# app/llm_client.py
from __future__ import annotations

import asyncio
import json
import os
import re
import unicodedata
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    from anthropic import Anthropic
except Exception:
    Anthropic = None  # type: ignore

# Optional tool support (only if tools.py exists)
try:
    from .tools import PUMi_TOOLS, get_tool_system_prompt

    TOOLS_AVAILABLE = True
except Exception:
    PUMi_TOOLS = []
    TOOLS_AVAILABLE = False

    def get_tool_system_prompt() -> str:
        return ""


# =========================
# ENV
# =========================
CLAUDE_API_KEY = (os.getenv("ANTHROPIC_API_KEY") or "").strip()

# Multi-model strategy:
# - SONNET: High-quality conversational responses (low token usage ~300 tokens)
# - HAIKU: Fast JSON generation tasks (high token usage but cheaper)
CLAUDE_MODEL_SONNET = (os.getenv("CLAUDE_MODEL_SONNET") or "claude-sonnet-4-20250514").strip()
CLAUDE_MODEL_HAIKU = (os.getenv("CLAUDE_MODEL_HAIKU") or "claude-3-haiku-20240307").strip()

# Default model for backwards compatibility
CLAUDE_MODEL = CLAUDE_MODEL_HAIKU


# =========================
# Client init
# =========================
claude = None
_CLAUDE_READY = False
if Anthropic and CLAUDE_API_KEY:
    claude = Anthropic(api_key=CLAUDE_API_KEY)
    _CLAUDE_READY = True


# =========================
# Helpers
# =========================
def _extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    """
    Extract first top-level JSON object from arbitrary text.
    Handles markdown code blocks. Returns dict or None.
    """
    if not text:
        return None

    s = text.strip()

    # Remove markdown fences if present
    if "```" in s:
        # Prefer ```json
        if "```json" in s:
            start = s.find("```json")
            s = s[start + 7 :]
            end = s.find("```")
            if end != -1:
                s = s[:end]
        else:
            start = s.find("```")
            s = s[start + 3 :]
            end = s.find("```")
            if end != -1:
                s = s[:end]

    s = s.strip()

    # Fast path
    if s.startswith("{") and s.endswith("}"):
        try:
            return json.loads(s)
        except Exception:
            pass

    # Bracket matching
    start = s.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False
    for i, ch in enumerate(s[start:], start):
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"' and not escape:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                candidate = s[start : i + 1]
                try:
                    return json.loads(candidate)
                except Exception:
                    return None

    return None


def _strip_json_fences(s: str) -> str:
    """
    Aggressively remove markdown code fences from JSON responses.
    Handles both inline and multiline fences.
    """
    if not s:
        return ""
    
    s = s.strip()
    
    # Remove opening fence (handles ```json\n or ``` or ```json or ``` json)
    s = re.sub(r'^```\s*(?:json)?\s*\n?', '', s, flags=re.IGNORECASE | re.MULTILINE)
    
    # Remove closing fence (handles \n``` or ```)
    s = re.sub(r'\n?\s*```\s*$', '', s, flags=re.MULTILINE)
    
    return s.strip()


def log_shadow(*, user_msg: str, claude_msg: str, meta: Optional[Dict[str, Any]] = None) -> None:
    """Lightweight stdout JSON log for monitoring."""
    try:
        def _scrub_pii(text: str) -> str:
            if not text:
                return ""
            # Redact emails
            text = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[redacted_email]", text)
            # Redact long base64-like blobs
            text = re.sub(r"[A-Za-z0-9+/=]{200,}", "[redacted_base64]", text)
            return text

        payload = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "user": _scrub_pii(user_msg or "")[:220],
            "claude": _scrub_pii(claude_msg or "")[:220],
            "meta": meta or {},
        }
        print(json.dumps(payload, ensure_ascii=False))
    except Exception:
        pass



# ✅ CRITICAL: Core API call with model selection
async def _claude_messages_create(
    *,
    system: str,
    user: str,
    max_tokens: int = 320,
    temperature: float = 0.5,
    history: Optional[List[Dict[str, str]]] = None,
    model: Optional[str] = None,  # Allow explicit model override
) -> str:
    """
    Simple Claude API call with optional history.
    Returns assistant's text response.

    Args:
        model: Optional model override. If None, uses CLAUDE_MODEL (Haiku by default)
    """
    if not _CLAUDE_READY or not claude:
        return "Claude API not available"

    # Use provided model or default
    model_to_use = model or CLAUDE_MODEL

    # Build messages array
    messages = []

    # Add history if provided
    if history:
        for h in history[-10:]:  # Keep last 10 messages for context
            role = h.get("role", "user")
            content = h.get("content", "")
            if role and content:
                messages.append({
                    "role": role,
                    "content": content
                })

    # Add current user message
    messages.append({
        "role": "user",
        "content": user
    })

    try:
        response = claude.messages.create(
            model=model_to_use,
            system=system,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        # Extract text from response
        if response.content and len(response.content) > 0:
            return response.content[0].text
        return ""

    except Exception as e:
        print(f"Claude API error: {e}")
        return f"Error: {str(e)}"


# ✅ Model-specific wrappers for cost optimization
async def _claude_chat_sonnet(
    *,
    system: str,
    user: str,
    max_tokens: int = 320,
    temperature: float = 0.5,
    history: Optional[List[Dict[str, str]]] = None,
) -> str:
    """Use Sonnet for high-quality conversational responses (low token usage)."""
    return await _claude_messages_create(
        system=system,
        user=user,
        max_tokens=max_tokens,
        temperature=temperature,
        history=history,
        model=CLAUDE_MODEL_SONNET,
    )


async def _claude_json_haiku(
    *,
    system: str,
    user: str,
    max_tokens: int = 1200,
    temperature: float = 0.3,
) -> str:
    """Use Haiku for fast, cheap JSON generation tasks."""
    return await _claude_messages_create(
        system=system,
        user=user,
        max_tokens=max_tokens,
        temperature=temperature,
        history=None,  # JSON generation doesn't need history
        model=CLAUDE_MODEL_HAIKU,
    )


async def _claude_json_sonnet(
    *,
    system: str,
    user: str,
    max_tokens: int = 4000,
    temperature: float = 0.4,
) -> str:
    """Use Sonnet for high-quality, long-form JSON generation (language lessons)."""
    return await _claude_messages_create(
        system=system,
        user=user,
        max_tokens=max_tokens,
        temperature=temperature,
        history=None,
        model=CLAUDE_MODEL_SONNET,
    )


async def _claude_messages_with_tools(
    *,
    system: str,
    user: str,
    max_tokens: int = 800,
    temperature: float = 0.3,
    history: Optional[List[Dict[str, str]]] = None,
) -> str:
    if not _CLAUDE_READY or not claude:
        return ""

    messages = []
    if history:
        for h in history[-6:]:
            role = h.get("role", "user")
            content = h.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user})

    text = await _claude_messages_create(
        system=system,
        user=user,
        max_tokens=max_tokens,
        temperature=temperature,
        history=history,
    )
    return text


async def _claude_messages_multimodal(
    *,
    system: str,
    text_content: str,
    images: List[Dict[str, Any]],
    max_tokens: int = 420,
    temperature: float = 0.5,
) -> str:
    if not _CLAUDE_READY or not claude:
        return "Claude API not available"

    content_blocks = []
    for img in images[:5]:
        b64 = img.get("base64", "")
        media_type = img.get("media_type", "image/jpeg")
        if b64:
            content_blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": b64
                }
            })

    content_blocks.append({"type": "text", "text": text_content})

    def _call():
        # ✅ Use Sonnet for multimodal chat (better image understanding)
        resp = claude.messages.create(
            model=CLAUDE_MODEL_SONNET,
            system=system,
            messages=[{"role": "user", "content": content_blocks}],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        try:
            return resp.content[0].text
        except Exception:
            return str(resp)

    text = await asyncio.to_thread(_call)
    return text


def _product_context_block(*, lang: str) -> str:
    is_hu = (lang or "hu").lower().startswith("hu")

    if is_hu:
        return (
            "- PUMi egy önfejlesztő app.\n"
            "- PUMi has Focus Mode: 45 minutes/day for learning, projects, or skill-building.\n"
            "- Focus mode days contain structured lessons, tasks, quizzes, and practices.\n"
        )
    else:
        return (
            "- PUMi is a self-improvement app.\n"
            "- PUMi has Focus Mode: 45 minutes/day for learning, projects, or skill-building.\n"
            "- Focus mode days contain structured lessons, tasks, quizzes, and practices.\n"
        )


def _genz_system(*, lang: str) -> str:
    is_hu = (lang or "hu").lower().startswith("hu")

    if is_hu:
        base = (
            "Te PUMi vagy, egy GEN Z-hez szabott önfejlesztő AI.\n"
            "Vibe: közvetlen, szókimondó, tisztelettudó, mintha egy barátod lenne – de nem terapeuta vagy HR.\n"
            "Tiltott:\n"
            "- NE légy önelégültségig vidám vagy lelkes\n"
            "- NE beszélj róla, hogy 'természetes, normális' vagy 'ne ítéld magad'\n"
            "- NE ígérj 'megoldást' vagy 'ragyogást'\n"
            "- NE adj túl általános savakat ('dolgozz magadon')\n"
            "Engedélyezett:\n"
            "- Egyetlen rövid (2–4 mondat) válasz, 200 karakter alatt\n"
            "- Legfeljebb EGY direkt kérdés, ami arra kényszerít, hogy szembenézz valamivel\n"
            "- Ha valaki lóg vagy megtörte, ne ünnepelj – kérdezz rá miért van esély csúszásra\n"
            "- Ha valaki büszke és szeretne továbblépni, add meg neki a respect-et és segíts a következő lépésben.\n"
        )
    else:
        base = (
            "You are PUMi, a Gen Z-focused self-development AI.\n"
            "Vibe: direct, honest, respectful, like a friend – not a therapist or HR rep.\n"
            "Forbidden:\n"
            "- Don't be obnoxiously cheerful\n"
            "- Don't say 'it's natural' or 'don't judge yourself'\n"
            "- Don't promise 'solutions' or 'you'll shine'\n"
            "- Don't give vague advice ('just work on it')\n"
            "Allowed:\n"
            "- One short reply (2–4 sentences, under 200 chars)\n"
            "- At most ONE direct question that makes them face something\n"
            "- If they're slacking or broke a habit, don't celebrate – ask why it might slip again\n"
            "- If they're proud and want to move forward, respect them and help with next step.\n"
        )

    product = _product_context_block(lang=lang)
    return base.rstrip() + "\n\n" + product.rstrip() + "\n"


def _millenial_system(*, lang: str) -> str:
    is_hu = (lang or "hu").lower().startswith("hu")

    if is_hu:
        base = (
            "Te PUMi vagy, egy MILLENNIAL-hez szabott önfejlesztő AI.\n"
            "Tónus: józan, mérsékelten bátorító, értelmes, szakmai – nem túl heves, de nem is száraz.\n"
            "Cél: 3–5 mondat (legfeljebb 300 karakter) amiből valódi válasz derül ki, vagy ami egy lényeges pontot vezet tovább.\n"
            "Tiltott:\n"
            "- NE legyél túlbuzgó coach vagy motivációs beszéd\n"
            "- NE kínálj rögtön 'action plan'-t, hacsak nem kérnek\n"
            "- NE legyél üres vagy sablonos ('lehet, hogy...', 'gondolkozz el rajta')\n"
            "Engedélyezett:\n"
            "- Ha valami nincs rendben, légy egyértelmű de barátságos\n"
            "- Ha valaki félúton van vagy terelődik, fókuszálj – mi a gát?\n"
            "- Ha konkrét tanácsot kér, adj 2–3 opciót vagy egy egyértelmű következő lépést.\n"
        )
    else:
        base = (
            "You are PUMi, a Millennial-focused self-development AI.\n"
            "Tone: level-headed, moderately encouraging, thoughtful, professional – not overly intense, but not dry.\n"
            "Goal: 3–5 sentences (max 300 chars) with a real answer or insight that moves things forward.\n"
            "Forbidden:\n"
            "- Don't be an overly excited coach or motivational speech\n"
            "- Don't offer an 'action plan' unless asked\n"
            "- Don't be empty or generic ('maybe consider...', 'think about it')\n"
            "Allowed:\n"
            "- If something's off, be clear but friendly\n"
            "- If they're stuck or drifting, focus – what's the blocker?\n"
            "- If they ask for advice, give 2–3 options or one clear next step.\n"
        )

    product = _product_context_block(lang=lang)
    return base.rstrip() + "\n\n" + product.rstrip() + "\n"


async def claude_chat_answer(
    *,
    message: str,
    lang: str,
    tier: str = "genz",
    images: Optional[List[Dict[str, Any]]] = None,
    enable_tools: bool = False,  # kept for compatibility
    memory_block: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> str:
    lang_norm = (lang or "hu").lower().strip()
    tier_norm = (tier or "genz").lower().strip()

    system = _genz_system(lang=lang_norm) if tier_norm == "genz" else _millenial_system(lang=lang_norm)

    # Memory injection
    if memory_block:
        system = system.rstrip() + "\n\nMEMORY:\n" + str(memory_block).strip() + "\n"

    # Optional tool prompt injection (only if exists)
    if enable_tools and TOOLS_AVAILABLE and PUMi_TOOLS:
        system = system.rstrip() + "\n\n" + get_tool_system_prompt().strip() + "\n"

    max_tokens = 320
    if images and len(images) > 0:
        max_tokens = 420

    if images and len(images) > 0:
        text = await _claude_messages_multimodal(
            system=system,
            text_content=message,
            images=images,
            max_tokens=max_tokens,
            temperature=0.5,
        )
    else:
        # ✅ Use Sonnet for conversational chat (better quality, low token count)
        text = await _claude_chat_sonnet(
            system=system,
            user=message,
            max_tokens=max_tokens,
            temperature=0.5,
            history=history,
        )

    out = (text or "").strip()
    log_shadow(
        user_msg=message,
        claude_msg=out,
        meta={"route": "chat", "tier": tier_norm, "lang": lang_norm, "has_images": bool(images)},
    )
    return out


async def claude_roleplay_answer(
    *,
    message: str,
    lang: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> str:
    lang_norm = (lang or "hu").lower().strip()
    is_hu = lang_norm.startswith("hu")

    if is_hu:
        system = (
            "Te egy párbeszéd-partner vagy egy tanulási role-play gyakorlathoz.\n"
            "SZABÁLYOK:\n"
            "- Mindig a kért szerepben válaszolj (A vagy B).\n"
            "- 1 rövid, természetes mondat (max 160 karakter).\n"
            "- NINCS coaching, NINCS magyarázat, NINCS visszakérdezés, NINCS extra szöveg.\n"
            "- Ne írj címkét, ne írd hogy 'A:' vagy 'B:' – csak a mondat.\n"
        )
    else:
        system = (
            "You are a dialogue partner for a learning role-play.\n"
            "RULES:\n"
            "- Always reply as the requested role (A or B).\n"
            "- 1 short natural sentence (max 160 chars).\n"
            "- No coaching, no explanations, no questions, no extra text.\n"
            "- Do not output role labels like 'A:' or 'B:'. Only the sentence.\n"
        )

    text = await _claude_chat_sonnet(
        system=system,
        user=message,
        max_tokens=120,
        temperature=0.7,
        history=history,
    )

    out = (text or "").strip()
    log_shadow(
        user_msg=message,
        claude_msg=out,
        meta={"route": "roleplay", "lang": lang_norm},
    )
    return out


async def llm_chat(
    *,
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
    tier: Optional[str] = None,
    lang: Optional[str] = None,
    mode: Optional[str] = None,
    images: Optional[List[Dict[str, Any]]] = None,
) -> str:
    mode_norm = (mode or "chat").lower().strip()

    if mode_norm == "roleplay":
        # roleplay: guard nélküli, 1 mondatos dialógus
        return await claude_roleplay_answer(
            message=message,
            lang=(lang or "hu"),
            history=history,
        )

    # default: a meglévő PUMi/PUMi chat
    return await claude_chat_answer(
        message=message,
        lang=(lang or "hu"),
        tier=(tier or "genz"),
        images=images,
        history=history,
    )


# =========================
# CANONICAL FOCUS ITEM SCHEMA v1.0
# =========================
VALID_KINDS = ["content", "quiz", "checklist", "upload_review", "translation", "cards", "roleplay", "writing", "briefing", "feedback", "smart_lesson"]

# Kind selection mapping - backend decides, not LLM
KIND_FROM_PRACTICE_TYPE = {
    "translation": "translation",
    "exercise": "roleplay",  # exercise = roleplay dialogue
    "roleplay": "roleplay",
    "dialogue": "roleplay",
    "quiz": "quiz",
    "cards": "cards",
    "flashcard": "cards",
    "writing": "writing",
    "speaking": "checklist",  # speaking = offline, needs proof
    "practice_speaking": "checklist",
    "task": "checklist",
}

# Validation rules per kind
KIND_VALIDATION_RULES = {
    "content": {"min_chars": 0, "min_items": 0, "input_type": "none"},  # Read-only lesson text
    "translation": {"min_chars": 10, "min_items": 1, "input_type": "multi_text"},
    "quiz": {"min_chars": 0, "min_items": 1, "input_type": "choice"},
    "cards": {"min_chars": 0, "min_items": 3, "input_type": "none"},
    "roleplay": {"min_chars": 80, "min_items": 1, "input_type": "text"},
    "writing": {"min_chars": 120, "min_items": 1, "input_type": "text"},
    "checklist": {"min_chars": 60, "min_items": 1, "input_type": "text"},
    "upload_review": {"min_chars": 0, "min_items": 1, "input_type": "file"},
    "briefing": {"min_chars": 0, "min_items": 0, "input_type": "none"},  # Read-only briefing card
    "feedback": {"min_chars": 0, "min_items": 0, "input_type": "none"},  # Read-only AI feedback
    "smart_lesson": {"min_chars": 0, "min_items": 1, "input_type": "choice"},  # Micro-skill lesson with interactive tasks
}

# Generic filler and placeholder guards
GENERIC_FILLER_PATTERNS_HU = [
    "ez egy olvasando tartalom",
    "a temaban",
    "ismerkedjunk meg",
    "attekintjuk a temat",
    "roviden osszefoglalja",
    "altalanos attekintes",
    "alapokat ismerjuk meg",
]

GENERIC_FILLER_PATTERNS_EN = [
    "this is a reading material",
    "about the topic",
    "let's get to know",
    "we will overview",
    "briefly summarizes",
    "general overview",
]

PLACEHOLDER_OPTIONS = {"a", "b", "c", "d", "1", "2", "3"}

# Forbidden patterns - tasks that cannot be verified via text input
# These phrases indicate speaking/listening tasks that bypass our validation
FORBIDDEN_PATTERNS = [
    "hangosan",
    "mondd ki",
    "ismételd el",
    "mondd utánam",
    "hallgasd meg",
    "mondd fel",
    "mond ki",
    "olvasd fel",
    "speak aloud",
    "say out loud",
    "repeat after",
    "listen and repeat",
]


def _determine_item_kind(item_type: str, practice_type: Optional[str] = None) -> str:
    """
    Deterministically select kind based on item type and practice_type.
    Backend decides, not the LLM.
    """
    if item_type == "briefing":
        return "briefing"
    if item_type == "feedback":
        return "feedback"
    if item_type == "smart_lesson":
        return "smart_lesson"
    if item_type == "quiz":
        return "quiz"
    if item_type == "flashcard":
        return "cards"
    if item_type == "lesson":
        return "content"  # lessons are read-only content (no input required)
    if item_type == "task":
        return "checklist"

    # For practice items, use practice_type
    if practice_type:
        pt = practice_type.lower().strip()
        if pt in KIND_FROM_PRACTICE_TYPE:
            return KIND_FROM_PRACTICE_TYPE[pt]

    # Default to checklist (safest)
    return "checklist"


def _contains_forbidden_pattern(text: str) -> Optional[str]:
    """
    Check if text contains any forbidden patterns.
    Returns the matched pattern if found, None otherwise.
    """
    if not text:
        return None
    text_lower = text.lower()
    for pattern in FORBIDDEN_PATTERNS:
        if pattern.lower() in text_lower:
            return pattern
    return None

def _normalize_for_match(text: str) -> str:
    if not text:
        return ""
    s = unicodedata.normalize("NFKD", text)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.lower().strip()


def _is_generic_summary(text: str, lang: str) -> bool:
    norm = _normalize_for_match(text)
    patterns = GENERIC_FILLER_PATTERNS_HU if (lang or "hu").lower().startswith("hu") else GENERIC_FILLER_PATTERNS_EN
    return any(pat in norm for pat in patterns)


def _options_invalid(options: List[str]) -> bool:
    if not options or len(options) != 3:
        return True
    normalized = [_normalize_for_match(o) for o in options if o]
    if any(opt in PLACEHOLDER_OPTIONS for opt in normalized):
        return True
    if len(set(normalized)) != len(normalized):
        return True
    return False


def _validate_focus_item(item: Dict[str, Any]) -> tuple[bool, str]:
    """
    Validate a focus item against the canonical schema.
    Returns (is_valid, error_message).
    """
    kind = item.get("kind")
    if not kind or kind not in VALID_KINDS:
        return False, f"Invalid or missing kind: {kind}"

    # Check for forbidden patterns in actionable (non-content) tasks only.
    # Language lessons may mention pronunciation terms as explanatory context.
    if kind != "content":
        instructions = item.get("instructions_md", "")
        title = item.get("title", "")
        subtitle = item.get("subtitle", "")
        content = item.get("content", {})

        fields_to_check = [
            instructions,
            title,
            subtitle,
            str(content.get("prompt", "")),
            str(content.get("scene_title", "")),
            str(content.get("proof_required", "")),
        ]
        if isinstance(content.get("steps"), list):
            fields_to_check.extend(content["steps"])

        for field in fields_to_check:
            forbidden = _contains_forbidden_pattern(field)
            if forbidden:
                return False, f"Contains forbidden pattern: '{forbidden}' - tasks requiring speaking aloud cannot be verified"

    # Check required fields
    required_fields = ["schema_version", "kind", "idempotency_key", "title", "instructions_md", "content", "validation"]
    for field in required_fields:
        if field not in item:
            return False, f"Missing required field: {field}"

    # Check validation block
    validation = item.get("validation", {})
    # Read-only kinds don't require interaction
    if kind not in ("content", "briefing", "feedback") and not validation.get("require_interaction"):
        return False, "validation.require_interaction must be true"

    # Kind-specific validation
    rules = KIND_VALIDATION_RULES.get(kind, {})
    content = item.get("content", {})

    if kind == "quiz":
        # Support both new "questions" array format and legacy single question format
        questions = content.get("questions", [])
        if questions:
            # New format: array of questions
            if len(questions) < 4 or len(questions) > 6:
                return False, f"Quiz must have 4-6 questions, got {len(questions)}"
            for i, q in enumerate(questions):
                opts = q.get("options", [])
                if _options_invalid(opts):
                    return False, f"Question {i+1} has invalid options"
                correct_idx = q.get("correct_index")
                if correct_idx is None:
                    correct_idx = q.get("answer_index")
                if correct_idx is None or correct_idx < 0 or correct_idx >= len(opts):
                    return False, f"Question {i+1} has invalid correct_index"
                qtext = q.get("q") or q.get("question")
                if not qtext:
                    return False, f"Question {i+1} missing question text"
                if not q.get("explanation"):
                    return False, f"Question {i+1} missing explanation"
        else:
            # Legacy format: single question
            choices = content.get("choices", [])
            if len(choices) < 3:
                return False, "Quiz must have at least 3 choices"
            correct_idx = content.get("correct_index")
            if correct_idx is None or correct_idx < 0 or correct_idx >= len(choices):
                return False, "Quiz has invalid correct_index"

    elif kind == "content":
        content_type = content.get("content_type", "")

        if content_type == "language_nonlatin_beginner":
            # Non-Latin beginner flow validation
            lesson_flow = content.get("lesson_flow", [])
            if not lesson_flow or len(lesson_flow) < 1:
                return False, "Non-Latin beginner lesson needs lesson_flow array"
            if len(lesson_flow) > 7:
                return False, f"lesson_flow too long ({len(lesson_flow)}), max 7"
            for fi, flow_item in enumerate(lesson_flow):
                if not flow_item.get("title_hu"):
                    return False, f"lesson_flow[{fi}] missing title_hu"
                if not flow_item.get("body_md"):
                    return False, f"lesson_flow[{fi}] missing body_md"
            # Warn if vocabulary_table slipped through (don't reject, just log)
            if content.get("vocabulary_table"):
                print(f"[NONLATIN_WARN] vocabulary_table present in nonlatin beginner content — will be ignored by renderer")

        elif content_type == "language_lesson":
            # Language lesson validation (relaxed to avoid timeout-causing retries)
            introduction = content.get("introduction", "")
            if not introduction or len(introduction.split()) < 15:
                return False, "Language lesson introduction too short (min 15 words)"
            vocab_table = content.get("vocabulary_table", [])
            if len(vocab_table) < 3:
                return False, f"Language lesson needs 3+ vocabulary items, got {len(vocab_table)}"
            grammar = content.get("grammar_explanation", {})
            if not grammar or not grammar.get("explanation"):
                return False, "Language lesson missing grammar_explanation"
            grammar_examples = grammar.get("examples", [])
            if len(grammar_examples) < 1:
                return False, "Language lesson grammar needs 1+ example"
            dialogues = content.get("dialogues", [])
            if len(dialogues) < 1:
                return False, "Language lesson needs at least 1 dialogue"
            for d in dialogues:
                if len(d.get("lines", [])) < 2:
                    return False, "Dialogue must have 2+ lines"
        else:
            # Standard content validation (non-language domains)
            summary = content.get("summary", "")
            key_points = content.get("key_points", [])
            example = content.get("example", "")
            micro_task = content.get("micro_task", {})
            common_mistakes = content.get("common_mistakes", [])
            # Allow both old body_md format and new structured format
            if not summary and not content.get("body_md"):
                return False, "Content must have summary or body_md"
            if summary and _is_generic_summary(summary, "hu"):
                return False, "Content summary too generic"
            if key_points:
                if len(key_points) < 3 or len(key_points) > 7:
                    return False, f"Content must have 3-7 key_points, got {len(key_points)}"
                for kp in key_points:
                    if len(str(kp)) < 10:
                        return False, "Content key_points too short"
            if example and len(str(example)) < 10:
                return False, "Content example too short"
            if micro_task:
                if not isinstance(micro_task, dict):
                    return False, "Content micro_task must be an object"
                if not micro_task.get("instruction") or not micro_task.get("expected_output"):
                    return False, "Content micro_task missing fields"
            if common_mistakes:
                if len(common_mistakes) < 3 or len(common_mistakes) > 5:
                    return False, "Content common_mistakes must have 3-5 items"

    elif kind == "checklist":
        items = content.get("items", [])
        steps = content.get("steps", [])
        if items:
            if len(items) < 5 or len(items) > 9:
                return False, "Checklist must have 5-9 items"
            for it in items:
                text = it.get("text") if isinstance(it, dict) else it
                if not text or len(str(text)) < 8:
                    return False, "Checklist item too short"
        elif steps:
            if len(steps) < 3:
                return False, "Checklist must have at least 3 steps"
        else:
            return False, "Checklist missing items"

    elif kind == "upload_review":
        prompt = content.get("prompt", "")
        rubric = content.get("rubric", [])
        if not prompt:
            return False, "Upload review missing prompt"
        if rubric and len(rubric) < 4:
            return False, "Upload review rubric too short"

    elif kind == "cards":
        cards = content.get("cards", [])
        if len(cards) < 3:
            return False, "Cards must have at least 3 cards"

    elif kind == "roleplay":
        if not content.get("opening_line"):
            return False, "Roleplay must have opening_line"
        turn_limit = content.get("turn_limit", 0)
        if turn_limit < 6 or turn_limit > 12:
            # Auto-fix instead of failing
            pass

    elif kind == "translation":
        items = content.get("items", [])
        if len(items) < 1:
            return False, "Translation must have at least 1 item"

    elif kind == "briefing":
        situation = content.get("situation", "")
        outcome = content.get("outcome", "")
        if not situation or len(situation) < 20:
            return False, "Briefing must have situation (min 20 chars)"
        if not outcome:
            return False, "Briefing must have outcome"

    elif kind == "feedback":
        # Feedback can be a placeholder (no corrections yet) or full content
        corrections = content.get("corrections", [])
        improved = content.get("improved_version", "")
        placeholder = content.get("placeholder", False)
        if not placeholder:
            if not corrections or len(corrections) < 1:
                return False, "Feedback must have at least 1 correction"
            if not improved:
                return False, "Feedback must have improved_version"

    elif kind == "smart_lesson":
        hook = content.get("hook", "")
        if not hook or len(hook) < 10:
            return False, "smart_lesson hook too short (min 10 chars)"
        insight = content.get("insight", "")
        if not insight or len(insight) < 10:
            return False, "smart_lesson insight too short (min 10 chars)"
        for task_key in ("micro_task_1", "micro_task_2"):
            task = content.get(task_key, {})
            if not isinstance(task, dict):
                return False, f"smart_lesson {task_key} must be an object"
            if not task.get("instruction"):
                return False, f"smart_lesson {task_key} missing instruction"
            opts = task.get("options", [])
            if len(opts) != 3:
                return False, f"smart_lesson {task_key} must have exactly 3 options, got {len(opts)}"
            ci = task.get("correct_index")
            if ci is None or ci < 0 or ci >= len(opts):
                return False, f"smart_lesson {task_key} has invalid correct_index"
            if not task.get("explanation"):
                return False, f"smart_lesson {task_key} missing explanation"
        # Financial basics: reject generic content
        is_generic, reason = _is_generic_smart_lesson(content)
        if is_generic:
            return False, f"smart_lesson too generic: {reason}"

    return True, ""


def _build_item_generation_prompt(
    *,
    kind: str,
    lang: str,
    domain: str,
    level: str,
    day_title: str,
    item_topic: str,
    minutes: int,
    user_goal: str = "",
    settings: Optional[Dict[str, Any]] = None,
    preceding_lesson_content: Optional[str] = None,
) -> tuple[str, str]:
    """
    Build the strict prompt-lock system + user message for item generation.
    Returns (system_prompt, user_prompt).

    Settings affect content style:
    - tone: "casual" (friendly), "neutral" (informative), "strict" (demanding)
    - difficulty: "easy" (simpler), "normal" (balanced), "hard" (complex)
    - pacing: "small_steps" (granular), "big_blocks" (comprehensive)
    - content_depth: "short" / "medium" / "substantial" (from item template)
    """
    # Defensive coercion — caller may pass dicts from plan metadata
    lang = str(lang) if not isinstance(lang, str) else (lang or "hu")
    domain = str(domain) if not isinstance(domain, str) else (domain or "other")
    level = str(level) if not isinstance(level, str) else (level or "beginner")
    day_title = str(day_title) if not isinstance(day_title, str) else (day_title or "")
    item_topic = str(item_topic) if not isinstance(item_topic, str) else (item_topic or "")
    user_goal = str(user_goal) if not isinstance(user_goal, str) else (user_goal or "")

    is_hu = (lang or "hu").lower().startswith("hu")
    settings = settings or {}

    # Extract settings with defaults
    tone = settings.get("tone", "neutral")
    difficulty = settings.get("difficulty", "normal")
    pacing = settings.get("pacing", "small_steps")
    content_depth = settings.get("content_depth", "medium")

    # Build tone guidance
    tone_guide = {
        "casual": "Use friendly, encouraging language. Add motivational touches. Be warm and supportive.",
        "neutral": "Use clear, informative language. Be professional but approachable.",
        "strict": "Use direct, demanding language. Set high expectations. Be precise and rigorous.",
    }.get(tone, "Use clear, informative language.")

    # Build difficulty guidance
    difficulty_guide = {
        "easy": "Use simple vocabulary. Provide more examples. Break down complex concepts into smaller pieces.",
        "normal": "Use balanced complexity. Mix theory with practical examples.",
        "hard": "Use advanced vocabulary. Include nuanced concepts. Challenge the learner with depth.",
    }.get(difficulty, "Use balanced complexity.")

    # Build depth guidance
    depth_guide = {
        "short": "Keep content brief and focused. 3-4 key points, short examples.",
        "medium": "Provide moderate depth. 4-5 key points with solid examples.",
        "substantial": "Provide comprehensive coverage. 5-7 key points, detailed examples, deeper explanations.",
    }.get(content_depth, "Provide moderate depth.")

    # Schema definition
    schema_def = '''
{
  "schema_version": "1.0",
  "kind": "''' + kind + '''",
  "idempotency_key": "unique-string",
  "title": "string",
  "subtitle": "string",
  "estimated_minutes": ''' + str(minutes) + ''',
  "difficulty": "easy|normal|hard",
  "instructions_md": "string - short, actionable instructions",
  "rubric_md": "string - how user knows they did it right",
  "ui": { "primary_cta": "string", "secondary_cta": "string|null" },
  "input": { "type": "''' + KIND_VALIDATION_RULES.get(kind, {}).get("input_type", "text") + '''", "placeholder": "string|null" },
  "content": { /* kind-specific, see below */ },
  "validation": { "require_interaction": true, "min_chars": ''' + str(KIND_VALIDATION_RULES.get(kind, {}).get("min_chars", 20)) + ''', "min_items": ''' + str(KIND_VALIDATION_RULES.get(kind, {}).get("min_items", 1)) + ''' },
  "scoring": { "mode": "manual|auto", "max_points": 10 }
}
'''

    # Kind-specific content requirements
    is_language_domain = (domain or "other").lower() in ("language_learning", "language")

    # Language domain lessons get a rich, structured content spec
    # NOTE: Keep spec compact — Haiku has limited token budget
    if kind == "content" and is_language_domain:
        content_spec_content = '''
"content": {
  "title": "Specific lesson title",
  "content_type": "language_lesson",
  "introduction": "1-2 paragraphs: what this lesson covers, what the learner will achieve. Min 40 words. In Hungarian.",
  "vocabulary_table": [
    { "word": "target word", "translation": "Hungarian", "pronunciation": "phonetic", "example_sentence": "full sentence", "example_translation": "Hungarian translation" }
  ],
  "grammar_explanation": {
    "rule_title": "Grammar concept name",
    "explanation": "Clear explanation of the rule, when to use it. Min 50 words. In Hungarian.",
    "formation_pattern": "e.g. Subject + verb + object",
    "examples": [
      { "target": "target language example", "hungarian": "translation", "note": "brief note" }
    ]
  },
  "dialogues": [
    {
      "title": "Scenario title in Hungarian",
      "lines": [
        { "speaker": "A", "text": "target language", "translation": "Hungarian" },
        { "speaker": "B", "text": "target language", "translation": "Hungarian" }
      ]
    }
  ],
  "practice_exercises": [
    { "type": "fill_in_blank", "instruction": "Hungarian instruction", "items": [
      { "prompt": "sentence with ___", "answer": "correct word" },
      { "prompt": "another sentence with ___", "answer": "correct word" }
    ]}
  ],
  "summary": "1-2 sentences summarizing what was learned (Hungarian)",
  "key_points": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],
  "common_mistakes": ["Mistake 1 and correction", "Mistake 2 and correction", "Mistake 3 and correction"],
  "estimated_minutes": ''' + str(minutes) + '''
}
RULES:
- vocabulary_table: 5-8 entries. "word" = TARGET language, "translation" = Hungarian
- example_sentence: in TARGET language. example_translation: Hungarian
- grammar_explanation: explain in Hungarian, examples in TARGET language with Hungarian translation
- dialogues: "text" = TARGET language, "translation" = Hungarian
- practice_exercises: REQUIRED. At least 1 exercise with 2-4 items each. Prompts in TARGET language, instructions in Hungarian
- key_points: 3-5, common_mistakes: 3-5
- introduction, instructions, explanations: Hungarian
- The TARGET language is detected from the user_goal context
'''
    else:
        content_spec_content = '''
"content": {
  "title": "Specific title, not equal to the day title",
  "summary": "2-4 concrete sentences explaining the topic and why it matters",
  "key_points": [
    "Concrete definition with a specific example",
    "How it works / key mechanism",
    "When to use it / real-world application",
    "Important nuance or boundary",
    "Connection to a related concept"
  ],
  "example": "One concrete worked example relevant to the topic",
  "micro_task": { "instruction": "One clear task", "expected_output": "What the user should produce" },
  "common_mistakes": [
    "First common mistake and how to avoid it",
    "Second common mistake and why it happens",
    "Third common mistake with the correct approach"
  ],
  "estimated_minutes": 5
}
QUALITY RULES:
- summary MUST be specific (no generic filler)
- key_points MUST be 4-7 concrete items
- example MUST be concrete, not placeholder
- micro_task MUST be actionable
- common_mistakes MUST be 3-5 specific warnings
'''

    content_specs = {
        "content": content_spec_content,
        "translation": '''
"content": {
  "sentences": [
    { "source": "Hungarian sentence to translate", "target_lang": "the target language being learned", "hint": "optional hint" },
    { "source": "Second Hungarian sentence", "target_lang": "the target language being learned", "hint": "optional hint" }
  ]
}
RULES:
- sentences: 4-6 items
- source: Hungarian sentence (the user translates this INTO the target language)
- target_lang: code of the language being learned (en, it, de, etc.)
- hint: optional hint in the target language
- Keep sentences aligned to the lesson topic
''',
        "quiz": '''
"content": {
  "title": "Specific quiz title",
  "questions": [
    {
      "question": "Question 1 text - tests understanding",
      "options": ["Option 1", "Option 2", "Option 3"],
      "correct_index": 0,
      "explanation": "Why this is correct (1-2 sentences)"
    },
    {
      "question": "Question 2 text - application scenario",
      "options": ["Option 1", "Option 2", "Option 3"],
      "correct_index": 1,
      "explanation": "Why this is correct"
    },
    {
      "question": "Question 3 text - compare/contrast",
      "options": ["Option 1", "Option 2", "Option 3"],
      "correct_index": 2,
      "explanation": "Why this is correct"
    },
    {
      "question": "Question 4 text - identify error",
      "options": ["Option 1", "Option 2", "Option 3"],
      "correct_index": 0,
      "explanation": "Why this is correct"
    }
  ]
}
QUALITY RULES:
- MUST have 4-6 questions
- Each question MUST have exactly 3 options
- Use "question" (not "q"), "correct_index" (not "answer_index")
- Options must be plausible, not placeholders, not repeated
- Each question MUST include explanation
''',
        "cards": '''
"content": {
  "cards": [
    { "front": "word in target language", "back": "Hungarian translation" }
  ]
}
RULES:
- 5-8 cards minimum
- front: target language word/phrase
- back: Hungarian translation
''',
        "roleplay": '''
"content": {
  "scenario": "Description of the roleplay situation (in Hungarian)",
  "roles": { "user": "user role name", "ai": "AI partner role name" },
  "starter_prompt": "The first line the AI says to start the dialogue",
  "sample_exchanges": [
    { "user": "Example user message", "ai": "Example AI response" }
  ]
}
RULES:
- scenario: clear description in Hungarian
- Use "ai" (not "assistant") for the AI role
- starter_prompt: natural opening line
- sample_exchanges: 2-3 example exchanges
''',
        "writing": '''
"content": {
  "prompt": "Clear writing task description in Hungarian",
  "example": "Example of what good output looks like",
  "word_count_target": 50
}
RULES:
- prompt: specific, actionable writing task
- example: short example to guide the learner
''',
        "checklist": '''
"content": {
  "steps": [
    { "instruction": "Concrete step 1" },
    { "instruction": "Concrete step 2" },
    { "instruction": "Concrete step 3" },
    { "instruction": "Concrete step 4" },
    { "instruction": "Concrete step 5" }
  ],
  "proof_prompt": "Describe how you completed the task"
}
QUALITY RULES:
- steps: 5-9 concrete items
- Use "steps" (not "items"), "instruction" (not "text")
''',
        "upload_review": '''
"content": {
  "title": "Upload review title",
  "prompt": "What to upload",
  "rubric": ["Criterion 1", "Criterion 2", "Criterion 3", "Criterion 4"],
  "estimated_minutes": 5
}
QUALITY RULES:
- rubric MUST have 4-6 criteria
''',
        "briefing": '''
"content": {
  "situation": "2-3 sentences describing a concrete workplace scenario (e.g. job interview, client meeting, email follow-up)",
  "outcome": "1 sentence: what the learner will produce by end of session (e.g. 'You will write a follow-up email')",
  "key_vocabulary_preview": ["key_term_1", "key_term_2", "key_term_3"]
}
RULES:
- situation: concrete, specific workplace scenario. Min 20 chars. In Hungarian.
- outcome: measurable, actionable. In Hungarian.
- key_vocabulary_preview: 3-5 key terms in the TARGET language that will appear in later exercises
''',
        "feedback": '''
"content": {
  "user_text": "The user's original submitted text (echoed back)",
  "corrections": [
    { "original": "incorrect phrase from user", "corrected": "correct version", "explanation": "brief explanation why" }
  ],
  "improved_version": "Full improved version of the user's text",
  "alternative_tone": "Same content rewritten in a different register (formal if original was informal, or vice versa)",
  "score": 4,
  "praise": "What the learner did well (1-2 sentences)"
}
RULES:
- corrections: 2-6 specific fixes with explanations
- improved_version: complete rewrite incorporating all corrections, natural fluent text
- alternative_tone: optional but preferred, different register from original
- score: 1-5 integer
- praise: always include something positive
''',
        "smart_lesson": '''
"content": {
  "hook": "1 short question or everyday scenario that grabs attention (max 2 sentences, casual Gen-Z tone)",
  "micro_task_1": {
    "instruction": "A choice or mini calculation task (1-2 sentences)",
    "options": ["Option A", "Option B", "Option C"],
    "correct_index": 0,
    "explanation": "Why this is correct (1 sentence, casual)"
  },
  "micro_task_2": {
    "instruction": "A decision or rewrite task (1-2 sentences)",
    "options": ["Option A", "Option B", "Option C"],
    "correct_index": 1,
    "explanation": "Why this is the best choice (1 sentence, casual)"
  },
  "insight": "1 sentence takeaway — the key learning of the day"
}
QUALITY RULES:
- hook: Must be relatable, everyday scenario. NO academic intro. Max 2 sentences.
- micro_task_1 and micro_task_2: MUST have exactly 3 options each
- options: plausible, not placeholder (no "A", "B", "C"), concrete
- correct_index: 0-2 integer, vary between tasks
- explanation: casual, short, Gen-Z friendly
- insight: 1 punchy sentence, memorable takeaway
- TOTAL content must be completable in under 5 minutes
- NO essays, NO lectures, NO academic jargon
- Use everyday examples, numbers, real-life situations
- Tone: like texting a smart friend, not a textbook
- Language: Hungarian (hu)
- Example hook style: "Ha 100k jon be, mennyi a 20%? Nem kell matekzseni."
''',
    }

    # For language domain: resolve target_language robustly
    language_direction_note = ""
    scope_note = ""
    if is_language_domain:
        target_lang = _resolve_target_language(settings or {}, day_title, user_goal)
        if not target_lang:
            target_lang = "the target language (detect from day_title/user_goal context)"

        # Get script description for non-ambiguous prompt (e.g., "Korean (한국어, Hangul script: 가나다)")
        script_desc = _LANG_SCRIPT_DESC.get(target_lang.lower(), target_lang)
        is_nonlatin_target = _is_nonlatin_language(target_lang)

        # Build explicit script rule for non-Latin languages
        script_rule = ""
        if is_nonlatin_target:
            script_rule = f"""
🚨 CRITICAL SCRIPT RULE:
- The target language is {script_desc}.
- vocabulary_table.word MUST be written in the NATIVE SCRIPT of {target_lang} (NOT in English, NOT in Latin letters).
- example_sentence MUST be in the NATIVE SCRIPT of {target_lang}.
- lesson_flow letters.glyph MUST be actual {target_lang} script characters.
- If you need romanization, put it in "pronunciation" or "latin_hint" fields, NEVER in "word".
- FORBIDDEN: English words like "Hello", "Good morning" in vocabulary_table.word — use {target_lang} script instead.
- If you generate English words in target-language fields, the response will be REJECTED."""

        language_direction_note = f"""
🌍 LANGUAGE LEARNING DIRECTION:
- The user's NATIVE language is {"Hungarian" if is_hu else "English"} (used for UI, instructions, explanations).
- The TARGET language the user is LEARNING is: {script_desc}
- vocabulary_table: "word" = {target_lang} script (NATIVE SCRIPT, e.g. 한국어 not "Korean word"), "translation" = Hungarian
- example_sentence: in {target_lang} NATIVE SCRIPT, example_translation: in Hungarian
- dialogues: "text" = {target_lang} NATIVE SCRIPT, "translation" = Hungarian
- grammar_explanation: explain in Hungarian, examples in {target_lang} NATIVE SCRIPT
- Quiz questions: test {target_lang} knowledge
- Translation exercises: translate FROM Hungarian TO {target_lang}
{script_rule}"""

        # SCOPE ENFORCEMENT: If week_outline is available, extract day-level vocabulary constraints
        week_outline = (settings or {}).get("week_outline")
        if week_outline and isinstance(week_outline, dict):
            outline_days = week_outline.get("days", [])
            for od in outline_days:
                day_num = od.get("day", 0)
                if f"Nap {day_num}" in (day_title or "") or f"Day {day_num}" in (day_title or ""):
                    vocab = od.get("key_vocab", [])
                    grammar = od.get("grammar_focus", "")
                    if vocab:
                        scope_note = f"""
🔒 SCOPE ENFORCEMENT (MANDATORY):
- This day's ALLOWED vocabulary: {', '.join(vocab)}
- This day's grammar focus: {grammar}
- You MUST ONLY use words from the allowed vocabulary list above.
- Do NOT introduce new vocabulary or phrases that are not in this list.
- All examples, exercises, dialogues, quiz questions MUST stay within this vocabulary scope.
"""
                    break

    system = f"""You are generating ONE Focus Item for a learning app.

STRICT OUTPUT RULES:
- Output MUST be valid JSON only. No markdown, no commentary, no extra text.
- Output MUST match the schema described below.
- kind is FIXED as: {kind}
- For kind=content: validation.require_interaction=false and input.type="none". For other kinds: validation.require_interaction=true.
- instructions_md must be short and actionable (2-3 sentences max).
- rubric_md must tell how the user knows they did it right.
- content must contain all fields required by the {kind} kind.
- {"Instructions and explanations in Hungarian. See LANGUAGE LEARNING DIRECTION below for vocabulary/content direction." if is_language_domain else f"All text content in {'Hungarian' if is_hu else 'English'}."}
{language_direction_note}
{scope_note}
🎨 STYLE GUIDANCE (apply to ALL generated content):
- TONE: {tone_guide}
- DIFFICULTY: {difficulty_guide}
- DEPTH: {depth_guide}

🚨 HARD RULE - FORBIDDEN TASK TYPES:
Do NOT generate tasks that require speaking aloud, listening, or pronunciation practice.
These CANNOT be verified via text input. NEVER use these phrases:
- "hangosan", "mondd ki", "ismételd el", "mondd utánam", "hallgasd meg"
- "speak aloud", "say out loud", "repeat after", "listen and repeat"
Instead: require WRITTEN responses only (typing, not speaking).

SCHEMA:
{schema_def}

CONTENT SPEC FOR kind={kind}:
{content_specs.get(kind, "{}")}

LANGUAGE: {"Hungarian (hu) — native. Target language from user_goal." if is_language_domain else ("Hungarian (hu)" if is_hu else "English (en)")}
"""

    user = f"""Generate ONE focus item.

CONTEXT:
- language: {lang}
- domain: {domain}
- level: {level}
- day_title: {day_title}
- item_topic: {item_topic}
- duration_minutes_target: {minutes}
- user_goal: {user_goal or "learning"}

KIND: {kind} (DO NOT CHANGE)
"""

    # Content chaining: inject preceding lesson content for quizzes
    if preceding_lesson_content and kind != "content":
        # Resolve actual target language name for use in chaining prompts
        _target_lang_raw = (settings or {}).get("target_language", "")
        _LANG_NAMES_HU = {"english": "angol", "german": "német", "spanish": "spanyol", "italian": "olasz",
                          "french": "francia", "greek": "görög", "portuguese": "portugál", "korean": "koreai", "japanese": "japán"}
        _chain_lang = _LANG_NAMES_HU.get((_target_lang_raw or "").lower(), _target_lang_raw) if _target_lang_raw else "a célnyelv"

        # Apply content chaining for all practice/quiz items in language domain
        user += f"""
IMPORTANT - CONTENT CHAINING:
The user just completed a lesson. You MUST build this item using ONLY the vocabulary,
grammar rules, and examples from THAT lesson. Do NOT introduce new material.
ONLY use the vocabulary list below (VOCABULARY section) when creating questions/tasks.
CRITICAL: The VOCABULARY section contains {_chain_lang} words (left side) = Hungarian translations (right side).
Quiz/practice must test the {_chain_lang} words (left side), not Hungarian.

--- PRECEDING LESSON CONTENT ---
{preceding_lesson_content[:3000]}
--- END LESSON CONTENT ---
"""
        if kind == "quiz":
            user += f"""
Generate quiz questions that test {_chain_lang} knowledge:
1. Vocabulary: "Hogyan mondod {_chain_lang}ul ezt: '[magyar szó]'?" or "Mit jelent a '[{_chain_lang} szó]'?"
2. Grammar: test correct {_chain_lang} forms and patterns
3. Dialogue: comprehension of {_chain_lang} sentences
4. Common mistakes: identify errors in {_chain_lang} usage
Options should include {_chain_lang} words/phrases, not only Hungarian.
Include at least: 2 vocab questions, 1 grammar question, 1 dialogue/mistake question.
"""
        elif kind == "translation":
            user += f"""
Generate translation items: translate FROM Hungarian TO {_chain_lang}.
"source" = Hungarian sentence, "target_lang" = the target language code.
ONLY use vocabulary from the lesson. Keep sentences short.
"""
        elif kind == "roleplay":
            user += f"""
Create a dialogue scenario IN {_chain_lang}.
The user practices speaking {_chain_lang}, not Hungarian.
Reuse lesson vocabulary and grammar structures.
"""
        elif kind == "writing":
            user += f"""
Create a short writing prompt where the user writes IN {_chain_lang}.
Require using the lesson's key vocabulary and grammar rule.
"""
        elif kind == "cards":
            user += f"""
Create flashcards from the lesson vocabulary: front = {_chain_lang} word, back = Hungarian translation.
"""

    user += "\nOutput ONLY the JSON object, nothing else.\n"

    # Track-specific prompt overrides
    track = (settings or {}).get("track", "")
    target_lang_setting = (settings or {}).get("target_language", "")
    if track == "career_language" and is_language_domain:
        system, user = _apply_career_prompt_overrides(kind, system, user, settings)
    elif is_language_domain and _is_nonlatin_language(target_lang_setting):
        system, user = _apply_nonlatin_prompt_overrides(kind, system, user, settings, item_topic)
    elif kind == "smart_lesson" and domain == "smart_learning":
        system, user = _apply_smart_learning_prompt_overrides(kind, system, user, settings)

    return system, user


def _apply_career_prompt_overrides(
    kind: str,
    system: str,
    user: str,
    settings: Optional[Dict[str, Any]] = None,
) -> tuple[str, str]:
    """
    Override prompts for career_language track items.
    Career mode focuses on workplace communication: emails, meetings, interviews, etc.
    """
    target_lang = (settings or {}).get("target_language", "English")

    career_context = f"""
🏢 CAREER LANGUAGE MODE:
This is a CAREER language learning track. The learner practices workplace communication in {target_lang}.
Focus on professional scenarios: job interviews, client meetings, email writing, presentations, negotiations.
All content should feel like real workplace situations, NOT classroom exercises.
"""

    if kind == "briefing":
        system += career_context
        user += f"""
CAREER BRIEFING: Create a specific workplace scenario briefing.
- situation: A concrete professional scenario (e.g., "Ma egy fontos ügyféltalálkozóra készülsz...")
- outcome: What they'll produce (e.g., "A nap végére képes leszel megírni egy follow-up emailt")
- key_vocabulary_preview: 3-5 key {target_lang} workplace terms relevant to today's scenario
Keep it motivating and practical. Instructions in Hungarian, vocabulary preview in {target_lang}.
"""

    elif kind == "cards":
        # Phrase pack: not traditional flashcards, but a "cheat sheet" of expressions
        system += career_context
        user += f"""
CAREER PHRASE PACK (not flashcards!):
Generate 8-12 workplace expressions as cards.
- front: {target_lang} expression/phrase (e.g., "I'd like to follow up on...")
- back: Hungarian translation + usage note (formal/informal, when to use)
Include a mix of:
- Polite openers/closers
- Key action phrases
- Do/Don't pairs (common mistakes with correct alternatives)
Focus on the day's workplace scenario. These are "cheat sheet" entries, not vocabulary drill.
"""

    elif kind == "quiz":
        # Micro drill: career-specific quick tasks
        system += career_context
        user += f"""
CAREER MICRO DRILL:
Generate 6 quick workplace communication tasks as quiz questions.
Mix these types:
- Sentence completion (fill in the blank in a {target_lang} email/message)
- Rewrite formal↔informal (given a sentence, pick the correct register)
- Tone selection (which response is appropriate for this situation?)
- Error spotting (which version is professionally correct?)
All options should be in {target_lang}. Questions/instructions in Hungarian.
Focus on practical workplace communication, not grammar theory.
"""

    elif kind == "writing":
        # Production task: write real workplace text
        system += career_context
        user += f"""
CAREER PRODUCTION TASK:
Create a specific workplace writing task.
The user should write ONE of these (pick the most relevant for the day's topic):
- A 5-sentence professional email
- A 4-line Slack/Teams message
- A 30-second pitch/introduction
- A response to a client complaint
- A meeting follow-up summary

The prompt should specify:
- The exact situation and recipient
- The tone expected (formal/casual professional)
- Key points to include
- Approximate length (in sentences, not words)

Instructions in Hungarian, the user writes in {target_lang}.
word_count_target should be 50-80.
"""

    elif kind == "feedback":
        system += career_context
        user += f"""
CAREER FEEDBACK:
Analyze the user's writing submission (provided in PRECEDING CONTENT).
Generate:
- corrections: 2-6 specific fixes (original → corrected + why)
- improved_version: full rewrite that sounds native and professional
- alternative_tone: same content in a different register (if original is formal → casual professional, or vice versa)
- score: 1-5 based on clarity, grammar, professionalism
- praise: what they did well

Be encouraging but specific. Focus on workplace-appropriate language.
Corrections should prioritize: register/tone errors > grammar > vocabulary > style.
"""

    return system, user


def _apply_smart_learning_prompt_overrides(
    kind: str,
    system: str,
    user: str,
    settings: Optional[Dict[str, Any]] = None,
) -> tuple[str, str]:
    """
    Override prompts for smart_learning track categories.
    Currently supports: financial_basics.
    """
    track = (settings or {}).get("track", "")

    if track == "financial_basics" and kind == "smart_lesson":
        system += """
💰 PÉNZÜGYI MIKRO-LECKE MÓD (financial_basics):
Te egy pénzügyi mikro-mentor vagy Gen-Z stílusban.
Minden lecke KONKRÉT, CSELEKVÉSRE FORDÍTHATÓ pénzügyi tudást ad.
NEM elég azt mondani "fektess be" — meg kell mondanod HOVA és HOGYAN.
NEM elég azt mondani "spórolj" — meg kell mondanod MENNYIT és MILYEN MÓDSZERREL.
"""
        user += """
FINANCIAL_BASICS MINŐSÉGI KÖVETELMÉNYEK:

ARANYSZABÁLY: Minden válasznak meg kell felelnie az "ÉS AKKOR MIT CSINÁLJAK?" tesztnek.
Ha valaki elolvassa és nem tudja azonnal megcsinálni, az ROSSZ tartalom.

1. hook: Konkrét, hétköznapi pénzügyi helyzet SZÁMMAL (max 2 mondat).
   JÓ: "Kaptál 200k-t. MÁP+-ba (6.5%) vagy bankba (2%)?"
   ROSSZ: "Gondolkodtál már azon, mit kezdj a pénzeddel?"

2. micro_task_1: Gyors számolás KONKRÉT eszközökkel/termékekkel.
   - instruction: Nevezd meg a KONKRÉT pénzügyi eszközt (MÁP+, PEMÁP, DKJ, babakötvény, lakástakarék, stb.)
   - options: 3 konkrét, SZÁMOS válasz — mindegyik tartalmaz forintösszeget VAGY százalékot
   - explanation: Számítási lépések (pl. "200 000 × 0.065 = 13 000 Ft/év kamat a MÁP+-ban")
   ROSSZ option példa: "Fektess be" / "Rakd bankba" / "Költsd el" (← TOO VAGUE!)
   JÓ option példa: "MÁP+ 6.5%: 213 000 Ft 1 év múlva" / "Bank 2%: 204 000 Ft" / "Párna alatt: 200 000 Ft"

3. micro_task_2: Döntési szcenárió KONKRÉT feltételekkel ÉS megnevezett termékkel/módszerrel.
   - instruction: Valós döntés, ami megnevezi a lehetőségeket (nem "mit csinálnál", hanem "melyiket választod")
   - options: 3 konkrét stratégia — mindegyik tartalmaz: eszköz neve + szám + eredmény
   - explanation: Miért jobb, SZÁMOKKAL
   ROSSZ: "Költsd el / Tedd félre / Fektessd be" (← EZ NEM TANÁCS, EZ SEMMI!)
   JÓ: "DKJ 3 hónapos 5.2%: 26k kamat" / "MÁP+ 6.5%: 32.5k kamat" / "Bankszámla 2%: 10k kamat"

4. insight: 1 mondatos, megjegyezhető szabály SZÁMMAL + KONKRÉT cselekvéssel.
   JÓ: "Az első 500k-t MÁP+-ba tedd — 6.5% garantált, nem kell hozzá semmi tudás."
   JÓ: "Ha <3 hónapra kell, DKJ. Ha >1 évre, MÁP+. Ha holnap kell: bankszámla."
   ROSSZ: "Mindig gondold át a döntéseidet." (← TILOS!)
   ROSSZ: "Érdemes befektetni." (← HOVA?? Ez nem tanács!)

TILTÓLISTÁS minták (ELUTASÍTVA ha megjelenik konkrét eszköz/termék neve nélkül):
- "fektess be" / "fektessd be" → hova? MÁP+? DKJ? ETF? mondd meg!
- "tedd félre" / "spórolj" → hova? megtakarítási számla? állampapír?
- "a legjobb módszer" → melyik konkrétan?
- "érdemes odafigyelni" → mire? mutasd meg!
- "mindig gondold át" → felesleges bölcsesség, számot adj!

KÖTELEZŐ: Minden option tartalmazzon LEGALÁBB 1 számot ÉS 1 megnevezett pénzügyi eszközt/módszert.
MAGYAR KONTEXTUS: Használj magyar eszközöket (MÁP+, PEMÁP, DKJ, babakötvény, lakástakarék, K&H/OTP/Revolut számlák, TBSZ).
"""

    return system, user


# ── Generic smart lesson detection ──

# Keywords that signal generic/useless financial advice when no number accompanies them
_GENERIC_FINANCIAL_KEYWORDS = [
    "mindig spórolj",
    "mindig gondold át",
    "legjobb módszer",
    "érdemes odafigyelni",
    "fontos, hogy",
    "próbálj meg",
]

# Vague action verbs that need a concrete product/instrument name nearby
_VAGUE_VERBS = ["fektess be", "fektessd be", "tedd félre", "rakd félre", "spórolj"]
# Known Hungarian financial instruments — at least one must appear in options
_KNOWN_INSTRUMENTS = [
    "máp", "máp+", "pemáp", "dkj", "tbsz", "etf", "állampapír",
    "babakötvény", "lakástakarék", "megtakarítási számla",
    "otp", "k&h", "revolut", "wise", "erste",
    "részvény", "kötvény", "befektetési alap", "index alap",
    "bankbetét", "lekötés", "folyószámla",
]

def _is_generic_smart_lesson(content: Dict[str, Any]) -> tuple[bool, str]:
    """
    Check if smart_lesson content is a placeholder / completely empty.
    Relaxed for FocusRoom MVP: only rejects empty or placeholder content.
    Number/amount requirements removed — Haiku omits them for non-financial topics.
    """
    hook = content.get("hook", "")
    if not hook or len(hook.strip()) < 10:
        return True, "hook is empty or too short"

    for task_key in ("micro_task_1", "micro_task_2"):
        task = content.get(task_key, {})
        if not isinstance(task, dict):
            return True, f"{task_key} must be an object"
        options = task.get("options", [])
        # Reject placeholder options like ["A", "B", "C"] (len <= 3 chars each)
        real_opts = [o for o in options if isinstance(o, str) and len(o.strip()) > 3]
        if len(real_opts) < 2:
            return True, f"{task_key}.options must have at least 2 real options (not placeholders)"

    return False, ""


# ── Non-Latin script detection ──
_NON_LATIN_LANGUAGES = {
    "greek", "korean", "japanese", "chinese", "mandarin",
    "arabic", "hebrew", "hindi", "thai", "russian",
    "ukrainian", "georgian", "armenian", "bengali", "tamil",
}

def _is_nonlatin_language(lang: str) -> bool:
    return (lang or "").lower() in _NON_LATIN_LANGUAGES


# ── Target language resolver ──
# Maps Hungarian language names (from plan titles like "Koreai - Alapozó") to English names
_HU_LANG_NAME_MAP = {
    "koreai": "korean", "japán": "japanese", "görög": "greek", "kínai": "chinese",
    "arab": "arabic", "héber": "hebrew", "hindi": "hindi", "thai": "thai",
    "orosz": "russian", "ukrán": "ukrainian", "grúz": "georgian", "örmény": "armenian",
    "bengáli": "bengali", "tamil": "tamil", "mandarin": "mandarin",
    "angol": "english", "német": "german", "francia": "french", "olasz": "italian",
    "spanyol": "spanish", "portugál": "portuguese", "holland": "dutch", "svéd": "swedish",
    "finn": "finnish", "lengyel": "polish", "cseh": "czech", "román": "romanian",
    "török": "turkish", "norvég": "norwegian", "dán": "danish",
}

# Script/writing system descriptions for prompt clarity
_LANG_SCRIPT_DESC = {
    "korean": "Korean (한국어, Hangul script: 가나다)",
    "japanese": "Japanese (日本語, Hiragana/Katakana/Kanji: あいう)",
    "chinese": "Chinese (中文, Hanzi: 你好)",
    "mandarin": "Mandarin Chinese (中文, Hanzi: 你好)",
    "greek": "Greek (Ελληνικά, Greek alphabet: αβγ)",
    "arabic": "Arabic (العربية, Arabic script: أبت)",
    "hebrew": "Hebrew (עברית, Hebrew script: אבג)",
    "hindi": "Hindi (हिन्दी, Devanagari script: अआइ)",
    "thai": "Thai (ภาษาไทย, Thai script: กขค)",
    "russian": "Russian (Русский, Cyrillic: абв)",
    "ukrainian": "Ukrainian (Українська, Cyrillic: абв)",
    "georgian": "Georgian (ქართული, Georgian script: ა ბ გ)",
    "armenian": "Armenian (Հայերեն, Armenian script: Ա Բ Գ)",
    "bengali": "Bengali (বাংলা, Bengali script: অআই)",
    "tamil": "Tamil (தமிழ், Tamil script: அஆஇ)",
}


def _resolve_target_language(settings: dict, day_title: str = "", user_goal: str = "") -> str:
    """
    Resolve the target language from settings, falling back to plan title inference.
    Returns the English language name (e.g., "korean", "japanese").
    """
    # 1. Explicit setting (best)
    target = (settings.get("target_language") or "").strip().lower()
    if target:
        return target

    # 2. Infer from day_title prefix (e.g., "Koreai - Alapozó - Nap 1: ...")
    for source in [day_title, user_goal]:
        if not source:
            continue
        prefix = source.split(" - ")[0].strip().lower() if " - " in source else ""
        if prefix and prefix in _HU_LANG_NAME_MAP:
            resolved = _HU_LANG_NAME_MAP[prefix]
            print(f"[target-lang] Inferred '{resolved}' from title prefix '{prefix}'")
            return resolved

    return ""


def _apply_nonlatin_prompt_overrides(
    kind: str,
    system: str,
    user: str,
    settings: Optional[Dict[str, Any]] = None,
    item_topic: str = "",
) -> tuple[str, str]:
    """
    Override prompts for non-Latin script foundations blocks.
    Hook→Pattern→Meaning blocks get a flow-based lesson_flow[] instead of vocabulary_table.
    """
    target_lang = _resolve_target_language(settings or {}, item_topic)
    if not target_lang:
        target_lang = "the target language"
    # Use script description for clearer prompts (e.g., "Korean (한국어, Hangul script: 가나다)")
    script_desc = _LANG_SCRIPT_DESC.get(target_lang.lower(), target_lang)
    topic_lower = (item_topic or "").lower()

    # Detect block type from item_topic (set by _generate_default_items_for_domain)
    is_hook = "hook:" in topic_lower
    is_pattern = "pattern:" in topic_lower
    is_meaning = "meaning:" in topic_lower

    if kind == "content" and (is_hook or is_pattern or is_meaning):
        # REPLACE the standard language_lesson content spec — remove it from system prompt
        # so the LLM doesn't see two competing schemas (language_lesson vs language_nonlatin_beginner)
        if '"content_type": "language_lesson"' in system:
            import re
            system = re.sub(
                r'CONTENT SPEC FOR kind=content:.*?(?=\nLANGUAGE:)',
                'CONTENT SPEC FOR kind=content:\nSee NON-LATIN BEGINNER MODE below.\n',
                system,
                flags=re.DOTALL,
            )
            if '"content_type": "language_lesson"' in system:
                print("[WARN] nonlatin override: language_lesson spec NOT removed from system prompt!")
            else:
                print("[nonlatin] Replaced language_lesson content spec successfully")

        nonlatin_context = f"""
🔤 NON-LATIN BEGINNER MODE (OVERRIDES ALL PREVIOUS CONTENT SPECS):
This learner is starting {script_desc} with a NON-LATIN script.
DO NOT use vocabulary_table, grammar_explanation, dialogues, or content_type "language_lesson".
MUST return content_type: "language_nonlatin_beginner" with a lesson_flow array.
Keep it SHORT, VISUAL, and IMMEDIATE — max 3 new characters per block.
Instructions in Hungarian, target content in {target_lang} NATIVE SCRIPT (not English, not Latin).
All "glyph" fields MUST contain actual {target_lang} script characters.
If you return vocabulary_table, content_type "language_lesson", or English words, the response will be REJECTED.
"""
        system += nonlatin_context

        if is_hook:
            user += f"""
HOOK BLOCK — First contact with new letters/characters:
Return this EXACT JSON structure (no vocabulary_table, no grammar_explanation):
{{
  "title": "descriptive title",
  "content_type": "language_nonlatin_beginner",
  "lesson_flow": [
    {{
      "type": "hook",
      "title_hu": "Ismerd meg!",
      "body_md": "Short Hungarian intro (1-2 sentences max) about these letters",
      "letters": [
        {{"glyph": "THE_LETTER", "latin_hint": "latin equivalent", "sound_hint_hu": "mint a magyar hang a ... szóban"}}
      ]
    }}
  ],
  "key_points": ["1-2 takeaways"],
  "estimated_minutes": 4
}}
RULES:
- lesson_flow: exactly 1 item of type "hook"
- letters: exactly 3 new {target_lang} letters/characters
- glyph: the actual {target_lang} character (uppercase and lowercase if applicable)
- latin_hint: closest Latin letter equivalent
- sound_hint_hu: Hungarian sound comparison (e.g. "mint az 'a' az 'alma' szóban")
- body_md: max 2 sentences, Hungarian, welcoming tone
- NO vocabulary_table, NO grammar_explanation, NO dialogues
"""

        elif is_pattern:
            user += f"""
PATTERN BLOCK — Sound-to-symbol mapping practice:
Return this EXACT JSON structure:
{{
  "title": "descriptive title",
  "content_type": "language_nonlatin_beginner",
  "lesson_flow": [
    {{
      "type": "pattern",
      "title_hu": "Hang és betű",
      "body_md": "Short Hungarian instruction about matching sounds to letters",
      "letters": [
        {{"glyph": "THE_LETTER", "latin_hint": "equivalent", "sound_hint_hu": "Hungarian sound hint"}}
      ],
      "items": [
        {{"prompt": "Which letter makes the sound [x]?", "answer": "THE_LETTER"}}
      ]
    }}
  ],
  "key_points": ["1-2 takeaways"],
  "estimated_minutes": 4
}}
RULES:
- lesson_flow: exactly 1 item of type "pattern"
- letters: 3-5 {target_lang} letters (reuse today's hook letters + 1-2 from earlier)
- items: 3-5 matching exercises (prompt in Hungarian, answer = the {target_lang} character)
- NO vocabulary_table, NO grammar_explanation
"""

        elif is_meaning:
            user += f"""
MEANING BLOCK — First words with meaning:
Return this EXACT JSON structure:
{{
  "title": "descriptive title",
  "content_type": "language_nonlatin_beginner",
  "lesson_flow": [
    {{
      "type": "meaning",
      "title_hu": "Első szavak",
      "body_md": "Short Hungarian intro connecting letters to real words",
      "letters": [
        {{"glyph": "WORD_IN_TARGET", "latin_hint": "transliteration", "sound_hint_hu": "meaning in Hungarian"}}
      ]
    }}
  ],
  "key_points": ["1-2 takeaways"],
  "estimated_minutes": 4
}}
RULES:
- lesson_flow: exactly 1 item of type "meaning"
- letters: 2-4 simple {target_lang} words using characters learned today
- glyph: the {target_lang} word, latin_hint: transliteration, sound_hint_hu: Hungarian meaning
- body_md: connect letters to real words, encouraging tone, Hungarian
- NO vocabulary_table, NO grammar_explanation
"""

    elif kind == "quiz" and "micro:" in topic_lower:
        # Micro quiz: simple character/sound recognition
        user += f"""
NON-LATIN MICRO QUIZ:
Generate 3-4 very simple character recognition questions.
Types to mix:
- "Melyik betű ez?" (show {target_lang} character, pick the sound)
- "Melyik {target_lang} betű hangzik úgy, mint...?" (pick the character)
- "Olvasd el:" (simple 2-3 letter combination, pick the correct reading)
Keep questions EASY — this is the learner's first day with these characters.
All options should show {target_lang} characters or sounds. Instructions in Hungarian.
"""

    return system, user


async def generate_focus_item(
    *,
    item_type: str,
    practice_type: Optional[str],
    topic: str,
    label: str,
    day_title: str,
    domain: str,
    level: str,
    lang: str,
    minutes: int = 5,
    user_goal: str = "",
    retry_count: int = 0,
    settings: Optional[Dict[str, Any]] = None,
    preceding_lesson_content: Optional[str] = None,
    max_retries: int = 2,
) -> Dict[str, Any]:
    """
    Generate a single focus item with the canonical schema.
    Kind is determined by backend, not LLM.

    Settings affect content style:
    - tone: casual/neutral/strict
    - difficulty: easy/normal/hard
    - pacing: small_steps/big_blocks
    - content_depth: short/medium/substantial

    DOMAIN SAFETY: Blocks language-specific types (translation, roleplay, flashcard)
    in non-language domains and converts them to safe alternatives.
    """
    # Defensive type coercion — DB rows sometimes return unexpected types
    domain = str(domain) if not isinstance(domain, str) else (domain or "other")
    lang = str(lang) if not isinstance(lang, str) else (lang or "hu")
    level = str(level) if not isinstance(level, str) else (level or "beginner")
    item_type = str(item_type) if not isinstance(item_type, str) else (item_type or "lesson")
    if practice_type is not None and not isinstance(practice_type, str):
        practice_type = str(practice_type)

    # DOMAIN GUARD: Block language-only types in non-language domains
    domain_lower = domain.lower()
    is_language_domain = domain_lower in ("language_learning", "language")

    LANGUAGE_ONLY_TYPES = {"translation", "flashcard", "cards"}
    LANGUAGE_ONLY_PRACTICE_TYPES = {"translation", "exercise", "roleplay", "dialogue", "speaking"}

    item_type_lower = (item_type or "").lower()
    practice_type_lower = (practice_type or "").lower() if practice_type else ""

    if not is_language_domain:
        # Convert language-only item types to safe alternatives
        if item_type_lower in LANGUAGE_ONLY_TYPES:
            print(f"[DOMAIN_GUARD] Blocking {item_type_lower} in domain '{domain}' → converting to quiz")
            item_type = "quiz"
            practice_type = None

        # Convert language-only practice types to safe alternatives
        if practice_type_lower in LANGUAGE_ONLY_PRACTICE_TYPES:
            print(f"[DOMAIN_GUARD] Blocking practice_type '{practice_type_lower}' in domain '{domain}' → converting to checklist")
            practice_type = None

    # Deterministic kind selection (after domain normalization)
    kind = _determine_item_kind(item_type, practice_type)
    allowed_kinds = {"content", "quiz", "checklist", "upload_review", "cards", "translation", "roleplay", "writing", "briefing", "feedback", "smart_lesson"}
    if kind not in allowed_kinds:
        kind = "content" if item_type_lower == "lesson" else "checklist"

    system, user = _build_item_generation_prompt(
        kind=kind,
        lang=lang,
        domain=domain,
        level=level,
        day_title=day_title,
        item_topic=topic,
        minutes=minutes,
        user_goal=user_goal,
        settings=settings,
        preceding_lesson_content=preceding_lesson_content,
    )
    if retry_count > 0:
        user = user.rstrip() + "\n\nRETRY: Be specific, avoid generic filler, and follow the schema exactly.\n"

    # Model + token selection based on kind and domain
    def _is_llm_error(text: str) -> bool:
        if not text:
            return True
        lower = text.strip().lower()
        if text.startswith("Error:"):
            return True
        if "overloaded" in lower:
            return True
        if "not available" in lower:
            return True
        if "invalid model" in lower:
            return True
        return False

    is_language_lesson = kind == "content" and (domain or "other").lower() in ("language_learning", "language")

    if kind == "content":
        # All lessons use Haiku — Sonnet is too slow for synchronous proxy architecture
        # Language lessons need 3500 tokens to fit vocab + grammar + dialogues + practice_exercises
        text = await _claude_json_haiku(
            system=system,
            user=user,
            max_tokens=3500 if is_language_lesson else 2500,
            temperature=0.3,
        )
    elif kind == "smart_lesson":
        text = await _claude_json_haiku(
            system=system,
            user=user,
            max_tokens=1500,
            temperature=0.5,
        )
    elif kind == "briefing":
        text = await _claude_json_haiku(
            system=system,
            user=user,
            max_tokens=1500,
            temperature=0.3,
        )
    elif kind == "feedback":
        text = await _claude_json_haiku(
            system=system,
            user=user,
            max_tokens=2000,
            temperature=0.3,
        )
    else:
        # All other kinds: Haiku with current budget
        text = await _claude_json_haiku(
            system=system,
            user=user,
            max_tokens=1500,
            temperature=0.3,
        )

    # Check for API errors
    if _is_llm_error(text):
        print(f"[FOCUS_ITEM] LLM ERROR for {kind}/{domain}: {text[:200]}")
        raise RuntimeError("Claude API temporarily unavailable")

    print(f"[FOCUS_ITEM] LLM response for {kind}/{domain} ({len(text)} chars, model={CLAUDE_MODEL_HAIKU})")

    # Parse JSON
    s = _strip_json_fences(text)
    data = _extract_json_object(s)

    if not data:
        if retry_count < max_retries:
            print(f"[FOCUS_ITEM] JSON parse failed (retry {retry_count}), response: {text[:300]}")
            return await generate_focus_item(
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
                retry_count=retry_count + 1,
                settings=settings,
                preceding_lesson_content=preceding_lesson_content,
                max_retries=max_retries,
            )
        # Return fallback item
        fallback = _create_fallback_item(kind, topic, label, lang, minutes, domain=domain)
        if preceding_lesson_content and kind != "content":
            fallback["chain_version"] = "lesson_v2"
        return fallback

    # Force correct kind (LLM might have changed it)
    data["kind"] = kind
    data.setdefault("validation", {})
    if kind in ("content", "briefing", "feedback"):
        data["validation"]["require_interaction"] = False
        data["input"] = {"type": "none", "placeholder": None}
    else:
        data["validation"]["require_interaction"] = True
        if preceding_lesson_content:
            # Mark chained practice items so cache can distinguish legacy content
            data["chain_version"] = "lesson_v2"

    # Validate
    is_valid, error = _validate_focus_item(data)
    if not is_valid:
        print(f"[FOCUS_ITEM] Validation failed (retry {retry_count}, max={max_retries}): {error} | kind={kind} domain={domain}")
        if retry_count < max_retries:
            # Retry with fix instruction
            return await generate_focus_item(
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
                retry_count=retry_count + 1,
                settings=settings,
                preceding_lesson_content=preceding_lesson_content,
                max_retries=max_retries,
            )
        # Return fallback after all retries exhausted
        print(f"[FOCUS_ITEM] FALLBACK for {kind}/{domain}/{topic[:50]} after {retry_count+1} attempts")
        fallback = _create_fallback_item(kind, topic, label, lang, minutes, domain=domain)
        if preceding_lesson_content and kind != "content":
            fallback["chain_version"] = "lesson_v2"
        return fallback

    # Non-Latin script validation: detect if vocabulary/content is in wrong script (ASCII instead of native)
    _resolved_target = _resolve_target_language(settings or {}, day_title, user_goal)
    if _resolved_target and _is_nonlatin_language(_resolved_target) and kind == "content" and retry_count < min(1, max_retries):
        content_data = data.get("content", {})
        # Check vocabulary_table words
        vocab = content_data.get("vocabulary_table", [])
        if vocab and isinstance(vocab, list) and len(vocab) > 0:
            ascii_count = sum(1 for v in vocab if v.get("word", "").isascii())
            if ascii_count > len(vocab) * 0.5:
                print(f"[FOCUS_ITEM] SCRIPT MISMATCH: {ascii_count}/{len(vocab)} vocab words are ASCII for non-Latin target '{_resolved_target}' — retrying")
                return await generate_focus_item(
                    item_type=item_type, practice_type=practice_type,
                    topic=topic, label=label, day_title=day_title,
                    domain=domain, level=level, lang=lang,
                    minutes=minutes, user_goal=user_goal,
                    retry_count=retry_count + 1, settings=settings,
                    preceding_lesson_content=preceding_lesson_content,
                    max_retries=max_retries,
                )
        # Check lesson_flow glyphs
        flow = content_data.get("lesson_flow", [])
        if flow and isinstance(flow, list):
            for fi in flow:
                letters = fi.get("letters", [])
                if letters and isinstance(letters, list) and len(letters) > 0:
                    ascii_glyphs = sum(1 for l in letters if l.get("glyph", "").isascii())
                    if ascii_glyphs > len(letters) * 0.5:
                        print(f"[FOCUS_ITEM] SCRIPT MISMATCH: {ascii_glyphs}/{len(letters)} glyphs are ASCII for non-Latin '{_resolved_target}' — retrying")
                        return await generate_focus_item(
                            item_type=item_type, practice_type=practice_type,
                            topic=topic, label=label, day_title=day_title,
                            domain=domain, level=level, lang=lang,
                            minutes=minutes, user_goal=user_goal,
                            retry_count=retry_count + 1, settings=settings,
                            preceding_lesson_content=preceding_lesson_content,
                            max_retries=max_retries,
                        )

    return data


def _create_fallback_item(kind: str, topic: str, label: str, lang: str, minutes: int, domain: str = "other") -> Dict[str, Any]:
    """
    Create a hardcoded fallback item when LLM generation fails.
    """
    is_hu = (lang or "hu").lower().startswith("hu")
    rules = KIND_VALIDATION_RULES.get(kind, {})
    domain_lower = (domain or "other").lower()
    is_language_domain = domain_lower in ("language_learning", "language")

    base = {
        "schema_version": "1.0",
        "kind": kind,
        "idempotency_key": f"fallback-{kind}-{hash(topic) % 10000}",
        "title": label,
        "subtitle": topic,
        "estimated_minutes": minutes,
        "difficulty": "normal",
        "instructions_md": ("Végezd el a feladatot az alábbi útmutató szerint." if is_hu else "Complete the task following the guide below."),
        "rubric_md": ("Ellenőrizd, hogy minden lépést elvégeztél." if is_hu else "Check that you completed all steps."),
        "ui": {
            "primary_cta": "Kész" if is_hu else "Done",
            "secondary_cta": None
        },
        "input": {
            "type": rules.get("input_type", "text"),
            "placeholder": "Írd ide..." if is_hu else "Type here..."
        },
        "validation": {
            "require_interaction": True,
            "min_chars": rules.get("min_chars", 20),
            "min_items": rules.get("min_items", 1)
        },
        "scoring": {
            "mode": "manual",
            "max_points": 10
        }
    }

    if kind == "smart_lesson":
        # Fallback smart_lesson: real structured content passable to _build_lesson_md
        base["content"] = {
            "hook": (
                f"Ma a(z) **{topic}** témát vesszük át — egy gyors, lényegre törő leckében."
                if is_hu
                else f"Today we cover **{topic}** — fast, practical, and straight to the point."
            ),
            "micro_task_1": {
                "instruction": (
                    f"Melyik állítás írja le legjobban a(z) {topic} lényegét?" if is_hu
                    else f"Which statement best describes {topic}?"
                ),
                "options": [
                    (f"A(z) {topic} segít konkrét célt és lépéseket meghatározni." if is_hu else f"{topic} helps define clear goals and steps."),
                    ("Csak általános inspiráció, konkrét lépések nélkül." if is_hu else "Just general inspiration without concrete steps."),
                    ("Elméleti tudás, amit nem lehet a gyakorlatban alkalmazni." if is_hu else "Pure theory with no practical application."),
                ],
                "correct_index": 0,
                "explanation": (
                    "A helyes válasz: konkrét cél + lépések = eredmény." if is_hu
                    else "Correct: clear goal + steps = results."
                ),
            },
            "micro_task_2": {
                "instruction": (
                    f"Mikor érdemes a(z) {topic} elvét alkalmazni?" if is_hu
                    else f"When is it worth applying {topic}?"
                ),
                "options": [
                    ("Ha konkrét, mérhető eredményt szeretnél elérni." if is_hu else "When you want a concrete, measurable outcome."),
                    ("Ha nincs szükséged semmiféle visszajelzésre." if is_hu else "When you need no feedback at all."),
                    ("Ha véletlenszerű döntést szeretnél hozni." if is_hu else "When you want to make a random decision."),
                ],
                "correct_index": 0,
                "explanation": (
                    "Mérhető cél és lépések — ez a kulcs." if is_hu
                    else "Measurable goal and steps — that is the key."
                ),
            },
            "insight": (
                f"A(z) {topic} nem rakétatudomány: célt tűzöl ki, lépéseket teszel, és méred az eredményt."
                if is_hu
                else f"{topic} is straightforward: set a goal, take steps, measure the result."
            ),
        }
        base["validation"]["require_interaction"] = True
        base["input"]["type"] = "choice"

    elif kind == "content":
        if is_language_domain:
            base["content"] = {
                "content_type": "language_lesson",
                "title": f"{topic} - alaplecke" if is_hu else f"{topic} - starter lesson",
                "introduction": (
                    f"Ebben a rövid leckében a(z) {topic} témához kapcsolódó alap szókincset és mondatszerkezeteket tanulod. "
                    "A cél, hogy egyszerű helyzetekben magabiztosan tudj köszönni, bemutatkozni, és röviden válaszolni."
                    if is_hu
                    else f"In this short lesson you learn the core vocabulary and sentence patterns for {topic}. "
                    "The goal is to greet people, introduce yourself, and answer simple questions with confidence."
                ),
                "key_points": [
                    ("Köszönések és udvarias alapmondatok." if is_hu else "Basic greetings and polite starter phrases."),
                    ("Egyszerű bemutatkozás: név, származás, foglalkozás." if is_hu else "Simple self-introduction: name, origin, role."),
                    ("Rövid kérdés-válasz minták hétköznapi helyzetekre." if is_hu else "Short question-answer patterns for daily situations."),
                ],
                "vocabulary_table": [
                    {"word": "Hello", "translation": "Helló"},
                    {"word": "Good morning", "translation": "Jó reggelt"},
                    {"word": "Good afternoon", "translation": "Jó napot"},
                    {"word": "My name is", "translation": "A nevem"},
                    {"word": "Nice to meet you", "translation": "Örülök, hogy megismertelek"},
                    {"word": "How are you?", "translation": "Hogy vagy?"},
                ],
                "grammar_explanation": {
                    "rule_title": "Egyszerű bemutatkozó mondat",
                    "formation_pattern": "My name is + név",
                    "explanation": (
                        "A minta segít udvariasan bemutatkozni első találkozáskor."
                        if is_hu
                        else "This pattern is used to introduce yourself politely in first meetings."
                    ),
                    "examples": [
                        {"target": "My name is Anna.", "hungarian": "A nevem Anna."},
                        {"target": "My name is Peter.", "hungarian": "A nevem Péter."},
                    ],
                },
                "dialogues": [
                    {
                        "scene": "Első találkozás" if is_hu else "First meeting",
                        "lines": [
                            {"speaker": "A", "text": "Hello!", "translation": "Helló!"},
                            {"speaker": "B", "text": "Good afternoon!", "translation": "Jó napot!"},
                            {"speaker": "A", "text": "My name is Anna.", "translation": "A nevem Anna."},
                            {"speaker": "B", "text": "Nice to meet you.", "translation": "Örülök, hogy megismertelek."},
                        ],
                    }
                ],
                "common_mistakes": [
                    ("A 'My name is' után lemarad a név." if is_hu else "Leaving out the name after 'My name is'."),
                    ("A köszönést napszakhoz rosszul választják." if is_hu else "Using a greeting that does not match the time of day."),
                    ("Túl hosszú, bonyolult mondatok kezdő szinten." if is_hu else "Using overly long, complex sentences at beginner level."),
                ],
                "estimated_minutes": max(3, min(10, minutes)),
            }
        else:
            base["content"] = {
                "title": f"{topic} alapjai" if is_hu else f"{topic} essentials",
                "summary": (
                    f"A(z) {topic} lényege, hogy érthetően lásd a célt és a megvalósítás lépéseit. "
                    f"Ez a rövid áttekintés segít abban, hogy mikor és hogyan használd a fogalmat a gyakorlatban."
                    if is_hu
                    else f"{topic} focuses on understanding the goal and the practical steps to apply it. "
                         f"This short overview helps you decide when to use it and what to watch for in practice."
                ),
                "key_points": [
                    (f"Definíció: mi a(z) {topic} és mire szolgál." if is_hu else f"Definition: what {topic} is and what it is for."),
                    ("Működés: a folyamat fő lépései röviden." if is_hu else "How it works: the main steps in order."),
                    ("Alkalmazás: egy tipikus helyzet, ahol hasznos." if is_hu else "Use case: a typical scenario where it helps."),
                    ("Korlátok: mikor nem ideális a használata." if is_hu else "Limitations: when it is not ideal."),
                    ("Kapcsolódás: hogyan illeszkedik a kapcsolódó fogalmakhoz." if is_hu else "Connections: how it relates to nearby concepts."),
                ],
                "example": (
                    f"Példa: Egy konkrét helyzetben a(z) {topic} segít a cél elérésében, mert lépésről lépésre követhető megoldást ad."
                    if is_hu
                    else f"Example: In a real situation, {topic} guides the process by making steps clear and measurable."
                ),
                "micro_task": {
                    "instruction": (f"Írj 2–3 mondatban egy saját példát, ahol a(z) {topic} segítene." if is_hu else f"Write a 2–3 sentence example where {topic} would help."),
                    "expected_output": ("2–3 mondat, konkrét helyzettel és céllal." if is_hu else "2–3 sentences with a concrete situation and goal."),
                },
                "common_mistakes": [
                    ("Túl általános megfogalmazás konkrétumok nélkül." if is_hu else "Using vague statements without concrete details."),
                    ("A lépések összekeverése vagy kihagyása." if is_hu else "Skipping or mixing up steps."),
                    ("A cél és a mérhető eredmény nem tiszta." if is_hu else "Unclear goal or success criteria."),
                ],
                "estimated_minutes": max(3, min(10, minutes))
            }
        base["validation"]["require_interaction"] = False
        base["input"]["type"] = "none"

    elif kind == "quiz":
        base["content"] = {
            "title": f"{topic} kvíz" if is_hu else f"{topic} quiz",
            "questions": [
                {
                    "q": (f"Melyik állítás írja le legjobban a(z) {topic} lényegét?" if is_hu else f"Which statement best describes {topic}?"),
                    "options": [
                        (f"A(z) {topic} célja egy világos, mérhető eredmény elérése." if is_hu else f"{topic} aims for a clear, measurable outcome."),
                        (f"A(z) {topic} csak általános inspiráció, lépések nélkül." if is_hu else f"{topic} is only general inspiration without steps."),
                        (f"A(z) {topic} kizárólag hosszú távú elmélet, gyakorlati nélkül." if is_hu else f"{topic} is purely long-term theory with no practice."),
                    ],
                    "answer_index": 0,
                    "explanation": ("Az első opció köti a célt és a megvalósítást." if is_hu else "Option one links goal and execution."),
                },
                {
                    "q": (f"Mikor hasznos a(z) {topic}?" if is_hu else f"When is {topic} useful?"),
                    "options": [
                        ("Ha konkrét célt és lépéseket kell meghatározni." if is_hu else "When you need a clear goal and steps."),
                        ("Ha nincs szükség mérhető eredményre." if is_hu else "When no measurable outcome is needed."),
                        ("Ha teljesen véletlenszerűen kell dönteni." if is_hu else "When decisions should be random."),
                    ],
                    "answer_index": 0,
                    "explanation": ("A konkrét cél és lépések a kulcs." if is_hu else "Clear goals and steps are the key."),
                },
                {
                    "q": (f"Mi a leggyakoribb hiba a(z) {topic} alkalmazásakor?" if is_hu else f"What is a common mistake when applying {topic}?"),
                    "options": [
                        ("A lépések kihagyása vagy összekeverése." if is_hu else "Skipping or mixing up steps."),
                        ("A cél egyértelmű megfogalmazása." if is_hu else "Clearly defining the goal."),
                        ("Az eredmény mérése." if is_hu else "Measuring the result."),
                    ],
                    "answer_index": 0,
                    "explanation": ("A folyamat lépéseinek elhagyása torzít." if is_hu else "Skipping steps causes errors."),
                },
                {
                    "q": (f"Melyik kimenet jelzi, hogy a(z) {topic} jól működött?" if is_hu else f"Which outcome shows that {topic} worked well?"),
                    "options": [
                        ("Mérhetően javult az eredmény." if is_hu else "The outcome measurably improved."),
                        ("Semmi nem változott." if is_hu else "Nothing changed."),
                        ("Nem tudjuk megmondani." if is_hu else "We cannot tell."),
                    ],
                    "answer_index": 0,
                    "explanation": ("A mérhető javulás jelzi a sikert." if is_hu else "Measurable improvement indicates success."),
                },
            ],
            "estimated_minutes": max(3, min(8, minutes))
        }

    elif kind == "checklist":
        base["content"] = {
            "title": f"{topic} ellenőrzőlista" if is_hu else f"{topic} checklist",
            "items": [
                {"text": (f"Fogalmazd meg a(z) {topic} pontos célját 1 mondatban." if is_hu else f"Define the exact goal for {topic} in one sentence."), "done": False},
                {"text": (f"Sorolj fel 3 követelményt a(z) {topic} kapcsán." if is_hu else f"List 3 constraints for {topic}."), "done": False},
                {"text": ("Állíts össze egy rövid (3 lépés) tervet." if is_hu else "Draft a short 3-step plan."), "done": False},
                {"text": ("Készíts egy első mérhető eredményt." if is_hu else "Create a first measurable deliverable."), "done": False},
                {"text": ("Írd le a következő lépést és a határidőt." if is_hu else "Write the next step and a deadline."), "done": False},
            ],
            "estimated_minutes": max(3, min(10, minutes))
        }

    elif kind == "upload_review":
        base["content"] = {
            "title": f"{topic} feltöltés" if is_hu else f"{topic} upload",
            "prompt": (f"Tölts fel egy fájlt, ami bemutatja: {topic}." if is_hu else f"Upload a file that demonstrates: {topic}."),
            "rubric": [
                ("A cél világosan látszik." if is_hu else "The goal is clear."),
                ("A lényegi elemek benne vannak." if is_hu else "Key elements are present."),
                ("A kimenet rendezett és olvasható." if is_hu else "The output is organized and readable."),
                ("Azonosíthatók a hiányok." if is_hu else "Gaps are identifiable."),
            ],
            "estimated_minutes": max(3, min(10, minutes))
        }
        base["input"]["type"] = "file"
        base["validation"]["min_items"] = 1

    elif kind == "briefing":
        base["content"] = {
            "situation": (f"Ma a következő munkahelyi szituációval foglalkozunk: {topic}." if is_hu else f"Today we focus on this workplace scenario: {topic}."),
            "outcome": ("A nap végére képes leszel alkalmazni a tanultakat egy valós helyzetben." if is_hu else "By the end you will apply what you learned in a real situation."),
            "key_vocabulary_preview": [],
        }
        base["validation"]["require_interaction"] = False
        base["input"]["type"] = "none"

    elif kind == "feedback":
        base["content"] = {
            "placeholder": True,
            "user_text": "",
            "corrections": [],
            "improved_version": "",
            "message": ("Először fejezd be a szövegalkotás feladatot!" if is_hu else "Complete the writing task first!"),
        }
        base["validation"]["require_interaction"] = False
        base["input"]["type"] = "none"

    else:
        base["content"] = {"summary": topic}

    return base


def _get_domain_rules_hu(domain: str) -> str:
    """Get Hungarian domain-specific rules for item types."""
    domain = domain.lower()

    if domain == "language":
        return (
            "📋 ITEM TÍPUSOK (NYELV DOMAIN):\n"
            "- lesson: Tananyag egy konkrét témáról\n"
            "- quiz: Kvíz az összes napi témából\n"
            "- practice: Gyakorlati feladat (exercise/writing/speaking)\n"
            "- flashcard: Memóriakártyák szavakhoz\n"
            "- task: Rövid, kipipálható feladat\n"
            "\n"
            "⚠️ PRACTICE items-nél KÖTELEZŐ practice_type mező:\n"
            "  - 'exercise' = párbeszéd gyakorlat AI-val (KÖTELEZŐ!)\n"
            "  - 'translation' = fordítási gyakorlat (KÖTELEZŐ!)\n"
            "  - 'writing' = írási feladat\n"
            "  - 'speaking' = olvasás/hangos gyakorlás\n"
            "\n"
            "🚨 KÖTELEZŐ MIX:\n"
            "  - LEGALÁBB 1 exercise (párbeszéd AI-val)\n"
            "  - LEGALÁBB 1 translation (fordítás)\n"
            "  - LEGALÁBB 1 writing VAGY speaking"
        )
    elif domain == "project":
        return (
            "📋 ITEM TÍPUSOK (PROJEKT DOMAIN):\n"
            "- lesson: Elméleti háttér, koncepciók\n"
            "- task: Konkrét lépés a projektben (KÖTELEZŐ!)\n"
            "- checklist: Ellenőrzőlista (KÖTELEZŐ!)\n"
            "\n"
            "⚠️ TILOS NYELV-SPECIFIKUS FELADATOK!\n"
            "  - NE használj 'translation' practice_type-ot!\n"
            "  - NE használj 'flashcard' típust!\n"
            "  - NE kérj nyelvtanulási feladatokat!\n"
            "\n"
            "🚨 KÖTELEZŐ MIX:\n"
            "  - Több lesson (elméleti háttér)\n"
            "  - Konkrét projekt lépések (task)\n"
            "  - Ellenőrzőlisták (checklist)"
        )
    elif domain == "fitness":
        return (
            "📋 ITEM TÍPUSOK (FITNESS DOMAIN):\n"
            "- lesson: Edzéselmélet, technika\n"
            "- task: Edzésfeladat, gyakorlat (KÖTELEZŐ!)\n"
            "- checklist: Ellenőrzőlista (KÖTELEZŐ!)\n"
            "\n"
            "⚠️ TILOS NYELV-SPECIFIKUS FELADATOK!\n"
            "  - NE használj 'translation' practice_type-ot!\n"
            "  - NE használj 'flashcard' típust!\n"
            "\n"
            "🚨 KÖTELEZŐ MIX:\n"
            "  - Edzéselmélet (lesson)\n"
            "  - Gyakorlatok leírása (task)\n"
            "  - Napló/mérés (checklist)"
        )
    elif domain == "programming":
        return (
            "📋 ITEM TÍPUSOK (PROGRAMOZÁS DOMAIN):\n"
            "- lesson: Koncepciók, szintaxis\n"
            "- quiz: Tudásszint ellenőrzés\n"
            "- practice: Kódolási feladat (practice_type='coding')\n"
            "- task: Implementációs lépés\n"
            "\n"
            "⚠️ TILOS NYELV-SPECIFIKUS FELADATOK!\n"
            "  - NE használj 'translation' practice_type-ot!\n"
            "\n"
            "🚨 KÖTELEZŐ MIX:\n"
            "  - Elméleti anyag (lesson)\n"
            "  - Kódolási gyakorlat (practice)\n"
            "  - Quiz"
        )
    else:
        return (
            "📋 ITEM TÍPUSOK (ÁLTALÁNOS):\n"
            "- lesson: Tananyag egy konkrét témáról\n"
            "- quiz: Kvíz az összes napi témából\n"
            "- practice: Gyakorlati feladat\n"
            "- task: Rövid, kipipálható feladat\n"
            "\n"
            "⚠️ FONTOS:\n"
            "  - NE használj 'translation' practice_type-ot (csak nyelvtanuláshoz)!\n"
            "  - NE használj 'flashcard' típust (csak nyelvtanuláshoz)!\n"
            "\n"
            "🚨 KÖTELEZŐ MIX:\n"
            "  - Elméleti anyag (lesson)\n"
            "  - Gyakorlat (practice/task)\n"
            "  - Quiz"
        )


def _get_domain_rules_en(domain: str) -> str:
    """Get English domain-specific rules for item types."""
    domain = domain.lower()

    if domain == "language":
        return (
            "📋 ITEM TYPES (LANGUAGE DOMAIN):\n"
            "- lesson: Teaching content on specific topic\n"
            "- quiz: Quiz covering all daily topics\n"
            "- practice: Practical exercise (exercise/writing/speaking)\n"
            "- flashcard: Memory cards for vocabulary\n"
            "- task: Short, checkable task\n"
            "\n"
            "⚠️ PRACTICE items MUST have practice_type:\n"
            "  - 'exercise' = dialogue practice with AI (REQUIRED!)\n"
            "  - 'translation' = translation practice (REQUIRED!)\n"
            "  - 'writing' = writing exercise\n"
            "  - 'speaking' = pronunciation practice\n"
            "\n"
            "🚨 REQUIRED MIX:\n"
            "  - AT LEAST 1 exercise (dialogue with AI)\n"
            "  - AT LEAST 1 translation\n"
            "  - AT LEAST 1 writing OR speaking"
        )
    elif domain == "project":
        return (
            "📋 ITEM TYPES (PROJECT DOMAIN):\n"
            "- lesson: Theoretical background, concepts\n"
            "- task: Concrete project step (REQUIRED!)\n"
            "- checklist: Verification checklist (REQUIRED!)\n"
            "\n"
            "⚠️ LANGUAGE-SPECIFIC TASKS FORBIDDEN!\n"
            "  - DO NOT use 'translation' practice_type!\n"
            "  - DO NOT use 'flashcard' type!\n"
            "  - DO NOT assign language learning tasks!\n"
            "\n"
            "🚨 REQUIRED MIX:\n"
            "  - Multiple lessons (theory)\n"
            "  - Concrete project steps (task)\n"
            "  - Checklists"
        )
    elif domain == "fitness":
        return (
            "📋 ITEM TYPES (FITNESS DOMAIN):\n"
            "- lesson: Training theory, technique\n"
            "- task: Exercise, workout task (REQUIRED!)\n"
            "- checklist: Verification checklist (REQUIRED!)\n"
            "\n"
            "⚠️ LANGUAGE-SPECIFIC TASKS FORBIDDEN!\n"
            "  - DO NOT use 'translation' practice_type!\n"
            "  - DO NOT use 'flashcard' type!\n"
            "\n"
            "🚨 REQUIRED MIX:\n"
            "  - Training theory (lesson)\n"
            "  - Exercise descriptions (task)\n"
            "  - Log/measurement (checklist)"
        )
    elif domain == "programming":
        return (
            "📋 ITEM TYPES (PROGRAMMING DOMAIN):\n"
            "- lesson: Concepts, syntax\n"
            "- quiz: Knowledge check\n"
            "- practice: Coding exercise (practice_type='coding')\n"
            "- task: Implementation step\n"
            "\n"
            "⚠️ LANGUAGE-SPECIFIC TASKS FORBIDDEN!\n"
            "  - DO NOT use 'translation' practice_type!\n"
            "\n"
            "🚨 REQUIRED MIX:\n"
            "  - Theory (lesson)\n"
            "  - Coding practice\n"
            "  - Quiz"
        )
    else:
        return (
            "📋 ITEM TYPES (GENERAL):\n"
            "- lesson: Teaching content on specific topic\n"
            "- quiz: Quiz covering daily topics\n"
            "- practice: Practical exercise\n"
            "- task: Short, checkable task\n"
            "\n"
            "⚠️ IMPORTANT:\n"
            "  - DO NOT use 'translation' practice_type (language learning only)!\n"
            "  - DO NOT use 'flashcard' type (language learning only)!\n"
            "\n"
            "🚨 REQUIRED MIX:\n"
            "  - Theory (lesson)\n"
            "  - Practice (practice/task)\n"
            "  - Quiz"
        )


# =========================
# FOCUS DAY (Detailed, time-filling)
# =========================
async def generate_focus_day(
    *,
    outline: Dict[str, Any],
    day_index: int,
    lang: str,
) -> Dict[str, Any]:
    """
    NEW STRATEGY: Generate day OUTLINE only (structure with topics, no detailed content).

    Returns item structure with:
    - id, type, label, topic, estimated_minutes
    - NO detailed content - that's loaded on-demand

    This keeps the response small (~1000 tokens) and prevents JSON truncation.
    """
    is_hu = (lang or "hu").lower().startswith("hu")

    days = outline.get("days", [])
    if day_index < 1 or day_index > len(days):
        raise RuntimeError(f"Invalid day_index: {day_index}")

    day_info = days[day_index - 1] or {}
    day_title = day_info.get("title") or (f"Nap {day_index}" if is_hu else f"Day {day_index}")
    day_intro = day_info.get("intro") or ""
    plan_title = outline.get("title") or ("Tanulási terv" if is_hu else "Learning plan")
    domain = outline.get("domain", "other")
    level = outline.get("level", "beginner")
    minutes_per_day = int(outline.get("minutes_per_day") or 45)
    focus_type = outline.get("focus_type", "learning")

    # Calculate time distribution
    # 45 min = 20 min learning + 25 min exercises
    # Learning: 6-7 lessons × 3 min = 18-21 min
    # Exercises: 1 quiz (5min) + 2 practice (8min each) + 4 tasks (1min each) = 25min

    # Domain-specific rules for item types
    domain_rules_hu = _get_domain_rules_hu(domain)
    domain_rules_en = _get_domain_rules_en(domain)

    if is_hu:
        system = (
            "FÓKUSZ NAP STRUKTÚRA GENERÁLÁS - CSAK OUTLINE!\n"
            "\n"
            "🎯 FELADAT:\n"
            "Készítsd el a nap itemjeinek listáját címekkel, témákkal és időbecsléssel.\n"
            "NE generálj részletes tartalmat - csak a struktúrát!\n"
            "\n"
            f"⏱️ IDŐBEOSZTÁS ({minutes_per_day} perc):\n"
            "- Tanulás (6-8 lesson): ~20 perc\n"
            "  → Minden lesson: 2-3 perc olvasás\n"
            "- Gyakorlás:\n"
            "  → 1 quiz: ~5 perc\n"
            "  → 2-3 practice: 6-10 perc each\n"
            "  → 4-6 task: 1-2 perc each\n"
            "\n"
            f"{domain_rules_hu}\n"
            "\n"
             "🔑 MINDEN ITEM-NEK KELL:\n"
            "- Egyedi ID\n"
            "- Type (lesson/quiz/practice/flashcard/task)\n"
            "- Label (rövid cím)\n"
            "- Topic (konkrét téma amit lefed)\n"
            "- Estimated_minutes (időbecslés)\n"
        )

        user = f"""Készítsd el a(z) {day_index}. nap STRUKTÚRÁJÁT.

**Terv:** {plan_title}
**Nap címe:** {day_title}
**Nap célja:** {day_intro}
**Típus:** {focus_type}
**Terület:** {domain}
**Szint:** {level}
**Napi idő:** {minutes_per_day} perc

Csak JSON struktúra:

{{
  "day": {day_index},
  "title": "{day_title}",
  "intro": "{day_intro}",
  "items": [
    {{
      "id": "d{day_index}-lesson-1",
      "type": "lesson",
      "label": "Első téma rövid címe (2-5 szó)",
      "topic": "Konkrét téma amit ez a lesson tanít",
      "estimated_minutes": 3
    }},
    {{
      "id": "d{day_index}-lesson-2",
      "type": "lesson",
      "label": "Második téma címe",
      "topic": "...",
      "estimated_minutes": 3
    }},
    // ... 4-6 további lesson (összesen ~18-20 perc)
    {{
      "id": "d{day_index}-exercise-1",
      "type": "practice",
      "label": "Párbeszéd: étteremben",
      "topic": "Rendelés étteremben - gyakorlat AI-val",
      "practice_type": "exercise",
      "estimated_minutes": 8
    }},
    {{
      "id": "d{day_index}-translation-1",
      "type": "practice",
      "label": "Fordítási gyakorlat",
      "topic": "Mondatok fordítása magyarul↔célnyelv",
      "practice_type": "translation",
      "estimated_minutes": 6
    }},
    {{
      "id": "d{day_index}-writing-1",
      "type": "practice",
      "label": "Írj egy rövid bemutatkozást",
      "topic": "Bemutatkozás írása",
      "practice_type": "writing",
      "estimated_minutes": 8
    }},
    {{
      "id": "d{day_index}-flashcard-1",
      "type": "flashcard",
      "label": "Memóriakártyák",
      "topic": "Kulcs kifejezések/fogalmak",
      "estimated_minutes": 5
    }},
    {{
      "id": "d{day_index}-task-1",
      "type": "task",
      "label": "Feladat címe",
      "topic": "Mit kell csinálni",
      "estimated_minutes": 2
    }}
    // ... még 3-5 task
  ]
}}

🚨 KRITIKUS:
- CSAK STRUKTÚRA, nincs részletes tartalom!
- Minden item-nek legyen 'topic' mezője
- Estimated_minutes összege: ~{minutes_per_day} perc
- A domain ({domain}) szabályait KÖVESD!
- STRICT JSON!
"""
    else:
        system = (
            "FOCUS DAY STRUCTURE GENERATION - OUTLINE ONLY!\n"
            "\n"
            "🎯 TASK:\n"
            "Create day's item list with titles, topics, and time estimates.\n"
            "DON'T generate detailed content - structure only!\n"
            "\n"
            f"⏱️ TIME DISTRIBUTION ({minutes_per_day} min):\n"
            "- Learning (6-8 lessons): ~20 min\n"
            "  → Each lesson: 2-3 min reading\n"
            "- Practice:\n"
            "  → 1 quiz: ~5 min\n"
            "  → 2-3 practice: 6-10 min each\n"
            "  → 4-6 tasks: 1-2 min each\n"
            "\n"
            f"{domain_rules_en}\n"
            "\n"
            "🔑 EVERY ITEM NEEDS:\n"
            "- Unique ID\n"
            "- Type (lesson/quiz/practice/flashcard/task)\n"
            "- Label (short title)\n"
            "- Topic (specific topic covered)\n"
            "- Estimated_minutes (time estimate)\n"
        )

        user = f"""Create structure for day {day_index}.

**Plan:** {plan_title}
**Day title:** {day_title}
**Day goal:** {day_intro}
**Type:** {focus_type}
**Domain:** {domain}
**Level:** {level}
**Daily time:** {minutes_per_day} min

JSON structure only:

{{
  "day": {day_index},
  "title": "{day_title}",
  "intro": "{day_intro}",
  "items": [
    {{
      "id": "d{day_index}-lesson-1",
      "type": "lesson",
      "label": "First topic short title (2-5 words)",
      "topic": "Specific topic this lesson teaches",
      "estimated_minutes": 3
    }},
    {{
      "id": "d{day_index}-lesson-2",
      "type": "lesson",
      "label": "Second topic title",
      "topic": "...",
      "estimated_minutes": 3
    }},
    // ... 4-6 more lessons (total ~18-20 min)
    {{
      "id": "d{day_index}-quiz-1",
      "type": "quiz",
      "label": "Quiz - Today's material",
      "topic": "All today's topics summarized",
      "estimated_minutes": 5
    }},
    {{
      "id": "d{day_index}-exercise-1",
      "type": "practice",
      "label": "Dialogue: at restaurant",
      "topic": "Ordering food - practice with AI",
      "practice_type": "exercise",
      "estimated_minutes": 8
    }},
    {{
      "id": "d{day_index}-translation-1",
      "type": "practice",
      "label": "Translation practice",
      "topic": "Translate sentences both ways",
      "practice_type": "translation",
      "estimated_minutes": 6
    }},
    {{
      "id": "d{day_index}-writing-1",
      "type": "practice",
      "label": "Write a short intro",
      "topic": "Writing practice",
      "practice_type": "writing",
      "estimated_minutes": 8
    }},
    {{
      "id": "d{day_index}-flashcard-1",
      "type": "flashcard",
      "label": "Flashcards",
      "topic": "Key terms/concepts",
      "estimated_minutes": 5
    }},
    {{
      "id": "d{day_index}-task-1",
      "type": "task",
      "label": "Task title",
      "topic": "What to do",
      "estimated_minutes": 2
    }}
    // ... 3-5 more tasks
  ]
}}

🚨 CRITICAL:
- STRUCTURE ONLY, no detailed content!
- Every item needs 'topic' field
- Estimated_minutes sum: ~{minutes_per_day} min
- Follow the DOMAIN ({domain}) rules from the system prompt!
- STRICT JSON!
"""

    # ✅ Use Haiku for JSON generation (cheap, fast for structured output)
    text = await _claude_json_haiku(
        system=system,
        user=user,
        max_tokens=1200,  # Outline is lightweight!
        temperature=0.3
    )

    # Check for API errors before JSON parsing
    if text.startswith("Error:") or "overloaded" in text.lower():
        raise RuntimeError("Claude API temporarily unavailable. Please try again in a moment.")

    s = _strip_json_fences(text)
    data = _extract_json_object(s)

    if not data:
        try:
            data = json.loads(s)
        except Exception:
            pass

    if not data:
        print(f"[FOCUS_DAY ERROR] Outline generation failed. Response: {text[:500]}")
        raise RuntimeError("Focus day outline generation failed")

    # ✅ Post-generation validation & normalization (DOMAIN-AWARE)
    data = _normalize_focus_day_items(data, day_index, is_hu, domain=domain)

    return data


def _normalize_focus_day_items(data: Dict[str, Any], day_index: int, is_hu: bool, domain: str = "other", settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Normalize and validate focus day items with DOMAIN AWARENESS:
    - Map 'roleplay' → 'exercise' for consistency (ONLY in language domains)
    - Convert language-only types to safe alternatives in non-language domains
    - Ensure minimum items exist

    DOMAIN SAFETY: Non-language domains get quiz/writing/checklist instead of
    translation/exercise/roleplay.
    """
    # Fixed-structure tracks — do not add/remove items
    track = (settings or {}).get("track", "")
    if track in ("career_language", "foundations_language"):
        return data

    items = data.get("items", [])
    domain_lower = (domain or "other").lower()
    is_language_domain = domain_lower in ("language_learning", "language")

    # Language-only practice types that should be converted in non-language domains
    LANGUAGE_ONLY_PRACTICE = {"translation", "exercise", "roleplay", "dialogue", "speaking"}

    has_quiz = False
    has_writing = False
    has_task = False

    # For language domains only
    has_exercise = False
    has_translation = False

    for item in items:
        item_type = (item.get("type") or "").lower()
        practice_type = (item.get("practice_type") or "").lower()

        # DOMAIN GUARD: Convert language-only items in non-language domains
        if not is_language_domain:
            if practice_type in LANGUAGE_ONLY_PRACTICE:
                print(f"[DOMAIN_GUARD] Converting practice_type '{practice_type}' → 'writing' for domain '{domain}'")
                item["practice_type"] = "writing"
                practice_type = "writing"

            if item_type in ("flashcard", "translation"):
                print(f"[DOMAIN_GUARD] Converting type '{item_type}' → 'quiz' for domain '{domain}'")
                item["type"] = "quiz"
                item_type = "quiz"

        # Type mapping for language domains
        if is_language_domain:
            type_map = {
                "roleplay": "exercise",
                "dialogue": "exercise",
                "conversation": "exercise",
                "drill": "translation",
            }
            if practice_type in type_map:
                item["practice_type"] = type_map[practice_type]
                practice_type = item["practice_type"]

        # Track what we have
        if item_type == "quiz" or practice_type == "quiz":
            has_quiz = True
        if practice_type == "writing":
            has_writing = True
        if item_type == "task":
            has_task = True
        if practice_type == "exercise":
            has_exercise = True
        if practice_type == "translation":
            has_translation = True

    # Add missing items based on domain
    if is_language_domain:
        # Language domain: require exercise, translation, writing
        if not has_exercise:
            items.append({
                "id": f"d{day_index}-exercise-auto",
                "type": "practice",
                "label": "Párbeszéd gyakorlat" if is_hu else "Dialogue practice",
                "topic": "Interaktív párbeszéd AI-val" if is_hu else "Interactive dialogue with AI",
                "practice_type": "exercise",
                "estimated_minutes": 8
            })
            print(f"[FOCUS_DAY] Added missing exercise item for day {day_index} (language domain)")

        if not has_translation:
            items.append({
                "id": f"d{day_index}-translation-auto",
                "type": "practice",
                "label": "Fordítási gyakorlat" if is_hu else "Translation practice",
                "topic": "Mondatok fordítása" if is_hu else "Sentence translation",
                "practice_type": "translation",
                "estimated_minutes": 6
            })
            print(f"[FOCUS_DAY] Added missing translation item for day {day_index} (language domain)")

        if not has_writing:
            items.append({
                "id": f"d{day_index}-writing-auto",
                "type": "practice",
                "label": "Írási feladat" if is_hu else "Writing task",
                "topic": "Rövid szöveg írása" if is_hu else "Write a short text",
                "practice_type": "writing",
                "estimated_minutes": 8
            })
            print(f"[FOCUS_DAY] Added missing writing item for day {day_index} (language domain)")
    else:
        # Non-language domain: require quiz, writing, task (NO translation/exercise!)
        if not has_quiz:
            items.append({
                "id": f"d{day_index}-quiz-auto",
                "type": "quiz",
                "label": "Kvíz" if is_hu else "Quiz",
                "topic": data.get("title", "Napi anyag"),
                "estimated_minutes": 5
            })
            print(f"[FOCUS_DAY] Added missing quiz for day {day_index} (non-language domain)")

        if not has_writing:
            items.append({
                "id": f"d{day_index}-writing-auto",
                "type": "practice",
                "label": "Összefoglaló" if is_hu else "Summary",
                "topic": "Írd le a tanultakat" if is_hu else "Summarize what you learned",
                "practice_type": "writing",
                "estimated_minutes": 5
            })
            print(f"[FOCUS_DAY] Added missing writing for day {day_index} (non-language domain)")

        if not has_task:
            items.append({
                "id": f"d{day_index}-task-auto",
                "type": "task",
                "label": "Mai feladat" if is_hu else "Today's task",
                "topic": "Alkalmazd a tanultakat" if is_hu else "Apply what you learned",
                "estimated_minutes": 5
            })
            print(f"[FOCUS_DAY] Added missing task for day {day_index} (non-language domain)")

    data["items"] = items
    return data


# =========================
# FOCUS OUTLINE (titles + intros only)
# =========================
def _fallback_focus_outline(
    *,
    user_goal: str,
    lang: str,
    focus_type: str,
    domain: str,
    level: str,
    minutes_per_day: int,
    duration_days: int = 7,
) -> Dict[str, Any]:
    is_hu = (lang or "hu").lower().startswith("hu")
    plan_title = user_goal.strip() or ("Fókusz terv" if is_hu else "Focus plan")
    days = []
    for i in range(1, int(duration_days or 7) + 1):
        days.append({
            "dayIndex": i,
            "title": f"Nap {i}" if is_hu else f"Day {i}",
            "intro": "Rövid napi áttekintés." if is_hu else "Short daily overview.",
            "items": [],
        })
    return {
        "title": plan_title,
        "days": days,
        "domain": domain,
        "level": level,
        "minutes_per_day": minutes_per_day,
        "focus_type": focus_type,
    }


async def generate_focus_outline(
    *,
    user_goal: str,
    lang: str,
    focus_type: str,
    domain: str,
    level: str,
    minutes_per_day: int,
    duration_days: int = 7,
) -> Dict[str, Any]:
    """
    Generate a focus outline (titles + intros only).
    Always returns a valid outline; falls back deterministically on failure.
    """
    is_hu = (lang or "hu").lower().startswith("hu")

    lang_instruction = "MINDEN SZÖVEG MAGYARUL LEGYEN. Írj magyarul!" if is_hu else "Write all text in English."

    system = (
        "FOCUS OUTLINE GENERATION - TITLES + INTROS ONLY.\n"
        "Return STRICT JSON only.\n"
        "No detailed content, no items.\n"
        f"CRITICAL: {lang_instruction}\n"
    )

    user = f"""Create a {duration_days}-day outline.

Goal: {user_goal}
IMPORTANT: {"ALL titles and intros MUST be written in HUNGARIAN language." if is_hu else "Write in English."}
Mode: {focus_type}
Domain: {domain}
Level: {level}
Minutes per day: {minutes_per_day}

Return JSON only ({"HUNGARIAN text" if is_hu else "English text"}):
{{
  "title": "{"Terv címe magyarul" if is_hu else "Plan title"}",
  "days": [
    {{"dayIndex": 1, "title": "{"magyar cím" if is_hu else "title"}", "intro": "{"magyar bevezető" if is_hu else "intro"}", "items": []}}
  ]
}}
"""

    try:
        text = await _claude_json_haiku(
            system=system,
            user=user,
            max_tokens=800,
            temperature=0.2,
        )

        if text.startswith("Error:") or "overloaded" in text.lower():
            raise RuntimeError("Claude API temporarily unavailable")

        s = _strip_json_fences(text)
        data = _extract_json_object(s)
        if not data:
            try:
                data = json.loads(s)
            except Exception:
                data = None

        if not data or not data.get("days"):
            raise RuntimeError("Invalid outline payload")

        # Normalize day indices and ensure items field exists
        days = []
        for idx, day in enumerate(data.get("days", []), start=1):
            day_index = day.get("dayIndex") or day.get("day") or idx
            days.append({
                "dayIndex": int(day_index),
                "title": day.get("title") or (f"Nap {day_index}" if is_hu else f"Day {day_index}"),
                "intro": day.get("intro") or ("Rövid napi áttekintés." if is_hu else "Short daily overview."),
                "items": day.get("items") or [],
            })

        return {
            "title": data.get("title") or user_goal or ("Fókusz terv" if is_hu else "Focus plan"),
            "days": days,
            "domain": domain,
            "level": level,
            "minutes_per_day": minutes_per_day,
            "focus_type": focus_type,
        }
    except Exception as e:
        print(f"[FOCUS_OUTLINE] Fallback outline used: {e}")
        return _fallback_focus_outline(
            user_goal=user_goal,
            lang=lang,
            focus_type=focus_type,
            domain=domain,
            level=level,
            minutes_per_day=minutes_per_day,
            duration_days=duration_days,
        )


# =========================
# FOCUS PLAN JSON (backwards compat)
# =========================
async def generate_focus_plan_json(
    *,
    user_goal: str,
    lang: str,
    focus_type: str,
    domain: str,
    level: str,
    minutes_per_day: int,
    new_items_per_day: int,
    target_lang: Optional[str] = None,
) -> Dict[str, Any]:
    outline = await generate_focus_outline(
        user_goal=user_goal,
        lang=lang,
        focus_type=focus_type,
        domain=domain,
        level=level,
        minutes_per_day=minutes_per_day,
    )
    outline["_lazy"] = True
    return outline


# =========================
# MEMORY extraction (single canonical function)
# =========================
async def extract_memory_facts(
    *,
    user_text: str,
    assistant_text: str,
    lang: str = "hu",
) -> List[Dict[str, Any]]:
    """
    Extract up to 3 long-term useful memory facts.
    Returns: [{"fact": str, "tags": [str], "importance": int 1-5}, ...]
    If nothing worth saving -> [].
    """
    lang_norm = (lang or "hu").lower().strip()

    system = (
        "You extract long-term memory facts for a chat app.\n"
        "Rules:\n"
        "- Save ONLY stable facts useful in future.\n"
        "- Do NOT save temporary moods, one-off events, or fleeting context.\n"
        "- Do NOT save sensitive medical details (diagnoses, test results, meds).\n"
        "- Max 3 facts.\n"
        "- Output STRICT JSON only (no markdown, no explanations).\n"
        '[{"fact":"...","tags":["..."],"importance":3}]\n'
    )

    if lang_norm.startswith("hu"):
        user = f"""Vonj ki maximum 3 darab HOSSZÚTÁVON hasznos memóriatételt.

User üzenet:
{user_text}

Asszisztens válasz:
{assistant_text}

Kimenet kizárólag JSON:
[
  {{"fact":"...","tags":["..."],"importance":3}}
]
Ha nincs menthető: []
""".strip()
    else:
        user = f"""Extract up to 3 long-term useful memory facts.

User message:
{user_text}

Assistant reply:
{assistant_text}

Output STRICT JSON only:
[
  {{"fact":"...","tags":["..."],"importance":3}}
]
If nothing: []
""".strip()

    raw = await _claude_messages_create(system=system, user=user, max_tokens=350, temperature=0.2)
    s = _strip_json_fences(raw)

    try:
        data = json.loads(s)
    except Exception:
        return []

    if not isinstance(data, list):
        return []

    out: List[Dict[str, Any]] = []
    for item in data[:3]:
        if not isinstance(item, dict):
            continue
        fact = (item.get("fact") or "").strip()
        if not fact:
            continue
        tags = item.get("tags") or []
        if not isinstance(tags, list):
            tags = []
        tags = [str(t).strip() for t in tags if str(t).strip()][:8]
        importance = item.get("importance") or 3
        try:
            importance_i = int(importance)
        except Exception:
            importance_i = 3
        importance_i = max(1, min(5, importance_i))
        out.append({"fact": fact, "tags": tags, "importance": importance_i})

    return out








