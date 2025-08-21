from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from .utils import PyObjectId
from bson import ObjectId
from datetime import datetime

class CategoryBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=50)
    icon_name: Optional[str] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=50)
    icon_name: Optional[str] = None

class Category(CategoryBase):
    id: str = Field(..., alias="_id")

    @field_validator("id", mode='before')
    @classmethod
    def convert_objectid_to_str(cls, v: Any) -> str:
        if isinstance(v, ObjectId):
            return str(v)
        return v
    
    class Config:
        from_attributes = True
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class CategoryRequestSchema(BaseModel):
    id: PyObjectId = Field(alias="_id")
    owner_id: PyObjectId
    category_name: str
    reason: str
    evidence_url: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class CategoryResponse(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True