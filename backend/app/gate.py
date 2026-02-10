# app/gate.py
from __future__ import annotations

import re
from typing import Literal, Optional

Mode = Literal["chat", "focus_plan"]

FOCUS_RE = re.compile(r"\b(fókusz|focus|terv|plan|7\s*nap|rutin|learning|project)\b", re.I)


def decide_mode(user_text: str, raw: str, forced: Optional[str] = None) -> Mode:
    if forced in ("chat", "focus_plan"):
        return forced  # type: ignore
    if FOCUS_RE.search(user_text or ""):
        return "focus_plan"
    return "chat"


def finalize(mode: Mode, user_text: str, raw: str) -> str:
    text = (raw or "").strip()
    # Keep chat short-ish, but don't murder focus mode here
    if mode == "chat" and len(text) > 700:
        text = text[:700].rstrip()
    return text
