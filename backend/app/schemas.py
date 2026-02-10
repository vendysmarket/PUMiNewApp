# app/schemas.py
from __future__ import annotations
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

Role = Literal["user", "assistant", "system"]


class HistoryItem(BaseModel):
    role: Role
    content: str


# =========================
# /health
# =========================
class HealthOutput(BaseModel):
    ok: bool = True
    db: Optional[bool] = None
    build: Optional[str] = None
    routes: Optional[List[str]] = None
    meta: Optional[Dict[str, Any]] = None


# =========================
# /chat
# =========================
class ChatRequest(BaseModel):
    message: Optional[str] = ""
    history: List[HistoryItem] = Field(default_factory=list)

    # Identity / routing
    tier: Optional[str] = None
    lang: Optional[str] = None
    mode: Optional[str] = None  # "chat" | "focus_plan" | "focus_outline" | "focus_day"
    companion: Optional[str] = None
    session_id: Optional[str] = None
    memberstack_id: Optional[str] = None

    # Focus plan inputs
    focus_type: Optional[str] = None
    domain: Optional[str] = None
    level: Optional[str] = None
    minutes_per_day: Optional[int] = None
    new_items_per_day: Optional[int] = None
    target_lang: Optional[str] = None

    # Lazy loading fields
    day_index: Optional[int] = None
    outline: Optional[Dict[str, Any]] = None
    
    # Image/file attachments
    # Format: [{"base64": "...", "media_type": "image/png", "filename": "screenshot.png"}]
    images: Optional[List[Dict[str, Any]]] = None


class ChatResponse(BaseModel):
    ok: bool = True
    mode: str = "chat"
    reply: str = ""
    plan: Optional[Dict[str, Any]] = None
    outline: Optional[Dict[str, Any]] = None
    day: Optional[Dict[str, Any]] = None
    raw: Optional[str] = None
    source: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
    usage: Optional[Dict[str, Any]] = None


# =========================
# /guard
# =========================
class GuardInput(BaseModel):
    source: Optional[str] = None
    tier: Optional[str] = None
    lang: Optional[str] = None
    companion: Optional[str] = None
    memberstack_id: Optional[str] = None
    session_id: Optional[str] = None
    message: Optional[str] = None
    mode: Optional[str] = None
    predicted_voice_seconds: Optional[int] = None


class GuardOutput(BaseModel):
    ok: bool = True
    allowed: bool = True
    reason: str = "ok"
    tier: Optional[str] = None
    mode: Optional[str] = None
    reset_at: Optional[str] = None
    # Token usage
    tokens_used: int = 0
    token_limit: int = 0
    remaining: int = 0
    percentage_used: float = 0.0
    # Entitlements (feature access)
    entitlements: Optional[Dict[str, bool]] = None
    # Legacy fields
    limits: Optional[Dict[str, Any]] = None
    usage: Optional[Dict[str, Any]] = None


# =========================
# /usage
# =========================
class UsageGetInput(BaseModel):
    memberstack_id: Optional[str] = None
    session_id: Optional[str] = None
    tier: Optional[str] = None
    companion: Optional[str] = None
    usage_day: Optional[str] = None


class UsageGetOutput(BaseModel):
    ok: bool = True
    usage_day: Optional[str] = None
    tokens_used_today: int = 0
    token_limit: int = 0
    tokens_remaining: int = 0
    percentage_used: float = 0.0
    usage_voice_seconds_today: int = 0
    tier: Optional[str] = None
    reset_at: Optional[str] = None


class UsageCommitInput(BaseModel):
    memberstack_id: Optional[str] = None
    session_id: Optional[str] = None
    tier: Optional[str] = None
    companion: Optional[str] = None
    usage_day: Optional[str] = None
    mode: Optional[str] = None
    add_tokens: int = 0
    add_voice_seconds: int = 0


class UsageCommitOutput(BaseModel):
    ok: bool = True
    committed: bool = True
    usage_day: Optional[str] = None
    tokens_used_today: int = 0
    usage_voice_seconds_today: int = 0
    tier: Optional[str] = None
    reset_at: Optional[str] = None