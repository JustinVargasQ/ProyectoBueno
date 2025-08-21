# backend/app/api/api.py

from fastapi import APIRouter
# CORRECCIÓN: Añade 'chatbot' a esta línea de importación
from .endpoints import login, users, businesses, categories, appointments, employees, reviews, chatbot

api_router = APIRouter()
api_router.include_router(login.router, prefix="/login", tags=["login"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(businesses.router, prefix="/businesses", tags=["businesses"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(appointments.router, prefix="/appointments", tags=["appointments"])
api_router.include_router(employees.router, prefix="/employees", tags=["employees"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["reviews"])
api_router.include_router(chatbot.router, prefix="/chatbot", tags=["chatbot"]) # Esta línea ahora funcionará