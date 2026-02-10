from __future__ import annotations
from datetime import datetime, timezone

CATEGORY_BASE = {
    "life_goals": 0.9,
    "personal_growth": 0.8,
    "emotional_context": 0.7,
    "challenges_and_obstacles": 0.7,
    "interaction_patterns": 0.6,
}

def compute_score(category: str, emotion: dict, created_at: datetime | None = None) -> float:
    base = CATEGORY_BASE.get(category, 0.5)
    emo = float((emotion or {}).get("intensity", 0.3))

    now = datetime.now(timezone.utc)
    ca = created_at or now
    days = max(0.0, (now - ca).total_seconds() / 86400.0)

    if days <= 7:
        rec = 1.0
    elif days <= 30:
        rec = 0.7
    elif days <= 90:
        rec = 0.4
    else:
        rec = 0.1

    score = (base * 0.6) + (emo * 0.25) + (rec * 0.15)
    return float(round(min(1.0, max(0.0, score)), 4))
