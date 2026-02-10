# app/usage.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .schemas import UsageGetInput, UsageGetOutput, UsageCommitInput, UsageCommitOutput
from .db import usage_get, usage_commit_tokens, get_token_limit

router = APIRouter(prefix="/usage", tags=["usage"])


@router.post("/get", response_model=UsageGetOutput)
def usage_get_route(payload: UsageGetInput):
    """Get current token usage for the day."""
    tier = (payload.tier or "FREE").upper()
    token_limit = get_token_limit(tier)
    
    day, tokens_used, voice_seconds = usage_get(
        payload.memberstack_id, 
        payload.session_id, 
        payload.usage_day
    )
    
    remaining = max(0, token_limit - tokens_used)
    percentage = round((tokens_used / token_limit) * 100, 1) if token_limit > 0 else 0
    
    # Calculate reset time
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    reset_in_seconds = int((tomorrow - now).total_seconds())
    reset_in_hours = reset_in_seconds // 3600
    reset_in_minutes = (reset_in_seconds % 3600) // 60
    reset_at = f"{reset_in_hours}h {reset_in_minutes}m"
    
    return UsageGetOutput(
        ok=True,
        usage_day=day,
        tokens_used_today=tokens_used,
        token_limit=token_limit,
        tokens_remaining=remaining,
        percentage_used=percentage,
        usage_voice_seconds_today=voice_seconds,
        tier=tier,
        reset_at=reset_at,
    )


@router.post("/commit", response_model=UsageCommitOutput)
def usage_commit_route(payload: UsageCommitInput):
    """Commit token usage (usually called automatically by /chat)."""
    if not payload.session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    day, tokens_used, voice_seconds = usage_commit_tokens(
        memberstack_id=payload.memberstack_id,
        session_id=payload.session_id,
        usage_day=payload.usage_day,
        add_tokens=payload.add_tokens,
        add_voice_seconds=payload.add_voice_seconds,
    )
    
    # Calculate reset time
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    reset_in_seconds = int((tomorrow - now).total_seconds())
    reset_in_hours = reset_in_seconds // 3600
    reset_in_minutes = (reset_in_seconds % 3600) // 60
    reset_at = f"{reset_in_hours}h {reset_in_minutes}m"
    
    return UsageCommitOutput(
        ok=True,
        committed=True,
        usage_day=day,
        tokens_used_today=tokens_used,
        usage_voice_seconds_today=voice_seconds,
        tier=payload.tier,
        reset_at=reset_at,
    )