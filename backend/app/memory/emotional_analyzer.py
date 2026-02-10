from __future__ import annotations

class SimpleEmotionalAnalyzer:
    POS = ["lelkes", "öröm", "remény", "boldog", "motiv", "siker", "megkönnyebbül"]
    NEG = ["frusztr", "félek", "szorong", "csalód", "düh", "kimer", "stressz", "pánik"]

    def analyze(self, text: str) -> dict:
        t = (text or "").lower()
        pos = any(k in t for k in self.POS)
        neg = any(k in t for k in self.NEG)

        if pos and not neg:
            dom = "pozitiv"
        elif neg and not pos:
            dom = "negativ"
        else:
            dom = "semleges"

        wc = len((text or "").split())
        intensity = min(1.0, max(0.1, wc / 120))
        return {"dominant_emotion": dom, "intensity": float(intensity)}
