from __future__ import annotations

from .emotional_analyzer import SimpleEmotionalAnalyzer
from .scoring import compute_score
from .repository import insert_memory, list_recent

def _pick_relevant(memories: list[dict], query: str, limit: int = 5) -> list[dict]:
    q = (query or "").lower().strip()
    def s(m: dict) -> float:
        score = float(m.get("memory_score", 0.0))
        txt = ((m.get("title","") or "") + " " + (m.get("content","") or "")).lower()
        if q and q in txt:
            score += 0.25
        return score
    return sorted(memories, key=s, reverse=True)[:limit]

def _format_block(memories: list[dict]) -> str:
    lines = []
    for m in memories:
        lines.append(f"- [{m.get('category')}] {m.get('title')}: {m.get('content')}")
    return "\n".join(lines).strip()

class MemoryService:
    def __init__(self):
        self.emotions = SimpleEmotionalAnalyzer()

    def store(self, user_id: str, category: str, title: str, content: str, tags: list[str] | None = None) -> dict | None:
        tags = tags or []
        emotion = self.emotions.analyze(content)
        score = compute_score(category, emotion)

        row = {
            "user_id": user_id,
            "category": category,
            "title": (title or "").strip()[:120],
            "content": (content or "").strip(),
            "tags": tags,
            "emotion": emotion,
            "memory_score": score,
        }
        return insert_memory(row)

    def retrieve_block(self, user_id: str, query: str, limit: int = 5) -> str:
        candidates = list_recent(user_id, limit=200)
        chosen = _pick_relevant(candidates, query, limit=limit)
        return _format_block(chosen)
