from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field
from .service import MemoryService

router = APIRouter(prefix="/memory", tags=["memory"])
svc = MemoryService()

class MemoryStoreIn(BaseModel):
    user_id: str
    category: str
    title: str
    content: str
    tags: list[str] = Field(default_factory=list)

class MemoryRetrieveIn(BaseModel):
    user_id: str
    query: str
    limit: int = 5

@router.post("/store")
def store(payload: MemoryStoreIn):
    row = svc.store(**payload.model_dump())
    return {"ok": True, "memory": row}

@router.post("/retrieve")
def retrieve(payload: MemoryRetrieveIn):
    block = svc.retrieve_block(payload.user_id, payload.query, payload.limit)
    return {"ok": True, "memory_block": block}
