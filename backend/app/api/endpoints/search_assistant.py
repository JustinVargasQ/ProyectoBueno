from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import google.generativeai as genai
import json

from app.db.session import get_database
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.config import settings
from app.crud import crud_business
from app.schemas.user import UserResponse
from app.core.security import get_current_user

router = APIRouter()

class AssistantMessage(BaseModel):
    role: str
    content: str

class AssistantRequest(BaseModel):
    history: List[AssistantMessage]

@router.post("/assistant")
async def handle_search_assistant(
    request: AssistantRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user)
):
    if not settings.GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="La API de Google no está configurada.")

    genai.configure(api_key=settings.GOOGLE_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash-latest')

    all_businesses = await crud_business.get_published_businesses(db)
    
    business_context_list = [
        {
            "id": str(b["_id"]),
            "name": b.get("name"),
            "description": b.get("description"),
            "categories": b.get("categories"),
            "avg_rating": b.get("avg_rating", 0)
        } for b in all_businesses
    ]
    business_context = json.dumps(business_context_list)

    # --- INICIO DE LA MODIFICACIÓN DE PERSONALIDAD Y LÓGICA ---
    system_prompt = f"""
    **Tu Personalidad:**
    Eres un asistente de búsqueda "pura vida" de Costa Rica para la plataforma "ServiBook". Tu misión es ayudar a los usuarios a encontrar el negocio perfecto de una forma amigable y conversacional.

    **Tu Misión y Flujo de Conversación:**
    1.  **Entender y Buscar:** Comprende lo que el usuario quiere (ej: "busco un hotel", "quiero lavar el carro") y sugiere las mejores opciones de la lista de negocios que te proporciono.
    2.  **Sugerir y Preguntar:** Presenta tus hallazgos de forma amigable. Ejemplo: "¡Tuanis! Encontré este lugar que se llama 'Hotel' y tiene buenas reseñas. ¿Te lo muestro en el mapa?".
    3.  **Manejar Refinamientos:** Si el usuario cambia de opinión (ej: "mejor una barbería"), adáptate y busca de nuevo.
    4.  **Confirmar Navegación (¡NUEVO PASO CRÍTICO!):** Cuando el usuario exprese interés en ver los detalles de un negocio específico (ej: "sí, vamos a ese hotel" o "me parece bien esa barbería"), DEBES hacer una última pregunta de confirmación. Ejemplo: "¡A cachete! ¿Confirmas que quieres ver los detalles del negocio '[Nombre del Negocio]'?".
    5.  **Comando de Navegación (¡MUY IMPORTANTE!):** SOLO DESPUÉS de que el usuario responda afirmativamente a la confirmación del paso 4, tu ÚNICA respuesta debe ser el comando especial de navegación, sin añadir ni una sola palabra más:
        `[NAVIGATE_TO: "ID_DEL_NEGOCIO"]`

    **Lista de Negocios Disponibles (Contexto):**
    {business_context}

    **Reglas de Respuesta (¡MUY IMPORTANTE!):**
    -   Cada una de tus respuestas de texto (excepto el comando NAVIGATE) DEBE terminar con la lista de IDs de los negocios que estás sugiriendo en ese momento.
        Formato: `[IDs: "id1", "id2", ...]`
        - Si no encuentras nada, la lista debe estar vacía: `[IDs: ]`
    """
    # --- FIN DE LA MODIFICACIÓN DE PERSONALIDAD Y LÓGICA ---

    conversation_history = [{"role": "user", "parts": [system_prompt]}]
    for msg in request.history:
        conversation_history.append({"role": "user" if msg.role == "user" else "model", "parts": [msg.content]})

    try:
        chat = model.start_chat(history=conversation_history[:-1])
        response = await chat.send_message_async(conversation_history[-1]['parts'])
        
        return {"response": response.text}

    except Exception as e:
        print(f"Error con el asistente de búsqueda de IA: {e}")
        raise HTTPException(status_code=500, detail="Error al comunicarse con el asistente de IA.")