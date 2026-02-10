"""
Focus Mode - Content Generators
Generate detailed content for individual focus items on-demand.
"""
from typing import Dict, Any, Optional, List
import json
import asyncio
import re
import unicodedata

# Import Claude client
try:
    from anthropic import Anthropic
    import os
    ANTHROPIC_AVAILABLE = True
    CLAUDE_API_KEY = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    CLAUDE_MODEL = (os.getenv("CLAUDE_MODEL") or "claude-sonnet-4-20250514").strip()
    claude = Anthropic(api_key=CLAUDE_API_KEY) if CLAUDE_API_KEY else None
except Exception:
    ANTHROPIC_AVAILABLE = False
    claude = None
    CLAUDE_MODEL = ""

# Mode/task whitelist enforcement (hard freeze)
ALLOWED_MODES = {"learning", "project"}

# Learning mode: knowledge acquisition tasks
LEARNING_TASK_TYPES = {
    "lesson", "content",              # Reading/content items
    "quiz", "quiz_single", "quiz_multi", "single_select",  # Quiz variants
    "short_answer", "reflection",     # Open-ended
    "practice", "exercise",           # Practice tasks (generic or language-specific)
    "cards", "flashcard", "flashcards",  # Memorization
    "translation",                    # Language domain only
    "roleplay", "dialogue",           # Language domain only
    "writing",                        # Writing prompts (safe for all domains)
}

# Project mode: action/output-oriented tasks
PROJECT_TASK_TYPES = {"step_checklist", "checklist", "upload_review", "rubric_eval", "before_after", "quiz"}

# Language-only types (blocked for non-language domains)
LANGUAGE_ONLY_TYPES = {"translation", "roleplay", "dialogue"}

LANGUAGE_LEAKAGE_PATTERNS = [
    "fordÃ­tsd",
    "translate",
    "translation",
    "pÃ¡rbeszÃ©d",
    "roleplay",
    "role-play",
    "dialogue",
]
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

GENERIC_KEYPOINT_PATTERNS = [
    r"^tanuld meg\\b",
    r"^ismerd meg\\b",
    r"^gyakorold\\b",
    r"^figyelj\\b",
    r"^alkalmazd\\b",
    r"^ne felejtsd\\b",
]

PLACEHOLDER_OPTIONS = {"a", "b", "c", "d", "1", "2", "3"}


def _require_mode(mode: Optional[str]) -> str:
    m = (mode or "").strip().lower()
    if not m:
        raise ValueError("Missing mode")
    if m not in ALLOWED_MODES:
        raise ValueError(f"Invalid mode: {m}")
    return m


def _is_language_domain(domain: Optional[str]) -> bool:
    return (domain or "").strip().lower() in ("language", "language_learning")


def _has_language_leakage(text: str) -> bool:
    lower = (text or "").lower()
    return any(pat in lower for pat in LANGUAGE_LEAKAGE_PATTERNS)


def _normalize_for_match(text: str) -> str:
    if not text:
        return ""
    s = unicodedata.normalize("NFKD", text)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.lower().strip()


def _count_sentences(text: str) -> int:
    if not text:
        return 0
    parts = re.split(r"[.!?]+", text)
    return len([p for p in parts if p.strip()])


def _is_generic_summary(text: str, lang: str) -> bool:
    norm = _normalize_for_match(text)
    patterns = GENERIC_FILLER_PATTERNS_HU if (lang or "hu").lower().startswith("hu") else GENERIC_FILLER_PATTERNS_EN
    return any(pat in norm for pat in patterns)


def _has_generic_keypoints(points: List[str]) -> bool:
    if not points:
        return True
    for p in points:
        norm = _normalize_for_match(p)
        if len(norm) < 12:
            return True
        for pat in GENERIC_KEYPOINT_PATTERNS:
            if re.match(pat, norm):
                return True
    return False


def _options_invalid(options: List[str]) -> bool:
    if not options or len(options) != 3:
        return True
    normalized = [_normalize_for_match(o) for o in options if o]
    if any(opt in PLACEHOLDER_OPTIONS for opt in normalized):
        return True
    if len(set(normalized)) != len(normalized):
        return True
    return False


def _validate_lesson_payload(payload: Dict[str, Any], topic: str, day_title: str, lang: str) -> List[str]:
    errors: List[str] = []
    if not isinstance(payload, dict):
        return ["invalid_payload"]
    title = str(payload.get("title") or "").strip()
    summary = str(payload.get("summary") or "").strip()
    key_points = payload.get("key_points") or []
    example = str(payload.get("example") or "").strip()
    micro_task = payload.get("micro_task") or {}
    common_mistakes = payload.get("common_mistakes") or []
    minutes = payload.get("estimated_minutes")

    if not title:
        errors.append("missing_title")
    if title and day_title and _normalize_for_match(title) == _normalize_for_match(day_title):
        errors.append("title_equals_day_title")
    if title and topic and _normalize_for_match(title) == _normalize_for_match(topic):
        errors.append("title_equals_topic")
    if not summary:
        errors.append("missing_summary")
    if summary and _is_generic_summary(summary, lang):
        errors.append("generic_summary")
    if summary and not (2 <= _count_sentences(summary) <= 4):
        errors.append("summary_sentence_count")
    if not isinstance(key_points, list) or not (4 <= len(key_points) <= 7):
        errors.append("key_points_count")
    elif _has_generic_keypoints([str(p) for p in key_points]):
        errors.append("key_points_generic")
    if not example:
        errors.append("missing_example")
    if not isinstance(micro_task, dict):
        errors.append("missing_micro_task")
    else:
        if not str(micro_task.get("instruction") or "").strip():
            errors.append("micro_task_instruction")
        if not str(micro_task.get("expected_output") or "").strip():
            errors.append("micro_task_expected_output")
    if not isinstance(common_mistakes, list) or not (3 <= len(common_mistakes) <= 5):
        errors.append("common_mistakes_count")
    if minutes is None:
        errors.append("missing_estimated_minutes")
    else:
        try:
            m = int(minutes)
            if m < 3 or m > 10:
                errors.append("estimated_minutes_range")
        except Exception:
            errors.append("estimated_minutes_invalid")
    return errors


def _validate_quiz_payload(payload: Dict[str, Any], topic: str, day_title: str) -> List[str]:
    errors: List[str] = []
    if not isinstance(payload, dict):
        return ["invalid_payload"]
    title = str(payload.get("title") or "").strip()
    questions = payload.get("questions") or []
    minutes = payload.get("estimated_minutes")

    if not title:
        errors.append("missing_title")
    if title and day_title and _normalize_for_match(title) == _normalize_for_match(day_title):
        errors.append("title_equals_day_title")
    if title and topic and _normalize_for_match(title) == _normalize_for_match(topic):
        errors.append("title_equals_topic")
    if not isinstance(questions, list) or not (4 <= len(questions) <= 6):
        errors.append("questions_count")
    else:
        for q in questions:
            qtext = str(q.get("q") or q.get("question") or "").strip()
            options = q.get("options") or []
            answer_index = q.get("answer_index")
            if qtext:
                if len(qtext) < 8:
                    errors.append("question_too_short")
            else:
                errors.append("missing_question")
            if _options_invalid(options):
                errors.append("options_invalid")
            try:
                ai = int(answer_index)
                if ai < 0 or ai > 2:
                    errors.append("answer_index_invalid")
            except Exception:
                errors.append("answer_index_invalid")
            if not str(q.get("explanation") or "").strip():
                errors.append("missing_explanation")
    if minutes is None:
        errors.append("missing_estimated_minutes")
    else:
        try:
            m = int(minutes)
            if m < 3 or m > 8:
                errors.append("estimated_minutes_range")
        except Exception:
            errors.append("estimated_minutes_invalid")
    return errors


def _validate_checklist_payload(payload: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if not isinstance(payload, dict):
        return ["invalid_payload"]
    items = payload.get("items") or []
    minutes = payload.get("estimated_minutes")
    if not isinstance(items, list) or not (5 <= len(items) <= 9):
        errors.append("items_count")
    else:
        for item in items:
            text = str(item.get("text") if isinstance(item, dict) else item).strip()
            if len(text) < 8:
                errors.append("item_too_short")
    if minutes is None:
        errors.append("missing_estimated_minutes")
    else:
        try:
            m = int(minutes)
            if m < 3 or m > 10:
                errors.append("estimated_minutes_range")
        except Exception:
            errors.append("estimated_minutes_invalid")
    return errors


def _validate_upload_review_payload(payload: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if not isinstance(payload, dict):
        return ["invalid_payload"]
    prompt = str(payload.get("prompt") or "").strip()
    rubric = payload.get("rubric") or []
    minutes = payload.get("estimated_minutes")
    if not prompt:
        errors.append("missing_prompt")
    if not isinstance(rubric, list) or not (4 <= len(rubric) <= 6):
        errors.append("rubric_count")
    if minutes is None:
        errors.append("missing_estimated_minutes")
    else:
        try:
            m = int(minutes)
            if m < 3 or m > 10:
                errors.append("estimated_minutes_range")
        except Exception:
            errors.append("estimated_minutes_invalid")
    return errors


def _safe_minimal_lesson_content(topic: str, lang: str) -> Dict[str, Any]:
    is_hu = (lang or "hu").lower().startswith("hu")
    if is_hu:
        return {
            "title": f"{topic} alapjai",
            "summary": f"A(z) {topic} lÃ©nyege, hogy Ã©rthetÅ‘en lÃ¡sd a cÃ©lt Ã©s a megvalÃ³sÃ­tÃ¡s lÃ©pÃ©seit. Ez a rÃ¶vid Ã¡ttekintÃ©s segÃ­t abban, hogy mikor Ã©s hogyan hasznÃ¡ld a fogalmat a gyakorlatban.",
            "key_points": [
                f"DefinÃ­ciÃ³: mi a(z) {topic} Ã©s mire szolgÃ¡l.",
                "MÅ±kÃ¶dÃ©s: a folyamat fÅ‘ lÃ©pÃ©sei rÃ¶viden.",
                "AlkalmazÃ¡s: egy tipikus helyzet, ahol hasznos.",
                "KorlÃ¡tok: mikor nem ideÃ¡lis a hasznÃ¡lata.",
                "KapcsolÃ³dÃ¡s: hogyan illeszkedik a kapcsolÃ³dÃ³ fogalmakhoz.",
            ],
            "example": f"PÃ©lda: Egy konkrÃ©t helyzetben a(z) {topic} segÃ­t a cÃ©l elÃ©rÃ©sÃ©ben, mert lÃ©pÃ©srÅ‘l lÃ©pÃ©sre kÃ¶vethetÅ‘ megoldÃ¡st ad.",
            "micro_task": {
                "instruction": f"Ãrj 2â€“3 mondatban egy sajÃ¡t pÃ©ldÃ¡t, ahol a(z) {topic} segÃ­tene.",
                "expected_output": "2â€“3 mondat, konkrÃ©t helyzettel Ã©s cÃ©llal.",
            },
            "common_mistakes": [
                "TÃºl Ã¡ltalÃ¡nos megfogalmazÃ¡s konkrÃ©tumok nÃ©lkÃ¼l.",
                "A lÃ©pÃ©sek Ã¶sszekeverÃ©se vagy kihagyÃ¡sa.",
                "A cÃ©l Ã©s a mÃ©rhetÅ‘ eredmÃ©ny nem tiszta.",
            ],
            "estimated_minutes": 5,
        }
    return {
        "title": f"{topic} essentials",
        "summary": f"{topic} focuses on understanding the goal and the practical steps to apply it. This short overview helps you decide when to use it and what to watch for in practice.",
        "key_points": [
            f"Definition: what {topic} is and what it is for.",
            "How it works: the main steps in order.",
            "Use case: a typical scenario where it helps.",
            "Limitations: when it is not ideal.",
            "Connections: how it relates to nearby concepts.",
        ],
        "example": f"Example: In a real situation, {topic} guides the process by making the steps clear and measurable.",
        "micro_task": {
            "instruction": f"Write a 2â€“3 sentence example where {topic} would help.",
            "expected_output": "2â€“3 sentences with a concrete situation and goal.",
        },
        "common_mistakes": [
            "Using vague statements without concrete details.",
            "Skipping or mixing up steps.",
            "Unclear goal or success criteria.",
        ],
        "estimated_minutes": 5,
    }


def _safe_minimal_quiz_content(topic: str, lang: str, num_questions: int) -> Dict[str, Any]:
    is_hu = (lang or "hu").lower().startswith("hu")
    count = max(4, min(6, num_questions or 4))
    questions = []
    for i in range(count):
        if is_hu:
            qtext = f"Melyik Ã¡llÃ­tÃ¡s Ã­rja le legjobban a(z) {topic} lÃ©nyegÃ©t? ({i + 1})"
            options = [
                f"A(z) {topic} cÃ©lja egy vilÃ¡gos, mÃ©rhetÅ‘ eredmÃ©ny elÃ©rÃ©se.",
                f"A(z) {topic} csak Ã¡ltalÃ¡nos inspirÃ¡ciÃ³, lÃ©pÃ©sek nÃ©lkÃ¼l.",
                f"A(z) {topic} kizÃ¡rÃ³lag hosszÃº tÃ¡vÃº elmÃ©let, gyakorlati nÃ©lkÃ¼l.",
            ]
            questions.append({
                "q": qtext,
                "options": options,
                "answer_index": 0,
                "explanation": "Az elsÅ‘ opciÃ³ kÃ¶t cÃ©lt Ã©s gyakorlati megvalÃ³sÃ­tÃ¡st, ez illik legjobban.",
            })
        else:
            qtext = f"Which statement best describes {topic}? ({i + 1})"
            options = [
                f"{topic} aims for a clear, measurable outcome.",
                f"{topic} is only general inspiration without steps.",
                f"{topic} is purely long-term theory with no practice.",
            ]
            questions.append({
                "q": qtext,
                "options": options,
                "answer_index": 0,
                "explanation": "Option one links goal and execution, which is the best fit.",
            })
    return {
        "title": f"{topic} kvÃ­z" if is_hu else f"{topic} quiz",
        "questions": questions,
        "estimated_minutes": min(8, max(3, 3 + count)),
    }


def _safe_minimal_checklist_content(topic: str, lang: str) -> Dict[str, Any]:
    is_hu = (lang or "hu").lower().startswith("hu")
    if is_hu:
        items = [
            {"text": f"Fogalmazd meg a(z) {topic} pontos cÃ©ljÃ¡t 1 mondatban.", "done": False},
            {"text": f"Sorolj fel 3 kÃ¶vetelmÃ©nyt vagy korlÃ¡tot a(z) {topic} kapcsÃ¡n.", "done": False},
            {"text": "ÃllÃ­ts Ã¶ssze egy rÃ¶vid (3 lÃ©pÃ©s) tervet a megvalÃ³sÃ­tÃ¡shoz.", "done": False},
            {"text": "KÃ©szÃ­ts egy elsÅ‘, kicsi mÃ©rhetÅ‘ eredmÃ©nyt.", "done": False},
            {"text": "Ãrd le a kÃ¶vetkezÅ‘ lÃ©pÃ©st Ã©s a hatÃ¡ridÅ‘t.", "done": False},
        ]
        title = f"{topic} ellenÅ‘rzÅ‘lista"
    else:
        items = [
            {"text": f"Define the exact goal for {topic} in one sentence.", "done": False},
            {"text": f"List 3 constraints or requirements for {topic}.", "done": False},
            {"text": "Draft a short 3-step plan to execute it.", "done": False},
            {"text": "Create a small measurable first deliverable.", "done": False},
            {"text": "Write the next step and a deadline.", "done": False},
        ]
        title = f"{topic} checklist"
    return {
        "title": title,
        "items": items,
        "estimated_minutes": 6,
    }


def _safe_minimal_upload_review_content(topic: str, lang: str) -> Dict[str, Any]:
    is_hu = (lang or "hu").lower().startswith("hu")
    if is_hu:
        return {
            "title": f"{topic} feltÃ¶ltÃ©s",
            "prompt": f"TÃ¶lts fel egy fÃ¡jlt, ami bemutatja: {topic}.",
            "rubric": [
                "A cÃ©l vilÃ¡gosan lÃ¡tszik.",
                "A lÃ©nyegi lÃ©pÃ©sek vagy elemek benne vannak.",
                "A kimenet olvashatÃ³ Ã©s rendezett.",
                "A fÅ‘ problÃ©mÃ¡k vagy hiÃ¡nyok beazonosÃ­thatÃ³k.",
            ],
            "estimated_minutes": 5,
        }
    return {
        "title": f"{topic} upload",
        "prompt": f"Upload a file that demonstrates: {topic}.",
        "rubric": [
            "The goal is clear.",
            "Key steps or elements are present.",
            "The output is readable and organized.",
            "Main issues or gaps are identifiable.",
        ],
        "estimated_minutes": 5,
    }


def _fallback_lesson(topic: str, lang: str) -> Dict[str, Any]:
    return {
        "type": "lesson",
        "kind": "content",
        "content": _safe_minimal_lesson_content(topic, lang),
    }


def _fallback_quiz(topics: List[str], lang: str, num_questions: int) -> Dict[str, Any]:
    base_topic = topics[0] if topics else "TÃ©ma"
    return {
        "type": "quiz",
        "content": _safe_minimal_quiz_content(base_topic, lang, num_questions),
    }


def _strip_json_fences(text: str) -> str:
    """Remove markdown code fences from JSON."""
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s
    if s.endswith("```"):
        s = s.rsplit("\n", 1)[0] if "\n" in s else s
    return s.strip()


def _get_language_name(lang_code: Optional[str], hungarian: bool = True) -> str:
    """Get human-readable language name from ISO code."""
    if not lang_code:
        return "a célnyelv" if hungarian else "the target language"

    lang_code = lang_code.lower().strip()

    # Hungarian names
    if hungarian:
        names = {
            "it": "olasz",
            "en": "angol",
            "de": "német",
            "fr": "francia",
            "es": "spanyol",
            "pt": "portugál",
            "nl": "holland",
            "pl": "lengyel",
            "ru": "orosz",
            "zh": "kínai",
            "ja": "japán",
            "ko": "koreai",
            "el": "görög",
            "tr": "török",
            "ar": "arab",
            "he": "héber",
            "sv": "svéd",
            "no": "norvég",
            "da": "dán",
            "fi": "finn",
            "hu": "magyar",
        }
        return names.get(lang_code, lang_code)
    else:
        # English names
        names = {
            "it": "Italian",
            "en": "English",
            "de": "German",
            "fr": "French",
            "es": "Spanish",
            "pt": "Portuguese",
            "nl": "Dutch",
            "pl": "Polish",
            "ru": "Russian",
            "zh": "Chinese",
            "ja": "Japanese",
            "ko": "Korean",
            "el": "Greek",
            "tr": "Turkish",
            "ar": "Arabic",
            "he": "Hebrew",
            "sv": "Swedish",
            "no": "Norwegian",
            "da": "Danish",
            "fi": "Finnish",
            "hu": "Hungarian",
        }
        return names.get(lang_code, lang_code)


async def _claude_call(system: str, user: str, max_tokens: int = 1000, temperature: float = 0.4) -> str:
    """Simple Claude API call wrapper."""
    if not claude:
        return "Claude API not available"
    
    def _call():
        response = claude.messages.create(
            model=CLAUDE_MODEL,
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return response.content[0].text if response.content else ""
    
    return await asyncio.to_thread(_call)


# ============================================================================
# LESSON CONTENT GENERATOR
# ============================================================================

async def generate_lesson_content(
    *,
    topic: str,
    context: Dict[str, Any],
    domain: str,
    level: str,
    lang: str = "hu",
    mode: Optional[str] = "learning",
) -> Dict[str, Any]:
    """
    Generate structured lesson content for ONE topic.
    """
    mode = _require_mode(mode)
    if mode != "learning":
        raise ValueError(f"Forbidden mode for lesson content: {mode}")

    is_hu = (lang or "hu").lower().startswith("hu")
    day_title = context.get("day_title", "")
    day_intro = context.get("day_intro", "")

    lang_instruction = "MINDEN SZÖVEG MAGYARUL LEGYEN!" if is_hu else "Write all text in English."
    system = (
        "You generate structured lesson content.\n"
        "Output JSON only. No markdown, no extra text.\n"
        "Required keys: title, summary, key_points, example, micro_task, common_mistakes, estimated_minutes.\n"
        "summary: 2-4 sentences. key_points: 4-7 bullets. common_mistakes: 3-5 items.\n"
        "micro_task: {instruction, expected_output}. estimated_minutes: 3-10.\n"
        "Avoid generic filler. Title must not equal the day title.\n"
        f"CRITICAL: {lang_instruction}\n"
    )

    language_note = "Hungarian" if is_hu else "English"
    user_base = f"""Topic: {topic}
Day title: {day_title}
Day intro: {day_intro}
Domain: {domain}
Level: {level}
IMPORTANT: {"ALL text (title, summary, key_points, etc.) MUST be written in HUNGARIAN." if is_hu else "Write in English."}

Return ONLY a JSON object with the required keys.
"""

    for attempt in range(3):
        retry_note = ""
        if attempt > 0:
            retry_note = "\nRETRY: Be specific. No generic filler. Make the title distinct from the day title."
        text = await _claude_call(system=system, user=user_base + retry_note, max_tokens=1200, temperature=0.4)
        payload = None
        try:
            payload = json.loads(_strip_json_fences(text))
        except Exception:
            payload = None

        if isinstance(payload, dict):
            errors = _validate_lesson_payload(payload, topic, day_title, lang)
            if not errors:
                if not _is_language_domain(domain) and _has_language_leakage(json.dumps(payload)):
                    return _fallback_lesson(topic, lang)
                return {
                    "type": "lesson",
                    "kind": "content",
                    "content": payload,
                }
            print(f"[LESSON QUALITY] Rejecting content ({attempt + 1}/3): {errors}")
        else:
            print(f"[LESSON QUALITY] Invalid JSON ({attempt + 1}/3)")

    return _fallback_lesson(topic, lang)


# ============================================================================
# QUIZ CONTENT GENERATOR
# ============================================================================

async def generate_quiz_content(
    *,
    topics: List[str],
    context: Dict[str, Any],
    num_questions: int = 5,
    lang: str = "hu",
    domain: Optional[str] = None,
    mode: Optional[str] = "learning",
) -> Dict[str, Any]:
    """
    Generate quiz with multiple questions covering the topics.
    """
    mode = _require_mode(mode)
    if mode not in ALLOWED_MODES:
        raise ValueError(f"Forbidden mode for quiz content: {mode}")

    is_hu = (lang or "hu").lower().startswith("hu")
    topics_text = ", ".join(topics)
    day_title = context.get("day_title", "")
    target_count = max(4, min(6, num_questions or 4))

    lang_instruction = "MINDEN SZÖVEG MAGYARUL LEGYEN!" if is_hu else "Write all text in English."
    system = (
        "You generate structured quiz content.\n"
        "Output JSON only. No markdown, no extra text.\n"
        "Required keys: title, questions, estimated_minutes.\n"
        "questions: 4-6 items. Each item has q, options[3], answer_index (0-2), explanation.\n"
        "Options must be plausible, not placeholders, and not repeated.\n"
        "Title must not equal the day title.\n"
        f"CRITICAL: {lang_instruction}\n"
    )

    language_note = "Hungarian" if is_hu else "English"
    user_base = f"""Topics: {topics_text}
Day title: {day_title}
IMPORTANT: {"ALL text (title, questions, options, explanations) MUST be in HUNGARIAN." if is_hu else "Write in English."}
Question count target: {target_count}

Return ONLY a JSON object with the required keys.
"""

    for attempt in range(3):
        retry_note = ""
        if attempt > 0:
            retry_note = "\nRETRY: Make options specific and plausible. No A/B/C placeholders."
        text = await _claude_call(system=system, user=user_base + retry_note, max_tokens=1400, temperature=0.3)
        payload = None
        try:
            payload = json.loads(_strip_json_fences(text))
        except Exception:
            payload = None

        if isinstance(payload, dict):
            errors = _validate_quiz_payload(payload, topics[0] if topics else "", day_title)
            if not errors:
                if not _is_language_domain(domain) and _has_language_leakage(json.dumps(payload)):
                    return _fallback_quiz(topics, lang, target_count)
                return {
                    "type": "quiz",
                    "content": payload,
                }
            print(f"[QUIZ QUALITY] Rejecting content ({attempt + 1}/3): {errors}")
        else:
            print(f"[QUIZ QUALITY] Invalid JSON ({attempt + 1}/3)")

    return _fallback_quiz(topics, lang, target_count)


# ============================================================================
# CHECKLIST / UPLOAD REVIEW CONTENT GENERATORS
# ============================================================================

async def generate_checklist_content(
    *,
    topic: str,
    lang: str = "hu",
    mode: Optional[str] = "project",
) -> Dict[str, Any]:
    mode = _require_mode(mode)
    if mode not in ALLOWED_MODES:
        raise ValueError(f"Forbidden mode for checklist content: {mode}")

    payload = _safe_minimal_checklist_content(topic, lang)
    errors = _validate_checklist_payload(payload)
    if errors:
        print(f"[CHECKLIST QUALITY] Rejecting fallback: {errors}")
    return {
        "type": "checklist",
        "content": payload,
    }


async def generate_upload_review_content(
    *,
    topic: str,
    lang: str = "hu",
    mode: Optional[str] = "project",
) -> Dict[str, Any]:
    mode = _require_mode(mode)
    if mode not in ALLOWED_MODES:
        raise ValueError(f"Forbidden mode for upload_review content: {mode}")

    payload = _safe_minimal_upload_review_content(topic, lang)
    errors = _validate_upload_review_payload(payload)
    if errors:
        print(f"[UPLOAD REVIEW QUALITY] Rejecting fallback: {errors}")
    return {
        "type": "upload_review",
        "content": payload,
    }

# ============================================================================
# PRACTICE CONTENT GENERATOR
# ============================================================================

async def generate_practice_content(
    *,
    topic: str,
    context: Dict[str, Any],
    domain: str,
    practice_type: str = "exercise",  # exercise, writing, translation, roleplay, coding
    lang: str = "hu",
    target_language: Optional[str] = None,  # Only for language domain (e.g., "it", "en", "de")
    mode: Optional[str] = "learning",
) -> Dict[str, Any]:
    """
    Generate practice exercise with detailed instructions.

    Practice types:
    - exercise: Structured exercise with steps
    - writing: Writing task with prompt (safe for all domains)
    - translation: Translation practice (LANGUAGE DOMAIN ONLY!)
    - roleplay: Dialogue practice (LANGUAGE DOMAIN ONLY!)
    - coding: Code writing task (for programming domain)
    """
    mode = _require_mode(mode)
    if mode != "learning":
        raise ValueError(f"Forbidden mode for practice content: {mode}")

    is_hu = (lang or "hu").lower().startswith("hu")
    domain_lower = domain.lower()

    # DOMAIN SAFETY: Block language-specific practice types in non-language domains
    LANGUAGE_ONLY_PRACTICE_TYPES = {"translation"}

    if practice_type in LANGUAGE_ONLY_PRACTICE_TYPES and domain_lower != "language":
        print(f"[PRACTICE] Blocked '{practice_type}' for domain '{domain}' → converting to generic writing")
        practice_type = "writing"  # Safe fallback

    # For roleplay (exercise type) in non-language domains, use generic exercise format
    is_language_domain = domain_lower == "language"
    
    day_title = context.get("day_title", "")
    
    # Determine target language name for prompts
    target_lang_name = _get_language_name(target_language, is_hu) if target_language else ("a célnyelv" if is_hu else "the target language")

    if is_hu:
        type_instructions = {
            "exercise": "Strukturált gyakorlat lépésekkel",
            "writing": "Írási feladat útmutatóval",
            "translation": f"Fordítási gyakorlat magyar-{target_lang_name}",
            "coding": "Kódírási feladat specifikációval",
        }

        if practice_type == "translation" and is_language_domain:
            system = (
                "FORDÍTÁSI GYAKORLAT GENERÁLÓ\n"
                "\n"
                "📏 HOSSZ: 5-7 mondat csak!\n"
                "\n"
                "Formátum:\n"
                "1. Magyar mondat\n"
                "2. Magyar mondat\n"
                "...\n"
                "\n"
                "Rövid mondatok (max 10 szó per mondat)\n"
            )

            user = f"""Készíts 5 fordítandó mondatot:

**Téma:** {topic}
**Kontextus:** {day_title}
**Célnyelv:** {target_lang_name}

Egyszerű lista (1 mondat per sor, CSAK MAGYARUL, amit {target_lang_name} nyelvre kell fordítani):

1. [első mondat]
2. [második mondat]
3. [harmadik mondat]
4. [negyedik mondat]
5. [ötödik mondat]

Használd a lecke szókincset!
"""
        elif practice_type == "exercise" and is_language_domain:
            # Roleplay dialogue practice - LANGUAGE DOMAIN ONLY
            system = (
                "PÁRBESZÉD GYAKORLAT GENERÁLÓ\n"
                "\n"
                "📏 HOSSZ: Maximum 150 szó!\n"
                "\n"
                "Struktúra:\n"
                "1. **Szituáció** (1 mondat)\n"
                "2. **Párbeszéd példa** (4-6 üzenet, röviden)\n"
                "   👤 A: [1 rövid mondat]\n"
                "   👤 B: [1 rövid mondat]\n"
                "3. **Tippek** (2 bullet point, egyenként 1 mondat)\n"
                "\n"
                f"A párbeszéd legyen {target_lang_name} nyelven!\n"
            )

            user = f"""Készíts RÖVID párbeszéd gyakorlatot (max 150 szó):

**Téma:** {topic}
**Célnyelv:** {target_lang_name}

A párbeszéd példát {target_lang_name} nyelven írd!

**Szituáció:** [kontextus a témából]

👤 A: [üdvözlés {target_lang_name} nyelven]
👤 B: [válasz {target_lang_name} nyelven]
👤 A: [folytatás]

**Tippek:**
- [hasznos kifejezés]
- [kiejtési tipp]

RÖVID, tömör!
"""
        elif practice_type == "exercise" and not is_language_domain:
            # Generic exercise for non-language domains (NO roleplay, NO foreign language)
            system = (
                "GYAKORLAT GENERÁLÓ\n"
                "\n"
                "📏 HOSSZ: Maximum 200 szó!\n"
                "\n"
                "Struktúra:\n"
                "1. **Feladat** (1-2 mondat)\n"
                "2. **Lépések** (4-6 lépés)\n"
                "3. **Ellenőrzés** (hogyan tudd, hogy kész)\n"
            )

            user = f"""Készíts gyakorlati feladatot:

**Téma:** {topic}
**Terület:** {domain}

Adj konkrét, végrehajtható lépéseket!
"""
        else:
            # Other types (e.g., coding, speaking if exists)
            system = (
                f"GYAKORLAT GENERÁLÓ: {type_instructions.get(practice_type, 'Gyakorlat')}.\n"
                "\n"
                "Struktúra:\n"
                "1. **Feladat leírása** (2-3 mondat)\n"
                "2. **Lépések** (4-6 lépés)\n"
                "3. **Példa megoldás**\n"
                "\n"
                "📝 FORMÁTUM: Markdown\n"
            )

            user = f"""Készíts gyakorlati feladatot erről a témáról:

**Téma:** {topic}
**Típus:** {practice_type}
**Kontextus:** {day_title}
**Terület:** {domain}

Írj részletes, lépésről-lépésre instrukciókat példával.
"""
    else:
        type_instructions = {
            "exercise": "Structured exercise with steps",
            "writing": "Writing task with guidance",
            "speaking": "Speaking practice scenario",
            "coding": "Code writing task with specs",
        }
        
        system = (
            f"PRACTICE GENERATOR: {type_instructions.get(practice_type, 'Practice')}.\n"
            "\n"
            "Structure:\n"
            "1. **Task description** (2-3 sentences) - What to do?\n"
            "2. **Steps** (4-6 steps) - Precise instructions\n"
            "3. **Example solution** - One concrete example\n"
            "4. **Verification** - How to check?\n"
            "\n"
            "🎯 GOAL: Practical, easy to follow, concrete\n"
            "📝 FORMAT: Markdown\n"
        )
        
        user = f"""Create a practice task about this topic:

**Topic:** {topic}
**Type:** {practice_type}
**Context:** {day_title}
**Domain:** {domain}

Write detailed, step-by-step instructions with example.
"""
    
    text = await _claude_call(system=system, user=user, max_tokens=600, temperature=0.4)

    return {
        "type": "practice",
        "practice_type": practice_type,
        "text": text.strip(),
    }


# ============================================================================
# FLASHCARD CONTENT GENERATOR
# ============================================================================

async def generate_flashcard_content(
    *,
    topic: str,
    context: Dict[str, Any],
    domain: str = "",
    num_cards: int = 8,
    lang: str = "hu",
    target_language: Optional[str] = None,
    mode: Optional[str] = "learning",
) -> Dict[str, Any]:
    """
    Generate flashcards for memorization.
    For language domain: word/phrase cards with translations.
    For other domains: concept/definition cards.
    """
    mode = _require_mode(mode)
    if mode != "learning":
        raise ValueError(f"Forbidden mode for flashcard content: {mode}")

    is_language = _is_language_domain(domain)
    is_hu = (lang or "hu").lower().startswith("hu")
    target_lang_name = _get_language_name(target_language, is_hu) if target_language else ""

    if is_language and target_lang_name:
        # Language domain: vocabulary cards with target language
        if is_hu:
            system = (
                f"SZÓKÁRTYA GENERÁTOR: {target_lang_name} szókincs memorizálásához.\n"
                "\n"
                "Követelmények:\n"
                f"- {num_cards} különböző kártya\n"
                f"- Előlap: {target_lang_name} szó/kifejezés\n"
                "- Hátlap: Magyar fordítás + rövid példa\n"
                "\n"
                "📏 KÁRTYÁNKÉNT: Front max 5 szó, Back max 12 szó!\n"
            )
            user = f"""Készíts {num_cards} {target_lang_name} szókártyát:

**Téma:** {topic}

JSON formátum:
{{
  "cards": [
    {{"front": "[{target_lang_name} szó]", "back": "[magyar fordítás]"}}
  ]
}}

A témához kapcsolódó szavakat adj!
"""
        else:
            system = (
                f"VOCABULARY FLASHCARD GENERATOR: {target_lang_name} vocabulary.\n"
                "\n"
                f"- {num_cards} different cards\n"
                f"- Front: {target_lang_name} word/phrase\n"
                "- Back: English translation\n"
            )
            user = f"""Create {num_cards} {target_lang_name} vocabulary flashcards:

**Topic:** {topic}

JSON format:
{{
  "cards": [
    {{"front": "[{target_lang_name} word]", "back": "[English translation]"}}
  ]
}}
"""
    else:
        # Non-language domain: concept/definition cards
        if is_hu:
            system = (
                "FOGALOMKÁRTYA GENERÁTOR: Definíciók memorizálásához.\n"
                "\n"
                "Követelmények:\n"
                f"- {num_cards} különböző kártya\n"
                "- Előlap: Fogalom neve\n"
                "- Hátlap: Rövid, tömör definíció\n"
                "\n"
                "📏 KÁRTYÁNKÉNT: Front max 5 szó, Back max 15 szó!\n"
            )
            user = f"""Készíts {num_cards} fogalomkártyát:

**Téma:** {topic}
**Terület:** {domain}

JSON formátum:
{{
  "cards": [
    {{"front": "[fogalom]", "back": "[definíció]"}}
  ]
}}

A témához kapcsolódó kulcsfogalmakat adj!
"""
        else:
            system = (
                "CONCEPT FLASHCARD GENERATOR: For memorizing definitions.\n"
                "\n"
                f"- {num_cards} different cards\n"
                "- Front: Concept name\n"
                "- Back: Brief definition\n"
            )
            user = f"""Create {num_cards} concept flashcards:

**Topic:** {topic}
**Domain:** {domain}

JSON format:
{{
  "cards": [
    {{"front": "[concept]", "back": "[definition]"}}
  ]
}}
"""
    
    text = await _claude_call(system=system, user=user, max_tokens=600, temperature=0.3)
    
    try:
        data = json.loads(_strip_json_fences(text))
        return {
            "type": "flashcard",
            "cards": data.get("cards", [])
        }
    except Exception:
        return {
            "type": "flashcard",
            "cards": []
        }


# ============================================================================
# TASK CONTENT GENERATOR
# ============================================================================

async def generate_task_content(
    *,
    topic: str,
    context: Dict[str, Any],
    domain: str = "",
    lang: str = "hu",
    mode: Optional[str] = "learning",
) -> Dict[str, Any]:
    """
    Generate simple checkable task.
    """
    mode = _require_mode(mode)
    if mode != "learning":
        raise ValueError(f"Forbidden mode for task content: {mode}")

    is_hu = (lang or "hu").lower().startswith("hu")
    
    if is_hu:
        system = (
            "FELADAT GENERÁLÓ: Rövid, kipipálható feladatok.\n"
            "\n"
            "📏 HOSSZ: 1 rövid mondat per task!\n"
            "\n"
            "Követelmények:\n"
            "- 1 mondatos instrukció\n"
            "- Konkrét, mérhető\n"
            "- 2-5 percben elvégezhető\n"
        )

        user = f"""Készíts 1 RÖVID feladatot:

**Téma:** {topic}
**Terület:** {domain or "általános"}

1 mondat, gyorsan elvégezhető!
"""
    else:
        system = (
            "TASK GENERATOR: Short, checkable tasks.\n"
            "\n"
            "📏 LENGTH: 1 short sentence per task!\n"
            "\n"
            "Requirements:\n"
            "- 1 sentence instruction\n"
            "- Concrete, measurable\n"
            "- Can be done in 2-5 minutes\n"
        )

        user = f"""Create 1 SHORT task:

**Topic:** {topic}
**Domain:** {domain or "general"}

1 sentence, quick to complete!
"""
    
    text = await _claude_call(system=system, user=user, max_tokens=200, temperature=0.4)
    
    return {
        "type": "task",
        "text": text.strip(),
    }


# ============================================================================
# TRANSLATION CONTENT GENERATOR (LANGUAGE DOMAIN ONLY)
# ============================================================================

async def generate_translation_content(
    *,
    topic: str,
    context: Dict[str, Any],
    target_language: str,
    num_sentences: int = 5,
    lang: str = "hu",
    mode: Optional[str] = "learning",
) -> Dict[str, Any]:
    """
    Generate translation exercise. LANGUAGE DOMAIN ONLY.
    Returns sentences to translate from source language to target language.
    """
    mode = _require_mode(mode)
    if mode != "learning":
        raise ValueError(f"Forbidden mode for translation content: {mode}")

    is_hu = (lang or "hu").lower().startswith("hu")
    target_lang_name = _get_language_name(target_language, is_hu)
    day_title = context.get("day_title", "")
    count = max(4, min(8, num_sentences))

    if is_hu:
        system = (
            f"FORDÍTÁSI GYAKORLAT GENERÁLÓ\n"
            f"Célnyelv: {target_lang_name}\n"
            "\n"
            "Követelmények:\n"
            f"- {count} mondat magyarul, amit le kell fordítani\n"
            "- Mondatonként max 12 szó\n"
            "- A témához kapcsolódó szókincs\n"
            "- Fokozatos nehézség (könnyűtől nehézig)\n"
            "\n"
            "JSON formátum kötelező!\n"
        )
        user = f"""Készíts {count} fordítandó mondatot:

**Téma:** {topic}
**Kontextus:** {day_title}
**Célnyelv:** {target_lang_name}

JSON:
{{
  "title": "Fordítási gyakorlat: {topic}",
  "target_language": "{target_language}",
  "sentences": [
    {{"source": "Magyar mondat itt.", "hint": "kulcsszó segítség"}},
    ...
  ],
  "estimated_minutes": 5
}}
"""
    else:
        system = (
            f"TRANSLATION EXERCISE GENERATOR\n"
            f"Target language: {target_lang_name}\n"
            "\n"
            "Requirements:\n"
            f"- {count} sentences to translate\n"
            "- Max 12 words per sentence\n"
            "- Topic-relevant vocabulary\n"
            "- Progressive difficulty\n"
        )
        user = f"""Create {count} sentences to translate:

**Topic:** {topic}
**Target language:** {target_lang_name}

JSON:
{{
  "title": "Translation practice: {topic}",
  "target_language": "{target_language}",
  "sentences": [
    {{"source": "English sentence here.", "hint": "keyword help"}},
    ...
  ],
  "estimated_minutes": 5
}}
"""

    text = await _claude_call(system=system, user=user, max_tokens=800, temperature=0.3)

    try:
        data = json.loads(_strip_json_fences(text))
        return {
            "type": "translation",
            "content": data,
        }
    except Exception:
        # Fallback
        return {
            "type": "translation",
            "content": {
                "title": f"Fordítás: {topic}" if is_hu else f"Translation: {topic}",
                "target_language": target_language,
                "sentences": [],
                "estimated_minutes": 5,
            },
        }


# ============================================================================
# ROLEPLAY/DIALOGUE CONTENT GENERATOR (LANGUAGE DOMAIN ONLY)
# ============================================================================

async def generate_roleplay_content(
    *,
    topic: str,
    context: Dict[str, Any],
    target_language: str,
    lang: str = "hu",
    mode: Optional[str] = "learning",
) -> Dict[str, Any]:
    """
    Generate roleplay/dialogue practice. LANGUAGE DOMAIN ONLY.
    Returns a scenario with example dialogue and prompts.
    """
    mode = _require_mode(mode)
    if mode != "learning":
        raise ValueError(f"Forbidden mode for roleplay content: {mode}")

    is_hu = (lang or "hu").lower().startswith("hu")
    target_lang_name = _get_language_name(target_language, is_hu)
    day_title = context.get("day_title", "")

    if is_hu:
        system = (
            f"PÁRBESZÉD GYAKORLAT GENERÁLÓ\n"
            f"Célnyelv: {target_lang_name}\n"
            "\n"
            "Struktúra:\n"
            "1. Szituáció leírása (2 mondat)\n"
            "2. Példa párbeszéd (6-8 üzenet, célnyelven)\n"
            "3. Hasznos kifejezések (4-6 db)\n"
            "4. Gyakorlási tippek (2-3 db)\n"
            "\n"
            "JSON formátum kötelező!\n"
        )
        user = f"""Készíts párbeszéd gyakorlatot:

**Téma:** {topic}
**Kontextus:** {day_title}
**Célnyelv:** {target_lang_name}

JSON:
{{
  "title": "Párbeszéd: {topic}",
  "target_language": "{target_language}",
  "scenario": "Szituáció leírása magyarul...",
  "dialogue": [
    {{"speaker": "A", "text": "[{target_lang_name} szöveg]", "translation": "[magyar fordítás]"}},
    {{"speaker": "B", "text": "[{target_lang_name} szöveg]", "translation": "[magyar fordítás]"}}
  ],
  "useful_phrases": [
    {{"phrase": "[{target_lang_name}]", "meaning": "[magyar]"}}
  ],
  "tips": ["tipp1", "tipp2"],
  "estimated_minutes": 8
}}
"""
    else:
        system = (
            f"DIALOGUE PRACTICE GENERATOR\n"
            f"Target language: {target_lang_name}\n"
            "\n"
            "Structure:\n"
            "1. Scenario description (2 sentences)\n"
            "2. Example dialogue (6-8 exchanges, in target language)\n"
            "3. Useful phrases (4-6)\n"
            "4. Practice tips (2-3)\n"
        )
        user = f"""Create dialogue practice:

**Topic:** {topic}
**Target language:** {target_lang_name}

JSON:
{{
  "title": "Dialogue: {topic}",
  "target_language": "{target_language}",
  "scenario": "Scenario description...",
  "dialogue": [
    {{"speaker": "A", "text": "[{target_lang_name} text]", "translation": "[English]"}},
    {{"speaker": "B", "text": "[{target_lang_name} text]", "translation": "[English]"}}
  ],
  "useful_phrases": [
    {{"phrase": "[{target_lang_name}]", "meaning": "[English]"}}
  ],
  "tips": ["tip1", "tip2"],
  "estimated_minutes": 8
}}
"""

    text = await _claude_call(system=system, user=user, max_tokens=1000, temperature=0.4)

    try:
        data = json.loads(_strip_json_fences(text))
        return {
            "type": "roleplay",
            "content": data,
        }
    except Exception:
        return {
            "type": "roleplay",
            "content": {
                "title": f"Párbeszéd: {topic}" if is_hu else f"Dialogue: {topic}",
                "target_language": target_language,
                "scenario": "",
                "dialogue": [],
                "useful_phrases": [],
                "tips": [],
                "estimated_minutes": 8,
            },
        }


# ============================================================================
# WRITING CONTENT GENERATOR (SAFE FOR ALL DOMAINS)
# ============================================================================

async def generate_writing_content(
    *,
    topic: str,
    context: Dict[str, Any],
    domain: str = "",
    lang: str = "hu",
    mode: Optional[str] = "learning",
) -> Dict[str, Any]:
    """
    Generate writing prompt/task. Safe for all domains (no language leakage).
    """
    mode = _require_mode(mode)
    if mode != "learning":
        raise ValueError(f"Forbidden mode for writing content: {mode}")

    is_hu = (lang or "hu").lower().startswith("hu")
    day_title = context.get("day_title", "")

    if is_hu:
        system = (
            "ÍRÁSI FELADAT GENERÁLÓ\n"
            "\n"
            "Struktúra:\n"
            "1. Feladat címe\n"
            "2. Prompt (mit kell írni, 2-3 mondat)\n"
            "3. Iránymutatás (4-5 pont)\n"
            "4. Példa kezdés (1-2 mondat)\n"
            "\n"
            "JSON formátum!\n"
        )
        user = f"""Készíts írási feladatot:

**Téma:** {topic}
**Terület:** {domain or "általános"}
**Kontextus:** {day_title}

JSON:
{{
  "title": "Írási feladat: {topic}",
  "prompt": "Mit kell írni...",
  "guidelines": ["pont1", "pont2", "pont3", "pont4"],
  "example_start": "Példa kezdő mondat...",
  "word_count_target": 150,
  "estimated_minutes": 10
}}
"""
    else:
        system = (
            "WRITING TASK GENERATOR\n"
            "\n"
            "Structure:\n"
            "1. Task title\n"
            "2. Prompt (what to write, 2-3 sentences)\n"
            "3. Guidelines (4-5 points)\n"
            "4. Example start (1-2 sentences)\n"
        )
        user = f"""Create writing task:

**Topic:** {topic}
**Domain:** {domain or "general"}

JSON:
{{
  "title": "Writing task: {topic}",
  "prompt": "What to write...",
  "guidelines": ["point1", "point2", "point3", "point4"],
  "example_start": "Example opening sentence...",
  "word_count_target": 150,
  "estimated_minutes": 10
}}
"""

    text = await _claude_call(system=system, user=user, max_tokens=600, temperature=0.4)

    try:
        data = json.loads(_strip_json_fences(text))
        return {
            "type": "writing",
            "content": data,
        }
    except Exception:
        return {
            "type": "writing",
            "content": {
                "title": f"Írás: {topic}" if is_hu else f"Writing: {topic}",
                "prompt": topic,
                "guidelines": [],
                "example_start": "",
                "word_count_target": 150,
                "estimated_minutes": 10,
            },
        }


# ============================================================================
# VALIDATION HELPERS
# ============================================================================

def _validate_translation_payload(payload: Dict[str, Any]) -> List[str]:
    """Validate translation content structure."""
    errors: List[str] = []
    if not isinstance(payload, dict):
        return ["invalid_payload"]

    content = payload.get("content", payload)
    sentences = content.get("sentences") or []

    if not isinstance(sentences, list) or len(sentences) < 3:
        errors.append("sentences_count_low")
    for s in sentences:
        if not isinstance(s, dict):
            errors.append("sentence_invalid_format")
            continue
        if not s.get("source"):
            errors.append("sentence_missing_source")

    if not content.get("target_language"):
        errors.append("missing_target_language")

    return errors


def _validate_roleplay_payload(payload: Dict[str, Any]) -> List[str]:
    """Validate roleplay/dialogue content structure."""
    errors: List[str] = []
    if not isinstance(payload, dict):
        return ["invalid_payload"]

    content = payload.get("content", payload)
    dialogue = content.get("dialogue") or []

    if not content.get("scenario"):
        errors.append("missing_scenario")
    if not isinstance(dialogue, list) or len(dialogue) < 4:
        errors.append("dialogue_too_short")
    if not content.get("target_language"):
        errors.append("missing_target_language")

    return errors


def _validate_writing_payload(payload: Dict[str, Any]) -> List[str]:
    """Validate writing content structure."""
    errors: List[str] = []
    if not isinstance(payload, dict):
        return ["invalid_payload"]

    content = payload.get("content", payload)

    if not content.get("prompt"):
        errors.append("missing_prompt")
    guidelines = content.get("guidelines") or []
    if not isinstance(guidelines, list) or len(guidelines) < 2:
        errors.append("guidelines_too_few")

    return errors


def _validate_flashcard_payload(payload: Dict[str, Any]) -> List[str]:
    """Validate flashcard content structure."""
    errors: List[str] = []
    if not isinstance(payload, dict):
        return ["invalid_payload"]

    cards = payload.get("cards") or []
    if not isinstance(cards, list) or len(cards) < 4:
        errors.append("cards_count_low")
    for card in cards:
        if not isinstance(card, dict):
            errors.append("card_invalid_format")
            continue
        if not card.get("front"):
            errors.append("card_missing_front")
        if not card.get("back"):
            errors.append("card_missing_back")

    return errors


def validate_item_content(item_type: str, payload: Dict[str, Any], topic: str = "", day_title: str = "", lang: str = "hu") -> List[str]:
    """
    Unified validation for all item content types.
    Returns list of error codes (empty = valid).
    """
    item_type = (item_type or "").lower().strip()

    if item_type in ("lesson", "content"):
        return _validate_lesson_payload(payload.get("content", payload), topic, day_title, lang)
    elif item_type in ("quiz", "quiz_single", "quiz_multi", "single_select"):
        return _validate_quiz_payload(payload.get("content", payload), topic, day_title)
    elif item_type in ("checklist", "step_checklist"):
        return _validate_checklist_payload(payload.get("content", payload))
    elif item_type == "upload_review":
        return _validate_upload_review_payload(payload.get("content", payload))
    elif item_type == "translation":
        return _validate_translation_payload(payload)
    elif item_type in ("roleplay", "dialogue"):
        return _validate_roleplay_payload(payload)
    elif item_type == "writing":
        return _validate_writing_payload(payload)
    elif item_type in ("flashcard", "flashcards", "cards"):
        return _validate_flashcard_payload(payload)
    else:
        return []  # Unknown type, no validation


# ============================================================================
# UNIFIED DISPATCH FUNCTION
# ============================================================================

async def generate_item_content(
    *,
    item_type: str,
    topic: str,
    context: Dict[str, Any],
    domain: str = "",
    level: str = "intermediate",
    lang: str = "hu",
    target_language: Optional[str] = None,
    mode: str = "learning",
    num_questions: int = 5,
    num_cards: int = 8,
    num_sentences: int = 5,
    topics_list: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Unified dispatch function for generating any type of focus item content.

    Handles domain enforcement:
    - translation, roleplay, dialogue: ONLY allowed for language domain
    - For non-language domains requesting these types: falls back to writing

    Returns: {"type": str, "content": dict} or {"type": str, ...}
    """
    mode = _require_mode(mode)
    item_type = (item_type or "").lower().strip()
    is_language = _is_language_domain(domain)

    # DOMAIN ENFORCEMENT: Block language-only types for non-language domains
    if item_type in LANGUAGE_ONLY_TYPES and not is_language:
        print(f"[DISPATCH] Blocked '{item_type}' for domain '{domain}' → falling back to 'writing'")
        item_type = "writing"

    # MODE ENFORCEMENT
    if mode == "learning" and item_type not in LEARNING_TASK_TYPES:
        return {"error": "task_not_allowed_for_mode", "requested_type": item_type}
    if mode == "project" and item_type not in PROJECT_TASK_TYPES:
        return {"error": "task_not_allowed_for_mode", "requested_type": item_type}

    # DISPATCH TO GENERATORS
    try:
        if item_type in ("lesson", "content"):
            return await generate_lesson_content(
                topic=topic,
                context=context,
                domain=domain,
                level=level,
                lang=lang,
                mode=mode,
            )

        elif item_type in ("quiz", "quiz_single", "quiz_multi", "single_select"):
            topics = topics_list or [topic]
            return await generate_quiz_content(
                topics=topics,
                context=context,
                num_questions=num_questions,
                lang=lang,
                domain=domain,
                mode=mode,
            )

        elif item_type == "translation":
            if not target_language:
                return {"error": "missing_target_language"}
            return await generate_translation_content(
                topic=topic,
                context=context,
                target_language=target_language,
                num_sentences=num_sentences,
                lang=lang,
                mode=mode,
            )

        elif item_type in ("roleplay", "dialogue"):
            if not target_language:
                return {"error": "missing_target_language"}
            return await generate_roleplay_content(
                topic=topic,
                context=context,
                target_language=target_language,
                lang=lang,
                mode=mode,
            )

        elif item_type == "writing":
            return await generate_writing_content(
                topic=topic,
                context=context,
                domain=domain,
                lang=lang,
                mode=mode,
            )

        elif item_type in ("flashcard", "flashcards", "cards"):
            return await generate_flashcard_content(
                topic=topic,
                context=context,
                domain=domain,
                num_cards=num_cards,
                lang=lang,
                target_language=target_language,
                mode=mode,
            )

        elif item_type in ("practice", "exercise"):
            # Determine practice type based on domain
            if is_language:
                practice_type = "exercise"  # Will use roleplay-style for language
            else:
                practice_type = "exercise"  # Generic exercise for other domains
            return await generate_practice_content(
                topic=topic,
                context=context,
                domain=domain,
                practice_type=practice_type,
                lang=lang,
                target_language=target_language,
                mode=mode,
            )

        elif item_type == "task":
            return await generate_task_content(
                topic=topic,
                context=context,
                domain=domain,
                lang=lang,
                mode=mode,
            )

        elif item_type in ("checklist", "step_checklist"):
            return await generate_checklist_content(
                topic=topic,
                lang=lang,
                mode="project" if mode == "project" else mode,
            )

        elif item_type == "upload_review":
            return await generate_upload_review_content(
                topic=topic,
                lang=lang,
                mode="project" if mode == "project" else mode,
            )

        else:
            return {"error": "unknown_item_type", "requested_type": item_type}

    except Exception as e:
        print(f"[DISPATCH ERROR] {item_type} generation failed: {e}")
        return {"error": "generation_failed", "message": str(e)}
