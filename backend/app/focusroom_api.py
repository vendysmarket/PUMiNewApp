"""
FocusRoom API — Interactive Learning Room endpoints.

Architecture: Session Orchestrator (NOT a chat agent).
The tutor executes a script. User input is only allowed during Task phase.
Retry-gate: wrong answers get hints, not solutions.

MVP: No DB persistence. Frontend manages state in localStorage.
Backend handles: plan generation, content generation, answer evaluation, TTS.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/focusroom", tags=["focusroom"])

# Reuse LLM client from existing code
try:
    from .llm_client import (
        generate_focus_item,
        generate_focus_outline,
        _claude_json_haiku,
        _strip_json_fences,
        _extract_json_object,
        CLAUDE_MODEL_HAIKU,
    )
    LLM_AVAILABLE = True
except Exception as e:
    print(f"[focusroom] LLM import failed: {e}")
    LLM_AVAILABLE = False

# ElevenLabs TTS
ELEVENLABS_API_KEY = (os.getenv("ELEVENLABS_API_KEY") or "").strip()

# Hardcoded voice fallbacks — used when env vars not set
# Override in Railway: ELEVENLABS_VOICE_ID_HU / _EN
_VOICE_FALLBACKS: dict[str, str] = {
    "hu": "3DRcczmb3qwp5aVD9M9E",  # custom HU voice
    "en": "21m00Tcm4TlvDq8ikWAM",  # Rachel — natural EN
}
_VOICE_ENV_KEYS: dict[str, str] = {
    "hu": "ELEVENLABS_VOICE_ID_HU",
    "en": "ELEVENLABS_VOICE_ID_EN",
}

def resolve_tts_voice(locale: str) -> str:
    """
    Deterministically map locale → ElevenLabs voice ID.
    Precedence: env var > hardcoded fallback.
    Logs WARNING when falling back so it's always visible in Railway logs.
    """
    locale_lower = (locale or "hu").strip().lower()
    env_key = _VOICE_ENV_KEYS.get(locale_lower)
    if env_key:
        env_val = os.getenv(env_key, "").strip()
        if env_val:
            return env_val
        fallback = _VOICE_FALLBACKS.get(locale_lower, _VOICE_FALLBACKS["hu"])
        print(f"[TTS] WARNING: {env_key} not set — using hardcoded fallback voice={fallback} for locale={locale_lower}")
        return fallback
    fallback = _VOICE_FALLBACKS["hu"]
    print(f"[TTS] WARNING: unknown locale='{locale_lower}' — falling back to HU voice={fallback}")
    return fallback

# Test sentences for /tts/voice-test endpoint
_TTS_TEST_HU = [
    "Ha 100 000 forintod van, és félreteszel 12,5%-ot, az 12 500 forint.",
    "A megtakarításom célja: 3 hónap vésztartalék.",
    "Költségvetés: bevétel mínusz kiadás egyenlő megtakarítás.",
]
_TTS_TEST_EN = [
    "If you have 100,000 forints and save 12.5 percent, that equals 12,500 forints.",
    "My savings goal: build a three-month emergency fund.",
    "Budget: income minus expenses equals savings.",
]

# Auth helper
try:
    from .guard import get_user_id
except Exception:
    async def get_user_id(request: Request) -> str:
        return "anonymous"


# ============================================================================
# Request / Response Models
# ============================================================================

class CreateRoomReq(BaseModel):
    domain: str  # "language" | "smart_learning"
    target_language: Optional[str] = None
    track: Optional[str] = None
    level: str = "beginner"
    category: Optional[str] = None
    minutes_per_day: int = 20
    duration_days: int = 7
    tone: Optional[str] = None

class StartDayReq(BaseModel):
    room_id: str
    day_index: int
    domain: str
    target_language: Optional[str] = None
    track: Optional[str] = None
    level: Optional[str] = "beginner"
    category: Optional[str] = None
    minutes_per_day: Optional[int] = 20
    day_title: Optional[str] = None

class EvaluateReq(BaseModel):
    room_id: str
    item_id: str
    kind: str
    user_answer: Any
    attempt: int = 1           # which attempt (1, 2, 3)
    # Context fields
    source: Optional[str] = None
    target_lang: Optional[str] = None
    question: Optional[str] = None
    correct_answer: Optional[str] = None
    prompt: Optional[str] = None
    options: Optional[List[str]] = None

class TtsReq(BaseModel):
    text: str
    voice_id: Optional[str] = None
    locale: Optional[str] = "hu"
    model_config = {"protected_namespaces": ()}

class VoiceTestReq(BaseModel):
    locale: str = "hu"
    text: Optional[str] = None   # None → use built-in test sentence
    sentence_index: int = 0      # 0-2 for the three test sentences

class DayTasksReq(BaseModel):
    room_id: str
    day_index: int
    domain: str
    target_language: Optional[str] = None
    track: Optional[str] = None
    level: Optional[str] = "beginner"
    category: Optional[str] = None
    minutes_per_day: Optional[int] = 20
    day_title: Optional[str] = None
    lesson_md: Optional[str] = None  # for content chaining

class CloseReq(BaseModel):
    room_id: str
    day_index: int
    items_completed: int = 0
    items_total: int = 0
    score_sum: int = 0


# ============================================================================
# POST /focusroom/create
# ============================================================================

LANG_LABELS = {
    "english": "Angol", "german": "Német", "spanish": "Spanyol",
    "italian": "Olasz", "french": "Francia", "greek": "Görög",
    "portuguese": "Portugál", "korean": "Koreai", "japanese": "Japán",
    "chinese": "Kínai", "russian": "Orosz", "arabic": "Arab",
}
CATEGORY_LABELS = {
    "financial_basics": "Pénzügyi alapok",
    "digital_literacy": "Digitális jártasság",
    "communication_social": "Kommunikáció",
    "study_brain_skills": "Tanulás & agy",
    "knowledge_bites": "Tudásfalatok",
}

@router.post("/create")
async def create_room(req: CreateRoomReq, request: Request):
    """
    Create a FocusRoom + generate 7-day plan (titles only).
    No DB — frontend stores in localStorage.
    """
    uid = await get_user_id(request)
    room_id = str(uuid.uuid4())

    if req.domain == "language" and req.target_language:
        goal = f"{LANG_LABELS.get(req.target_language, req.target_language)} nyelvtanulás"
    elif req.domain == "smart_learning" and req.category:
        goal = CATEGORY_LABELS.get(req.category, req.category)
    else:
        goal = "Tanulási terv"

    # Generate plan outline via LLM
    if LLM_AVAILABLE:
        try:
            outline = await generate_focus_outline(
                user_goal=goal,
                lang="hu",
                focus_type="learning",
                domain=req.domain,
                level=req.level,
                minutes_per_day=req.minutes_per_day,
                duration_days=req.duration_days,
            )
            days = [
                {"day_index": d.get("dayIndex", i + 1), "title": d.get("title", f"Nap {i + 1}")}
                for i, d in enumerate(outline.get("days", []))
            ]
        except Exception as e:
            print(f"[focusroom/create] Outline generation failed: {e}")
            days = [{"day_index": i + 1, "title": f"Nap {i + 1}"} for i in range(req.duration_days)]
    else:
        days = [{"day_index": i + 1, "title": f"Nap {i + 1}"} for i in range(req.duration_days)]

    return {
        "ok": True,
        "room_id": room_id,
        "plan": {"days": days},
    }


# ============================================================================
# POST /focusroom/day/start
# Returns: lesson_md, script_steps[], tasks[]
# ============================================================================

LANGUAGE_DAY_ITEMS = [
    {"kind": "lesson", "label": "Lecke"},
    {"kind": "quiz", "label": "Kvíz"},
    {"kind": "translation", "label": "Fordítás"},
    {"kind": "writing", "label": "Írás"},
]

SMART_DAY_ITEMS = [
    {"kind": "smart_lesson", "label": "Lecke"},
    {"kind": "quiz", "label": "Kvíz"},
    {"kind": "writing", "label": "Gondolkodás"},
]


@router.post("/day/start")
async def start_day(req: StartDayReq, request: Request):
    """
    Phase 1: Generate lesson only (~5s). Returns tasks: [].
    Practice items are fetched lazily via POST /day/tasks when teach phase ends.
    This keeps each request under the Supabase Edge Function ~10s wall-clock limit.
    """
    import time
    t0 = time.monotonic()

    uid = await get_user_id(request)

    if not LLM_AVAILABLE:
        raise HTTPException(status_code=503, detail="LLM not available")

    domain = req.domain or "language"
    level = req.level or "beginner"
    day_title = req.day_title or f"Nap {req.day_index}"
    target_lang = req.target_language or ""
    minutes = req.minutes_per_day or 20

    templates = LANGUAGE_DAY_ITEMS if domain == "language" else SMART_DAY_ITEMS
    per_item_minutes = max(3, minutes // len(templates))
    LESSON_MAX_RETRIES = 2

    # ── Generate lesson only ──
    lesson_tmpl = templates[0]  # always lesson or smart_lesson
    lesson_md = ""
    lesson_content_raw = {}

    try:
        lesson_result = await generate_focus_item(
            item_type=lesson_tmpl["kind"],
            practice_type=None,
            topic=day_title,
            label=lesson_tmpl["label"],
            day_title=day_title,
            domain=domain,
            level=level,
            lang="hu",  # UI/instruction language is always Hungarian
            minutes=per_item_minutes,
            user_goal=day_title,
            settings={
                "tone": "casual",
                "difficulty": "normal",
                "target_language": target_lang,   # e.g. "english", "korean" — drives content language
                "track": req.track or "",
            },
            preceding_lesson_content=None,
            max_retries=LESSON_MAX_RETRIES,
        )
        if lesson_result:
            lesson_md = _build_lesson_md(lesson_result)
            lesson_content_raw = lesson_result
    except Exception as e:
        print(f"[focusroom/day/start] Lesson generation failed: {e}")

    t_end = time.monotonic()
    print(f"[focusroom/day/start] TOTAL: {t_end - t0:.1f}s | body_md len={len(lesson_md)} | domain={domain} day={req.day_index}")

    # Last-resort fallback — lesson_md must never be empty
    if not lesson_md:
        print(f"[focusroom/day/start] WARNING: empty lesson | domain={domain} target_language={target_lang} track={req.track} day_title={day_title}")
        lesson_md = f"# {day_title}\n\nA mai lecke tartalma generálás alatt volt. Folytasd a feladatokkal!"

    script_steps = _build_script_steps(lesson_content_raw, day_title)

    # tts_script: full transcript of all script_steps for debug / transcript display.
    # Frontend must play from script_steps (sequential), NOT from tts_script (too long for single TTS).
    tts_script = "\n\n".join(s["text"] for s in script_steps)

    return {
        "ok": True,
        "lesson_md": lesson_md,
        "script_steps": script_steps,
        "tts_script": tts_script,
        "tts_script_is_transcript": True,  # marker: this is a transcript, not for single-shot TTS
        "tts_locale": "hu",               # script_steps are always in Hungarian
        "tasks": [],                       # fetched lazily by /day/tasks
    }


# ============================================================================
# POST /focusroom/day/tasks
# Phase 2: Generate practice items (called lazily at teach→task transition)
# ============================================================================

@router.post("/day/tasks")
async def fetch_day_tasks(req: DayTasksReq, request: Request):
    """
    Phase 2: Generate practice items in parallel (~5-8s).
    Called by the frontend when the teach phase ends (user has been reading
    the lesson for 10-30s, so this never races with day/start).
    lesson_md is passed for content chaining.
    """
    import time
    t0 = time.monotonic()

    uid = await get_user_id(request)

    if not LLM_AVAILABLE:
        raise HTTPException(status_code=503, detail="LLM not available")

    domain = req.domain or "language"
    level = req.level or "beginner"
    day_title = req.day_title or f"Nap {req.day_index}"
    target_lang = req.target_language or ""
    minutes = req.minutes_per_day or 20
    lesson_md = req.lesson_md or None

    templates = LANGUAGE_DAY_ITEMS if domain == "language" else SMART_DAY_ITEMS
    practice_templates = templates[1:]
    per_item_minutes = max(3, minutes // len(templates))
    TASK_MAX_RETRIES = 0

    async def gen_task(idx: int, tmpl: Dict[str, str]) -> Dict[str, Any]:
        item_id = f"room-{req.room_id[:8]}-d{req.day_index}-{tmpl['kind']}-{idx}"
        kind = tmpl["kind"]
        try:
            result = await generate_focus_item(
                item_type=kind,
                practice_type=kind,
                topic=day_title,
                label=tmpl["label"],
                day_title=day_title,
                domain=domain,
                level=level,
                lang="hu",  # UI/instruction language is always Hungarian
                minutes=per_item_minutes,
                user_goal=day_title,
                settings={
                    "tone": "casual",
                    "difficulty": "normal",
                    "target_language": target_lang,  # drives content language
                    "track": req.track or "",
                },
                preceding_lesson_content=lesson_md,
                max_retries=TASK_MAX_RETRIES,
            )
            return {"id": item_id, "kind": kind, "title": tmpl["label"], "content": result}
        except Exception as e:
            print(f"[focusroom/day/tasks] Task generation failed ({kind}): {e}")
            return {"id": item_id, "kind": kind, "title": tmpl["label"], "content": _fallback_content(kind)}

    tasks = list(await asyncio.gather(*[
        gen_task(i, t) for i, t in enumerate(practice_templates, 1)
    ]))

    t_end = time.monotonic()
    print(f"[focusroom/day/tasks] TOTAL: {t_end - t0:.1f}s | {len(tasks)} tasks | domain={domain} day={req.day_index}")

    return {"ok": True, "tasks": tasks}


def _build_script_steps(content: Dict[str, Any], day_title: str) -> List[Dict[str, str]]:
    """
    Convert lesson content into sequential script steps for the tutor.
    Each step = { "id": "...", "type": "intro|teach|transition", "text": "..." }
    The tutor reads these one by one. This is NOT a chat — it's a scripted lesson.
    """
    steps = []
    step_idx = 0

    def add_step(step_type: str, text: str):
        nonlocal step_idx
        steps.append({
            "id": f"step-{step_idx}",
            "type": step_type,
            "text": text.strip(),
        })
        step_idx += 1

    # Unwrap: LLM returns {title: ..., content: {introduction: ..., ...}}
    # title is at the top level; all content fields are nested inside "content"
    title = content.get("title", day_title)
    c = content.get("content") or content  # unwrap nested block, fallback to flat

    # 1. Intro
    add_step("intro", f"Szia! A mai leckénk témája: {title}. Figyelj, és kövesd a jegyzeteket!")

    # 2. Introduction / summary
    intro = c.get("introduction") or c.get("summary", "")
    if intro:
        add_step("teach", intro)

    # 3. Vocabulary
    vocab = c.get("vocabulary_table") or []
    if vocab:
        vocab_text = "Most nézzünk pár fontos szót!\n"
        for v in vocab:
            word = v.get("word", "")
            trans = v.get("translation", "")
            pron = v.get("pronunciation", "")
            vocab_text += f"\n{word}"
            if pron:
                vocab_text += f", kiejtve: {pron}"
            vocab_text += f" — jelentése: {trans}."
            ex = v.get("example_sentence", "")
            if ex:
                vocab_text += f" Például: {ex}"
        add_step("teach", vocab_text)

    # 4. Grammar
    grammar = c.get("grammar_explanation")
    if grammar:
        gram_text = f"Nyelvtani pont: {grammar.get('rule_title', '')}.\n"
        gram_text += grammar.get("explanation", "")
        examples = grammar.get("examples", [])
        if examples:
            gram_text += "\nPéldák: "
            for ex in examples[:3]:
                gram_text += f"{ex.get('target', '')} — {ex.get('hungarian', '')}. "
        add_step("teach", gram_text)

    # 5. Dialogues
    dialogues = c.get("dialogues") or []
    for d in dialogues:
        dial_text = f"Párbeszéd: {d.get('title', '')}.\n"
        if d.get("context"):
            dial_text += f"{d['context']}\n"
        for line in d.get("lines", []):
            dial_text += f"{line.get('speaker', '')}: {line.get('text', '')} — {line.get('translation', '')}.\n"
        add_step("teach", dial_text)

    # 6. Smart lesson fields
    hook = c.get("hook", "")
    if hook:
        add_step("teach", hook)
    insight = c.get("insight", "")
    if insight:
        add_step("teach", f"A mai tanulság: {insight}")

    # 7. Key points
    kps = c.get("key_points") or []
    if kps:
        kp_text = "Összefoglalva a legfontosabbakat:\n"
        for kp in kps:
            kp_text += f"- {kp}\n"
        add_step("teach", kp_text)

    # 8. Non-latin flow
    flow = c.get("lesson_flow") or []
    for block in flow:
        block_text = f"{block.get('title_hu', '')}.\n{block.get('body_md', '')}"
        add_step("teach", block_text)

    # 9. Transition to tasks
    add_step("transition", "Ezzel a lecke része véget ért! Most jönnek a gyakorló feladatok. Hajrá!")

    return steps


def _build_lesson_md(item: Dict[str, Any]) -> str:
    """
    Extract markdown text from a generate_focus_item result.

    The LLM result has structure: { "kind": ..., "title": ..., "content": { ... }, ... }
    Content fields (hook, vocab, grammar etc.) are nested inside item["content"].
    This function unwraps that and builds human-readable markdown.
    """
    parts = []

    # Top-level title (outside content)
    title = item.get("title") or item.get("subtitle") or ""
    if title:
        parts.append(f"# {title}")

    # Unwrap nested content block — smart_lesson and others nest fields here
    c = item.get("content") or item  # fallback: treat item itself as content

    # ── smart_lesson fields ──
    hook = c.get("hook", "")
    if hook:
        parts.append(f"\n{hook}")

    for task_key in ("micro_task_1", "micro_task_2"):
        task = c.get(task_key)
        if isinstance(task, dict) and task.get("instruction"):
            opts = task.get("options", [])
            opts_md = "\n".join(f"  - {o}" for o in opts) if opts else ""
            parts.append(f"\n**{task['instruction']}**")
            if opts_md:
                parts.append(opts_md)

    insight = c.get("insight", "")
    if insight:
        parts.append(f"\n**Tanulság:** {insight}")

    # ── language lesson fields ──
    intro = c.get("introduction") or c.get("summary", "")
    if intro:
        parts.append(f"\n{intro}")

    vocab = c.get("vocabulary_table") or []
    if vocab:
        parts.append("\n## Szókincs")
        for v in vocab:
            word = v.get("word", "")
            trans = v.get("translation", "")
            pron = v.get("pronunciation", "")
            parts.append(f"- **{word}**{f' ({pron})' if pron else ''} = {trans}")
            ex = v.get("example_sentence", "")
            if ex:
                parts.append(f"  _{ex}_ — {v.get('example_translation', '')}")

    grammar = c.get("grammar_explanation")
    if grammar:
        parts.append(f"\n## Nyelvtan: {grammar.get('rule_title', '')}")
        parts.append(grammar.get("explanation", ""))
        for ex in grammar.get("examples", []):
            parts.append(f"- {ex.get('target', '')} — {ex.get('hungarian', '')}")

    dialogues = c.get("dialogues") or []
    for d in dialogues:
        parts.append(f"\n## Párbeszéd: {d.get('title', d.get('scene', ''))}")
        for line in d.get("lines", []):
            parts.append(f"**{line.get('speaker', '')}:** {line.get('text', '')} ({line.get('translation', '')})")

    # ── shared fields ──
    kps = c.get("key_points") or []
    if kps:
        parts.append("\n## Kulcspontok")
        for kp in kps:
            parts.append(f"- {kp}")

    example = c.get("example", "")
    if example:
        parts.append(f"\n_{example}_")

    flow = c.get("lesson_flow") or []
    for block in flow:
        parts.append(f"\n## {block.get('title_hu', '')}")
        parts.append(block.get("body_md", ""))

    # body_md shortcut (some fallbacks use this directly)
    body_md = c.get("body_md", "")
    if body_md and not parts:
        parts.append(body_md)

    return "\n".join(parts).strip()


def _fallback_content(kind: str) -> Dict[str, Any]:
    """Minimal fallback content when generation fails."""
    if kind == "quiz":
        return {
            "questions": [{
                "question": "Mi a helyes válasz?",
                "options": ["A", "B", "C", "D"],
                "correct_index": 0,
                "explanation": "Próbáld újra a generálást.",
            }]
        }
    if kind == "translation":
        return {
            "sentences": [{"source": "Hello", "target_lang": "hu", "hint": "Köszönés"}]
        }
    if kind == "writing":
        return {"prompt": "Írj egy rövid szöveget a mai témáról.", "word_count_target": 50}
    return {"title": "Tartalom", "summary": "A tartalom generálása sikertelen volt."}


# ============================================================================
# POST /focusroom/evaluate — with RETRY-GATE
# ============================================================================

MAX_ATTEMPTS = 3  # After this many wrong attempts, reveal the answer

@router.post("/evaluate")
async def evaluate_answer(req: EvaluateReq, request: Request):
    """
    Evaluate user's answer with retry-gate logic:
    - Attempt 1: wrong → hint, no answer reveal
    - Attempt 2: wrong → stronger hint
    - Attempt 3: wrong → reveal answer + explanation
    """
    uid = await get_user_id(request)
    kind = req.kind
    attempt = req.attempt

    if kind == "quiz":
        return _evaluate_quiz(req, attempt)
    if kind == "translation":
        return await _evaluate_translation(req, attempt)
    if kind == "writing":
        return await _evaluate_writing(req, attempt)

    return {"ok": True, "correct": True, "feedback": "Elfogadva.", "score": 80, "can_retry": False}


def _evaluate_quiz(req: EvaluateReq, attempt: int) -> Dict[str, Any]:
    """Quiz: local check with retry-gate."""
    user_answer = req.user_answer
    correct = req.correct_answer

    # Normalize types
    try:
        user_int = int(user_answer) if not isinstance(user_answer, int) else user_answer
        correct_int = int(correct) if correct is not None else None
    except (ValueError, TypeError):
        user_int = None
        correct_int = None

    is_correct = (user_int is not None and correct_int is not None and user_int == correct_int)

    if is_correct:
        return {
            "ok": True,
            "correct": True,
            "feedback": "Helyes! Szép munka!",
            "score": max(100 - (attempt - 1) * 20, 60),
            "can_retry": False,
        }

    # Wrong answer — retry gate
    if attempt < MAX_ATTEMPTS:
        # Give hint, don't reveal
        options = req.options or []
        hint = ""
        if attempt == 1:
            hint = "Nem egészen. Gondolkodj újra — melyik illik legjobban?"
        elif attempt == 2:
            # Eliminate one wrong option
            if options and correct_int is not None and len(options) > 2:
                wrong_indices = [i for i in range(len(options)) if i != correct_int and i != user_int]
                if wrong_indices:
                    eliminated = options[wrong_indices[0]]
                    hint = f"Még nem. Segítség: biztosan NEM '{eliminated}'. Próbáld újra!"
                else:
                    hint = "Majdnem! Még egy próbálkozásod van."
            else:
                hint = "Még nem jó. Utolsó próbálkozás!"

        return {
            "ok": True,
            "correct": False,
            "feedback": hint,
            "score": 0,
            "can_retry": True,
            "attempt": attempt,
        }

    # Final attempt: reveal
    answer_text = ""
    if req.options and correct_int is not None and 0 <= correct_int < len(req.options):
        answer_text = req.options[correct_int]
    else:
        answer_text = str(req.correct_answer)

    return {
        "ok": True,
        "correct": False,
        "feedback": f"A helyes válasz: {answer_text}. Legközelebb sikerül!",
        "score": 0,
        "can_retry": False,
        "correct_answer": answer_text,
    }


async def _evaluate_translation(req: EvaluateReq, attempt: int) -> Dict[str, Any]:
    """Translation: LLM evaluation with retry-gate."""
    if not LLM_AVAILABLE:
        return {"ok": True, "correct": True, "feedback": "Értékelés nem elérhető.", "score": 70, "can_retry": False}

    try:
        reveal_mode = "ONLY give a hint, do NOT reveal the correct translation" if attempt < MAX_ATTEMPTS else "Reveal the correct translation"

        system = "Te egy nyelvtanár vagy. Értékeld a fordítást. Válaszolj JSON-ban. MAGYARUL válaszolj."
        user_prompt = f"""Értékeld ezt a fordítást:
Eredeti: {req.source}
Célnyelv: {req.target_lang}
Tanuló válasza: {req.user_answer}
Próbálkozás: {attempt}/{MAX_ATTEMPTS}

FONTOS: {reveal_mode}

JSON válasz:
{{"correct": true/false, "feedback": "magyar visszajelzés", "score": 0-100, "hint": "segítség ha hibás", "correct_answer": "helyes fordítás (CSAK ha attempt=={MAX_ATTEMPTS})"}}"""

        text = await _claude_json_haiku(system=system, user=user_prompt, max_tokens=300, temperature=0.1)
        s = _strip_json_fences(text)
        data = _extract_json_object(s) or json.loads(s)

        is_correct = bool(data.get("correct", False))
        can_retry = not is_correct and attempt < MAX_ATTEMPTS

        return {
            "ok": True,
            "correct": is_correct,
            "feedback": data.get("feedback", "") or data.get("hint", ""),
            "score": int(data.get("score", 0)) if is_correct else 0,
            "can_retry": can_retry,
            "attempt": attempt,
            "correct_answer": data.get("correct_answer", "") if not can_retry else "",
        }
    except Exception as e:
        print(f"[focusroom/evaluate] Translation eval failed: {e}")
        return {"ok": True, "correct": True, "feedback": "Jó próbálkozás!", "score": 70, "can_retry": False}


async def _evaluate_writing(req: EvaluateReq, attempt: int) -> Dict[str, Any]:
    """Writing: LLM evaluation (no retry-gate, always accept but score)."""
    if not LLM_AVAILABLE:
        return {"ok": True, "correct": True, "feedback": "Szép munka!", "score": 80, "can_retry": False}

    try:
        system = "Te egy nyelvtanár vagy. Értékeld az írást. Válaszolj JSON-ban. MAGYARUL válaszolj."
        user_prompt = f"""Értékeld ezt az írást:
Feladat: {req.prompt}
Tanuló szövege: {req.user_answer}

JSON válasz:
{{"correct": true, "feedback": "magyar visszajelzés javításokkal", "score": 0-100, "improved_version": "javított verzió"}}"""

        text = await _claude_json_haiku(system=system, user=user_prompt, max_tokens=500, temperature=0.2)
        s = _strip_json_fences(text)
        data = _extract_json_object(s) or json.loads(s)

        return {
            "ok": True,
            "correct": True,  # Writing is always "accepted"
            "feedback": data.get("feedback", ""),
            "score": int(data.get("score", 70)),
            "improved_version": data.get("improved_version", ""),
            "can_retry": False,
        }
    except Exception as e:
        print(f"[focusroom/evaluate] Writing eval failed: {e}")
        return {"ok": True, "correct": True, "feedback": "Jó munka!", "score": 75, "can_retry": False}


# ============================================================================
# POST /focusroom/tts — Script step → audio
# ============================================================================

@router.post("/tts")
async def generate_tts(req: TtsReq, request: Request):
    """
    Convert a script step text to audio via ElevenLabs TTS.
    Returns base64-encoded audio.
    """
    uid = await get_user_id(request)

    if not ELEVENLABS_API_KEY:
        return {"ok": False, "error": "TTS not configured"}

    try:
        import httpx

        voice = req.voice_id or resolve_tts_voice(req.locale or "hu")
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                headers={
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "text": req.text[:2000],
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    },
                },
            )

        if resp.status_code != 200:
            return {"ok": False, "error": f"ElevenLabs API error: {resp.status_code}"}

        import base64
        audio_b64 = base64.b64encode(resp.content).decode("utf-8")

        return {
            "ok": True,
            "audio_base64": audio_b64,
            "content_type": "audio/mpeg",
        }
    except Exception as e:
        print(f"[focusroom/tts] TTS failed: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# POST /focusroom/tts/voice-test — dev endpoint for voice quality QA
# ============================================================================

@router.post("/tts/voice-test")
async def tts_voice_test(req: VoiceTestReq, request: Request):
    """
    Dev/QA endpoint: render one of the built-in test sentences for a locale.
    Returns audio identical to /tts.

    Built-in HU test sentences:
      [0] "Ha 100 000 forintod van, és félreteszel 12,5%-ot, az 12 500 forint."
      [1] "A megtakarításom célja: 3 hónap vésztartalék."
      [2] "Költségvetés: bevétel mínusz kiadás egyenlő megtakarítás."
    """
    locale = req.locale.strip().lower()
    sentence_bank = {"hu": _TTS_TEST_HU, "en": _TTS_TEST_EN}
    sentences = sentence_bank.get(locale, _TTS_TEST_HU)
    idx = max(0, min(req.sentence_index, len(sentences) - 1))
    text = req.text or sentences[idx]
    voice = resolve_tts_voice(locale)
    print(f"[tts/voice-test] locale={locale} voice={voice} sentence_index={idx} text={text[:80]}")
    tts_req = TtsReq(text=text, voice_id=voice, locale=locale)
    return await generate_tts(tts_req, request)


# ============================================================================
# POST /focusroom/close — Day summary + streak
# ============================================================================

@router.post("/close")
async def close_day(req: CloseReq, request: Request):
    """
    Close a day session. Returns summary stats.
    MVP: no DB, just calculates and returns.
    """
    uid = await get_user_id(request)

    avg_score = req.score_sum // max(req.items_completed, 1) if req.items_completed > 0 else 0
    completion_rate = round(req.items_completed / max(req.items_total, 1) * 100)

    # Generate a short summary message
    if avg_score >= 80:
        message = "Kiváló munka! Nagyon jól teljesítettél ma."
    elif avg_score >= 60:
        message = "Jó munka! Holnap még jobbra képes leszel."
    else:
        message = "Szép próbálkozás! A gyakorlás teszi a mestert."

    return {
        "ok": True,
        "summary": {
            "day_index": req.day_index,
            "items_completed": req.items_completed,
            "items_total": req.items_total,
            "avg_score": avg_score,
            "completion_rate": completion_rate,
            "message": message,
        },
    }
