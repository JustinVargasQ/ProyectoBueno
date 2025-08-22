from fastapi import APIRouter, Depends, status, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr

from app.db.session import get_database
from app.schemas.user import UserResponse
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentResponse,
    AppointmentWithUserResponse,
)
from app.crud import crud_appointment, crud_business
from app.core.security import get_current_user
from app.services.notification_service import (
    send_confirmation_email,
    send_cancellation_email,
    generate_appointment_pdf_as_bytes,
    generate_qr_code_as_bytes,
)

router = APIRouter()

# --- INICIO DE LA MODIFICACIÓN ---
class EmailPayload(BaseModel):
    email: Optional[EmailStr] = None
# --- FIN DE LA MODIFICACIÓN ---

@router.post("/", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    appointment_in: AppointmentCreate,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
):
    # ... (sin cambios en esta función)
    appt = await crud_appointment.create(
        db=db,
        business_id=appointment_in.business_id,
        user_id=current_user.id,
        appointment_time=appointment_in.appointment_time,
        employee_id=appointment_in.employee_id,
    )
    return AppointmentResponse.model_validate(appt)


@router.post("/{appointment_id}/send-pdf", status_code=status.HTTP_200_OK)
async def send_appointment_pdf_email(
    appointment_id: str,
    # --- INICIO DE LA MODIFICACIÓN ---
    payload: EmailPayload, # Ahora aceptamos un cuerpo de solicitud
    # --- FIN DE LA MODIFICACIÓN ---
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
):
    appointment = await crud_appointment.get_appointment_by_id(db, appointment_id, current_user.id)
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada o no te pertenece.")

    # --- INICIO DE LA MODIFICACIÓN ---
    # Usar el email del payload si se proporciona, si no, usar el del usuario logueado
    target_email = payload.email if payload.email else current_user.email
    # --- FIN DE LA MODIFICACIÓN ---

    business = await crud_business.get_business(db, str(appointment["business_id"]))
    details = {
        "id": appointment_id,
        "user_name": current_user.full_name or current_user.email,
        "business_name": business.get("name"),
        "date": appointment["appointment_time"].strftime("%d/%m/%Y"),
        "time": appointment["appointment_time"].strftime("%H:%M"),
        "address": business.get("address"),
        "status": appointment.get("status", "confirmed"),
    }

    qr_png = generate_qr_code_as_bytes(appointment_id).getvalue()
    pdf_bytes = generate_appointment_pdf_as_bytes(
        {**details, "qr_png": qr_png},
        cancelled=(appointment.get("status") == "cancelled"),
    )

    success = await run_in_threadpool(
        send_confirmation_email,
        # --- INICIO DE LA MODIFICACIÓN ---
        user_email=target_email, # Usamos el email seleccionado
        # --- FIN DE LA MODIFICACIÓN ---
        details=details,
        pdf_bytes=pdf_bytes,
    )
    if not success:
        raise HTTPException(status_code=500, detail="No se pudo enviar el correo.")
    return {"message": f"Correo enviado con éxito a {target_email}."}


# ... (El resto de las funciones como get_appointment_pdf, get_my_appointments, etc., no cambian) ...
@router.get("/{appointment_id}/pdf")
async def get_appointment_pdf(
    appointment_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
):
    appointment = await crud_appointment.get_appointment_by_id(db, appointment_id, current_user.id)
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada o no te pertenece.")

    business = await crud_business.get_business(db, str(appointment["business_id"]))
    details = {
        "id": appointment_id,
        "user_name": current_user.full_name or current_user.email,
        "business_name": business.get("name"),
        "date": appointment["appointment_time"].strftime("%d/%m/%Y"),
        "time": appointment["appointment_time"].strftime("%H:%M"),
        "address": business.get("address"),
        "status": appointment.get("status", "confirmed"),
    }

    qr_png = generate_qr_code_as_bytes(appointment_id).getvalue()
    pdf_bytes = generate_appointment_pdf_as_bytes(
        {**details, "qr_png": qr_png},
        cancelled=(appointment.get("status") == "cancelled"),
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="cita_{appointment_id}.pdf"'},
    )


@router.get("/{appointment_id}/qr")
async def get_appointment_qr(
    appointment_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
):
    appointment = await crud_appointment.get_appointment_by_id(db, appointment_id, current_user.id)
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada o no te pertenece.")
    qr_buffer = generate_qr_code_as_bytes(appointment_id)
    return Response(content=qr_buffer.getvalue(), media_type="image/png")


@router.get("/me", response_model=List[AppointmentResponse])
async def get_my_appointments(
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
):
    appointments = await crud_appointment.get_appointments_by_user_id(db, user_id=current_user.id)
    return [AppointmentResponse.model_validate(app) for app in appointments]


@router.get("/business/{business_id}", response_model=List[AppointmentResponse])
async def get_business_appointments(business_id: str, db: AsyncIOMotorDatabase = Depends(get_database)):
    apps = await crud_appointment.get_appointments_by_business_id(db, business_id=business_id)
    return [AppointmentResponse.model_validate(app) for app in apps]


@router.get("/business/{business_id}/with-users", response_model=List[AppointmentWithUserResponse])
async def get_business_appointments_with_users(
    business_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    appts = await crud_appointment.get_business_appointments_with_users(db, business_id)
    return [AppointmentWithUserResponse.model_validate(a) for a in appts]


@router.post("/{appointment_id}/cancel", response_model=AppointmentResponse)
async def cancel_my_appointment(
    appointment_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
):
    appt = await crud_appointment.get_appointment_by_id(db, appointment_id, current_user.id)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada o no te pertenece.")

    now = datetime.now(timezone.utc)
    appt_time = appt["appointment_time"]
    if appt_time.tzinfo is None:
        if appt_time < datetime.utcnow():
            raise HTTPException(status_code=400, detail="No puedes cancelar una cita que ya pasó.")
    else:
        if appt_time < now:
            raise HTTPException(status_code=400, detail="No puedes cancelar una cita que ya pasó.")

    if appt.get("status") == "cancelled":
        return AppointmentResponse.model_validate(appt)

    appt = await crud_appointment.update_status(db, appointment_id, current_user.id, "cancelled")

    business = await crud_business.get_business(db, str(appt["business_id"]))
    details = {
        "id": appointment_id,
        "user_name": current_user.full_name or current_user.email,
        "business_name": business.get("name"),
        "date": appt["appointment_time"].strftime("%d/%m/%Y"),
        "time": appt["appointment_time"].strftime("%H:%M"),
        "address": business.get("address"),
        "status": "cancelled",
    }
    qr_png = generate_qr_code_as_bytes(appointment_id).getvalue()
    pdf_bytes = generate_appointment_pdf_as_bytes({**details, "qr_png": qr_png}, cancelled=True)
    await run_in_threadpool(send_cancellation_email, user_email=current_user.email, details=details, pdf_bytes=pdf_bytes)

    return AppointmentResponse.model_validate(appt)


@router.post("/{appointment_id}/send-cancellation-email", status_code=status.HTTP_200_OK)
async def resend_cancellation_email(
    appointment_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    current_user: UserResponse = Depends(get_current_user),
):
    appt = await crud_appointment.get_appointment_by_id(db, appointment_id, current_user.id)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada o no te pertenece.")
    if appt.get("status") != "cancelled":
        raise HTTPException(status_code=400, detail="La cita no está cancelada.")

    business = await crud_business.get_business(db, str(appt["business_id"]))
    details = {
        "id": appointment_id,
        "user_name": current_user.full_name or current_user.email,
        "business_name": business.get("name"),
        "date": appt["appointment_time"].strftime("%d/%m/%Y"),
        "time": appt["appointment_time"].strftime("%H:%M"),
        "address": business.get("address"),
        "status": "cancelled",
    }
    qr_png = generate_qr_code_as_bytes(appointment_id).getvalue()
    pdf_bytes = generate_appointment_pdf_as_bytes({**details, "qr_png": qr_png}, cancelled=True)

    ok = await run_in_threadpool(send_cancellation_email, user_email=current_user.email, details=details, pdf_bytes=pdf_bytes)
    if not ok:
        raise HTTPException(status_code=500, detail="No se pudo enviar el correo de cancelación.")
    return {"message": "Correo de cancelación enviado."}