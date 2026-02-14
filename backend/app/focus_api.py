from __future__ import annotations



import os
import base64
import json
import uuid

from datetime import datetime

from typing import Any, Dict, List, Optional

from zoneinfo import ZoneInfo



from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel


from supabase import create_client, Client  # pip: supabase



router = APIRouter(prefix="/focus", tags=["focus"])

# Claude API (for upload_review feedback)
try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except Exception:
    ANTHROPIC_AVAILABLE = False
    Anthropic = None

CLAUDE_API_KEY = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
CLAUDE_MODEL = (os.getenv("CLAUDE_MODEL") or "claude-sonnet-4-20250514").strip()
claude = Anthropic(api_key=CLAUDE_API_KEY) if ANTHROPIC_AVAILABLE and CLAUDE_API_KEY else None

ALLOWED_MODES = {"learning", "project"}
LEARNING_TASK_TYPES = {"lesson", "quiz", "single_select"}
PROJECT_TASK_TYPES = {"upload_review", "checklist", "quiz"}
UPLOAD_REVIEW_MAX_BYTES = 5 * 1024 * 1024  # 5MB


# Timezone for daily reset (Budapest = Europe/Budapest)
try:
    BUDAPEST = ZoneInfo("Europe/Budapest")
    EFFECTIVE_TZ = "Europe/Budapest"
except Exception:
    BUDAPEST = ZoneInfo("UTC")
    EFFECTIVE_TZ = "UTC"
print(f"[timezone] Using {EFFECTIVE_TZ} for focus reset")



# Low-effort responses that don't count as real interaction

# These are trivial inputs users might type to bypass validation

LOW_EFFORT_RESPONSES = {
    "ok", "oké", "kész", "megcsináltam", "done", "yes", "igen",
    "ready", "finished", "complete", "completed", "megvan",
    "na", "jó", "jo", "yep", "yup", "k", "x", ".", "..",
}


def _require_mode(mode: Optional[str]) -> str:
    m = (mode or "").strip().lower()
    if not m:
        raise HTTPException(status_code=400, detail="Missing mode")
    if m not in ALLOWED_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {m}")
    return m


def _strip_data_url(raw: str) -> str:
    if not raw:
        return ""
    if raw.startswith("data:") and "base64," in raw:
        return raw.split("base64,", 1)[1]
    return raw


def _fallback_review_response(message: str) -> Dict[str, Any]:
    return {
        "feedback": message,
        "strengths": [],
        "improvements": ["Please upload a clear image or readable text file."],
        "next_step": "Upload a supported file (image or text) for review.",
    }


def _strip_json_fences(text: str) -> str:
    s = (text or "").strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s
    if s.endswith("```"):
        s = s.rsplit("\n", 1)[0] if "\n" in s else s
    return s.strip()


def _extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    s = _strip_json_fences(text)
    start = s.find("{")
    end = s.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(s[start : end + 1])
    except Exception:
        return None


def _coerce_review_response(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return _fallback_review_response("Could not parse model response.")
    feedback = str(raw.get("feedback") or "").strip() or "Feedback not available."
    strengths = raw.get("strengths") or []
    improvements = raw.get("improvements") or []
    if not isinstance(strengths, list):
        strengths = [str(strengths)]
    if not isinstance(improvements, list):
        improvements = [str(improvements)]
    next_step = str(raw.get("next_step") or "").strip() or "Provide a revised file for review."
    return {
        "feedback": feedback,
        "strengths": [str(s) for s in strengths if str(s).strip()],
        "improvements": [str(i) for i in improvements if str(i).strip()],
        "next_step": next_step,
    }


def _build_content_body_md(content_data: Dict[str, Any]) -> str:
    summary = str(content_data.get("summary") or "").strip()
    key_points = content_data.get("key_points") or []
    example = str(content_data.get("example") or "").strip()
    micro_task = content_data.get("micro_task") or None
    common_mistakes = content_data.get("common_mistakes") or []

    parts: List[str] = []
    if summary:
        parts.append(f"### Összefoglaló\n{summary}")
    if isinstance(key_points, list) and key_points:
        bullets = "\n".join([f"- {str(p)}" for p in key_points if str(p).strip()])
        if bullets:
            parts.append(f"### Kulcspontok\n{bullets}")
    if example:
        parts.append(f"### Példa\n{example}")
    if micro_task:
        if isinstance(micro_task, str):
            parts.append(f"### Mikro-feladat\n{micro_task}")
        elif isinstance(micro_task, dict):
            instruction = str(micro_task.get("instruction") or "").strip()
            expected = str(micro_task.get("expected_output") or "").strip()
            lines = []
            if instruction:
                lines.append(f"**Feladat:** {instruction}")
            if expected:
                lines.append(f"**Elvárt kimenet:** {expected}")
            if lines:
                parts.append("### Mikro-feladat\n" + "\n".join(lines))
    if isinstance(common_mistakes, list) and common_mistakes:
        bullets = "\n".join([f"- {str(m)}" for m in common_mistakes if str(m).strip()])
        if bullets:
            parts.append(f"### Gyakori hibák\n{bullets}")

    return "\n\n".join(parts).strip()


def _extract_lesson_context(content: Dict[str, Any]) -> str:
    """
    Extract a compact, structured context from a language lesson content dict.
    Accepts either a full focus item or the inner lesson content object.
    """
    if not isinstance(content, dict):
        return ""

    src = content
    # If this looks like a full item, unwrap content
    if isinstance(content.get("content"), dict) and (content.get("kind") or content.get("schema_version")):
        src = content.get("content") or {}
    # If wrapped as data
    if isinstance(src.get("data"), dict):
        src = src.get("data") or {}

    parts: List[str] = []

    # Vocabulary
    vocab = src.get("vocabulary_table") or []
    if isinstance(vocab, list) and vocab:
        items = []
        for v in vocab[:15]:
            if not isinstance(v, dict):
                continue
            word = str(v.get("word") or "").strip()
            translation = str(v.get("translation") or "").strip()
            if word and translation:
                items.append(f"{word} = {translation}")
        if items:
            parts.append("VOCABULARY:\n- " + "\n- ".join(items))

    # Grammar
    grammar = src.get("grammar_explanation") or {}
    if isinstance(grammar, dict) and grammar:
        rule_title = str(grammar.get("rule_title") or "").strip()
        formation = str(grammar.get("formation_pattern") or "").strip()
        examples = []
        for ex in (grammar.get("examples") or [])[:3]:
            if not isinstance(ex, dict):
                continue
            tgt = str(ex.get("target") or "").strip()
            hu = str(ex.get("hungarian") or "").strip()
            if tgt and hu:
                examples.append(f"{tgt} — {hu}")
        lines = []
        if rule_title:
            lines.append(f"Rule: {rule_title}")
        if formation:
            lines.append(f"Pattern: {formation}")
        if examples:
            lines.append("Examples: " + "; ".join(examples))
        if lines:
            parts.append("GRAMMAR:\n" + "\n".join(lines))

    # Dialogue snippets (1-2 lines)
    dialogues = src.get("dialogues") or []
    if isinstance(dialogues, list) and dialogues:
        snippets = []
        for d in dialogues:
            if not isinstance(d, dict):
                continue
            for line in (d.get("lines") or [])[:2]:
                if not isinstance(line, dict):
                    continue
                text = str(line.get("text") or "").strip()
                tr = str(line.get("translation") or "").strip()
                if text and tr:
                    snippets.append(f"{text} — {tr}")
            if snippets:
                break
        if snippets:
            parts.append("DIALOGUE:\n- " + "\n- ".join(snippets))

    # Common mistakes
    mistakes = src.get("common_mistakes") or []
    if isinstance(mistakes, list) and mistakes:
        mitems = [str(m).strip() for m in mistakes[:5] if str(m).strip()]
        if mitems:
            parts.append("COMMON MISTAKES:\n- " + "\n- ".join(mitems))

    return "\n\n".join(parts).strip()
def today_local_iso() -> str:

    """Get today's date in Budapest timezone as ISO string (YYYY-MM-DD)."""

    return datetime.now(BUDAPEST).date().isoformat()





def _normalize_supabase_url(raw: str) -> str:

    """Ensure SUPABASE_URL has https:// prefix and no trailing slash."""

    raw = (raw or "").strip()

    if not raw:

        return ""

    if not raw.startswith("http://") and not raw.startswith("https://"):

        raw = "https://" + raw

    return raw.rstrip("/")





def _validate_supabase_url(url: str) -> bool:

    """

    Validate that SUPABASE_URL is a proper Supabase project URL.

    Must be https://<project>.supabase.co format.

    NOT a direct Postgres DSN.

    """

    if not url:

        return False

    if not url.startswith("https://"):

        return False

    # Must be supabase.co domain (not db.* or other variants)

    if ".supabase.co" not in url:

        return False

    # Must NOT be a database DSN (no postgres://, no port numbers)

    if "postgres" in url.lower() or ":5432" in url or ":6543" in url:

        return False

    return True





def _is_valid_uuid(val: str) -> bool:

    """Check if string is a valid UUID."""

    try:

        uuid.UUID(str(val))

        return True

    except (ValueError, AttributeError):

        return False





SUPABASE_URL = _normalize_supabase_url(os.getenv("SUPABASE_URL"))

SUPABASE_URL_VALID = _validate_supabase_url(SUPABASE_URL)



if not SUPABASE_URL_VALID and SUPABASE_URL:

    print(f"[focus_api] WARNING: SUPABASE_URL appears invalid: {SUPABASE_URL[:50]}...")

    print("[focus_api] Expected format: https://<project>.supabase.co")

SUPABASE_SERVICE_ROLE_KEY = (

    os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    or os.getenv("SUPABASE_SERVICE_KEY")

    or os.getenv("SUPABASE_SERVICE_ROLE")

    or ""

).strip()



# RAILWAY_TOKEN: shared secret for proxy-to-backend authentication

# When set, allows trusted proxies to pass user ID via X-User-ID header

RAILWAY_TOKEN = (os.getenv("RAILWAY_TOKEN") or "").strip()



# ADMIN_KEY: secret for admin endpoints (backfill, migrations, etc.)

# Set this in Railway env to protect admin operations

ADMIN_KEY = (os.getenv("ADMIN_KEY") or os.getenv("PUMI_ADMIN_KEY") or "").strip()



if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:

    # Don't crash import; fail on request with clear error

    supabase_admin: Optional[Client] = None

else:

    supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)





def _require_admin() -> Client:

    if not supabase_admin:

        if not SUPABASE_URL_VALID:

            raise HTTPException(

                status_code=503,

                detail="SUPABASE_URL invalid. Expected https://<project>.supabase.co format"

            )

        raise HTTPException(status_code=503, detail="Supabase admin client not configured")

    return supabase_admin





def _safe_execute(query):

    """

    Safely execute a Supabase query that uses maybe_single().

    Returns the response or None if no data (204 response).

    """

    try:

        result = query.execute()

        return result

    except Exception as e:

        # Handle 204 No Content responses from maybe_single()

        if "204" in str(e) or "Missing response" in str(e):

            return None

        raise





def _require_admin_key(request: Request) -> None:

    """

    Verify X-Admin-Key header matches ADMIN_KEY env variable.

    Used to protect admin endpoints from unauthorized access.



    NOTE: X-User-ID alone is NOT secure (can be spoofed).

    Admin endpoints MUST check ADMIN_KEY.

    """

    if not ADMIN_KEY:

        raise HTTPException(

            status_code=503,

            detail="ADMIN_KEY not configured. Set ADMIN_KEY or PUMI_ADMIN_KEY env variable."

        )



    provided_key = request.headers.get("x-admin-key") or ""

    if not provided_key:

        raise HTTPException(status_code=403, detail="Missing X-Admin-Key header")



    if provided_key != ADMIN_KEY:

        raise HTTPException(status_code=403, detail="Invalid admin key")





async def get_user_id(request: Request) -> str:

    """

    Get user ID from request. Supports two auth methods:



    1. RAILWAY_TOKEN mode (for pumi-proxy):

       - Authorization: Bearer <RAILWAY_TOKEN>

       - X-User-ID: <user_id>



    2. Direct Supabase JWT mode (legacy):

       - Authorization: Bearer <supabase_access_token>

       - Validates token against Supabase /auth/v1/user



    Returns: Valid UUID string (validated)

    Raises: HTTPException 401 if not authenticated or invalid UUID

    """

    auth = request.headers.get("authorization") or ""

    if not auth.lower().startswith("bearer "):

        raise HTTPException(status_code=401, detail="Missing Authorization Bearer token")

    token = auth.split(" ", 1)[1].strip()

    if not token:

        raise HTTPException(status_code=401, detail="Empty token")



    # Method 1: RAILWAY_TOKEN + X-User-ID (trusted proxy)

    if RAILWAY_TOKEN and token == RAILWAY_TOKEN:

        user_id = request.headers.get("x-user-id") or ""

        if not user_id:

            raise HTTPException(status_code=401, detail="RAILWAY_TOKEN requires X-User-ID header")

        # Validate UUID format

        if not _is_valid_uuid(user_id):

            raise HTTPException(status_code=401, detail="Invalid user_id format (must be UUID)")

        return user_id



    # Method 2: Verify Supabase JWT directly

    if not SUPABASE_URL_VALID:

        raise HTTPException(status_code=503, detail="Supabase not configured properly")



    import httpx



    url = SUPABASE_URL.rstrip("/") + "/auth/v1/user"

    headers = {

        "Authorization": f"Bearer {token}",

        "apikey": SUPABASE_SERVICE_ROLE_KEY,

    }



    async with httpx.AsyncClient(timeout=15) as client:

        r = await client.get(url, headers=headers)



    if r.status_code != 200:

        raise HTTPException(status_code=401, detail="Invalid Supabase token")



    data = r.json()

    uid = data.get("id")

    if not uid:

        raise HTTPException(status_code=401, detail="Invalid Supabase token (no user id)")

    # Validate UUID format

    if not _is_valid_uuid(uid):

        raise HTTPException(status_code=401, detail="Invalid user_id from Supabase (not UUID)")

    return uid





class StartDayReq(BaseModel):

    plan_id: str





class CompleteItemReq(BaseModel):

    item_id: str

    status: str = "done"  # done/not_started

    score: Optional[float] = None

    result_json: Optional[Dict[str, Any]] = None





class CompleteDayReq(BaseModel):

    plan_id: str

    day_index: int





class ResetFocusReq(BaseModel):
    mode: str
    plan_id: str
    reset_mode: str = "archive"  # archive/delete




# --- Create Plan models ---

class FocusItemInput(BaseModel):

    itemKey: str

    type: str  # "lesson" | "practice" | "task"

    practiceType: Optional[str] = None  # "roleplay" | "quiz" | "writing" | "translation" etc.

    topic: str

    label: str

    estimatedMinutes: int = 5

    contentDepth: Optional[str] = None  # "short" | "medium" | "substantial"





# =========================
# DOMAIN-BASED ITEM TYPE WHITELIST
# =========================

# Allowed item types per domain
# Language domains get extended types for practice activities
DOMAIN_ALLOWED_TYPES = {
    "language_learning": {"lesson", "quiz", "single_select", "practice", "cards", "flashcard", "translation", "roleplay", "dialogue", "writing"},
    "language": {"lesson", "quiz", "single_select", "practice", "cards", "flashcard", "translation", "roleplay", "dialogue", "writing"},
    "learning": {"lesson", "quiz", "single_select", "practice", "cards", "flashcard", "translation", "roleplay", "dialogue", "writing"},
    "project": {"upload_review", "checklist", "quiz"},
    "business": {"upload_review", "checklist", "quiz"},
    "fitness": {"lesson", "quiz", "single_select"},
    "habits": {"lesson", "quiz", "single_select"},
    "programming": {"lesson", "quiz", "single_select"},
    "other": {"lesson", "quiz", "single_select"},
}

# Allowed practice_types per domain
# Language domains allow rich practice types; other domains stay restricted
DOMAIN_ALLOWED_PRACTICE_TYPES = {
    "language_learning": {"translation", "exercise", "roleplay", "dialogue", "cards", "flashcard", "writing"},
    "language": {"translation", "exercise", "roleplay", "dialogue", "cards", "flashcard", "writing"},
    "learning": {"translation", "exercise", "roleplay", "dialogue", "cards", "flashcard", "writing"},
    "project": set(),
    "business": set(),
    "fitness": set(),
    "habits": set(),
    "programming": set(),
    "other": set(),
}

# Mapping: practice_type → canonical kind (must match llm_client.py VALID_KINDS)
PRACTICE_TYPE_TO_KIND = {
    "translation": "translation",
    "exercise": "roleplay",      # exercise = roleplay dialogue for language
    "roleplay": "roleplay",
    "dialogue": "roleplay",
    "cards": "cards",
    "flashcard": "cards",
    "writing": "writing",
}

# Mapping: item_type → canonical kind (for non-practice items)
ITEM_TYPE_TO_KIND = {
    "lesson": "content",
    "quiz": "quiz",
    "single_select": "quiz",
    "checklist": "checklist",
    "upload_review": "upload_review",
    "translation": "translation",
    "roleplay": "roleplay",
    "dialogue": "roleplay",
    "cards": "cards",
    "flashcard": "cards",
    "writing": "writing",
    "practice": "checklist",  # generic practice defaults to checklist
}


def _normalize_item_for_domain(
    item_type: str,
    practice_type: Optional[str],
    domain: str,
    topic: str = "",
) -> tuple[str, Optional[str], str, dict]:
    """
    Normalize item type/practice_type for the given domain.
    Returns (normalized_type, normalized_practice_type, normalized_kind, normalized_content).

    Language domains (language, language_learning) allow practice_type.
    Other domains: practice_type is forbidden.
    """
    domain_lower = (domain or "other").lower()
    item_type_lower = (item_type or "").lower().strip()
    practice_type_lower = (practice_type or "").lower().strip()

    # Get allowed types and practice types for this domain
    allowed_types = DOMAIN_ALLOWED_TYPES.get(domain_lower, DOMAIN_ALLOWED_TYPES["other"])
    allowed_practice = DOMAIN_ALLOWED_PRACTICE_TYPES.get(domain_lower, set())

    # Handle practice_type
    if practice_type_lower:
        # Check if practice_type is allowed for this domain
        if practice_type_lower not in allowed_practice:
            print(f"[NORMALIZE] Blocked practice_type '{practice_type_lower}' for domain '{domain_lower}'")
            raise HTTPException(status_code=409, detail="task_not_allowed_for_mode")

        # For practice types, normalize item_type to "practice" or the practice_type itself
        # and determine kind from practice_type
        if item_type_lower in ("practice", "exercise", ""):
            normalized_type = "practice"
        else:
            # Keep item_type if it's a specific type like "translation", "roleplay"
            normalized_type = item_type_lower

        # Get kind from practice_type mapping
        kind = PRACTICE_TYPE_TO_KIND.get(practice_type_lower, "checklist")
        normalized_content: dict = {}

        return normalized_type, practice_type_lower, kind, normalized_content

    # No practice_type - handle item_type normalization
    # Normalize single_select → quiz
    if item_type_lower == "single_select":
        normalized_type = "quiz"
    else:
        normalized_type = item_type_lower

    # Check if item_type is allowed for this domain
    if normalized_type not in allowed_types:
        print(f"[NORMALIZE] Blocked item_type '{normalized_type}' for domain '{domain_lower}'")
        raise HTTPException(status_code=409, detail="task_not_allowed_for_mode")

    # Get kind from item_type mapping (or fallback to _determine_kind_from_type)
    kind = ITEM_TYPE_TO_KIND.get(normalized_type, _determine_kind_from_type(normalized_type, None))
    normalized_content: dict = {}

    return normalized_type, None, kind, normalized_content

def _sanitize_content_for_domain(content: dict, domain: str, item_type: str) -> dict:

    """

    Final sanitizer: remove language-learning patterns from non-language content.

    This is the LAST LINE OF DEFENSE.

    """

    domain_lower = (domain or "other").lower()



    # Language domains don't need sanitization

    if domain_lower in ("language_learning", "language", "learning"):

        return content



    # Patterns that indicate language-learning content (should not appear in non-language domains)

    FORBIDDEN_PATTERNS = [
        "fordítsd le", "fordítás", "translation", "translate",
        "ciao", "italiano", "olasz", "italian",
        "role-play", "roleplay", "párbeszéd gyakorlat",
        "célnyelv", "target language", "foreign language",
        "vocabulary", "szókincs", "grammar", "nyelvtan",
    ]



    def contains_forbidden(text: str) -> bool:

        if not text:

            return False

        text_lower = text.lower()

        return any(pattern in text_lower for pattern in FORBIDDEN_PATTERNS)



    # Check and clean content fields

    sanitized = dict(content)



    # Check common text fields

    for field in ["prompt", "question", "body_md", "text", "instructions"]:

        if field in sanitized and contains_forbidden(str(sanitized.get(field, ""))):

            print(f"[DOMAIN_GUARD] Sanitizing forbidden content in field '{field}' for domain '{domain}'")

            # Replace with generic content based on item_type

            if item_type in ("quiz", "single_select"):
                sanitized[field] = "Válaszd ki a helyes választ!"
            else:
                sanitized[field] = "Feladat leírása"


    return sanitized





def _determine_kind_from_type(item_type: str, practice_type: Optional[str] = None) -> str:
    """
    Deterministically map item type → canonical kind for UI rendering.
    This is the SINGLE SOURCE OF TRUTH for kind determination.

    Canonical kinds (must match VALID_KINDS in llm_client.py):
    - "content" → read-only lesson (no input)
    - "quiz" → multiple choice
    - "checklist" → task with proof (textarea)
    - "upload_review" → file upload review
    - "translation" → translation exercise
    - "cards" → flashcards
    - "roleplay" → dialogue/roleplay practice
    - "writing" → writing prompt
    """
    item_type_lower = (item_type or "").lower().strip()
    practice_type_lower = (practice_type or "").lower().strip()

    # If practice_type is specified, use PRACTICE_TYPE_TO_KIND mapping
    if practice_type_lower and practice_type_lower in PRACTICE_TYPE_TO_KIND:
        return PRACTICE_TYPE_TO_KIND[practice_type_lower]

    # Use ITEM_TYPE_TO_KIND mapping if available
    if item_type_lower in ITEM_TYPE_TO_KIND:
        return ITEM_TYPE_TO_KIND[item_type_lower]

    # Legacy fallback
    if item_type_lower == "lesson":
        return "content"
    if item_type_lower == "quiz":
        return "quiz"
    if item_type_lower == "checklist":
        return "checklist"
    if item_type_lower == "upload_review":
        return "upload_review"

    return "content"


def _sanitize_item_row_for_insert(item_row: Dict[str, Any], order_idx: int) -> Dict[str, Any]:
    """
    Sanitize item_row before DB insert.
    Ensures all NOT NULL fields have valid values.
    """
    row = dict(item_row)  # Copy to avoid mutation

    # Ensure kind has a value (fallback to type-based determination or 'content')
    if not row.get("kind"):
        item_type = row.get("type", "")
        row["kind"] = _determine_kind_from_type(item_type) if item_type else "content"

    # Ensure type has a value (fallback to kind or 'lesson')
    if not row.get("type"):
        row["type"] = row.get("kind", "lesson") or "lesson"

    # Ensure item_key has a value
    if not row.get("item_key"):
        kind = row.get("kind", "item")
        row["item_key"] = f"{kind}_{order_idx}"

    # Ensure topic has a value (NOT NULL with default '')
    if row.get("topic") is None:
        row["topic"] = ""

    # Ensure label has a value (NOT NULL with default '')
    if row.get("label") is None:
        row["label"] = row.get("type", "Item").capitalize()

    # Ensure order_index is int
    if row.get("order_index") is None:
        row["order_index"] = order_idx

    # Ensure estimated_minutes is int
    if row.get("estimated_minutes") is None:
        row["estimated_minutes"] = 5

    # Ensure content is dict if provided, otherwise don't include (let DB default)
    if "content" in row and row["content"] is None:
        del row["content"]

    return row


class FocusDayInput(BaseModel):

    dayIndex: int

    title: str

    intro: Optional[str] = None

    items: List[FocusItemInput] = []  # Can be empty initially





class CreatePlanReq(BaseModel):

    title: str

    domain: str

    level: str

    lang: str = "hu"

    mode: str = "learning"  # "learning" | "project" - required for mode validation

    minutes_per_day: Optional[int] = None

    # Wizard settings that affect content generation
    tone: Optional[str] = None  # "casual" | "neutral" | "strict"
    difficulty: Optional[str] = None  # "easy" | "normal" | "hard"
    pacing: Optional[str] = None  # "small_steps" | "big_blocks"

    # Force new plan creation (skip idempotency, delete old plan if exists)
    force_new: bool = False

    days: List[FocusDayInput]



    class Config:

        extra = "ignore"  # Ignore _path, message, etc.





class GetDayReq(BaseModel):

    plan_id: str

    day_index: int





def _generate_default_items_for_domain(
    domain: str,
    day_index: int,
    day_title: str,
    settings: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate default items for a day based on domain and settings.
    Called when frontend sends empty/missing items array.

    Settings affect item count and depth:
    - minutes_per_day: 10 -> 1 lesson + 1 quiz
                       20 -> 1 lesson (2 sections) + 2 quizzes
                       45 -> 2 lessons + 3 quizzes + 1 practice

    Returns list of item dicts ready for DB insertion (without id/day_id).
    """
    domain_lower = (domain or "other").lower()
    settings = settings or {}
    minutes = settings.get("minutes_per_day", 20)

    if domain_lower in ("project", "business"):
        items = [
            {
                "order_index": 0,
                "item_key": f"d{day_index}-upload-review-1",
                "type": "upload_review",
                "kind": "upload_review",
                "practice_type": None,
                "topic": day_title,
                "label": "Fájl ellenőrzés",
                "estimated_minutes": 5,
            },
            {
                "order_index": 1,
                "item_key": f"d{day_index}-checklist-1",
                "type": "checklist",
                "kind": "checklist",
                "practice_type": None,
                "topic": day_title,
                "label": "Checklist",
                "estimated_minutes": 8,
            },
            {
                "order_index": 2,
                "item_key": f"d{day_index}-quiz-1",
                "type": "quiz",
                "kind": "quiz",
                "practice_type": None,
                "topic": day_title,
                "label": "Kvíz",
                "estimated_minutes": 4,
            },
        ]
        # Add extra items for longer sessions
        if minutes >= 45:
            items.append({
                "order_index": 3,
                "item_key": f"d{day_index}-practice-1",
                "type": "checklist",
                "kind": "checklist",
                "practice_type": None,
                "topic": day_title,
                "label": "Gyakorlat",
                "estimated_minutes": 10,
            })
        return items

    # Learning domain - scale by minutes_per_day
    items = []
    order = 0

    if minutes <= 10:
        # 10 min: 1 short lesson + 1 quiz
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-lesson-1",
            "type": "lesson",
            "kind": "content",
            "practice_type": None,
            "topic": day_title,
            "label": "Tananyag",
            "estimated_minutes": 6,
            "content_depth": "short",  # Signal for LLM
        })
        order += 1
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-quiz-1",
            "type": "quiz",
            "kind": "quiz",
            "practice_type": None,
            "topic": day_title,
            "label": "Kvíz",
            "estimated_minutes": 4,
        })
    elif minutes <= 20:
        # 20 min: 1 medium lesson + 2 quizzes
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-lesson-1",
            "type": "lesson",
            "kind": "content",
            "practice_type": None,
            "topic": day_title,
            "label": "Tananyag",
            "estimated_minutes": 10,
            "content_depth": "medium",
        })
        order += 1
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-quiz-1",
            "type": "quiz",
            "kind": "quiz",
            "practice_type": None,
            "topic": day_title,
            "label": "Ismétlő kvíz",
            "estimated_minutes": 5,
        })
        order += 1
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-quiz-2",
            "type": "quiz",
            "kind": "quiz",
            "practice_type": None,
            "topic": day_title,
            "label": "Elmélyítő kvíz",
            "estimated_minutes": 5,
        })
    else:
        # 45 min: 2 lessons (structured) + 3 quizzes + 1 practice
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-lesson-1",
            "type": "lesson",
            "kind": "content",
            "practice_type": None,
            "topic": f"{day_title} - Alapok",
            "label": "Tananyag I.",
            "estimated_minutes": 12,
            "content_depth": "substantial",
        })
        order += 1
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-quiz-1",
            "type": "quiz",
            "kind": "quiz",
            "practice_type": None,
            "topic": f"{day_title} - Alapok",
            "label": "Kvíz I.",
            "estimated_minutes": 5,
        })
        order += 1
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-lesson-2",
            "type": "lesson",
            "kind": "content",
            "practice_type": None,
            "topic": f"{day_title} - Haladó",
            "label": "Tananyag II.",
            "estimated_minutes": 12,
            "content_depth": "substantial",
        })
        order += 1
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-quiz-2",
            "type": "quiz",
            "kind": "quiz",
            "practice_type": None,
            "topic": f"{day_title} - Haladó",
            "label": "Kvíz II.",
            "estimated_minutes": 5,
        })
        order += 1
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-practice-1",
            "type": "writing",
            "kind": "writing",
            "practice_type": "writing",
            "topic": day_title,
            "label": "Gyakorlat",
            "estimated_minutes": 8,
        })
        order += 1
        items.append({
            "order_index": order,
            "item_key": f"d{day_index}-quiz-3",
            "type": "quiz",
            "kind": "quiz",
            "practice_type": None,
            "topic": day_title,
            "label": "Összefoglaló kvíz",
            "estimated_minutes": 5,
        })

    return items

@router.post("/create-plan")

async def create_plan(req: CreatePlanReq, request: Request):

    """

    Create a new focus plan from FocusOutline.

    Creates: focus_plans + focus_days + focus_items



    IDEMPOTENT: If user already has an active plan with the same title,

    returns existing plan instead of creating a duplicate.



    ITEMS-OPTIONAL: If days[i].items is empty or missing, generates

    default items server-side based on domain.

    """

    # Debug: log incoming payload (safe - no PII)
    print(f"[create-plan] === INCOMING REQUEST ===")
    print(f"  title={req.title}")
    print(f"  domain={req.domain}")
    print(f"  level={req.level}")
    print(f"  mode={req.mode}")
    print(f"  minutes_per_day={req.minutes_per_day}")
    print(f"  days_count={len(req.days)}")
    for i, d in enumerate(req.days):
        print(f"  day[{i}]: dayIndex={d.dayIndex}, title={d.title[:50] if d.title else 'N/A'}, intro={d.intro[:30] if d.intro else 'N/A'}..., items_count={len(d.items)}")

    try:
        uid = await get_user_id(request)
        print(f"[create-plan] user_id={uid}")

        sb = _require_admin()

        _require_mode(req.mode)

        # IDEMPOTENCY CHECK: If there's an active plan with same title, return it
        # UNLESS force_new=True (user explicitly wants fresh start)
        if not req.force_new:
            existing_plan = _safe_execute(
                sb.table("focus_plans")
                .select("id, title, domain, level, lang, status")
                .eq("user_id", uid)
                .eq("status", "active")
                .eq("title", req.title)
                .maybe_single()
            )

            if existing_plan and existing_plan.data:
                # Count days for this plan
                days_count_res = sb.table("focus_days").select("id", count="exact").eq("plan_id", existing_plan.data["id"]).execute()
                days_count = days_count_res.count if hasattr(days_count_res, 'count') else len(days_count_res.data or [])
                print(f"[create-plan] IDEMPOTENT: returning existing plan {existing_plan.data['id']} for user {uid}")
                return {
                    "ok": True,
                    "plan_id": existing_plan.data["id"],
                    "days_count": days_count,
                    "idempotent": True,
                    "message": "Returned existing active plan with same title"
                }
        else:
            print(f"[create-plan] force_new=True, skipping idempotency check")

        # 1) Archive any existing active plan for this user
        sb.table("focus_plans").update({
            "status": "archived",
            "updated_at": datetime.utcnow().isoformat() + "Z"
        }).eq("user_id", uid).eq("status", "active").execute()

        # 2) Create focus_plan
        plan_id = str(uuid.uuid4())
        now_iso = datetime.utcnow().isoformat() + "Z"

        # Build settings JSON for wizard preferences
        settings = {
            "minutes_per_day": req.minutes_per_day or 20,
            "tone": req.tone or "neutral",
            "difficulty": req.difficulty or "normal",
            "pacing": req.pacing or "small_steps",
        }

        plan_row = {
            "id": plan_id,
            "user_id": uid,
            "title": req.title,
            "domain": req.domain,
            "level": req.level,
            "lang": req.lang,
            "status": "active",
            "created_at": now_iso,
            "updated_at": now_iso,
        }

        # Try to insert with settings column (may not exist yet)
        try:
            plan_row_with_settings = {**plan_row, "settings": settings}
            sb.table("focus_plans").insert(plan_row_with_settings).execute()
        except Exception as insert_err:
            if "PGRST204" in str(insert_err) or "settings" in str(insert_err).lower():
                # Settings column doesn't exist yet - insert without it
                print(f"[create-plan] Settings column not found, inserting without settings")
                sb.table("focus_plans").insert(plan_row).execute()
            else:
                raise

        # 3) Create focus_days + focus_items
        total_items_created = 0
        for day_input in req.days:
            day_id = str(uuid.uuid4())
            day_row = {
                "id": day_id,
                "plan_id": plan_id,
                "day_index": day_input.dayIndex,
                "title": day_input.title,
                "started_at": None,
                "completed_at": None,
            }
            sb.table("focus_days").insert(day_row).execute()

            # ITEMS-OPTIONAL: If items missing/empty, generate defaults
            items_to_create = []
            if day_input.items and len(day_input.items) > 0:
                # Frontend provided items - use them (with domain normalization)
                for idx, item_input in enumerate(day_input.items):
                    # Normalize item type/practice_type for domain
                    normalized_type, normalized_practice_type, normalized_kind, normalized_content = _normalize_item_for_domain(
                        item_type=item_input.type,
                        practice_type=item_input.practiceType,
                        domain=req.domain,
                        topic=item_input.topic,
                    )

                    # Sanitize content as final defense
                    if normalized_content:
                        normalized_content = _sanitize_content_for_domain(normalized_content, req.domain, normalized_type)

                    item_row = {
                        "id": str(uuid.uuid4()),
                        "day_id": day_id,
                        "order_index": idx,
                        "item_key": item_input.itemKey,
                        "type": normalized_type,
                        "kind": normalized_kind,
                        "practice_type": normalized_practice_type,
                        "topic": item_input.topic,
                        "label": item_input.label,
                        "estimated_minutes": item_input.estimatedMinutes,
                    }

                    if item_input.contentDepth:
                        item_row["content_depth"] = item_input.contentDepth

                    if normalized_content:
                        item_row["content"] = normalized_content

                    items_to_create.append(item_row)
                    print(f"[create-plan] Item from frontend: {item_input.type}/{item_input.practiceType} -> {normalized_type}/{normalized_practice_type} (kind={normalized_kind})")
            else:
                # NO ITEMS from frontend - generate default items server-side
                print(f"[create-plan] Day {day_input.dayIndex} has no items - generating defaults for domain '{req.domain}'")
                default_items = _generate_default_items_for_domain(
                    domain=req.domain,
                    day_index=day_input.dayIndex,
                    day_title=day_input.title,
                    settings=settings,  # Pass wizard settings for item scaling
                )
                for item_template in default_items:
                    item_row = {
                        "id": str(uuid.uuid4()),
                        "day_id": day_id,
                        **item_template,
                    }
                    items_to_create.append(item_row)
                    print(f"[create-plan] Generated default item: {item_template['type']}/{item_template.get('practice_type')} (kind={item_template['kind']})")

            # Insert all items for this day
            for idx, item_row in enumerate(items_to_create):
                # Sanitize before insert - ensures all NOT NULL fields have values
                sanitized_row = _sanitize_item_row_for_insert(item_row, idx)

                # Log item details before insert (for debugging)
                print(f"[create-plan] INSERT item: item_key={sanitized_row.get('item_key')}, type={sanitized_row.get('type')}, kind={sanitized_row.get('kind')}, order_index={sanitized_row.get('order_index')}")

                try:
                    sb.table("focus_items").insert(sanitized_row).execute()
                    total_items_created += 1
                except Exception as insert_err:
                    # Log detailed error for debugging
                    err_str = str(insert_err)
                    print(f"[create-plan] ITEM INSERT FAILED: {err_str}")
                    print(f"[create-plan] Failed item_row keys: {list(sanitized_row.keys())}")
                    print(f"[create-plan] Failed item_row values: item_key={sanitized_row.get('item_key')!r}, type={sanitized_row.get('type')!r}, kind={sanitized_row.get('kind')!r}")

                    # Check for common Postgres error codes
                    if "23502" in err_str:
                        print(f"[create-plan] ERROR TYPE: NOT NULL violation (23502)")
                    elif "23505" in err_str:
                        print(f"[create-plan] ERROR TYPE: Unique constraint violation (23505)")
                    elif "PGRST" in err_str:
                        print(f"[create-plan] ERROR TYPE: PostgREST schema error")

                    raise  # Re-raise to be caught by outer exception handler

        print(f"[create-plan] SUCCESS: plan_id={plan_id}, days={len(req.days)}, items={total_items_created}")
        return {"ok": True, "plan_id": plan_id, "days_count": len(req.days), "items_created": total_items_created}

    except HTTPException:
        raise  # Re-raise FastAPI HTTP exceptions as-is

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"[create-plan] ERROR: {e}")
        print(f"[create-plan] TRACEBACK:\n{tb}")

        # Return 422 with details instead of 500
        return JSONResponse(
            status_code=422,
            content={
                "ok": False,
                "error": "create_plan_failed",
                "detail": str(e),
                "hint": "Check server logs for traceback"
            }
        )



@router.get("/active")

async def get_active(request: Request):

    """

    Get user's active plan state for page refresh recovery.

    Returns: active plan, current day, streak, items progress summary.

    """

    uid = await get_user_id(request)

    sb = _require_admin()



    # 1) Find active plan

    plan_res = _safe_execute(

        sb.table("focus_plans")

        .select("*")

        .eq("user_id", uid)

        .eq("status", "active")

        .maybe_single()

    )

    plan = plan_res.data if plan_res else None



    if not plan:

        # No active plan

        stats = _safe_execute(sb.table("user_focus_stats").select("*").eq("user_id", uid).maybe_single())

        return {

            "ok": True,

            "has_active_plan": False,

            "plan": None,

            "current_day": None,

            "streak": ((stats.data if stats else None) or {}).get("streak", 0),

        }



    plan_id = plan["id"]



    # 2) Find current day (in-progress or next pending)

    days_res = (

        sb.table("focus_days")

        .select("*")

        .eq("plan_id", plan_id)

        .order("day_index", desc=False)

        .execute()

    )

    days = days_res.data or []



    current_day = None

    completed_days = 0

    for d in days:

        if d.get("completed_at"):

            completed_days += 1

        elif d.get("started_at") and not d.get("completed_at"):

            # in-progress

            current_day = d

            break

        elif not current_day:

            # first not-started day

            current_day = d



    # 3) Get items for current day (if any)

    day_items = []

    if current_day:

        items_res = (

            sb.table("focus_items")

            .select("*")

            .eq("day_id", current_day["id"])

            .order("order_index", desc=False)

            .execute()

        )

        day_items = items_res.data or []



        # Get progress for these items

        item_ids = [it["id"] for it in day_items]

        if item_ids:

            progress_res = (

                sb.table("focus_item_progress")

                .select("*")

                .eq("user_id", uid)

                .in_("item_id", item_ids)

                .execute()

            )

            progress_map = {p["item_id"]: p for p in (progress_res.data or [])}

            for it in day_items:

                it["progress"] = progress_map.get(it["id"])



    # 4) Streak

    stats = sb.table("user_focus_stats").select("*").eq("user_id", uid).maybe_single().execute()



    return {

        "ok": True,

        "has_active_plan": True,

        "plan": plan,

        "days": days,

        "current_day": current_day,

        "current_day_items": day_items,

        "completed_days": completed_days,

        "total_days": len(days),

        "streak": (stats.data or {}).get("streak", 0),

    }





@router.post("/get-day")

async def get_day(req: GetDayReq, request: Request):

    """

    Get a specific day with items, progress, and status for the current user.

    Status can be: locked, in_progress, completed, available, locked_until_tomorrow



    IMPORTANT: If day is locked, we do NOT return items - this prevents

    users from completing the entire week in one day.

    """

    uid = await get_user_id(request)

    sb = _require_admin()



    today = today_local_iso()



    # 1) Verify plan belongs to user

    plan = (

        sb.table("focus_plans")

        .select("*")

        .eq("id", req.plan_id)

        .eq("user_id", uid)

        .maybe_single()

        .execute()

    )

    if not plan.data:

        raise HTTPException(status_code=404, detail="Plan not found")



    # 2) Get ALL days to determine status

    all_days_res = (

        sb.table("focus_days")

        .select("*")

        .eq("plan_id", req.plan_id)

        .order("day_index", desc=False)

        .execute()

    )

    all_days = all_days_res.data or []



    # Find requested day

    day = None

    for d in all_days:

        if d.get("day_index") == req.day_index:

            day = d

            break



    if not day:

        raise HTTPException(status_code=404, detail="Day not found")



    # 3) Determine day status

    started_at = day.get("started_at")

    completed_at = day.get("completed_at")



    # Check if any day was completed today

    completed_today = any(

        d.get("completed_at") and d.get("completed_at")[:10] == today

        for d in all_days

    )



    # Check if there's another in-progress day

    other_in_progress = any(

        d.get("started_at") and not d.get("completed_at") and d.get("day_index") != req.day_index

        for d in all_days

    )



    # Determine status

    if completed_at:

        day_status = "completed"

    elif started_at and not completed_at:

        day_status = "in_progress"

    elif completed_today:

        # User already completed a day today - this day is locked until tomorrow

        day_status = "locked_until_tomorrow"

    elif other_in_progress:

        # Another day is in progress - this one is locked

        day_status = "locked"

    else:

        # Check if previous days are completed (sequential unlock)

        prev_completed = True

        for d in all_days:

            if d.get("day_index") < req.day_index:

                if not d.get("completed_at"):

                    prev_completed = False

                    break

        day_status = "available" if prev_completed else "locked"



    # 4) LOCK CHECK: If day is not in_progress or completed, don't return items

    allowed_statuses = {"in_progress", "completed"}

    if day_status not in allowed_statuses:

        return {

            "ok": False,

            "status": day_status,

            "day": {

                "id": day["id"],

                "day_index": day.get("day_index"),

                "title": day.get("title"),

                "started_at": day.get("started_at"),

                "completed_at": day.get("completed_at"),

            },

            "items": [],

            "reason": "Day is locked. Start the day first (or wait until tomorrow).",

        }



    # 5) Get items for this day (only if allowed)

    items_res = (

        sb.table("focus_items")

        .select("*")

        .eq("day_id", day["id"])

        .order("order_index", desc=False)

        .execute()

    )

    items = items_res.data or []



    # 6) Get progress for these items

    item_ids = [it["id"] for it in items]

    progress_map = {}

    if item_ids:

        progress_res = (

            sb.table("focus_item_progress")

            .select("*")

            .eq("user_id", uid)

            .in_("item_id", item_ids)

            .execute()

        )

        progress_map = {p["item_id"]: p for p in (progress_res.data or [])}



    # Attach progress to each item

    completed_items = 0

    for it in items:

        progress = progress_map.get(it["id"])

        it["progress"] = progress

        if progress and progress.get("status") == "done":

            completed_items += 1



    return {

        "ok": True,

        "day": day,

        "items": items,

        "status": day_status,

        "progress_summary": {

            "completed_items": completed_items,

            "total_items": len(items),

        }

    }





@router.get("/stats")

async def get_stats(request: Request):

    """

    Get user's focus stats (streak, last_streak_date).

    """

    uid = await get_user_id(request)

    sb = _require_admin()



    stats = _safe_execute(sb.table("user_focus_stats").select("*").eq("user_id", uid).maybe_single())



    if not stats or not stats.data:

        return {

            "ok": True,

            "streak": 0,

            "last_streak_date": None,

        }



    return {

        "ok": True,

        "streak": stats.data.get("streak", 0),

        "last_streak_date": stats.data.get("last_streak_date"),

    }





@router.post("/start-day")

async def start_day(req: StartDayReq, request: Request):

    """

    Start the next day in a plan.

    Rules:

    - If there's an in-progress day: return it (idempotent)

    - If user already completed a day TODAY: return already_completed_today=true

    - Otherwise: start the next pending day

    """

    uid = await get_user_id(request)

    sb = _require_admin()



    # Ensure plan belongs to user

    plan = sb.table("focus_plans").select("*").eq("id", req.plan_id).eq("user_id", uid).maybe_single().execute()

    if not plan.data:

        raise HTTPException(status_code=404, detail="Plan not found")



    today = today_local_iso()



    # 1) Check if user already completed a day TODAY

    all_days = (

        sb.table("focus_days")

        .select("*")

        .eq("plan_id", req.plan_id)

        .order("day_index", desc=False)

        .execute()

    )

    if not all_days.data:

        raise HTTPException(status_code=400, detail="Plan has no days")



    completed_today = None

    in_progress = None

    next_pending = None



    for d in all_days.data:

        completed_at = d.get("completed_at")

        started_at = d.get("started_at")



        # Check if completed today

        if completed_at and completed_at[:10] == today:

            completed_today = d



        # Check if in-progress (started but not completed)

        if started_at and not completed_at:

            in_progress = d



        # Find next pending (not started, not completed)

        if not started_at and not completed_at and not next_pending:

            next_pending = d



    # 2) If there's an in-progress day: return it (idempotent)

    if in_progress:

        return {

            "ok": True,

            "plan_id": req.plan_id,

            "day": in_progress,

            "status": "in_progress"

        }



    # 3) If user already completed a day TODAY: block new day start

    if completed_today:

        stats = sb.table("user_focus_stats").select("*").eq("user_id", uid).maybe_single().execute()

        return {

            "ok": True,

            "plan_id": req.plan_id,

            "day": completed_today,

            "already_completed_today": True,

            "streak": (stats.data or {}).get("streak", 0),

            "message": "You already completed today's learning. Come back tomorrow!"

        }



    # 4) All days completed?

    if not next_pending:

        return {"ok": True, "plan_id": req.plan_id, "day": None, "done": True}



    # 5) Start the next day

    now = datetime.utcnow().isoformat() + "Z"

    upd = (

        sb.table("focus_days")

        .update({"started_at": now})

        .eq("id", next_pending["id"])

        .execute()

    )

    day = upd.data[0] if upd.data else next_pending

    return {"ok": True, "plan_id": req.plan_id, "day": day, "status": "started"}





@router.post("/complete-item")

async def complete_item(req: CompleteItemReq, request: Request):

    """

    Complete an item with interaction validation.

    Enforces minimum interaction requirements based on practice_type.

    """

    uid = await get_user_id(request)

    sb = _require_admin()



    # item exists?

    item = sb.table("focus_items").select("*").eq("id", req.item_id).maybe_single().execute()

    if not item.data:

        raise HTTPException(status_code=404, detail="Item not found")



    # Enforce interaction for "done" status
    # BUT: lesson/content items are read-only and don't require interaction
    item_type = (item.data.get("type") or "").lower()
    item_kind = (item.data.get("kind") or "").lower()

    # Read-only items (lessons) can be completed without result_json
    is_read_only = item_type == "lesson" or item_kind == "content"

    if req.status == "done" and not is_read_only:

        # result_json is required for interactive items

        if not req.result_json:

            raise HTTPException(

                status_code=422,

                detail="Interaction required: result_json is missing"

            )



        practice_type = (item.data.get("practice_type") or "").lower()

        user_input = (req.result_json.get("user_input") or "").strip()

        user_items = req.result_json.get("user_items") or []



        # Low-effort filter: reject trivial inputs that bypass validation

        if user_input and user_input.lower() in LOW_EFFORT_RESPONSES:

            raise HTTPException(

                status_code=422,

                detail="Érdemi interakció szükséges. Írd le részletesen, mit csináltál!"

            )



        # Hard rules by practice_type (MVP-level strictness)

        if practice_type == "writing":

            if len(user_input) < 40:

                raise HTTPException(422, "Interaction required: write at least 40 characters")

        elif practice_type == "translation":

            if not isinstance(user_items, list) or len(user_items) < 1:

                raise HTTPException(422, "Interaction required: submit at least 1 translation")

        elif practice_type in ("exercise", "roleplay"):

            if len(user_input) < 15:

                raise HTTPException(422, "Interaction required: send at least 15 characters")



        # Also check validation rules from result_json if provided

        validation = req.result_json.get("validation", {})

        if validation.get("require_interaction"):

            min_chars = validation.get("min_chars", 0)

            min_items = validation.get("min_items", 0)



            # Text input validation

            if min_chars > 0:

                input_len = len(user_input)

                if input_len < min_chars:

                    raise HTTPException(

                        status_code=422,

                        detail=f"Interaction required: minimum {min_chars} characters, got {input_len}"

                    )



            # Items validation (for cards, multi-choice, etc.)

            if min_items > 0:

                items_count = len(user_items) if isinstance(user_items, list) else 0

                if items_count < min_items:

                    raise HTTPException(

                        status_code=422,

                        detail=f"Interaction required: minimum {min_items} items, got {items_count}"

                    )



    # upsert progress

    existing = (

        sb.table("focus_item_progress")

        .select("*")

        .eq("user_id", uid)

        .eq("item_id", req.item_id)

        .maybe_single()

        .execute()

    )



    payload = {

        "user_id": uid,

        "item_id": req.item_id,

        "status": req.status,

        "score": req.score,

        "last_result_json": req.result_json,

        "updated_at": datetime.utcnow().isoformat() + "Z",

    }



    if existing and existing.data:

        payload["attempts"] = int(existing.data.get("attempts") or 0) + 1

        res = sb.table("focus_item_progress").update(payload).eq("id", existing.data["id"]).execute()

    else:

        payload["attempts"] = 1

        res = sb.table("focus_item_progress").insert(payload).execute()



    return {"ok": True, "progress": (res.data[0] if res.data else payload)}





@router.post("/complete-day")

async def complete_day(req: CompleteDayReq, request: Request):

    """

    Complete a day in a plan.

    Rules:

    - Day must be started (not locked)

    - Day must be started TODAY (same calendar day)

    - Can only complete one day per real calendar day

    Uses Athens timezone for daily reset.

    """

    uid = await get_user_id(request)

    sb = _require_admin()



    today = today_local_iso()



    # Step 1: Verify plan belongs to user (simple select, no join)

    plan_res = _safe_execute(

        sb.table("focus_plans").select("id, user_id").eq("id", req.plan_id).maybe_single()

    )

    if not plan_res or not plan_res.data:

        raise HTTPException(status_code=404, detail="Plan not found")

    if plan_res.data.get("user_id") != uid:

        raise HTTPException(status_code=403, detail="Not your plan")



    # Step 2: Get day (simple select)

    day_res = _safe_execute(

        sb.table("focus_days")

        .select("*")

        .eq("plan_id", req.plan_id)

        .eq("day_index", req.day_index)

        .maybe_single()

    )

    if not day_res or not day_res.data:

        raise HTTPException(status_code=404, detail="Day not found")

    day = type("Day", (), {"data": day_res.data})()  # Mock object for compatibility



    # Already completed?

    if day.data.get("completed_at") is not None:

        stats = sb.table("user_focus_stats").select("*").eq("user_id", uid).maybe_single().execute()

        return {"ok": True, "already_completed": True, "streak": (stats.data or {}).get("streak", 0)}



    # Day must be started

    started_at = day.data.get("started_at")

    if not started_at:

        return {"ok": False, "not_allowed": True, "reason": "Day not started yet (locked)"}



    # Day must be started TODAY (same calendar day rule)

    started_date = started_at[:10]  # Extract YYYY-MM-DD

    if started_date != today:

        stats = sb.table("user_focus_stats").select("*").eq("user_id", uid).maybe_single().execute()

        return {

            "ok": False,

            "not_allowed": True,

            "reason": "Can only complete a day on the same calendar day it was started",

            "started_date": started_date,

            "today": today,

            "streak": (stats.data or {}).get("streak", 0)

        }



    # Check if user already completed another day TODAY

    other_completed_today = (

        sb.table("focus_days")

        .select("*")

        .eq("plan_id", req.plan_id)

        .neq("id", day.data["id"])

        .execute()

    )

    for other in (other_completed_today.data or []):

        other_completed = other.get("completed_at")

        if other_completed and other_completed[:10] == today:

            stats = sb.table("user_focus_stats").select("*").eq("user_id", uid).maybe_single().execute()

            return {

                "ok": False,

                "not_allowed": True,

                "reason": "Already completed another day today",

                "streak": (stats.data or {}).get("streak", 0)

            }



    # All checks passed - complete the day

    now_iso = datetime.utcnow().isoformat() + "Z"

    sb.table("focus_days").update({"completed_at": now_iso}).eq("id", day.data["id"]).execute()



    # Update streak

    stats = sb.table("user_focus_stats").select("*").eq("user_id", uid).maybe_single().execute()



    if not stats.data:

        sb.table("user_focus_stats").insert({"user_id": uid, "streak": 1, "last_streak_date": today}).execute()

        streak = 1

    else:

        last = stats.data.get("last_streak_date")

        streak = int(stats.data.get("streak") or 0)



        if str(last) == today:

            # already counted today (shouldn't happen with above checks, but safety)

            pass

        else:

            streak += 1

            sb.table("user_focus_stats").update({

                "streak": streak,

                "last_streak_date": today,

                "updated_at": now_iso

            }).eq("user_id", uid).execute()



    return {"ok": True, "day_completed": True, "streak": streak}





@router.post("/reset")
async def reset_focus(req: ResetFocusReq, request: Request):
    uid = await get_user_id(request)

    sb = _require_admin()

    _require_mode(req.mode)




    plan = sb.table("focus_plans").select("*").eq("id", req.plan_id).eq("user_id", uid).maybe_single().execute()

    if not plan.data:

        raise HTTPException(status_code=404, detail="Plan not found")



    new_status = "archived" if req.reset_mode == "archive" else "deleted"
    sb.table("focus_plans").update({"status": new_status, "updated_at": datetime.utcnow().isoformat() + "Z"}).eq("id", req.plan_id).execute()



    return {"ok": True, "status": new_status}


# --- Interactivity: Submit Upload Review (project file) ---
class SubmitUploadReviewReq(BaseModel):
    mode: str
    domain: Optional[str] = None
    item_type: str
    item_id: Optional[str] = None
    prompt: Optional[str] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_base64: str


@router.post("/submit-upload-review")
async def submit_upload_review(req: SubmitUploadReviewReq, request: Request):
    """
    Interactivity endpoint for project-mode upload_review.
    Returns structured feedback in fixed JSON shape.
    """
    _ = await get_user_id(request)

    mode = _require_mode(req.mode)
    if mode != "project":
        return JSONResponse(status_code=409, content={"error": "task_not_allowed_for_mode"})

    item_type = (req.item_type or "").strip().lower()
    if item_type != "upload_review":
        return JSONResponse(status_code=409, content={"error": "task_not_allowed_for_mode"})

    if not req.file_base64:
        raise HTTPException(status_code=400, detail="Missing file_base64")

    file_b64 = _strip_data_url(req.file_base64)
    try:
        file_bytes = base64.b64decode(file_b64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 payload")

    if len(file_bytes) > UPLOAD_REVIEW_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    file_type = (req.file_type or "").strip().lower()
    file_name = (req.file_name or "upload").strip()
    domain = (req.domain or "other").strip().lower()

    if not claude:
        return _fallback_review_response("AI review is temporarily unavailable.")

    system = (
        "You are a strict project reviewer. "
        "Return ONLY a JSON object with keys: feedback, strengths, improvements, next_step. "
        "feedback is a short paragraph. strengths and improvements are arrays of short bullet phrases. "
        "next_step is one concrete action. No extra text."
    )

    user_prompt = (
        f"Review the uploaded file for the project.\n"
        f"Domain: {domain}\n"
        f"File name: {file_name}\n"
        f"File type: {file_type}\n"
        f"User prompt: {req.prompt or ''}\n"
    )

    try:
        if file_type.startswith("image/"):
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt},
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": file_type or "image/png",
                                "data": file_b64,
                            },
                        },
                    ],
                }
            ]
        else:
            try:
                text_payload = file_bytes.decode("utf-8", errors="replace")
            except Exception:
                text_payload = ""
            if not text_payload.strip():
                return _fallback_review_response("Unsupported file type. Please upload an image or text file.")
            excerpt = text_payload[:4000]
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_prompt + "\nFile content excerpt:\n" + excerpt}
                    ],
                }
            ]

        resp = claude.messages.create(
            model=CLAUDE_MODEL,
            system=system,
            messages=messages,
            max_tokens=500,
            temperature=0.2,
        )
        raw_text = ""
        try:
            raw_text = resp.content[0].text
        except Exception:
            raw_text = str(resp)

        data = _extract_json_object(raw_text)
        return _coerce_review_response(data)
    except HTTPException:
        raise
    except Exception:
        return _fallback_review_response("Could not analyze the file. Please try again.")


# --- Interactivity: Submit Answer (text/quiz) ---
class SubmitAnswerReq(BaseModel):
    mode: str
    domain: Optional[str] = None
    item_type: str
    item_id: Optional[str] = None
    prompt: Optional[str] = None
    answer: Optional[str] = None


@router.post("/submit-answer")
async def submit_answer(req: SubmitAnswerReq, request: Request):
    """
    Interactivity endpoint for text/quiz answers.
    Returns structured feedback in fixed JSON shape.
    """
    _ = await get_user_id(request)

    mode = _require_mode(req.mode)
    item_type = (req.item_type or "").strip().lower()

    if mode == "learning":
        allowed = {"quiz", "single_select"}
    else:
        allowed = {"quiz", "checklist"}

    if item_type not in allowed:
        return JSONResponse(status_code=409, content={"error": "task_not_allowed_for_mode"})

    answer = (req.answer or "").strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Missing answer")

    if not claude:
        return _fallback_review_response("Answer received.")

    system = (
        "Return ONLY a JSON object with keys: feedback, strengths, improvements, next_step. "
        "feedback is short and constructive. strengths and improvements are arrays of short phrases. "
        "next_step is one concrete action. No extra text."
    )

    user_prompt = (
        f"Evaluate the user's answer.\n"
        f"Mode: {mode}\n"
        f"Domain: {(req.domain or 'other').strip().lower()}\n"
        f"Item type: {item_type}\n"
        f"Prompt: {req.prompt or ''}\n"
        f"Answer: {answer}\n"
    )

    try:
        resp = claude.messages.create(
            model=CLAUDE_MODEL,
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=350,
            temperature=0.2,
        )
        raw_text = ""
        try:
            raw_text = resp.content[0].text
        except Exception:
            raw_text = str(resp)

        data = _extract_json_object(raw_text)
        return _coerce_review_response(data)
    except HTTPException:
        raise
    except Exception:
        return _fallback_review_response("Could not evaluate the answer. Please try again.")


# --- Generate Item Content (on-demand, canonical schema) --- (on-demand, canonical schema) ---

class GenerateItemContentReq(BaseModel):

    item_id: str

    # Optional overrides (if not in DB)

    topic: Optional[str] = None

    label: Optional[str] = None

    day_title: Optional[str] = None

    user_goal: Optional[str] = None





@router.post("/generate-item-content")

async def generate_item_content(req: GenerateItemContentReq, request: Request):

    """

    Generate full item content using the canonical schema.

    Called on-demand when user opens an item.

    Returns UI-ready JSON with kind, content, validation, etc.



    HARDENED: Uses 3 simple selects instead of inner joins to avoid

    postgrest-py 204 edge case crashes.

    """

    uid = await get_user_id(request)

    sb = _require_admin()



    # DEBUG: Log request details

    print(f"[generate-item-content] uid={uid}, item_id={req.item_id}")



    # Accept both UUID and item_key format (e.g. "d1-lesson-1")

    item_ref = req.item_id

    item_res = None



    if _is_valid_uuid(item_ref):

        # Direct UUID lookup

        print(f"[generate-item-content] Looking up by UUID: {item_ref}")

        item_res = _safe_execute(

            sb.table("focus_items").select("*").eq("id", item_ref).maybe_single()

        )

    else:

        # item_key format (e.g. "d1-lesson-1") - lookup by item_key column

        print(f"[generate-item-content] Looking up by item_key: {item_ref}")

        item_res = _safe_execute(

            sb.table("focus_items").select("*").eq("item_key", item_ref).maybe_single()

        )



    if not item_res or not item_res.data:

        print(f"[generate-item-content] ERROR: item not found: {item_ref}")

        raise HTTPException(status_code=404, detail=f"Item not found: {item_ref}")

    item = item_res.data

    print(f"[generate-item-content] Found item: type={item.get('type')}, kind={item.get('kind')}, topic={item.get('topic')}")



    # Step 2: Get day by item's day_id

    day_id = item.get("day_id")

    if not day_id:

        raise HTTPException(status_code=409, detail="Item has no day_id (inconsistent state)")



    day_res = _safe_execute(

        sb.table("focus_days").select("*").eq("id", day_id).maybe_single()

    )

    if not day_res or not day_res.data:

        raise HTTPException(status_code=404, detail="Day not found for this item")

    day = day_res.data



    # Step 3: Get plan by day's plan_id

    plan_id = day.get("plan_id")

    if not plan_id:

        raise HTTPException(status_code=409, detail="Day has no plan_id (inconsistent state)")



    plan_res = _safe_execute(

        sb.table("focus_plans").select("*").eq("id", plan_id).maybe_single()

    )

    if not plan_res or not plan_res.data:

        raise HTTPException(status_code=404, detail="Plan not found for this day")

    plan = plan_res.data



    # Verify ownership

    plan_user_id = plan.get("user_id")

    if plan_user_id != uid:

        print(f"[generate-item-content] ERROR: ownership mismatch. plan.user_id={plan_user_id}, request uid={uid}")

        raise HTTPException(status_code=403, detail="Not your item")



    print(f"[generate-item-content] Ownership OK. plan_id={plan_id}, user_id={uid}")



    # Extract metadata - PRIORITIZE stored kind if available

    item_type = item.get("type", "task")

    practice_type = item.get("practice_type")

    stored_kind = item.get("kind")  # May be None for old items



    # If kind not stored, compute it now (for backward compatibility)

    if not stored_kind:

        stored_kind = _determine_kind_from_type(item_type, practice_type)

        print(f"[generate-item-content] Computed kind from type: {item_type}/{practice_type} → {stored_kind}")

    else:

        print(f"[generate-item-content] Using stored kind: {stored_kind}")

    # Validate stored_kind is a canonical kind - convert "practice" to valid kind
    VALID_CANONICAL_KINDS = {"content", "quiz", "checklist", "upload_review", "translation", "cards", "roleplay", "writing"}
    if stored_kind not in VALID_CANONICAL_KINDS:
        # "practice" was incorrectly stored - convert based on practice_type or domain
        old_kind = stored_kind
        if practice_type in ("translation", "exercise", "roleplay", "dialogue", "cards", "flashcard", "writing"):
            stored_kind = PRACTICE_TYPE_TO_KIND.get(practice_type, "writing")
        else:
            stored_kind = "writing"  # Default for unknown practice types
        print(f"[generate-item-content] Converted invalid kind '{old_kind}' → '{stored_kind}'")

    topic = req.topic or item.get("topic", "")

    label = req.label or item.get("label", "")

    day_title = req.day_title or day.get("title", "")

    domain = plan.get("domain", "learning")

    level = plan.get("level", "beginner")

    lang = plan.get("lang", "hu")

    minutes = item.get("estimated_minutes", 5)

    user_goal = req.user_goal or plan.get("title", "")

    # Extract settings from plan for content generation
    plan_settings = plan.get("settings") or {}
    if isinstance(plan_settings, str):
        try:
            plan_settings = json.loads(plan_settings)
        except:
            plan_settings = {}

    # Merge item-level content_depth if present
    content_depth = item.get("content_depth")
    if content_depth:
        plan_settings["content_depth"] = content_depth

    is_language_domain = (domain or "").lower() in ("language_learning", "language")

    # DB CACHE: If content already generated and saved, return it immediately
    existing_content = item.get("content")
    if existing_content and isinstance(existing_content, dict):
        has_real_content = (
            existing_content.get("kind")
            or existing_content.get("schema_version")
            or (isinstance(existing_content.get("content"), dict) and (
                existing_content["content"].get("summary")
                or existing_content["content"].get("vocabulary_table")
                or existing_content["content"].get("questions")
            ))
        )
        if has_real_content:
            if is_language_domain and stored_kind == "content":
                # Only use cache if it's already the rich language_lesson format
                content_type = None
                if isinstance(existing_content.get("content"), dict):
                    content_type = existing_content["content"].get("content_type")
                if not content_type:
                    content_type = existing_content.get("content_type")
                if content_type != "language_lesson":
                    print(f"[generate-item-content] Cache bypass (needs language_lesson) for item {item.get('id')}")
                else:
                    print(f"[generate-item-content] DB CACHE HIT for item {item.get('id')}")
                    return {"ok": True, "item_id": req.item_id, "content": existing_content, "cached": True}
            elif is_language_domain and stored_kind in ("quiz", "translation", "roleplay", "writing", "cards"):
                # For practice items, require chained content marker (v2)
                if existing_content.get("chain_version") != "lesson_v2":
                    print(f"[generate-item-content] Cache bypass (needs chained practice v2) for item {item.get('id')}")
                else:
                    print(f"[generate-item-content] DB CACHE HIT for item {item.get('id')}")
                    return {"ok": True, "item_id": req.item_id, "content": existing_content, "cached": True}
            else:
                print(f"[generate-item-content] DB CACHE HIT for item {item.get('id')}")
                return {"ok": True, "item_id": req.item_id, "content": existing_content, "cached": True}


    plan_mode = (plan.get("focus_type") or "learning").lower().strip()
    if plan_mode not in ALLOWED_MODES:
        raise HTTPException(status_code=400, detail="Invalid mode")

    allowed_types = LEARNING_TASK_TYPES if plan_mode == "learning" else PROJECT_TASK_TYPES
    normalized_type = "quiz" if item_type == "single_select" else item_type

    if normalized_type not in allowed_types:
        return JSONResponse(status_code=409, content={"error": "task_not_allowed_for_mode"})

    if normalized_type == "upload_review":
        content = {
            "schema_version": "1.0",
            "kind": "upload_review",
            "title": label or "Fájl ellenőrzés",
            "subtitle": topic,
            "instructions_md": "Tölts fel egy fájlt a feladathoz.",
            "ui": {"mode": "inline", "estimated_minutes": minutes},
            "input": {"type": "file"},
            "content": {
                "kind": "upload_review",
                "data": {
                    "prompt": f"Tölts fel egy fájlt a következő témához: {topic}",
                    "rubric": [
                        "A cél világos.",
                        "A lényegi elemek benne vannak.",
                        "A kimenet olvasható és rendezett.",
                        "A hiányok beazonosíthatók.",
                    ],
                    "accepted_types": ["image/*", "text/plain", "text/markdown", "application/json"],
                    "max_size_mb": 5,
                    "estimated_minutes": max(3, min(10, minutes)),
                },
            },
            "validation": {"require_interaction": True, "min_items": 1},
            "scoring": {"max_points": 0, "partial_credit": False, "auto_grade": False},
        }
        return {"ok": True, "item_id": req.item_id, "content": content}
    if normalized_type == "checklist":
        steps = [
            f"Dolgozz a témán: {topic}",
            "Írj le 3 kulcslépést.",
            "Ellenőrizd az eredményt.",
            "Rögzítsd a következő lépést.",
            "Tűzz ki egy határidőt.",
        ]
        content = {
            "schema_version": "1.0",
            "kind": "checklist",
            "title": label or "Checklist",
            "subtitle": topic,
            "instructions_md": "Végezd el a lépéseket és rögzítsd a bizonyítékot.",
            "ui": {"mode": "inline", "estimated_minutes": minutes},
            "input": {"type": "checkbox"},
            "content": {
                "kind": "checklist",
                "data": {
                    "steps": [{"instruction": s} for s in steps],
                    "items": [{"text": s, "done": False} for s in steps],
                    "proof_prompt": "Írd le röviden, mit csináltál:",
                    "estimated_minutes": max(3, min(10, minutes)),
                },
            },
            "validation": {"require_interaction": True, "require_proof": True, "min_chars": 20},
            "scoring": {"max_points": 0, "partial_credit": False, "auto_grade": False},
        }
        return {"ok": True, "item_id": req.item_id, "content": content}
    item_type = normalized_type    # Import generator

    from .llm_client import generate_focus_item

    # CONTENT CHAINING: For practice/quiz, find preceding lesson's content
    preceding_lesson_content = None
    stored_kind = item.get("kind", "")
    practice_kinds = ("quiz", "translation", "roleplay", "writing", "cards")
    if is_language_domain and (stored_kind in practice_kinds or item_type in practice_kinds):
        try:
            day_items_res = _safe_execute(
                sb.table("focus_items")
                .select("id, kind, type, practice_type, order_index, content, item_key, topic, label, estimated_minutes")
                .eq("day_id", day_id)
                .order("order_index")
            )
            if day_items_res and day_items_res.data:
                current_order = item.get("order_index", 999)
                for di in reversed(day_items_res.data):
                    if di.get("order_index", 999) >= current_order:
                        continue
                    if di.get("kind") != "content":
                        continue

                    lesson_content = di.get("content") if isinstance(di.get("content"), dict) else None
                    content_type = None
                    if isinstance(lesson_content, dict):
                        if isinstance(lesson_content.get("content"), dict):
                            content_type = lesson_content["content"].get("content_type")
                        if not content_type:
                            content_type = lesson_content.get("content_type")

                    # Auto-generate lesson if missing or not language_lesson
                    if not lesson_content or content_type != "language_lesson":
                        try:
                            lesson_content = await generate_focus_item(
                                item_type=di.get("type") or "lesson",
                                practice_type=di.get("practice_type"),
                                topic=di.get("topic") or day_title,
                                label=di.get("label") or "Tananyag",
                                day_title=day_title,
                                domain=domain,
                                level=level,
                                lang=lang,
                                minutes=di.get("estimated_minutes") or minutes,
                                user_goal=user_goal,
                                settings=plan_settings,
                                preceding_lesson_content=None,
                            )
                            try:
                                _safe_execute(
                                    sb.table("focus_items").update({"content": lesson_content}).eq("id", di["id"])
                                )
                            except Exception as save_err:
                                print(f"[generate-item-content] WARNING: Failed to save auto lesson: {save_err}")
                            print(f"[generate-item-content] Auto-generated preceding lesson for chaining {di.get('item_key')}")
                        except Exception as gen_err:
                            print(f"[generate-item-content] Auto-lesson generation failed (non-fatal): {gen_err}")

                    if isinstance(lesson_content, dict):
                        extracted = _extract_lesson_context(lesson_content)
                        if extracted:
                            preceding_lesson_content = extracted
                            print(f"[generate-item-content] Content chain: quiz will use lesson {di.get('item_key')}")
                            break
        except Exception as chain_err:
            print(f"[generate-item-content] Content chaining failed (non-fatal): {chain_err}")

    try:

        content = await generate_focus_item(

            item_type=item_type,

            practice_type=practice_type,

            topic=topic,

            label=label,

            day_title=day_title,

            domain=domain,

            level=level,

            lang=lang,

            minutes=minutes,

            user_goal=user_goal,

            settings=plan_settings,

            preceding_lesson_content=preceding_lesson_content,

        )

        # Ensure lesson/content has body_md for UI rendering
        if isinstance(content, dict) and content.get("kind") == "content":
            inner = content.get("content") if isinstance(content.get("content"), dict) else None
            # Data might be directly in inner, or nested in inner["data"]
            data = inner.get("data") if inner and "data" in inner else inner
            if isinstance(data, dict):
                body_md = str(data.get("body_md") or data.get("text") or "").strip()
                if not body_md:
                    built = _build_content_body_md(data)
                    if built:
                        data["body_md"] = built
                        # Update the right place depending on structure
                        if inner and "data" in inner:
                            inner["data"] = data
                        else:
                            content["content"] = data

        # Save generated content to DB for caching (next load = instant)
        try:
            _safe_execute(
                sb.table("focus_items").update({"content": content}).eq("id", item["id"])
            )
            print(f"[generate-item-content] Saved content to DB for item {item.get('id')}")
        except Exception as save_err:
            print(f"[generate-item-content] WARNING: Failed to save content to DB: {save_err}")

        return {

            "ok": True,

            "item_id": req.item_id,

            "content": content,

        }



    except Exception as e:

        print(f"[generate-item-content] Error: {e}")

        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")





# --- Simple content generation (no plan required) ---

class GenerateSimpleReq(BaseModel):
    topic: str
    task_type: str = "lesson"  # lesson, practice, quiz, flashcard, writing
    lang: str = "hu"
    domain: str = "general"
    round_index: int = 0


@router.post("/generate-simple")
async def generate_simple_content(req: GenerateSimpleReq, request: Request):
    """
    Generate AI content for a simple focus session (no plan required).
    Used by the frontend's quick focus timer feature.
    Returns structured content based on topic and task type.
    """
    from .focus_content_generators import (
        generate_lesson_content,
        generate_practice_content,
        generate_quiz_content,
        generate_flashcard_content,
        generate_writing_content,
    )

    topic = (req.topic or "").strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Topic is required")

    task_type = (req.task_type or "lesson").lower().strip()
    lang = req.lang or "hu"
    domain = req.domain or "general"

    context = {
        "day_title": topic,
        "day_intro": f"Focus session: {topic}",
        "round_index": req.round_index,
    }

    print(f"[generate-simple] topic={topic}, type={task_type}, lang={lang}")

    try:
        if task_type in ("lesson", "tananyag", "content", "theory"):
            result = await generate_lesson_content(
                topic=topic,
                context=context,
                domain=domain,
                level="intermediate",
                lang=lang,
                mode="learning",
            )
        elif task_type in ("practice", "gyakorlas", "exercise"):
            result = await generate_practice_content(
                topic=topic,
                context=context,
                domain=domain,
                practice_type="exercise",
                lang=lang,
                mode="learning",
            )
        elif task_type in ("quiz", "kviz"):
            result = await generate_quiz_content(
                topics=[topic],
                context=context,
                num_questions=5,
                lang=lang,
                domain=domain,
                mode="learning",
            )
        elif task_type in ("flashcard", "cards", "szokartya"):
            result = await generate_flashcard_content(
                topic=topic,
                context=context,
                domain=domain,
                num_cards=8,
                lang=lang,
                mode="learning",
            )
        elif task_type in ("writing", "iras"):
            result = await generate_writing_content(
                topic=topic,
                context=context,
                domain=domain,
                lang=lang,
                mode="learning",
            )
        else:
            result = await generate_lesson_content(
                topic=topic,
                context=context,
                domain=domain,
                level="intermediate",
                lang=lang,
                mode="learning",
            )

        print(f"[generate-simple] Generated {result.get('type', 'unknown')} content")
        return {"ok": True, "data": result}

    except Exception as e:
        print(f"[generate-simple] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")


# --- Backfill/Admin utilities ---

class BackfillLessonsReq(BaseModel):

    plan_id: Optional[str] = None  # If provided, only backfill this plan

    dry_run: bool = True  # If True, only report what would be changed





@router.post("/admin/backfill-lessons")

async def backfill_lessons(req: BackfillLessonsReq, request: Request):

    """

    Backfill existing lesson/theory items to ensure they have correct type.



    PROTECTED: Requires X-Admin-Key header matching ADMIN_KEY env variable.



    This fixes items created before the content kind fix:

    - Items with type='lesson' or type='theory' should render as read-only content

    - This endpoint ensures the DB has correct type values



    Use dry_run=True first to see what would be changed.



    ## Data Model Clarification (type vs kind):

    - `type` (DB column): storage value, e.g. "lesson", "task", "practice"

    - `kind` (API response): canonical UI kind, e.g. "content", "checklist", "writing"

    - Backend maps: type="lesson" → kind="content" (read-only, no textarea)

    - Backend maps: type="task" → kind="checklist" (textarea + proof required)

    """

    # ADMIN AUTH: X-Admin-Key header required

    _require_admin_key(request)



    uid = await get_user_id(request)

    sb = _require_admin()



    # Build query for user's items

    if req.plan_id:

        # Verify plan belongs to user

        plan_res = _safe_execute(

            sb.table("focus_plans").select("id").eq("id", req.plan_id).eq("user_id", uid).maybe_single()

        )

        if not plan_res or not plan_res.data:

            raise HTTPException(status_code=404, detail="Plan not found or not yours")



        # Get days for this plan

        days_res = sb.table("focus_days").select("id").eq("plan_id", req.plan_id).execute()

        day_ids = [d["id"] for d in (days_res.data or [])]



        if not day_ids:

            return {"ok": True, "message": "No days in plan", "affected": 0}



        # Get lesson items in these days

        items_res = (

            sb.table("focus_items")

            .select("id, type, practice_type, topic, label")

            .in_("day_id", day_ids)

            .in_("type", ["lesson", "theory", "content"])

            .execute()

        )

    else:

        # Get all user's plans first

        plans_res = sb.table("focus_plans").select("id").eq("user_id", uid).execute()

        plan_ids = [p["id"] for p in (plans_res.data or [])]



        if not plan_ids:

            return {"ok": True, "message": "No plans found", "affected": 0}



        # Get all days for user's plans

        days_res = sb.table("focus_days").select("id").in_("plan_id", plan_ids).execute()

        day_ids = [d["id"] for d in (days_res.data or [])]



        if not day_ids:

            return {"ok": True, "message": "No days found", "affected": 0}



        # Get lesson items

        items_res = (

            sb.table("focus_items")

            .select("id, type, practice_type, topic, label")

            .in_("day_id", day_ids)

            .in_("type", ["lesson", "theory", "content"])

            .execute()

        )



    items = items_res.data or []



    # Filter items that need updating (type should be 'lesson' for content kind detection)

    # The backend _determine_item_kind maps 'lesson' -> 'content' kind

    # Items already with type='lesson' are correct, but we report them anyway

    report = []

    for item in items:

        report.append({

            "id": item["id"],

            "current_type": item["type"],

            "topic": item.get("topic", ""),

            "label": item.get("label", ""),

            "status": "ok" if item["type"] == "lesson" else "will_update"

        })



    items_to_update = [item for item in items if item["type"] != "lesson"]



    if req.dry_run:

        return {

            "ok": True,

            "dry_run": True,

            "total_lesson_items": len(items),

            "items_needing_update": len(items_to_update),

            "report": report,

            "message": "Set dry_run=false to apply changes"

        }



    # Apply updates

    updated_count = 0

    for item in items_to_update:

        sb.table("focus_items").update({"type": "lesson"}).eq("id", item["id"]).execute()

        updated_count += 1



    return {

        "ok": True,

        "dry_run": False,

        "total_lesson_items": len(items),

        "updated_count": updated_count,

        "message": f"Updated {updated_count} items to type='lesson'"

    }





# --- Domain Cleanup Backfill ---



class BackfillDomainCleanupReq(BaseModel):

    dry_run: bool = True

    plan_id: Optional[str] = None  # If provided, only this plan

    only_non_language: bool = True  # Only process non-language domain plans

    convert_translation: bool = True

    convert_roleplay: bool = True

    fix_lesson_kind: bool = True

    limit: int = 500





@router.post("/admin/backfill-domain-cleanup")

async def backfill_domain_cleanup(req: BackfillDomainCleanupReq, request: Request):

    """

    Fix existing plans/items with language-specific content in non-language domains.



    PROTECTED: Requires X-Admin-Key header matching ADMIN_KEY env variable.



    Conversion rules:

    - translation → quiz (with normalized quiz content)

    - roleplay/exercise → writing (with normalized prompt)

    - lesson → ensure kind="content"



    IDEMPOTENT: Running twice produces 0 changes on second run.



    Use dry_run=True first to see what would be changed.

    """

    _require_admin_key(request)



    uid = await get_user_id(request)

    sb = _require_admin()



    changes = []

    plans_scanned = 0

    items_scanned = 0



    # 1) Find target plans

    if req.plan_id:

        # Single plan mode

        plan_res = _safe_execute(

            sb.table("focus_plans")

            .select("id, domain, title")

            .eq("id", req.plan_id)

            .eq("user_id", uid)

            .maybe_single()

        )

        plans = [plan_res.data] if plan_res and plan_res.data else []

    else:

        # All plans mode

        query = sb.table("focus_plans").select("id, domain, title").eq("user_id", uid)



        if req.only_non_language:

            # Get plans where domain is NOT language_learning/language OR domain is NULL

            # Since Supabase doesn't support OR with neq easily, we fetch all and filter

            all_plans_res = query.limit(req.limit).execute()

            plans = [

                p for p in (all_plans_res.data or [])

                if not p.get("domain") or p.get("domain", "").lower() not in ("language_learning", "language")

            ]

        else:

            plans = (query.limit(req.limit).execute()).data or []



    plans_scanned = len(plans)



    if not plans:

        return {

            "ok": True,

            "dry_run": req.dry_run,

            "plans_scanned": 0,

            "items_scanned": 0,

            "changes": [],

            "changed_count": 0,

            "message": "No plans found matching criteria"

        }



    # 2) Process each plan

    for plan in plans:

        plan_id = plan["id"]

        plan_domain = plan.get("domain") or "other"



        # Skip language domains

        if plan_domain.lower() in ("language_learning", "language"):

            continue



        # Get days for this plan

        days_res = sb.table("focus_days").select("id").eq("plan_id", plan_id).execute()

        day_ids = [d["id"] for d in (days_res.data or [])]



        if not day_ids:

            continue



        # Get all items in these days

        items_res = (

            sb.table("focus_items")

            .select("id, type, kind, practice_type, topic, label, content")

            .in_("day_id", day_ids)

            .execute()

        )

        items = items_res.data or []

        items_scanned += len(items)



        # 3) Process each item

        for item in items:

            item_id = item["id"]

            item_type = (item.get("type") or "").lower()

            item_kind = (item.get("kind") or "").lower()

            item_practice_type = (item.get("practice_type") or "").lower()

            item_topic = item.get("topic", "")



            updates = {}

            change_from = {"type": item_type, "kind": item_kind, "practice_type": item_practice_type}

            change_to = {}



            # Rule 1: translation → quiz

            if req.convert_translation and (item_practice_type == "translation" or item_type == "translation"):

                updates["type"] = "quiz"

                updates["kind"] = "quiz"

                updates["practice_type"] = None

                updates["content"] = {

                    "question": f"Melyik állítás igaz a következő témáról: {item_topic}?",

                    "options": [

                        "Az első lehetőség",

                        "A második lehetőség",

                        "A harmadik lehetőség",

                        "A negyedik lehetőség"

                    ],

                    "correct_index": 0,

                    "explanation": f"A helyes válasz a témához ({item_topic}) kapcsolódik."

                }

                change_to = {"type": "quiz", "kind": "quiz", "practice_type": None}



            # Rule 2: roleplay/exercise → writing

            elif req.convert_roleplay and item_practice_type in ("roleplay", "exercise", "dialogue"):

                updates["type"] = "practice"

                updates["kind"] = "writing"

                updates["practice_type"] = "writing"

                updates["content"] = {

                    "prompt": f"Írd le 2-3 mondatban a véleményedet vagy tapasztalataidat a következő témáról: {item_topic}",

                    "min_chars": 80,

                    "grading_hint": "Keress konkrét példákat és érthető megfogalmazást."

                }

                change_to = {"type": "practice", "kind": "writing", "practice_type": "writing"}



            # Rule 3: lesson → ensure kind="content"

            elif req.fix_lesson_kind and item_type == "lesson" and item_kind != "content":

                updates["kind"] = "content"

                change_to = {"type": "lesson", "kind": "content", "practice_type": item_practice_type}



            # If changes needed

            if updates:

                changes.append({

                    "item_id": item_id,

                    "plan_id": plan_id,

                    "topic": item_topic,

                    "from": change_from,

                    "to": change_to

                })



                # Apply if not dry run

                if not req.dry_run:

                    sb.table("focus_items").update(updates).eq("id", item_id).execute()

                    print(f"[DOMAIN_CLEANUP] Updated item {item_id}: {change_from} → {change_to}")



    return {

        "ok": True,

        "dry_run": req.dry_run,

        "plans_scanned": plans_scanned,

        "items_scanned": items_scanned,

        "changes": changes,

        "changed_count": len(changes),

        "message": f"{'Would update' if req.dry_run else 'Updated'} {len(changes)} items"

    }


# =============================================================================
# OUTLINE GENERATION ENDPOINT
# =============================================================================

class OutlineRequest(BaseModel):
    goal: str
    mode: str = "learning"  # "learning" | "project"
    domain: Optional[str] = None
    level: str = "beginner"
    minutes_per_day: int = 20
    duration_days: int = 7
    lang: str = "hu"


@router.post("/outline")
async def generate_outline(req: OutlineRequest):
    """
    Generate a 7-day focus outline (titles + intros only).
    Returns STRICT JSON, never chat text.
    """
    _require_mode(req.mode)

    try:
        from .llm_client import generate_focus_outline

        domain = req.domain or req.mode

        outline = await generate_focus_outline(
            user_goal=req.goal,
            lang=req.lang,
            focus_type=req.mode,
            domain=domain,
            level=req.level,
            minutes_per_day=req.minutes_per_day,
            duration_days=req.duration_days,
        )

        if not outline or not outline.get("days"):
            return JSONResponse(
                status_code=422,
                content={"ok": False, "error": "outline_generation_failed", "detail": "No valid outline generated"}
            )

        return {
            "ok": True,
            "outline": outline,
        }

    except Exception as e:
        print(f"[OUTLINE] Generation failed: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": "outline_generation_error", "detail": str(e)}
        )



























