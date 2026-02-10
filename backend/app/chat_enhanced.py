from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Union
import os
import asyncio
import json

# Import Claude client directly
try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except Exception:
    ANTHROPIC_AVAILABLE = False
    Anthropic = None

from .llm_client import claude_chat_answer
from .query_analyzer import analyze_query, should_use_detailed_endpoint

# Supabase-backed memory
from .memory.service import MemoryService

# DB log functions might have different signatures (or be 0-arg stubs)
try:
    from .db import insert_chat_log, insert_shadow_log
except Exception:
    insert_chat_log = None
    insert_shadow_log = None


router = APIRouter(tags=["chat"])
memory_service = MemoryService()

# Claude API setup
CLAUDE_API_KEY = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
CLAUDE_MODEL = (os.getenv("CLAUDE_MODEL") or "claude-sonnet-4-20250514").strip()

claude = None
if ANTHROPIC_AVAILABLE and CLAUDE_API_KEY:
    claude = Anthropic(api_key=CLAUDE_API_KEY)


# ---------- Models ----------

class ChatInput(BaseModel):
    message: str
    lang: str = "hu"
    tier: str = "genz"
    user_id: Optional[str] = None  # Primary identity from pumi-proxy
    session_id: Optional[str] = None
    memberstack_id: Optional[str] = None
    conversation_context: Optional[List[Dict[str, Any]]] = None
    history: Optional[List[Dict[str, Any]]] = None
    mode: Optional[str] = None

    # Focus mode fields
    focus_type: Optional[str] = None
    domain: Optional[str] = None
    level: Optional[str] = None
    minutes_per_day: Optional[int] = 45
    new_items_per_day: Optional[int] = None
    target_lang: Optional[str] = None

    # For focus_day mode
    # NOTE: frontend néha stringként küldi -> ezért Union
    outline: Optional[Union[Dict[str, Any], str]] = None
    day_index: Optional[int] = None


class ChatOutput(BaseModel):
    ok: bool
    text: str
    type: str = "chat"
    memory_saved: int = 0


class DetailedDocumentOutput(BaseModel):
    ok: bool
    title: str
    content: str
    category: str
    tokens_used: int
    type: str = "detailed_document"

class FocusItemContentInput(BaseModel):
    """Input for generating detailed content for a specific focus item."""
    item_type: str  # lesson, quiz, translation, roleplay, flashcard, writing, practice, etc.
    item_id: str
    topic: str
    context: Dict[str, Any]  # day_title, day_intro, etc.
    mode: Optional[str] = None
    domain: str = "other"
    level: str = "beginner"
    lang: str = "hu"

    # Type-specific fields
    practice_type: Optional[str] = "exercise"
    topics_list: Optional[List[str]] = None
    num_questions: Optional[int] = 5
    num_cards: Optional[int] = 8
    target_language: Optional[str] = None  # For translation/roleplay/flashcard (language domain)
    num_sentences: Optional[int] = 5  # For translation exercises


# ---------- Mode & Task Rules ----------

ALLOWED_MODES = {"learning", "project"}

# Learning mode: knowledge acquisition tasks
LEARNING_TASK_TYPES = {
    "lesson", "content",              # Reading/content items
    "quiz", "quiz_single", "quiz_multi", "single_select",  # Quiz variants
    "short_answer", "reflection",     # Open-ended
    "practice", "exercise",           # Practice tasks
    "cards", "flashcard", "flashcards",  # Memorization
    "translation",                    # Language domain only
    "roleplay", "dialogue",           # Language domain only
    "writing",                        # Writing prompts
}

# Project mode: action/output-oriented tasks
PROJECT_TASK_TYPES = {"step_checklist", "checklist", "upload_review", "rubric_eval", "before_after", "quiz"}


# ---------- Helpers ----------

def _require_mode(mode: Optional[str]) -> str:
    m = (mode or "").strip().lower()
    if not m:
        raise HTTPException(status_code=400, detail="Missing mode")
    if m not in ALLOWED_MODES:
        raise HTTPException(status_code=400, detail=f"Invalid mode: {m}")
    return m


def _require_task_type(mode: str, item_type: Optional[str]) -> str:
    t = (item_type or "").strip().lower()
    if not t:
        raise HTTPException(status_code=400, detail="Missing item_type")
    allowed = LEARNING_TASK_TYPES if mode == "learning" else PROJECT_TASK_TYPES
    if t not in allowed:
        raise HTTPException(status_code=409, detail="task_not_allowed_for_mode")
    return t


def _normalize_tier(tier: str) -> str:
    """
    Front néha még 'free'-t küld, de backend már GEN Z / MILLENIAL-t vár.
    Itt stabilizálunk: minden ismeretlen -> genz.
    """
    t = (tier or "").strip().lower()
    if t in ("genz", "gen_z", "gen-z", "gen z"):
        return "genz"
    if t in ("millenial", "millennial"):
        return "millenial"
    return "genz"


def build_system_prompt(lang: str, memory_block: Optional[str]) -> str:
    base = (
        "Te PUMi vagy. Magyarul válaszolsz. Rövid, emberszagú. "
        "Nem asszisztens, nem tanár, nem terapeuta. "
        "Egyetlen rövid válasz, végén maximum egy kérdés."
        if (lang or "").lower().startswith("hu")
        else
        "You are PUMi. Short, human, non-assistant tone. One short reply, at most one question."
    )

    if memory_block:
        base = base.rstrip() + "\n\nMEMORY:\n" + memory_block.strip() + "\n"

    return base


def _should_persist_memory(user_text: str) -> bool:
    if not user_text:
        return False

    words = user_text.split()
    if len(words) < 8:
        return False

    lower = user_text.lower()
    keywords = [
        "cél", "terv", "döntöttem", "holnaptól",
        "szokás", "mindig", "rendszeresen",
        "stressz", "félek", "szorong", "kimer",
        "probléma", "küzdök", "akadály",
        "projekt",
        "tanulok", "minden nap", "45 perc", "fókusz", "routine", "rutin"
    ]
    return any(k in lower for k in keywords)


def _categorize_memory(user_text: str) -> str:
    lower = user_text.lower()

    if any(k in lower for k in ["cél", "terv", "döntöttem", "holnaptól", "tanulok", "minden nap", "45 perc", "fókusz"]):
        return "life_goals"
    if any(k in lower for k in ["szokás", "mindig", "rendszeresen", "rutin", "routine"]):
        return "interaction_patterns"
    if any(k in lower for k in ["stressz", "félek", "szorong", "kimer"]):
        return "emotional_context"
    if any(k in lower for k in ["probléma", "küzdök", "akadály"]):
        return "challenges_and_obstacles"
    return "personal_growth"


def _categorize_document(user_text: str) -> str:
    lower = user_text.lower()

    if any(k in lower for k in ["hogyan", "how to", "lépések", "útmutató", "guide"]):
        return "Útmutató"
    if any(k in lower for k in ["mi a", "what is", "magyarázd", "explain"]):
        return "Magyarázat"
    if any(k in lower for k in ["történet", "életrajz", "story", "biography", "élete", "született"]):
        return "Életrajz"
    if any(k in lower for k in ["terv", "stratégia", "plan", "strategy"]):
        return "Terv"
    if any(k in lower for k in ["elemzés", "analysis", "összehasonlítás", "comparison"]):
        return "Elemzés"
    return "Dokumentum"


def _extract_title_from_query(user_text: str) -> str:
    title = user_text.strip().rstrip("?!.")
    if len(title) > 80:
        title = title[:77] + "..."
    return title


def _safe_log(fn, *, kwargs: dict, args: tuple = ()) -> None:
    """
    Defensive logger:
    - tries kwargs
    - tries positional
    - tries no-arg
    - never raises (so chat never 500s because of logging)
    """
    if not fn:
        return
    try:
        fn(**kwargs)
        return
    except TypeError:
        pass
    except Exception:
        return

    try:
        fn(*args)
        return
    except TypeError:
        pass
    except Exception:
        return

    try:
        fn()
    except Exception:
        return


def _extract_outline_obj(outline_value: Optional[Union[Dict[str, Any], str]]) -> Optional[Dict[str, Any]]:
    """
    Frontend/Lovable néha outline-ot így küldi:
      - dictként: {"title":..., "days":[...]}
      - stringként: "{\"title\":...}"
      - stringként, de wrapperrel: "{\"outline\": {...}}"
      - stringként, de még egyszer be van ágyazva mezőbe
    Itt mindet normalizáljuk egy dictre.
    """
    if outline_value is None:
        return None

    if isinstance(outline_value, dict):
        # lehet, hogy wrapper: {"outline": {...}}
        if "outline" in outline_value and isinstance(outline_value["outline"], dict):
            return outline_value["outline"]
        return outline_value

    if isinstance(outline_value, str):
        s = outline_value.strip()
        if not s:
            return None
        try:
            parsed = json.loads(s)
        except Exception:
            return None

        if isinstance(parsed, dict):
            if "outline" in parsed and isinstance(parsed["outline"], dict):
                return parsed["outline"]
            return parsed

    return None


def _normalize_day_index(day_index: Optional[int]) -> int:
    """
    Biztosítjuk, hogy 1..N legyen:
    - ha 0 jön, 1-re emeljük
    - ha None, 1
    """
    if day_index is None:
        return 1
    try:
        i = int(day_index)
    except Exception:
        return 1
    return 1 if i <= 0 else i


def _json_ok(payload: ChatOutput) -> JSONResponse:
    """
    Hard guarantee: mindig JSON Response.
    (A response_model önmagában elég lenne, de itt biztosra megyünk.)
    """
    return JSONResponse(content=payload.model_dump())


# ---------- Core Chat Logic ----------

@router.post("/chat/enhanced", response_model=ChatOutput)
async def chat_enhanced(payload: ChatInput):
    try:
        user_text = (payload.message or "").strip()
        if not user_text:
            raise HTTPException(status_code=400, detail="Empty message")

        _require_mode(payload.mode)

        identity_key = payload.user_id or payload.session_id or payload.memberstack_id or "anon"

        # HOTFIX: tier normalizálás (free -> genz)
        tier = _normalize_tier(payload.tier)

        # ========== REGULAR CHAT MODE ==========

        # Load persistent memory (skip for anonymous users)
        if identity_key and identity_key != "anon":
            memory_block = memory_service.retrieve_block(
                user_id=identity_key,
                query=user_text,
                limit=5
            )
        else:
            memory_block = None

        # Keep compatibility: prompt builder exists, but llm_client uses memory_block anyway
        _system_prompt = build_system_prompt(payload.lang, memory_block)
        _ = _system_prompt  # silence linters, keep behavior unchanged

        # Decide detailed or normal
        analysis = analyze_query(user_text)
        use_detailed = should_use_detailed_endpoint(analysis)

        if use_detailed:
            out = ChatOutput(ok=True, text="", type="needs_detailed", memory_saved=0)
            return _json_ok(out)

        # Call LLM
        assistant_text = await claude_chat_answer(
            message=user_text,
            lang=payload.lang,
            tier=tier,
            memory_block=memory_block,
            enable_tools=False,
            history=payload.history,
        )

        # Store memory facts
        memory_saved = 0
        if _should_persist_memory(user_text):
            category = _categorize_memory(user_text)
            stored = memory_service.store(
                user_id=identity_key,
                category=category,
                title=user_text[:60],
                content=user_text,
                tags=[]
            )
            if stored:
                memory_saved = 1

        # Insert logs SAFELY (won't break chat even if signature mismatches)
        chat_kwargs = dict(
            session_id=payload.session_id,
            identity_key=identity_key,
            user_text=user_text,
            assistant_text=assistant_text,
            tier=tier,
            lang=payload.lang
        )
        chat_args = (
            payload.session_id,
            identity_key,
            user_text,
            assistant_text,
            tier,
            payload.lang
        )
        _safe_log(insert_chat_log, kwargs=chat_kwargs, args=chat_args)

        shadow_kwargs = dict(
            session_id=payload.session_id,
            identity_key=identity_key,
            user_text=user_text,
            assistant_raw=assistant_text,
            assistant_final=assistant_text,
            tier=tier,
            lang=payload.lang,
            memory_saved=memory_saved
        )
        shadow_args = (
            payload.session_id,
            identity_key,
            user_text,
            assistant_text,  # raw
            assistant_text,  # final
            tier,
            payload.lang,
            memory_saved
        )
        _safe_log(insert_shadow_log, kwargs=shadow_kwargs, args=shadow_args)

        out = ChatOutput(ok=True, text=assistant_text, type="chat", memory_saved=memory_saved)
        return _json_ok(out)

    except HTTPException:
        raise
    except Exception as e:
        print(f"[CHAT ERROR] chat_enhanced failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")


# ---------- Detailed Document Generation ----------

@router.post("/chat/detailed", response_model=DetailedDocumentOutput)
async def chat_detailed(payload: ChatInput):
    """
    Generate a detailed, long-form document (2000-4000 tokens)
    in Markdown format based on user query.

    Uses direct Claude API call with high max_tokens to bypass
    the normal chat's 280 token limit.
    """
    try:
        user_text = (payload.message or "").strip()
        if not user_text:
            raise HTTPException(status_code=400, detail="Empty message")

        _require_mode(payload.mode)

        if not claude:
            raise HTTPException(status_code=503, detail="Claude API not available")

        identity_key = payload.user_id or payload.session_id or payload.memberstack_id or "anon"

        # normalize tier for logs
        tier = _normalize_tier(payload.tier)

        # Load persistent memory (skip for anonymous users)
        if identity_key and identity_key != "anon":
            memory_block = memory_service.retrieve_block(
                user_id=identity_key,
                query=user_text,
                limit=5
            )
        else:
            memory_block = None

        # Build detailed system prompt
        lang_is_hu = (payload.lang or "").lower().startswith("hu")

        if lang_is_hu:
            system_prompt = """Te egy professzionális magyar AI dokumentum-készítő vagy.

FELADAT: Részletes, strukturált Markdown dokumentumot készítesz.

KÖVETELMÉNYEK:
- 2000-4000 token hosszúságú tartalom
- Markdown formátum:
  - # Fő cím
  - ## Alcímek (több szint)
  - **Félkövér** kiemelések
  - *Dőlt* szöveg
  - Listák (bullet és számozott)
  - Kódblokkok ha releváns
- Strukturált, szakaszokra bontott
- Gyakorlati példák, konkrét információk
- Részletes magyarázatok

KRITIKUS:
- NE használj semmilyen bevezető szöveget (pl. "Íme a dokumentum...")
- Kezdd KÖZVETLENÜL a fő címmel (# ...)
- CSAK a Markdown tartalom, semmi más
- Legalább 5-10 bekezdés
- Minden fontosabb gondolat külön szakaszban

STÍLUS:
- Szakmai, de érthető
- Konkrét, informatív
- Példákkal illusztrálva
"""
        else:
            system_prompt = """You are a professional AI document creator.

TASK: Create a detailed, structured Markdown document.

REQUIREMENTS:
- 2000-4000 tokens long
- Markdown format:
  - # Main title
  - ## Subheadings (multiple levels)
  - **Bold** emphasis
  - *Italic* text
  - Lists (bullet and numbered)
  - Code blocks if relevant
- Structured, divided into sections
- Practical examples, concrete information
- Detailed explanations

CRITICAL:
- NO preamble (e.g. "Here is the document...")
- Start DIRECTLY with the main title (# ...)
- ONLY the Markdown content, nothing else
- At least 5-10 paragraphs
- Each major idea in separate section

STYLE:
- Professional but understandable
- Concrete, informative
- Illustrated with examples
"""

        if memory_block:
            system_prompt = system_prompt.rstrip() + "\n\nUSER CONTEXT:\n" + memory_block.strip() + "\n"

        # Build message with clear instruction
        user_message = (
            f"""Készíts részletes Markdown dokumentumot erről a témáról:

{user_text}

Emlékeztető:
- Kezdd a fő címmel (# ...)
- Legalább 2000 token
- Strukturált, szakaszokra bontott
- Példákkal, konkrét információkkal
"""
            if lang_is_hu else
            f"""Create a detailed Markdown document about:

{user_text}

Remember:
- Start with main title (# ...)
- At least 2000 tokens
- Structured, divided into sections
- With examples and concrete information
"""
        )

        # Build message history
        messages = []
        if payload.history:
            for h in payload.history[-3:]:
                role = h.get("role", "user")
                cont = h.get("content", "")
                if role in ("user", "assistant") and cont:
                    messages.append({"role": role, "content": cont})

        messages.append({"role": "user", "content": user_message})

        # Call Claude API directly with high max_tokens
        def _call():
            resp = claude.messages.create(
                model=CLAUDE_MODEL,
                system=system_prompt,
                messages=messages,
                max_tokens=4096,
                temperature=0.7,
            )
            try:
                return resp.content[0].text
            except Exception:
                return str(resp)

        content = await asyncio.to_thread(_call)

        # Extract title and category
        title = _extract_title_from_query(user_text)
        category = _categorize_document(user_text)

        # Estimate tokens (rough approximation)
        tokens_used = int(len(content.split()) * 1.3)

        # Log detailed generation
        shadow_kwargs = dict(
            session_id=payload.session_id,
            identity_key=identity_key,
            user_text=user_text,
            assistant_raw=content,
            assistant_final=content,
            tier=tier,
            lang=payload.lang,
            memory_saved=0
        )
        shadow_args = (
            payload.session_id,
            identity_key,
            user_text,
            content,
            content,
            tier,
            payload.lang,
            0
        )
        _safe_log(insert_shadow_log, kwargs=shadow_kwargs, args=shadow_args)

        return DetailedDocumentOutput(
            ok=True,
            title=title,
            content=content,
            category=category,
            tokens_used=tokens_used,
            type="detailed_document"
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"[DETAILED ERROR] chat_detailed failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Detailed generation failed: {str(e)}")


# ---------- Focus Item Content Generation ----------

@router.post("/chat/focus-item-content")
async def focus_item_content(payload: FocusItemContentInput):
    """
    Generate detailed content for a specific focus item on-demand.
    Uses unified dispatch function that handles:
    - lesson, quiz, translation, roleplay, flashcard, writing, practice, etc.
    - Domain enforcement (language-only types blocked for non-language domains)
    - Mode enforcement (learning vs project)
    """
    try:
        from .focus_content_generators import generate_item_content

        mode = _require_mode(payload.mode)

        # Use unified dispatch function
        content = await generate_item_content(
            item_type=payload.item_type,
            topic=payload.topic,
            context=payload.context,
            domain=payload.domain,
            level=payload.level,
            lang=payload.lang,
            target_language=payload.target_language,
            mode=mode,
            num_questions=payload.num_questions or 5,
            num_cards=payload.num_cards or 8,
            num_sentences=payload.num_sentences or 5,
            topics_list=payload.topics_list,
        )

        # Check for errors from dispatch
        if isinstance(content, dict) and content.get("error"):
            error_code = content.get("error")
            if error_code == "task_not_allowed_for_mode":
                return JSONResponse(status_code=409, content=content)
            elif error_code == "missing_target_language":
                return JSONResponse(status_code=400, content={"error": "missing_target_language", "detail": "target_language is required for translation/roleplay"})
            else:
                return JSONResponse(status_code=400, content=content)

        # Normalize lesson content
        if isinstance(content, dict) and content.get("type") == "lesson":
            content["kind"] = "content"
        if isinstance(content, dict):
            inner = content.get("content")
            if isinstance(inner, dict) and inner.get("title") and not content.get("title"):
                content["title"] = inner.get("title")

        return JSONResponse(content={
            "ok": True,
            "content": content,
            "item_id": payload.item_id,
        })

    except HTTPException:
        raise
    except Exception as e:
        print(f"[FOCUS ITEM ERROR] {payload.item_type} generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Item content generation failed: {str(e)}")







