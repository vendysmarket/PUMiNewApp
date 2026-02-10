# app/guard.py
from __future__ import annotations

from fastapi import APIRouter

from .schemas import GuardInput, GuardOutput
from .db import usage_get, get_token_limit
from .memberstack import get_member_access

router = APIRouter(tags=["guard"])


# =========================
# Entitlements by Tier
# =========================
def _get_entitlements(tier: str) -> dict:
    """
    Returns feature access for each tier.
    FREE: chat only
    GENZ/MILLENNIAL: full access
    """
    t = (tier or "FREE").upper()
    
    if t == "FREE":
        return {
            "chat": True,
            "focus": False,
            "voice": False,
            "files": False,
            "profile": False,
            "settings": True,  # Always available
        }
    
    # GENZ, MILLENNIAL, CORE - full access
    return {
        "chat": True,
        "focus": True,
        "voice": True,
        "files": True,
        "profile": True,
        "settings": True,
    }


def _get_tier_display(tier: str, core_variant: str = None) -> str:
    """
    Returns display name for tier.
    CORE + STUDENT -> GENZ
    CORE + ADULT -> MILLENNIAL
    """
    t = (tier or "FREE").upper()
    
    if t == "FREE":
        return "FREE"
    
    if t == "CORE":
        if core_variant == "STUDENT":
            return "GENZ"
        elif core_variant == "ADULT":
            return "MILLENNIAL"
        return "MILLENNIAL"  # default
    
    return t


@router.post("/guard", response_model=GuardOutput)
def guard(payload: GuardInput):
    """
    Check if user can perform action.
    Returns tier, limits, usage, and entitlements.
    """
    # 1) Determine tier from Memberstack
    access = get_member_access(payload.memberstack_id)
    raw_tier = (access.tier or "FREE").upper()
    core_variant = access.core_variant
    
    # Map to display tier (GENZ/MILLENNIAL)
    display_tier = _get_tier_display(raw_tier, core_variant)
    
    # 2) Get token limit for this tier
    token_limit = get_token_limit(display_tier)
    
    # 3) Get current usage
    day, tokens_used, voice_seconds = usage_get(
        payload.memberstack_id, 
        payload.session_id, 
        None
    )
    
    # 4) Calculate remaining
    remaining = max(0, token_limit - tokens_used)
    percentage_used = (tokens_used / token_limit * 100) if token_limit > 0 else 0
    
    # 5) Check if allowed (need at least 500 tokens for a message)
    min_required = 500
    allowed = remaining >= min_required
    reason = "ok" if allowed else "daily_token_limit_reached"
    
    # 6) Get entitlements
    entitlements = _get_entitlements(display_tier)
    
    # 7) Calculate reset time (midnight UTC)
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    reset_at = tomorrow.isoformat() + "Z"
    
    return GuardOutput(
        ok=True,
        allowed=allowed,
        reason=reason,
        tier=display_tier,
        mode=payload.mode,
        reset_at=reset_at,
        # Token usage
        tokens_used=tokens_used,
        token_limit=token_limit,
        remaining=remaining,
        percentage_used=round(percentage_used, 1),
        # Entitlements
        entitlements=entitlements,
        # Legacy fields (for backwards compatibility)
        limits={
            "tokens_daily": token_limit,
        },
        usage={
            "tokens_today": tokens_used,
            "voice_seconds_today": voice_seconds,
        },
    )