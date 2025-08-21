from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel
import google.generativeai as genai
from bson import ObjectId

from app.db.session import get_database
from app.crud import crud_category
from app.schemas.category import CategoryCreate, CategoryUpdate, Category
from app.schemas.user import UserResponse
from app.core.security import get_current_admin_user
from app.core.config import settings

router = APIRouter()

class IconRequest(BaseModel):
    category_name: str

@router.post("/suggest-icons", response_model=List[str])
async def suggest_category_icons(
    request: IconRequest,
    current_user: UserResponse = Depends(get_current_admin_user)
):
    if not settings.GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="La clave de API de Google no está configurada.")

    genai.configure(api_key=settings.GOOGLE_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash-latest')

    icon_list = "ContentCut, Brush, FaceRetouchingNatural, Spa, Storefront, Star, People, LocationOn, Search"

    prompt = (
        f"Eres un asistente de diseño de interfaces. Dada la categoría de negocio '{request.category_name}', "
        f"sugiere 4 nombres de iconos de la biblioteca Material-UI Icons que la representen bien. "
        f"Algunos ejemplos de nombres de iconos son: {icon_list}. "
        "Tu respuesta debe ser únicamente una lista de los nombres de los iconos separados por comas, sin espacios adicionales. "
        "Por ejemplo: Spa,Storefront,Star,People"
    )
    
    try:
        response = await model.generate_content_async(prompt)
        icon_names = [name.strip() for name in response.text.split(',')]
        return icon_names

    except Exception as e:
        print(f"Error con la API de Gemini: {e}")
        raise HTTPException(status_code=500, detail="Error al generar sugerencias de iconos.")


@router.post("/", response_model=Category, status_code=status.HTTP_201_CREATED)
async def create_category(
    category_in: CategoryCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_admin_user)
):
    existing_category = await crud_category.get_category_by_name(db, name=category_in.name)
    if existing_category:
        raise HTTPException(
            status_code=400,
            detail="Ya existe una categoría con este nombre."
        )

    category = await crud_category.create_category(db, category=category_in)
    return Category.model_validate(category)

@router.get("/", response_model=List[Category])
async def get_all_categories(db: AsyncIOMotorDatabase = Depends(get_database)):
    categories = await crud_category.get_all_categories(db)
    return [Category.model_validate(cat) for cat in categories]

@router.put("/{category_id}", response_model=Category)
async def update_category(
    category_id: str,
    category_in: CategoryUpdate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_admin_user)
):
    if not ObjectId.is_valid(category_id):
        raise HTTPException(status_code=400, detail="ID de categoría inválido.")
    
    updated_category = await crud_category.update_category(db, category_id, category_in)
    
    if updated_category is None:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
        
    return Category.model_validate(updated_category)

@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_admin_user)
):
    if not ObjectId.is_valid(category_id):
        raise HTTPException(status_code=400, detail="ID de categoría inválido.")
        
    deleted = await crud_category.delete_category(db, category_id)
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Categoría no encontrada o no se pudo eliminar.")