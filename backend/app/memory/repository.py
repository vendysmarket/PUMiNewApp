# app/memory/repository.py
# Supabase REST-based memory repository (no direct psycopg2)

from __future__ import annotations

import os
from typing import Optional

# Use Supabase Python client
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    Client = None

TABLE = "user_memories"

# Lazy-initialized Supabase client
_supabase_client: Optional[Client] = None


def _normalize_url(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return ""
    if not raw.startswith("http://") and not raw.startswith("https://"):
        raw = "https://" + raw
    return raw.rstrip("/")


def _get_supabase() -> Optional[Client]:
    """Get or create Supabase client. Returns None if not configured."""
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    if not SUPABASE_AVAILABLE:
        print("[memory] supabase-py not available")
        return None

    url = _normalize_url(os.getenv("SUPABASE_URL"))
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE")
        or ""
    ).strip()

    if not url or not key:
        print("[memory] SUPABASE_URL or SUPABASE_SERVICE_KEY not configured")
        return None

    try:
        _supabase_client = create_client(url, key)
        return _supabase_client
    except Exception as e:
        print(f"[memory] Failed to create Supabase client: {e}")
        return None


def insert_memory(row: dict) -> dict | None:
    """Insert a memory row via Supabase REST API."""
    sb = _get_supabase()
    if not sb:
        print("[memory] Supabase not available, skipping insert")
        return None

    try:
        data = {
            "user_id": row["user_id"],
            "category": row["category"],
            "title": row["title"],
            "content": row["content"],
            "tags": row.get("tags", []),
            "emotion": row.get("emotion", {}),
            "memory_score": float(row.get("memory_score", 0.0)),
        }

        result = sb.table(TABLE).insert(data).execute()

        if result.data and len(result.data) > 0:
            return result.data[0]
        return None

    except Exception as e:
        print(f"[memory] insert_memory error: {e}")
        return None


def list_recent(user_id: str, limit: int = 50) -> list[dict]:
    """List recent memories for a user via Supabase REST API."""
    sb = _get_supabase()
    if not sb:
        return []

    # Skip if user_id is invalid (anon, empty, etc.)
    if not user_id or user_id == "anon":
        return []

    try:
        result = (
            sb.table(TABLE)
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        return result.data if result.data else []

    except Exception as e:
        print(f"[memory] list_recent error: {e}")
        return []
