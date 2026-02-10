# app/account.py
from __future__ import annotations

import os
import uuid
from typing import Any, Dict, Optional

import requests
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

try:
    from supabase import create_client, Client  # type: ignore
except Exception:
    create_client = None
    Client = None  # type: ignore

router = APIRouter(prefix="/account", tags=["account"])


def _normalize_url(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    if not raw.startswith("http://") and not raw.startswith("https://"):
        raw = "https://" + raw
    return raw.rstrip("/")


def _is_valid_uuid(val: str) -> bool:
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError):
        return False


SUPABASE_URL = _normalize_url(os.getenv("SUPABASE_URL"))
SUPABASE_SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("SUPABASE_SERVICE_KEY")
    or os.getenv("SUPABASE_SERVICE_ROLE")
    or ""
).strip()
RAILWAY_TOKEN = (os.getenv("RAILWAY_TOKEN") or "").strip()


def _require_admin_client() -> "Client":
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or not create_client:
        raise HTTPException(status_code=503, detail="Supabase admin client not configured")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def _require_user_id(request: Request) -> str:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization Bearer token")
    token = auth.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty token")

    # Proxy mode: RAILWAY_TOKEN + X-User-ID
    if RAILWAY_TOKEN and token == RAILWAY_TOKEN:
        user_id = request.headers.get("x-user-id") or ""
        if not user_id or not _is_valid_uuid(user_id):
            raise HTTPException(status_code=401, detail="Invalid user_id format")
        return user_id

    # Direct JWT validation
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=503, detail="Supabase not configured for auth validation")

    r = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
        timeout=15,
    )

    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Supabase token")

    uid = (r.json() or {}).get("id")
    if not uid or not _is_valid_uuid(uid):
        raise HTTPException(status_code=401, detail="Invalid Supabase token (no user id)")
    return uid


def _safe_delete(table: str, filters: Dict[str, Any], client: "Client") -> int:
    try:
        query = client.table(table).delete()
        for key, value in filters.items():
            if isinstance(value, list):
                query = query.in_(key, value)
            else:
                query = query.eq(key, value)
        res = query.execute()
        return len(res.data or [])
    except Exception:
        return 0


def _delete_auth_user(uid: str) -> None:
    url = f"{SUPABASE_URL}/auth/v1/admin/users/{uid}"
    r = requests.delete(
        url,
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
        timeout=20,
    )
    if r.status_code not in (200, 202, 204):
        raise HTTPException(status_code=502, detail="Failed to delete auth user")


@router.post("/delete")
def delete_account(request: Request):
    uid = _require_user_id(request)
    client = _require_admin_client()

    cleanup: Dict[str, int] = {
        "user_profiles": 0,
        "user_focus_stats": 0,
        "focus_item_progress": 0,
        "focus_items": 0,
        "focus_days": 0,
        "focus_plans": 0,
    }

    try:
        cleanup["user_focus_stats"] = _safe_delete("user_focus_stats", {"user_id": uid}, client)
        cleanup["focus_item_progress"] = _safe_delete("focus_item_progress", {"user_id": uid}, client)

        plan_ids: list[str] = []
        try:
            plans = client.table("focus_plans").select("id").eq("user_id", uid).execute()
            plan_ids = [p["id"] for p in (plans.data or []) if p.get("id")]
        except Exception:
            plan_ids = []

        day_ids: list[str] = []
        if plan_ids:
            try:
                days = client.table("focus_days").select("id").in_("plan_id", plan_ids).execute()
                day_ids = [d["id"] for d in (days.data or []) if d.get("id")]
            except Exception:
                day_ids = []

        if day_ids:
            cleanup["focus_items"] = _safe_delete("focus_items", {"day_id": day_ids}, client)

        if plan_ids:
            cleanup["focus_days"] = _safe_delete("focus_days", {"plan_id": plan_ids}, client)

        cleanup["focus_plans"] = _safe_delete("focus_plans", {"user_id": uid}, client)
        cleanup["user_profiles"] = _safe_delete("user_profiles", {"id": uid}, client)

        _delete_auth_user(uid)

        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "deleted": True,
                "cleanup": cleanup,
            },
        )
    except HTTPException as e:
        return JSONResponse(
            status_code=e.status_code,
            content={
                "ok": False,
                "deleted": False,
                "error": "account_delete_failed",
                "detail": e.detail,
                "cleanup": cleanup,
            },
        )
    except Exception:
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "deleted": False,
                "error": "account_delete_failed",
                "detail": "Unexpected error",
                "cleanup": cleanup,
            },
        )
