from motor.motor_asyncio import AsyncIOMotorDatabase
from app.schemas.category import CategoryCreate, CategoryUpdate
from bson import ObjectId

async def create_category(db: AsyncIOMotorDatabase, category: CategoryCreate):
    category_data = category.model_dump(exclude_unset=True)
    result = await db["categories"].insert_one(category_data)
    return await db["categories"].find_one({"_id": result.inserted_id})

async def get_category_by_name(db: AsyncIOMotorDatabase, name: str):
    return await db["categories"].find_one({"name": name})

async def get_all_categories(db: AsyncIOMotorDatabase):
    return await db["categories"].find().to_list(1000)

# --- NUEVA FUNCIÓN PARA ACTUALIZAR ---
async def update_category(db: AsyncIOMotorDatabase, category_id: str, category_in: CategoryUpdate):
    update_data = category_in.model_dump(exclude_unset=True)
    if not update_data:
        return await db["categories"].find_one({"_id": ObjectId(category_id)})
    
    await db["categories"].update_one(
        {"_id": ObjectId(category_id)},
        {"$set": update_data}
    )
    return await db["categories"].find_one({"_id": ObjectId(category_id)})

# --- NUEVA FUNCIÓN PARA ELIMINAR ---
async def delete_category(db: AsyncIOMotorDatabase, category_id: str):
    delete_result = await db["categories"].delete_one({"_id": ObjectId(category_id)})
    return delete_result.deleted_count > 0