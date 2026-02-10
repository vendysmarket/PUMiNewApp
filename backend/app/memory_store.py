# app/memory_store.py
from __future__ import annotations

import re
from typing import Dict, List, Optional

from .db import run_sql, fetch_all


DEFAULT_FACT_LIMIT = 12


def _tier_norm(t: Optional[str]) -> str:
    return (t or "FREE").strip().upper()


def _should_persist_memory(tier: Optional[str]) -> bool:
    t = _tier_norm(tier)
    # FREE: no long-term memory
    if t in ("FREE",):
        return False
    # GENZ + MILLENNIAL: full long-term memory
    if t in ("GENZ", "GEN_Z", "MILLENNIAL", "MILLENIAL"):
        return True
    # default safe: no persistence for unknown tiers
    return False


def _normalize_identity_key(
    *,
    identity_key: Optional[str] = None,
    user_key: Optional[str] = None,
    memberstack_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> str:
    # Prefer stable identity:
    for k in (identity_key, memberstack_id, user_key, session_id):
        if k and str(k).strip():
            return str(k).strip()
    return "anon"


def ensure_schema() -> None:
    run_sql(
        """
        CREATE TABLE IF NOT EXISTS memory_facts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL DEFAULT 0,
            fact TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            identity_key TEXT NOT NULL
        );
        """
    )
    run_sql("CREATE INDEX IF NOT EXISTS idx_memory_facts_identity_key ON memory_facts(identity_key);")
    run_sql("CREATE INDEX IF NOT EXISTS idx_memory_facts_created_at ON memory_facts(created_at DESC);")


def fetch_recent_facts(*, identity_key: str, limit: int = DEFAULT_FACT_LIMIT) -> List[Dict]:
    ensure_schema()
    rows = fetch_all(
        """
        SELECT id, user_id, fact, created_at, identity_key
        FROM memory_facts
        WHERE identity_key = %s
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (identity_key, int(limit)),
    )
    return rows or []


def store_facts(*, identity_key: str, facts: List[str], user_id: int = 0) -> int:
    ensure_schema()
    if not facts:
        return 0

    inserted = 0
    for f in facts:
        fact = (f or "").strip()
        if not fact:
            continue
        # IMPORTANT: always set created_at explicitly too (even if DB has default)
        run_sql(
            """
            INSERT INTO memory_facts (user_id, fact, created_at, identity_key)
            VALUES (%s, %s, NOW(), %s)
            """,
            (int(user_id), fact, identity_key),
        )
        inserted += 1
    return inserted


# --- Fact extraction (simple, safe) ---

_PATTERNS = [
    # "X vagyok / X-nak hívnak"
    re.compile(r"\b(?:a nevem|hívnak)\s+([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű\- ]{2,40})", re.I),
    # "itt lakom"
    re.compile(r"\b(?:zakros|kr[eé]ta|lassithi|sitia)\b", re.I),
    # "júniusra elkészül" type timeline
    re.compile(r"\b(?:janu[aá]r|febru[aá]r|m[aá]rcius|[aá]prilis|m[aá]jus|j[uú]nius|j[uú]lius|augusztus|szeptember|okt[oó]ber|november|december)\b", re.I),
]


def _extract_facts_from_message(message: str) -> List[str]:
    m = (message or "").strip()
    if not m:
        return []

    facts: List[str] = []

      # --- life / events ---
    if re.search(r"\bsz[üu]let[eé]snapom\b", m, re.I) or re.search(r"\bma van a sz[üu]let[eé]snapom\b", m, re.I):
        facts.append("Ma van a születésnapod.")

    # --- business / restaurant ---
    if re.search(r"\b(?:bez[aá]rjuk|bez[aá]rom|bez[aá]r|v[eé]gleg bez[aá]r)\b", m, re.I) and re.search(r"\b(?:[eé]tterem|pizz[eé]ria|centro)\b", m, re.I):
        facts.append("Azt mondtad, felmerült/tervben van az étterem bezárása.")

    # --- renovation / timeline (more general) ---
    if re.search(r"\bfel[úu]j[ií]tunk\b", m, re.I) and re.search(r"\bh[aá]z\b", m, re.I):
        facts.append("Most házfelújításon dolgozol.")

    if re.search(r"\bj[uú]niusra\b", m, re.I) and re.search(r"\b(?:k[eé]sz|elk[eé]sz[uü]l)\b", m, re.I):
        facts.append("A terv az, hogy júniusra kész legyen a felújítás.")
    if re.search(r"\bszül(?:e|é)tesnap", m, re.I) and re.search(r"\bma\b", m, re.I):
        facts.append("Ma van a születésnapod.")

    if re.search(r"\bbezár", m, re.I) and re.search(r"\b(?:étterm|restaurant)\b", m, re.I):
        facts.append("Felmerült, hogy bezárjátok az éttermet.")


    # de-dup
    uniq = []
    seen = set()
    for f in facts:
        k = f.lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(f)

    return uniq[:4]


def build_memory_block(
    *,
    identity_key: Optional[str] = None,
    user_key: Optional[str] = None,
    memberstack_id: Optional[str] = None,
    session_id: Optional[str] = None,
    tier: Optional[str] = None,
    limit: int = DEFAULT_FACT_LIMIT,
) -> str:
    if not _should_persist_memory(tier):
        return ""

    ik = _normalize_identity_key(
        identity_key=identity_key,
        user_key=user_key,
        memberstack_id=memberstack_id,
        session_id=session_id,
    )

    try:
        ensure_schema()
        rows = fetch_recent_facts(identity_key=ik, limit=limit)
    except Exception as e:
        print(f"[memory_store] build_memory_block: DB error: {e}")
        return ""

    if not rows:
        return ""

    lines = []
    for r in rows:
        fact = (r.get("fact") or "").strip()
        if fact:
            lines.append(f"- {fact}")

    if not lines:
        return ""

    return "MEMORY FACTS (persistent):\n" + "\n".join(lines) + "\n"


def maybe_persist_from_message(
    *,
    message: str,
    tier: Optional[str],
    identity_key: Optional[str] = None,
    user_key: Optional[str] = None,
    memberstack_id: Optional[str] = None,
    session_id: Optional[str] = None,
    user_id: int = 0,
) -> int:
    if not _should_persist_memory(tier):
        return 0

    ik = _normalize_identity_key(
        identity_key=identity_key,
        user_key=user_key,
        memberstack_id=memberstack_id,
        session_id=session_id,
    )

    try:
        ensure_schema()
        facts = _extract_facts_from_message(message)
        return store_facts(identity_key=ik, facts=facts, user_id=user_id)
    except Exception as e:
        print(f"[memory_store] maybe_persist_from_message: {e}")
        return 0
def store_memory_fact(
    identity_key: str,
    user_message: str,
    assistant_message: str | None = None,
    tier: str | None = None,
    session_id: str | None = None,
) -> int:
    # csak user message-ből mentsünk (biztonságosabb, kevesebb zaj)
    return maybe_persist_from_message(
        message=user_message,
        tier=tier,
        identity_key=identity_key,
        session_id=session_id,
    )
def store_memory_fact(
    identity_key: str,
    user_message: str,
    assistant_message: str | None = None,
    tier: str | None = None,
    session_id: str | None = None,
) -> int:
    """
    Extracts memory facts from user_message and inserts them into DB.
    Returns how many facts were actually inserted (best-effort).
    """
    # FREE tier: don't persist
    if (tier or "").upper() == "FREE":
        return 0

    msg = (user_message or "").strip()
    if not msg:
        return 0

    facts = _extract_facts_from_message(msg)
    if not facts:
        return 0

    # Persist facts; count successful inserts (dedupe-safe)
    inserted = 0
    for fact in facts:
        try:
            # store_facts may exist; if you already have it, keep it and call it.
            # Here we do safe per-row insert to count inserts reliably.
            row = fetch_all(
                """
                INSERT INTO memory_facts (identity_key, fact)
                VALUES (%s, %s)
                ON CONFLICT (identity_key, fact) DO NOTHING
                RETURNING id
                """,
                (identity_key, fact),
            )
            if row:
                inserted += 1
        except Exception:
            # never crash memory pipeline
            continue

    return inserted
