from pydantic import BaseModel, Field
from typing import Optional, List

class ScheduleDay(BaseModel):
    is_active: bool = False
    open_time: str = "09:00"
    close_time: str = "17:00"
    slot_duration_minutes: int = 30
    capacity_per_slot: int = 1

class Schedule(BaseModel):
    monday: ScheduleDay = Field(default_factory=ScheduleDay)
    tuesday: ScheduleDay = Field(default_factory=ScheduleDay)
    wednesday: ScheduleDay = Field(default_factory=ScheduleDay)
    thursday: ScheduleDay = Field(default_factory=ScheduleDay)
    friday: ScheduleDay = Field(default_factory=ScheduleDay)
    saturday: ScheduleDay = Field(default_factory=ScheduleDay)
    sunday: ScheduleDay = Field(default_factory=ScheduleDay)

class BusinessBase(BaseModel):
    name: str = Field(..., min_length=3)
    description: str = Field(..., min_length=10)
    address: str = Field(..., min_length=5)
    logo_url: Optional[str] = None

class BusinessCreate(BusinessBase):
    pass

class BusinessUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3)
    description: Optional[str] = Field(None, min_length=10)
    address: Optional[str] = Field(None, min_length=5)
    photos: Optional[List[str]] = None
    categories: Optional[List[str]] = None
    logo_url: Optional[str] = None
    appointment_mode: Optional[str] = None  

class BusinessResponse(BusinessBase):
    id: str
    owner_id: str
    photos: List[str]
    categories: List[str]
    status: str
    schedule: Optional[Schedule] = None
    appointment_mode: Optional[str] = "generico"
    # --- INICIO DE LA CORRECCIÓN ---
    avg_rating: Optional[float] = 0.0
    reviews_count: Optional[int] = 0
    # --- FIN DE LA CORRECCIÓN ---

    class Config:
        from_attributes = True