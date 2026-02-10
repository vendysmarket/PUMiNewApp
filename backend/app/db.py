# app/db.py
from __future__ import annotations

import os
import json
from datetime import date, datetime
from typing import Optional, Tuple, Any, List, Dict

import psycopg2
from psycopg2.extras import RealDictCursor


def get_db_dsn() -> str:
    """
    Get database DSN from environment.
    Priority: SUPABASE_DB_URL > DATABASE_URL

    IMPORTANT: Never use SUPABASE_URL for direct DB connections!
    SUPABASE_URL is the REST API endpoint (https://*.supabase.co)
    SUPABASE_DB_URL/DATABASE_URL is the Postgres connection string.
    """
    dsn = os.getenv("SUPABASE_DB_URL", "").strip()
    if dsn:
        return dsn
    return os.getenv("DATABASE_URL", "").strip()


def _connect():
    dsn = get_db_dsn()
    if not dsn:
        raise RuntimeError("DATABASE_URL or SUPABASE_DB_URL not set")
    # Safety check: never connect to SUPABASE_URL (REST endpoint)
    if ".supabase.co" in dsn and not dsn.startswith("postgres"):
        raise RuntimeError("Invalid DB DSN: looks like SUPABASE_URL (REST), not a Postgres DSN")
    return psycopg2.connect(dsn, sslmode="require")


def db_ok() -> bool:
    try:
        if not get_db_dsn():
            return False
        conn = _connect()
        conn.close()
        return True
    except Exception:
        return False


# =========================
# Generic helpers (needed by memory_store.py)
# =========================
def run_sql(sql: str, params: Optional[tuple] = None) -> None:
    if not get_db_dsn():
        return
    conn = _connect()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, params or ())
    finally:
        conn.close()


def fetch_all(sql: str, params: Optional[tuple] = None) -> List[Dict[str, Any]]:
    if not get_db_dsn():
        return []
    conn = _connect()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params or ())
                rows = cur.fetchall()
                return list(rows) if rows else []
    finally:
        conn.close()


def fetch_one(sql: str, params: Optional[tuple] = None) -> Optional[Dict[str, Any]]:
    if not get_db_dsn():
        return None
    conn = _connect()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params or ())
                row = cur.fetchone()
                return dict(row) if row else None
    finally:
        conn.close()


# =========================
# Schema init
# =========================
def ensure_schema() -> None:
    """
    Idempotens schema init.

    - emoria_usage_daily: token/voice usage
    - memory_facts: persistent facts
    - emoria_chat_logs: every turn audit log
    - emoria_shadow_logs: future training shadow log (Qwen etc.)
    """
    if not get_db_dsn():
        return

    conn = _connect()
    try:
        with conn:
            with conn.cursor() as cur:
                # ---- usage ----
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS emoria_usage_daily (
                        id BIGSERIAL PRIMARY KEY,
                        session_id TEXT NOT NULL,
                        memberstack_id TEXT,
                        usage_day DATE NOT NULL,
                        tokens_used_today INTEGER NOT NULL DEFAULT 0,
                        usage_voice_seconds_today INTEGER NOT NULL DEFAULT 0,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    """
                )

                cur.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS ux_emoria_usage_daily_session_day
                    ON emoria_usage_daily (session_id, usage_day);
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS ix_emoria_usage_daily_member_day
                    ON emoria_usage_daily (memberstack_id, usage_day);
                    """
                )

                # ---- memory facts ----
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS memory_facts (
                        id BIGSERIAL PRIMARY KEY,
                        user_id INTEGER NOT NULL DEFAULT 0,
                        fact TEXT NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        identity_key TEXT NOT NULL
                    );
                    """
                )
                cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_facts_identity_key ON memory_facts(identity_key);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_memory_facts_created_at ON memory_facts(created_at DESC);")

                # ---- audit chat logs (ALWAYS written) ----
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS emoria_chat_logs (
                        id BIGSERIAL PRIMARY KEY,
                        ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        session_id TEXT NOT NULL,
                        memberstack_id TEXT,
                        identity_key TEXT,
                        tier TEXT,
                        lang TEXT,
                        mode TEXT,
                        user_message TEXT,
                        assistant_reply TEXT,
                        assistant_source TEXT,
                        meta_json JSONB
                    );
                    """
                )
                cur.execute("CREATE INDEX IF NOT EXISTS ix_emoria_chat_logs_session_ts ON emoria_chat_logs(session_id, ts DESC);")
                cur.execute("CREATE INDEX IF NOT EXISTS ix_emoria_chat_logs_ts ON emoria_chat_logs(ts DESC);")

                # ---- shadow logs (future training) ----
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS emoria_shadow_logs (
                        id BIGSERIAL PRIMARY KEY,
                        ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        session_id TEXT NOT NULL,
                        memberstack_id TEXT,
                        identity_key TEXT,
                        tier TEXT,
                        lang TEXT,
                        mode TEXT,
                        user_message TEXT NOT NULL,
                        production_model TEXT,
                        production_reply TEXT,
                        shadow_model TEXT,
                        shadow_reply TEXT,
                        shadow_meta_json JSONB
                    );
                    """
                )
                cur.execute("CREATE INDEX IF NOT EXISTS ix_emoria_shadow_logs_session_ts ON emoria_shadow_logs(session_id, ts DESC);")
                cur.execute("CREATE INDEX IF NOT EXISTS ix_emoria_shadow_logs_ts ON emoria_shadow_logs(ts DESC);")

    finally:
        conn.close()


# =========================
# Usage helpers (unchanged logic)
# =========================
def _parse_day(day_str: Optional[str]) -> date:
    if day_str:
        return datetime.strptime(day_str, "%Y-%m-%d").date()
    return date.today()


TIER_TOKEN_LIMITS = {
    "GENZ": 25_000,
    "GEN_Z": 25_000,
    "MILLENIAL": 40_000,
    "MILLENNIAL": 40_000,
    "FREE": 4_000,
}


def get_token_limit(tier: Optional[str]) -> int:
    t = (tier or "FREE").upper().replace("-", "_").replace(" ", "_")
    return TIER_TOKEN_LIMITS.get(t, TIER_TOKEN_LIMITS["FREE"])


def usage_get(memberstack_id: Optional[str], session_id: Optional[str], usage_day: Optional[str]) -> Tuple[str, int, int]:
    day = _parse_day(usage_day)
    day_s = day.isoformat()

    if not get_db_dsn():
        return (day_s, 0, 0)

    sid = (session_id or "").strip()
    if not sid:
        return (day_s, 0, 0)

    row = fetch_one(
        """
        SELECT tokens_used_today, usage_voice_seconds_today
        FROM emoria_usage_daily
        WHERE session_id = %s AND usage_day = %s
        """,
        (sid, day),
    )
    if not row:
        return (day_s, 0, 0)
    return (day_s, int(row.get("tokens_used_today", 0)), int(row.get("usage_voice_seconds_today", 0)))


def usage_commit_tokens(
    memberstack_id: Optional[str],
    session_id: Optional[str],
    usage_day: Optional[str],
    add_tokens: int,
    add_voice_seconds: int = 0,
) -> Tuple[str, int, int]:
    day = _parse_day(usage_day)
    day_s = day.isoformat()

    sid = (session_id or "").strip()
    if not sid:
        raise ValueError("session_id required for usage_commit_tokens")

    if not get_db_dsn():
        return (day_s, max(0, int(add_tokens)), max(0, int(add_voice_seconds)))

    conn = _connect()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    INSERT INTO emoria_usage_daily (
                        session_id, memberstack_id, usage_day,
                        tokens_used_today, usage_voice_seconds_today
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (session_id, usage_day)
                    DO UPDATE SET
                        memberstack_id = COALESCE(EXCLUDED.memberstack_id, emoria_usage_daily.memberstack_id),
                        tokens_used_today = emoria_usage_daily.tokens_used_today + EXCLUDED.tokens_used_today,
                        usage_voice_seconds_today = emoria_usage_daily.usage_voice_seconds_today + EXCLUDED.usage_voice_seconds_today,
                        updated_at = NOW()
                    RETURNING tokens_used_today, usage_voice_seconds_today
                    """,
                    (sid, (memberstack_id or None), day, max(0, int(add_tokens)), max(0, int(add_voice_seconds))),
                )
                row = cur.fetchone()
                return (day_s, int(row["tokens_used_today"]), int(row["usage_voice_seconds_today"]))
    finally:
        conn.close()


def check_token_budget(session_id: Optional[str], tier: Optional[str], required_tokens: int = 0) -> Tuple[bool, int, int, int]:
    _, tokens_used, _ = usage_get(None, session_id, None)
    token_limit = get_token_limit(tier)
    remaining = max(0, token_limit - tokens_used)
    allowed = (tokens_used + required_tokens) <= token_limit
    return (allowed, tokens_used, token_limit, remaining)


# =========================
# Logging inserts
# =========================
def insert_chat_log(
    *,
    session_id: str,
    memberstack_id: Optional[str],
    identity_key: Optional[str],
    tier: Optional[str],
    lang: Optional[str],
    mode: Optional[str],
    user_message: str,
    assistant_reply: str,
    assistant_source: str,
    meta: Optional[dict] = None,
) -> None:
    ensure_schema()
    if not get_db_dsn():
        return

    run_sql(
        """
        INSERT INTO emoria_chat_logs(
          session_id, memberstack_id, identity_key, tier, lang, mode,
          user_message, assistant_reply, assistant_source, meta_json
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
        """,
        (
            session_id,
            (memberstack_id or None),
            (identity_key or None),
            (tier or None),
            (lang or None),
            (mode or None),
            user_message,
            assistant_reply,
            assistant_source,
            json.dumps(meta or {}, ensure_ascii=False),
        ),
    )


def insert_shadow_log(
    *,
    session_id: str,
    memberstack_id: Optional[str],
    identity_key: Optional[str],
    tier: Optional[str],
    lang: Optional[str],
    mode: Optional[str],
    user_message: str,
    production_model: str,
    production_reply: str,
    shadow_model: str,
    shadow_reply: Optional[str] = None,
    shadow_meta: Optional[dict] = None,
) -> None:
    ensure_schema()
    if not get_db_dsn():
        return

    run_sql(
        """
        INSERT INTO emoria_shadow_logs(
          session_id, memberstack_id, identity_key, tier, lang, mode,
          user_message, production_model, production_reply,
          shadow_model, shadow_reply, shadow_meta_json
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
        """,
        (
            session_id,
            (memberstack_id or None),
            (identity_key or None),
            (tier or None),
            (lang or None),
            (mode or None),
            user_message,
            production_model,
            production_reply,
            shadow_model,
            shadow_reply,
            json.dumps(shadow_meta or {}, ensure_ascii=False),
        ),
    )
# --- Generic helpers for memory_store (required) ---

from typing import Any, Iterable, List, Dict, Optional, Tuple

def run_sql(sql: str, params: Optional[Tuple[Any, ...]] = None) -> None:
    conn = _connect()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
    finally:
        conn.close()

def fetch_all(sql: str, params: Optional[Tuple[Any, ...]] = None) -> List[Dict]:
    conn = _connect()
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
                return [dict(r) for r in rows] if rows else []
    finally:
        conn.close()
