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
VALID_KINDS = ["content", "quiz", "checklist", "upload_review", "translation", "cards", "roleplay", "writing"]

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
    # Content kind is read-only, doesn't require interaction
    if kind != "content" and not validation.get("require_interaction"):
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

        if content_type == "language_lesson":
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
    { "type": "fill_in_blank", "instruction": "Hungarian instruction", "items": [{ "prompt": "sentence with ___", "answer": "word" }] }
  ],
  "summary": "1-2 sentences summarizing what was learned (Hungarian)",
  "key_points": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],
  "common_mistakes": ["Mistake 1 and correction", "Mistake 2 and correction", "Mistake 3 and correction"],
  "estimated_minutes": ''' + str(minutes) + '''
}
RULES:
- vocabulary_table: 5-8 entries with example_sentence
- grammar_explanation.examples: 2-3 examples
- dialogues: 1 dialogue, 4+ lines
- practice_exercises: 1-2 exercises, 2+ items each
- key_points: 3-5, common_mistakes: 3-5
- ALL text in Hungarian, target language with Hungarian translation
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
  "source_lang": "hu",
  "target_lang": "en",
  "items": [
    { "prompt": "Fordítsd le: „..."", "answer_key": null }
  ],
  "hints": ["hint1", "hint2"]
}''',
        "quiz": '''
"content": {
  "title": "Specific quiz title",
  "questions": [
    {
      "q": "Question 1 text - tests understanding",
      "options": ["Option 1", "Option 2", "Option 3"],
      "answer_index": 0,
      "explanation": "Why this is correct (1-2 sentences)"
    },
    {
      "q": "Question 2 text - application scenario",
      "options": ["Option 1", "Option 2", "Option 3"],
      "answer_index": 1,
      "explanation": "Why this is correct"
    },
    {
      "q": "Question 3 text - compare/contrast",
      "options": ["Option 1", "Option 2", "Option 3"],
      "answer_index": 2,
      "explanation": "Why this is correct"
    },
    {
      "q": "Question 4 text - identify error",
      "options": ["Option 1", "Option 2", "Option 3"],
      "answer_index": 0,
      "explanation": "Why this is correct"
    }
  ],
  "estimated_minutes": 5
}
QUALITY RULES:
- MUST have 4-6 questions
- Each question MUST have exactly 3 options
- Options must be plausible, not placeholders, not repeated
- Each question MUST include explanation
''',
        "cards": '''
"content": {
  "cards": [
    { "front": "word", "back": "translation", "example": "Example sentence" },
    ... at least 5-8 cards
  ],
  "mode": "study_then_selftest"
}''',
        "roleplay": '''
"content": {
  "scene_title": "Scene description",
  "roles": { "user": "customer", "assistant": "waiter" },
  "setting": { "place": "restaurant", "tone": "friendly", "goal": "order food" },
  "opening_line": "The first line the AI says to start the dialogue",
  "must_use_phrases": ["phrase1", "phrase2", "phrase3"],
  "success_criteria": ["criterion1", "criterion2"],
  "turn_limit": 8
}''',
        "writing": '''
"content": {
  "prompt": "Writing task description",
  "constraints": ["constraint1", "constraint2"],
  "example_starter": "Example opening..."
}''',
        "checklist": '''
"content": {
  "title": "Checklist title",
  "items": [
    { "text": "Concrete step 1", "done": false },
    { "text": "Concrete step 2", "done": false },
    { "text": "Concrete step 3", "done": false },
    { "text": "Concrete step 4", "done": false },
    { "text": "Concrete step 5", "done": false }
  ],
  "estimated_minutes": 5
}
QUALITY RULES:
- MUST have 5-9 concrete items
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
    }

    system = f"""You are generating ONE Focus Item for a learning app.

STRICT OUTPUT RULES:
- Output MUST be valid JSON only. No markdown, no commentary, no extra text.
- Output MUST match the schema described below.
- kind is FIXED as: {kind}
- For kind=content: validation.require_interaction=false and input.type="none". For other kinds: validation.require_interaction=true.
- instructions_md must be short and actionable (2-3 sentences max).
- rubric_md must tell how the user knows they did it right.
- content must contain all fields required by the {kind} kind.
- All text content in {"Hungarian" if is_hu else "English"}.

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

LANGUAGE: {"Hungarian (hu)" if is_hu else "English (en)"}
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
        # Apply content chaining for all practice/quiz items in language domain
        user += f"""
IMPORTANT - CONTENT CHAINING:
The user just completed a lesson. You MUST build this item using ONLY the vocabulary,
grammar rules, and examples from THAT lesson. Do NOT introduce new material.
ONLY use the vocabulary list below (VOCABULARY section) when creating questions/tasks.

--- PRECEDING LESSON CONTENT ---
{preceding_lesson_content[:3000]}
--- END LESSON CONTENT ---
"""
        if kind == "quiz":
            user += """
Generate quiz questions that directly test:
1. Vocabulary from the vocabulary_table (word meanings, translations)
2. Grammar rules from grammar_explanation (correct forms, patterns)
3. Dialogue comprehension (what was said, appropriate responses)
4. Common mistakes awareness (identify the error)
Include at least: 2 vocab questions, 1 grammar question, 1 dialogue question, 1 mistake question (if available).
"""
        elif kind == "translation":
            user += """
Generate translation items that ONLY use lesson vocabulary and grammar patterns.
Keep sentences short and directly aligned to the lesson examples.
"""
        elif kind == "roleplay":
            user += """
Create a dialogue scenario that reuses lesson vocabulary and grammar structures.
Include must_use_phrases from the vocabulary_table where possible.
"""
        elif kind == "writing":
            user += """
Create a short writing prompt that requires using the lesson's key vocabulary
and the specific grammar rule taught in the lesson.
"""
        elif kind == "cards":
            user += """
Create flashcards ONLY from the lesson vocabulary_table (front = target language, back = Hungarian).
"""

    user += "\nOutput ONLY the JSON object, nothing else.\n"

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
    # DOMAIN GUARD: Block language-only types in non-language domains
    domain_lower = (domain or "other").lower()
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
    allowed_kinds = {"content", "quiz", "checklist", "upload_review"}
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

    if kind == "content":
        # All lessons use Haiku — Sonnet is too slow for synchronous proxy architecture
        # Language lessons get structured prompt (vocab, grammar, dialogues) within Haiku's capacity
        text = await _claude_json_haiku(
            system=system,
            user=user,
            max_tokens=2500,
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
        if retry_count < 2:
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
            )
        # Return fallback item
        fallback = _create_fallback_item(kind, topic, label, lang, minutes, domain=domain)
        if preceding_lesson_content and kind != "content":
            fallback["chain_version"] = "lesson_v2"
        return fallback

    # Force correct kind (LLM might have changed it)
    data["kind"] = kind
    data.setdefault("validation", {})
    if kind == "content":
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
        print(f"[FOCUS_ITEM] Validation failed (retry {retry_count}): {error} | kind={kind} domain={domain}")
        if retry_count < 2:
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
            )
        # Return fallback after all retries exhausted
        print(f"[FOCUS_ITEM] FALLBACK for {kind}/{domain}/{topic[:50]} after {retry_count+1} attempts")
        fallback = _create_fallback_item(kind, topic, label, lang, minutes, domain=domain)
        if preceding_lesson_content and kind != "content":
            fallback["chain_version"] = "lesson_v2"
        return fallback

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

    if kind == "content":
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


def _normalize_focus_day_items(data: Dict[str, Any], day_index: int, is_hu: bool, domain: str = "other") -> Dict[str, Any]:
    """
    Normalize and validate focus day items with DOMAIN AWARENESS:
    - Map 'roleplay' → 'exercise' for consistency (ONLY in language domains)
    - Convert language-only types to safe alternatives in non-language domains
    - Ensure minimum items exist

    DOMAIN SAFETY: Non-language domains get quiz/writing/checklist instead of
    translation/exercise/roleplay.
    """
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








