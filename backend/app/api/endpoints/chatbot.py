from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import google.generativeai as genai
from datetime import datetime, timedelta
import re

from app.db.session import get_database
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.config import settings
from app.crud import crud_business, crud_appointment, crud_employee
from app.schemas.user import UserResponse
from app.core.security import get_current_user
from app.services.notification_service import (
    generate_qr_code_as_bytes,
    generate_appointment_pdf_as_bytes,
    send_confirmation_email
)

router = APIRouter()

class ChatMessage(BaseModel):
    role: str
    parts: List[str]

class ChatRequest(BaseModel):
    business_id: str
    history: List[ChatMessage]
    message: str

async def get_available_slots_for_chatbot(db: AsyncIOMotorDatabase, business_id: str, days_from_now: int, employee_id: Optional[str] = None):
    try:
        target_date = datetime.now() + timedelta(days=days_from_now)
        date_str = target_date.strftime("%Y-%m-%d")
        slots = await crud_business.get_available_slots_for_day(db, business_id, date_str, employee_id)
        return {"date": date_str, "slots": slots}
    except Exception:
        return {"date": None, "slots": []}

@router.post("/chat")
async def handle_chat(
    request: ChatRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al configurar la API de Gemini: {e}")

    business = await crud_business.get_business(db, request.business_id)
    if not business:
        raise HTTPException(status_code=404, detail="Negocio no encontrado.")

    employees = []
    employee_context = ""
    selected_employee = None
    selected_employee_id = None
    is_employee_mode = business.get("appointment_mode") == "por_empleado"

    if is_employee_mode:
        active_employees = await crud_employee.get_employees_by_business(db, request.business_id)
        if active_employees:
            employees = active_employees
            employee_names = [emp.get("name", "Desconocido") for emp in employees]
            employee_context = f"Este negocio funciona con citas por empleado. Los compas disponibles son: {', '.join(employee_names)}."
            full_conversation = request.message + " ".join([msg.parts[0] for msg in request.history])
            for emp in employees:
                if emp.get("name", "").lower() in full_conversation.lower():
                    selected_employee = emp
                    selected_employee_id = str(emp["_id"])
                    break
        else:
            is_employee_mode = False
            employee_context = "Este negocio no tiene empleados activos en este momento."

    today_slots = await get_available_slots_for_chatbot(db, request.business_id, 0, selected_employee_id)
    tomorrow_slots = await get_available_slots_for_chatbot(db, request.business_id, 1, selected_employee_id)
    in_2_days_slots = await get_available_slots_for_chatbot(db, request.business_id, 2, selected_employee_id)
    
    availability_context = ""
    if is_employee_mode and not selected_employee:
        availability_context = "Para poder mostrarte los campos, primero tienes que decirme con cuál de los compas te gustaría la cita."
    else:
        employee_name_for_prompt = f" con {selected_employee.get('name')}" if selected_employee else ""
        availability_context = f"""
        Esta es la disponibilidad de citas{employee_name_for_prompt} para los próximos días:
        - Hoy ({today_slots['date']}): {', '.join(today_slots['slots']) if today_slots['slots'] else 'ya no queda campo.'}
        - Mañana ({tomorrow_slots['date']}): {', '.join(tomorrow_slots['slots']) if tomorrow_slots['slots'] else 'no hay campo.'}
        - Pasado mañana ({in_2_days_slots['date']}): {', '.join(in_2_days_slots['slots']) if in_2_days_slots['slots'] else 'tampoco hay campo.'}
        """

    # --- INICIO DE LA MODIFICACIÓN DE PERSONALIDAD Y LÓGICA ---
    context = f"""
    **Tu Personalidad:**
    Eres un asistente virtual para "{business.get('name')}", con la personalidad de un "mae" de Costa Rica: amigable, servicial y "pura vida". Tu misión es que agendar una cita sea fácil y cómodo.

    **Tu Única Misión:**
    Tu propósito es agendar citas. Si te preguntan otra cosa, amablemente dices que en eso sí les quedas mal y vuelves al tema de la cita.

    **Información Clave para Agendar:**
    {employee_context}
    {availability_context}

    **Reglas de Conversación para Agendar (¡SIGUE ESTOS PASOS EN ORDEN ESTRICTO!):**
    1.  **Saludo y Guía:** Saluda de forma amigable. Si el negocio requiere un empleado, pídelo. Si no, ve directo a la fecha y hora.
    2.  **Confirmación de Cita:** Una vez que el usuario elige fecha y hora (y empleado si es necesario), haz una verificación final. Ejemplo: "¡Tuanis! Para confirmar: la cita el [FECHA] a las [HORA]. ¿Estamos bien así?".
    3.  **Solicitud de Correo:** INMEDIATAMENTE DESPUÉS de que el usuario confirme la cita, haz esta pregunta: "¿Con mucho gusto! ¿A cuál correo electrónico le envío la confirmación?".
    4.  **Verificación del Correo (NUEVO PASO CRÍTICO):** Cuando el usuario te dé su correo, debes mostrárselo y pedir una última confirmación. Tu respuesta DEBE ser: "Ok, lo envío a [correo del usuario]. ¿Es correcto?".
    5.  **Comando de Agendamiento (¡MUY IMPORTANTE!):** SOLO DESPUÉS de que el usuario responda afirmativamente a la verificación del correo (paso 4), tu ÚNICA respuesta debe ser el comando especial, sin añadir ni una sola palabra más:
        `[BOOK_APPOINTMENT:fecha="YYYY-MM-DD",hora="HH:MM",empleado="NOMBRE_DEL_EMPLEADO",email="correo@ejemplo.com"]`
        (Si no se usa empleado, omites ese campo).
    6.  **Honestidad:** Nunca inventes horarios.
    """
    # --- FIN DE LA MODIFICACIÓN DE PERSONALIDAD Y LÓGICA ---

    chat_history = [
        {"role": "user", "parts": [context]},
    ]
    for msg in request.history:
        chat_history.append({"role": msg.role, "parts": msg.parts})
    
    chat_history.append({"role": "user", "parts": [request.message]})

    try:
        chat = model.start_chat(history=chat_history[:-1])
        response = chat.send_message(request.message)
        model_response_text = response.text

        booking_match = re.search(r'\[BOOK_APPOINTMENT:fecha="([^"]+)",hora="([^"]+)"(?:,empleado="([^"]+)")?,email="([^"]+)"\]', model_response_text)

        if booking_match:
            date_str = booking_match.group(1)
            time_str = booking_match.group(2)
            employee_name = booking_match.group(3)
            target_email = booking_match.group(4)

            final_employee_id_for_booking = None
            if employee_name and employees:
                for emp in employees:
                    if emp.get("name", "").lower() == employee_name.lower():
                        final_employee_id_for_booking = str(emp["_id"])
                        break
            
            try:
                appointment_dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")

                new_appointment = await crud_appointment.create(
                    db=db, business_id=request.business_id, user_id=str(current_user.id),
                    appointment_time=appointment_dt, employee_id=final_employee_id_for_booking
                )
                
                appointment_id = str(new_appointment["_id"])
                
                details = {
                    "id": appointment_id, "user_name": current_user.full_name or current_user.email,
                    "business_name": business.get("name"), "date": appointment_dt.strftime("%d/%m/%Y"),
                    "time": appointment_dt.strftime("%H:%M"), "address": business.get("address"), "status": "confirmed",
                }
                qr_png = generate_qr_code_as_bytes(appointment_id).getvalue()
                pdf_bytes = generate_appointment_pdf_as_bytes({**details, "qr_png": qr_png}, cancelled=False)
                
                await run_in_threadpool(
                    send_confirmation_email,
                    user_email=target_email,
                    details=details, pdf_bytes=pdf_bytes,
                )
                
                confirmation_msg = f"¡Listo, pura vida! Su cita quedó para el {date_str} a las {time_str}"
                if employee_name: confirmation_msg += f" con {employee_name}"
                confirmation_msg += f". Ya le mandé la confirmación al correo {target_email}. Ahí en 'Mis Citas' puede revisarla cuando quiera."
                
                return {
                    "response": confirmation_msg, 
                    "action": "BOOKING_SUCCESS",
                    "pdf_url": f"/appointments/{appointment_id}/pdf"
                }

            except Exception as e:
                print(f"Error al crear la cita o enviar correo: {e}")
                error_response = "¡Uy, mae! Algo falló en el sistema y no pude agendar la cita. ¿Lo intentamos otra vez?"
                return {"response": error_response}
        
        return {"response": model_response_text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al comunicarse con el modelo de IA: {e}")