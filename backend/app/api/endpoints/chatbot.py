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
        model = genai.GenerativeModel('gemini-2.5-flash') 
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
            employee_context = f"Nota: Este negocio agendar citas por especialista. Disponibles: {', '.join(employee_names)}."
            full_conversation = request.message + " ".join([msg.parts[0] for msg in request.history])
            for emp in employees:
                if emp.get("name", "").lower() in full_conversation.lower():
                    selected_employee = emp
                    selected_employee_id = str(emp["_id"])
                    break
        else:
            is_employee_mode = False
            employee_context = "Nota: Actualmente no hay especialistas específicos activos."

    today_slots = await get_available_slots_for_chatbot(db, request.business_id, 0, selected_employee_id)
    tomorrow_slots = await get_available_slots_for_chatbot(db, request.business_id, 1, selected_employee_id)
    in_2_days_slots = await get_available_slots_for_chatbot(db, request.business_id, 2, selected_employee_id)
    
    def format_slots(slots_data):
        if not slots_data: return []
        cleaned_slots = []
        for s in slots_data:
            if isinstance(s, dict):
                cleaned_slots.append(s.get('time', str(s))) 
            else:
                cleaned_slots.append(str(s))
        return cleaned_slots

    t_slots_list = format_slots(today_slots.get('slots', []))
    tm_slots_list = format_slots(tomorrow_slots.get('slots', []))
    i2_slots_list = format_slots(in_2_days_slots.get('slots', []))

    ui_slots_data = {
        "today": {"date": today_slots['date'], "hours": t_slots_list},
        "tomorrow": {"date": tomorrow_slots['date'], "hours": tm_slots_list},
        "next_day": {"date": in_2_days_slots['date'], "hours": i2_slots_list}
    }

    availability_context = ""
    if is_employee_mode and not selected_employee:
        availability_context = "ADVERTENCIA: No muestres horarios todavía. Pide amablemente al usuario que seleccione un especialista primero."
    else:
        availability_context = f"""
        DATOS DE DISPONIBILIDAD (SOLO PARA TU REFERENCIA INTERNA, NO LEER EN VOZ ALTA):
        - Hoy ({today_slots['date']}): {', '.join(t_slots_list) if t_slots_list else 'AGOTADO'}
        - Mañana ({tomorrow_slots['date']}): {', '.join(tm_slots_list) if tm_slots_list else 'AGOTADO'}
        - Pasado mañana ({in_2_days_slots['date']}): {', '.join(i2_slots_list) if i2_slots_list else 'AGOTADO'}
        """

    context = f"""
    **Rol:** Eres un asistente virtual profesional y eficiente para el negocio "{business.get('name')}".
    **Tono:** Formal pero cercano (usa "usted"). Cordial, breve y directo. Nada de jerga callejera ni "mae".

    **Contexto:**
    {employee_context}
    {availability_context}

    **REGLAS ESTRICTAS DE RESPUESTA (SÍGUELAS O EL SISTEMA FALLARÁ):**

    1.  **PROHIBIDO LEER LISTAS DE HORAS:** Cuando te pregunten por disponibilidad, NUNCA listes todas las horas en el texto (ej: "tengo 9:00, 9:30, 10:00..."). Eso suena robótico.
        * **Correcto:** "Claro, tenemos amplia disponibilidad para hoy en la mañana y tarde. Aquí le muestro las opciones."
        * **Correcto:** "Para mañana solo me quedan un par de espacios en la tarde."
        * **Incorrecto:** "Tengo citas a las 8:00, 8:30, 9:00, 9:30..." (ESTO ESTÁ PROHIBIDO).

    2.  **Flujo de Agendamiento:**
        * Si falta el especialista (y el negocio lo requiere), pídelo cortésmente.
        * Si ya tienes fecha y hora, confirma: "Perfecto, ¿le agendo la cita para el [FECHA] a las [HORA] con [ESPECIALISTA]?"
        * Pide el correo electrónico para la confirmación.
        * Muestra el correo para verificar: "¿Es correcto el correo [email]?"
    
    3.  **Comando Final:** Solo cuando el usuario confirme el correo, responde ÚNICAMENTE con:
        `[BOOK_APPOINTMENT:fecha="YYYY-MM-DD",hora="HH:MM",empleado="NOMBRE",email="correo"]`

    4.  **Manejo de Errores:** Si el usuario pide una hora que NO está en tu lista de "DATOS DE DISPONIBILIDAD", dile amablemente que esa hora ya está ocupada y sugiere otra cercana.
    """
    # -------------------------------------------------------------------

    chat_history = [{"role": "user", "parts": [context]}]
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
                    send_confirmation_email, user_email=target_email, details=details, pdf_bytes=pdf_bytes,
                )
                
                confirmation_msg = f"Cita confirmada para el {date_str} a las {time_str}. Se ha enviado el comprobante a {target_email}. ¡Gracias por preferirnos!"
                
                return {
                    "response": confirmation_msg, 
                    "action": "BOOKING_SUCCESS",
                    "pdf_url": f"/appointments/{appointment_id}/pdf"
                }

            except Exception as e:
                print(f"Error: {e}")
                return {"response": "Disculpe, hubo un error técnico al procesar su cita. ¿Podría intentarlo nuevamente?"}
        
       
        return {
            "response": model_response_text,
            "slots_view": ui_slots_data 
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error IA: {e}")