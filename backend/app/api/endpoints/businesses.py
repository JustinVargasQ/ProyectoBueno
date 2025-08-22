from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from pydantic import BaseModel
import google.generativeai as genai
import json

from app.db.session import get_database
from app.crud import crud_business
from app.schemas.business import BusinessCreate, BusinessUpdate, BusinessResponse, Schedule
from app.schemas.user import UserResponse
from app.core.security import get_current_user
from app.core.config import settings

router = APIRouter()

class GenerateDescriptionRequest(BaseModel):
    name: str
    categories: List[str]
    keywords: Optional[str] = None

class SearchRequest(BaseModel):
    query: str

def convert_business_to_response(business: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(business["_id"]),
        "owner_id": str(business["owner_id"]),
        "name": business.get("name"),
        "description": business.get("description"),
        "address": business.get("address"),
        "logo_url": business.get("logo_url"),
        "photos": business.get("photos", []),
        "categories": business.get("categories", []),
        "status": business.get("status"),
        "schedule": business.get("schedule"),
        "appointment_mode": business.get("appointment_mode", "generico"),
        "avg_rating": business.get("avg_rating", 0),
        "reviews_count": business.get("reviews_count", 0),
    }

@router.get("/", response_model=List[BusinessResponse])
async def get_all_published_businesses(db: AsyncIOMotorDatabase = Depends(get_database)):
    businesses_from_db = await crud_business.get_published_businesses(db)
    return [convert_business_to_response(b) for b in businesses_from_db]

@router.post("/ai-search", response_model=List[BusinessResponse])
async def ai_search(
    request: SearchRequest,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    try:
        api_key = settings.GOOGLE_API_KEY
        if not api_key:
            raise HTTPException(status_code=500, detail="La clave de API de Google no está configurada.")
        
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash-latest')

        all_businesses = await crud_business.get_published_businesses(db)
        
        business_context = json.dumps([
            {
                "id": str(b["_id"]),
                "name": b.get("name"),
                "description": b.get("description"),
                "categories": b.get("categories"),
                "address": b.get("address")
            } for b in all_businesses
        ])

        prompt = (
            f"Basado en la siguiente lista de negocios en formato JSON, y la consulta del usuario, "
            f"devuelve únicamente una lista de IDs de negocio ordenados por relevancia. "
            f"La consulta del usuario es: '{request.query}'.\n\n"
            f"Lista de negocios: {business_context}\n\n"
            f"Respuesta esperada: una lista de IDs separados por comas. Por ejemplo: id1,id2,id3"
        )

        response = await model.generate_content_async(prompt)
        
        ordered_ids_str = response.text.strip()
        ordered_ids = [ObjectId(id_str.strip()) for id_str in ordered_ids_str.split(',') if ObjectId.is_valid(id_str.strip())]
        
        business_map = {b["_id"]: b for b in all_businesses}
        
        ordered_businesses = [business_map[oid] for oid in ordered_ids if oid in business_map]

        return [convert_business_to_response(b) for b in ordered_businesses]

    except Exception as e:
        print(f"Error con la búsqueda de IA: {e}")
        raise HTTPException(status_code=500, detail="Error al realizar la búsqueda con IA.")

@router.get("/my-businesses", response_model=List[BusinessResponse])
async def get_my_businesses(
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user)
):
    businesses = await crud_business.get_businesses_by_owner(db, str(current_user.id))
    return [convert_business_to_response(b) for b in businesses]

@router.get("/{business_id}", response_model=BusinessResponse)
async def get_business_by_id(business_id: str, db: AsyncIOMotorDatabase = Depends(get_database)):
    if not ObjectId.is_valid(business_id):
        raise HTTPException(status_code=400, detail="ID de negocio inválido")
    business = await crud_business.get_business(db, business_id)
    if not business:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")
    return convert_business_to_response(business)

@router.post("/my-business", response_model=BusinessResponse, status_code=status.HTTP_201_CREATED)
async def create_my_business(
    business_in: BusinessCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user)
):
    owner_id = str(current_user.id)
    business = await crud_business.create_business(db, business_in, owner_id)
    return convert_business_to_response(business)

@router.put("/my-business/{business_id}", response_model=BusinessResponse)
async def update_my_business(
    business_id: str,
    business_in: BusinessUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user)
):
    if not ObjectId.is_valid(business_id):
        raise HTTPException(status_code=400, detail="ID de negocio inválido")
    existing_business = await crud_business.get_business(db, business_id)
    if not existing_business or str(existing_business['owner_id']) != str(current_user.id):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar este negocio")
    updated_business = await crud_business.update_business(db, business_id, business_in)
    if not updated_business:
        raise HTTPException(status_code=404, detail="No se pudo actualizar el negocio")
    return convert_business_to_response(updated_business)

@router.post("/my-business/{business_id}/publish", response_model=BusinessResponse)
async def publish_my_business(
    business_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user)
):
    business = await crud_business.get_business(db, business_id)
    if not business or str(business['owner_id']) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Acción no permitida")
    published_business = await crud_business.update_business_status(db, business_id, "published")
    if not published_business:
        raise HTTPException(status_code=404, detail="No se pudo publicar el negocio")
    return convert_business_to_response(published_business)

@router.put("/my-business/{business_id}/schedule", response_model=BusinessResponse)
async def manage_my_business_schedule(
    business_id: str,
    schedule_in: Schedule,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user)
):
    business = await crud_business.get_business(db, business_id)
    if not business or str(business['owner_id']) != str(current_user.id):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar este horario")
    updated_business = await crud_business.update_business_schedule(db, business_id, schedule_in)
    return convert_business_to_response(updated_business)

@router.get("/{business_id}/available-slots", response_model=List[Dict[str, Any]])
async def get_available_slots(
    business_id: str,
    date: str,
    employee_id: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    try:
        slots = await crud_business.get_available_slots_for_day(db, business_id, date, employee_id)
        return slots
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/generate-description", response_model=Dict[str, str])
async def generate_business_description(
    request: GenerateDescriptionRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        api_key = settings.GOOGLE_API_KEY
        if not api_key:
            raise HTTPException(status_code=500, detail="La clave de API de Google no está configurada.")
        
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash-latest')

        prompt_parts = [
            f"Eres un experto en marketing. Genera una descripción atractiva y profesional para un negocio en español.",
            f"Nombre del negocio: '{request.name}'",
            f"Categorías: {', '.join(request.categories)}"
        ]
        if request.keywords:
            prompt_parts.append(f"Palabras clave para inspirarte: {request.keywords}")
        
        prompt_parts.append("La descripción debe ser concisa, vendedora y no exceder los 250 caracteres.")

        prompt = "\n".join(prompt_parts)

        response = model.generate_content(prompt)
        return {"description": response.text}

    except Exception as e:
        print(f"Error con la API de Gemini: {e}")
        raise HTTPException(status_code=500, detail="Error al generar la descripción con IA.")