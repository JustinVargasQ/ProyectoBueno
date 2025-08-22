from typing import Optional, List, Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime, timedelta
from app.schemas.business import BusinessCreate, BusinessUpdate, Schedule
from app.crud import crud_appointment # Asegúrate de que esta importación exista

async def get_business(db: AsyncIOMotorDatabase, business_id: str):
    if not ObjectId.is_valid(business_id):
        return None
    return await db.businesses.find_one({"_id": ObjectId(business_id)})

async def get_published_businesses(db: AsyncIOMotorDatabase):
    cursor = db.businesses.find({"status": "published"})
    return await cursor.to_list(length=None)

async def create_business(db: AsyncIOMotorDatabase, business_in: BusinessCreate, owner_id: str):
    business_data = business_in.model_dump()
    logo_url = business_data.get("logo_url")
    initial_photos = [logo_url] if logo_url else []
    business_data.update({
        "owner_id": ObjectId(owner_id),
        "status": "draft",
        "photos": initial_photos,
        "categories": [],
        "schedule": Schedule().model_dump(),
        "created_at": datetime.utcnow(),
        "appointment_mode": business_data.get("appointment_mode", "generico"),
    })
    result = await db.businesses.insert_one(business_data)
    return await db.businesses.find_one({"_id": result.inserted_id})

async def update_business(db: AsyncIOMotorDatabase, business_id: str, business_in: BusinessUpdate):
    update_data = business_in.model_dump(exclude_unset=True)
    if not update_data:
        return await get_business(db, business_id)
    await db.businesses.update_one({"_id": ObjectId(business_id)}, {"$set": update_data})
    return await get_business(db, business_id)

async def get_businesses_by_owner(db: AsyncIOMotorDatabase, owner_id: str):
    cursor = db.businesses.find({"owner_id": ObjectId(owner_id)})
    return await cursor.to_list(length=None)

async def update_business_status(db: AsyncIOMotorDatabase, business_id: str, status: str):
    await db.businesses.update_one({"_id": ObjectId(business_id)}, {"$set": {"status": status}})
    return await get_business(db, business_id)

async def update_business_schedule(db: AsyncIOMotorDatabase, business_id: str, schedule_in: Schedule):
    await db.businesses.update_one({"_id": ObjectId(business_id)}, {"$set": {"schedule": schedule_in.model_dump()}})
    return await get_business(db, business_id)

# --- INICIO DE LA RECONSTRUCCIÓN DE LA FUNCIÓN ---
async def get_available_slots_for_day(
    db: AsyncIOMotorDatabase,
    business_id: str,
    date: str,
    employee_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    business = await get_business(db, business_id)
    if not business or not business.get("schedule"):
        raise ValueError("El negocio no tiene un horario configurado.")

    try:
        request_date = datetime.strptime(date, "%Y-%m-%d")
        day_of_week = request_date.strftime("%A").lower()
    except ValueError:
        raise ValueError("Formato de fecha inválido. Use YYYY-MM-DD.")

    day_schedule = business["schedule"].get(day_of_week)
    if not day_schedule or not day_schedule.get("is_active"):
        return []

    open_time = datetime.strptime(day_schedule["open_time"], "%H:%M").time()
    close_time = datetime.strptime(day_schedule["close_time"], "%H:%M").time()
    slot_duration = int(day_schedule["slot_duration_minutes"])
    capacity_business = int(day_schedule["capacity_per_slot"])

    from_time = datetime.combine(request_date, open_time)
    to_time = datetime.combine(request_date, close_time)
    all_slots_times = []
    cur = from_time
    while cur < to_time:
        all_slots_times.append(cur.strftime("%H:%M"))
        cur += timedelta(minutes=slot_duration)
    
    # Obtener todas las citas del día con la info del usuario ya incluida
    appointments = await crud_appointment.get_appointments_by_business_id_and_date(
        db, business_id, request_date, employee_id=employee_id
    )

    # Agrupar las citas por hora
    bookings_by_slot: Dict[str, List[Dict[str, Any]]] = {}
    for app in appointments:
        time_str = app["appointment_time"].strftime("%H:%M")
        if time_str not in bookings_by_slot:
            bookings_by_slot[time_str] = []
        
        user_info = app.get("user_info")
        bookings_by_slot[time_str].append({
            "appointment_id": str(app["_id"]),
            "user_id": str(app["user_id"]),
            "user_name": user_info.get("full_name") if user_info else "Usuario no encontrado",
            "user_email": user_info.get("email") if user_info else "N/A"
        })

    # Determinar la capacidad y los horarios permitidos (para modo empleado)
    capacity = capacity_business
    allowed_slots_set = set(all_slots_times)

    if employee_id:
        if not ObjectId.is_valid(employee_id): return []
        employee = await db.employees.find_one({"_id": ObjectId(employee_id), "active": True})
        if not employee: return []
        
        allowed = (employee.get("allowed_slots") or {}).get(day_of_week, [])
        if not allowed: return []
        
        allowed_slots_set = set(allowed)
        capacity = 1  # Capacidad es 1 por empleado

    # Construir la respuesta detallada
    detailed_slots = []
    for time_slot in all_slots_times:
        if time_slot not in allowed_slots_set:
            continue

        bookings = bookings_by_slot.get(time_slot, [])
        booked_count = len(bookings)
        
        detailed_slots.append({
            "time": time_slot,
            "total_capacity": capacity,
            "booked_count": booked_count,
            "is_available": booked_count < capacity,
            "bookings": bookings
        })

    return detailed_slots
# --- FIN DE LA RECONSTRUCCIÓN DE LA FUNCIÓN ---