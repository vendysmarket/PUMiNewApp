# app/query_analyzer.py
"""
Analyze user queries to decide whether to use the detailed (document-style) answer flow.

Goal:
- Trigger detailed answers broadly for "document intent" (guides, checklists, plans, tables, step-by-step, structured output),
  not only biographies.
- Use: hard triggers + soft scoring.
"""

from __future__ import annotations
from typing import Dict, Optional, List
import re


# ----------------------------
# HARD triggers (instant-ish)
# ----------------------------
HARD_PHRASES = [
    # HU explicit detailed requests
    "hosszan",
    "hosszasan",
    "részletesen",
    "kifejted",
    "kifejtve",
    "bővebben",
    "teljes körűen",
    
    # HU doc intent
    "lépésről lépésre",
    "pontokba szedve",
    "pontokba",
    "bullet",
    "checklist",
    "ellenőrző lista",
    "útmutató",
    "részletes útmutató",
    "roadmap",
    "ütemterv",
    "stratégia",
    "terv",
    "folyamat",
    "specifikáció",
    "dokumentáció",
    "táblázat",
    "táblázatban",
    "idővonal",
    "kronológia",
    "áttekintés",
    "teljes áttekintés",
    "összefoglaló +",
    "összefoglaló és",
    "mindent is",
    "minden fontos részlettel",
    "részletesen, példákkal",
    "példákkal",

    # EN doc intent
    "step by step",
    "detailed",
    "in detail",
    "comprehensive",
    "checklist",
    "roadmap",
    "guide",
    "tutorial",
    "table",
    "in a table",
    "documentation",
    "specification",
]

DOC_VERBS = [
    # HU
    "készíts", "írj", "add meg", "állíts össze", "foglalj össze", "dokumentáld", "dolgozd ki",
    # EN
    "create", "write", "build", "draft", "compile", "document",
]

FORMAT_HINTS = [
    "markdown", "md", "##", "fejezet", "szekció", "alcím",
    "lista", "listát", "pontok", "bullet", "táblázat", "table",
]

# Category signals
BIO_KEYWORDS = [
    "életrajz", "életút", "életpálya", "munkássága", "született", "halála",
    "élete", "karrierje", "pályafutása",
    "biography", "life story", "born", "career", "life of",
]
COMPARE_KEYWORDS = ["összehasonl", "különbség", "hasonlóság", "vs", "versus", "compare", "comparison", "difference"]
EXPLAIN_KEYWORDS = ["magyarázd", "magyarázat", "hogyan működik", "mi az", "miért", "explain", "how does", "what is", "why"]
LIST_KEYWORDS = ["sorolj", "sorold", "listázd", "felsorol", "enumerate", "list", "give me", "show me"]

DOC_TOPICS = [
    # HU
    "üzleti", "árképzés", "költség", "kalkuláció", "budget", "pénzügy", "marketing", "stratégia",
    "projekt", "roadmap", "spec", "api", "architektúra", "deployment", "debug", "tervezés",
    "edzésterv", "étirend", "tanulási terv", "nyelvtanulás", "útiterv",
    # EN
    "business plan", "pricing", "budget", "marketing plan", "strategy",
    "architecture", "api contract", "deployment",
]


def _contains_any(text_lower: str, items: List[str]) -> bool:
    return any(x in text_lower for x in items)


def analyze_query(query: str, conversation_context: Optional[list] = None) -> Dict:
    q = (query or "").strip()
    ql = q.lower()
    qlen = len(q)

    score = 0.0
    reasons: List[str] = []
    category = "general"
    est_tokens = 900

    # ----------------------------
    # 0) HARD triggers (STRONGEST)
    # ----------------------------
    hard_hit = _contains_any(ql, HARD_PHRASES)
    if hard_hit:
        score += 1.0  # INSTANT TRIGGER
        reasons.append("hard_doc_phrase")

    if _contains_any(ql, DOC_VERBS) and _contains_any(ql, FORMAT_HINTS):
        score += 0.80
        reasons.append("doc_verb+format")

    # "részletes" / "detailed" is a strong hint
    if any(k in ql for k in ["részletes", "detailed", "bővebb", "comprehensive"]):
        score += 0.40
        reasons.append("asks_detailed")

    if "teljes" in ql and ("összefoglal" in ql or "életrajz" in ql or "áttekint" in ql):
        score += 0.40
        reasons.append("asks_full_overview")

    # ----------------------------
    # 1) Length heuristic
    # ----------------------------
    if qlen > 240:
        score += 0.32
        reasons.append("long_query")
    elif qlen > 140:
        score += 0.20
    elif qlen > 90:
        score += 0.12

    # ----------------------------
    # 2) Multi-constraint / multi-question
    # ----------------------------
    qm = q.count("?")
    if qm >= 2:
        score += 0.22
        reasons.append("multiple_questions")

    and_count = len(re.findall(r"\b(és|and)\b", ql))
    if and_count >= 3:
        score += 0.18
        reasons.append("compound_request")
    elif and_count == 2:
        score += 0.10

    # ----------------------------
    # 3) Category detection
    # ----------------------------
    bio_hits = sum(1 for k in BIO_KEYWORDS if k in ql)
    if bio_hits >= 1:
        category = "biography"
        score += 0.35 + min(0.25, 0.12 * (bio_hits - 1))
        est_tokens = max(est_tokens, 2800)
        reasons.append("biography")

    cmp_hits = sum(1 for k in COMPARE_KEYWORDS if k in ql)
    if cmp_hits >= 1:
        category = "comparison"
        score += 0.40
        est_tokens = max(est_tokens, 2200)
        reasons.append("comparison")

    exp_hits = sum(1 for k in EXPLAIN_KEYWORDS if k in ql)
    if exp_hits >= 1:
        category = "explanation"
        score += 0.30 + min(0.20, 0.10 * (exp_hits - 1))
        est_tokens = max(est_tokens, 2400)
        reasons.append("explanation")

    list_hits = sum(1 for k in LIST_KEYWORDS if k in ql)
    if list_hits >= 1:
        category = "list"
        score += 0.28
        est_tokens = max(est_tokens, 1900)
        reasons.append("listing")

    doc_topic_hits = sum(1 for t in DOC_TOPICS if t in ql)
    if doc_topic_hits >= 1:
        category = "doc"
        score += 0.35
        est_tokens = max(est_tokens, 2600)
        reasons.append("doc_topic")

    # ----------------------------
    # 4) Conversation context (tiny nudge)
    # ----------------------------
    if conversation_context and len(conversation_context) >= 4:
        recent = conversation_context[-4:]
        user_msgs = sum(1 for m in recent if m.get("isUser"))
        if user_msgs >= 3:
            score += 0.08
            reasons.append("followups")

    # ----------------------------
    # Decision threshold (LOWERED for easier triggering)
    # ----------------------------
    needs_detailed = score >= 0.50

    return {
        "needs_detailed": needs_detailed,
        "reason": ", ".join(reasons) if reasons else "standard_query",
        "category": category,
        "estimated_tokens": est_tokens,
        "confidence": min(score, 1.0),
        "query": q,  # Store original query
    }


def should_use_detailed_endpoint(analysis: Dict) -> bool:
    """
    Decide if we should use /chat/detailed endpoint.
    
    Returns True if:
    1. Analysis says needs_detailed AND confidence >= 0.50
    2. OR query contains explicit detailed keywords (failsafe)
    """
    query_lower = (analysis.get("query") or "").lower()
    
    # FAILSAFE: Always trigger for explicit detailed requests
    explicit_keywords = [
        "hosszan", "hosszasan", "részletesen", "kifejted", "kifejtve",
        "bővebben", "pontokba szedve", "lépésről lépésre",
        "detailed", "in detail", "comprehensive", "step by step"
    ]
    if any(k in query_lower for k in explicit_keywords):
        return True
    
    # Standard analysis-based decision
    return bool(analysis.get("needs_detailed")) and float(analysis.get("confidence", 0.0)) >= 0.50