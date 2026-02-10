// src/components/focus/InteractivePractice.tsx
// Interactive writing practice with AI feedback

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, RotateCw } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface InteractivePracticeProps {
  practiceText: string;
  topic: string;
  dayTitle: string;
  lang?: string;
  onInteraction?: (hasInteracted: boolean) => void; // NEW: notify parent of interaction
}

type FeedbackState = "idle" | "checking" | "correct" | "incorrect";

interface Feedback {
  isCorrect: boolean;
  feedback: string;
  suggestions?: string;
}

export function InteractivePractice({
  practiceText,
  topic,
  dayTitle,
  lang = "hu",
  onInteraction,
}: InteractivePracticeProps) {
  const [userAnswer, setUserAnswer] = useState("");
  const [state, setState] = useState<FeedbackState>("idle");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Notify parent when user has submitted
  useEffect(() => {
    onInteraction?.(hasSubmitted);
  }, [hasSubmitted, onInteraction]);

  const checkAnswer = async () => {
    if (!userAnswer.trim()) return;

    setState("checking");
    setFeedback(null);

    try {
      const { pumiInvoke } = await import("@/lib/pumiInvoke");
      const data = await pumiInvoke<{ ok: boolean; text?: string }>("/chat/enhanced", {
        mode: "chat",
        message: `Ellenőrizd ezt a választ a következő gyakorlatra:

**Gyakorlat:** ${practiceText}
**Téma:** ${topic}
**Nap:** ${dayTitle}

**Felhasználó válasza:**
${userAnswer}

Adj visszajelzést JSON formátumban:
{
  "isCorrect": true/false,
  "feedback": "Rövid értékelés (1-2 mondat)",
  "suggestions": "Javítási javaslatok ha szükséges (opcionális)"
}

STRICT JSON! Csak a JSON objektumot add vissza, semmi mást!`,
        lang: lang,
      });

      if (data.ok && data.text) {
        try {
          // Parse the JSON response
          let feedbackText = data.text;
          
          // Strip markdown code fences if present
          if (typeof feedbackText === 'string') {
            feedbackText = feedbackText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          }
          
          const parsedFeedback = JSON.parse(feedbackText);
          setFeedback(parsedFeedback);
          setState(parsedFeedback.isCorrect ? "correct" : "incorrect");
          setHasSubmitted(true); // Mark as interacted after successful check
        } catch (err) {
          console.error("Failed to parse feedback:", err);
          // Fallback: treat as text feedback
          setFeedback({
            isCorrect: false,
            feedback: data.text,
          });
          setState("incorrect");
          setHasSubmitted(true);
        }
      } else {
        throw new Error("Invalid response");
      }
    } catch (err) {
      console.error("Check answer error:", err);
      setFeedback({
        isCorrect: false,
        feedback: "Hiba történt az ellenőrzés során. Próbáld újra!",
      });
      setState("incorrect");
    }
  };

  const reset = () => {
    setUserAnswer("");
    setState("idle");
    setFeedback(null);
    // Keep hasSubmitted true - they already interacted once
  };

  return (
    <div className="rounded-xl border border-foreground/10 bg-background/30 p-4 space-y-4">
      {/* Practice prompt */}
      <div className="text-sm text-foreground/80">
        <ReactMarkdown>{practiceText}</ReactMarkdown>
      </div>

      {/* User input */}
      <textarea
        value={userAnswer}
        onChange={(e) => setUserAnswer(e.target.value)}
        placeholder="Írd ide a válaszod..."
        disabled={state === "checking"}
        className="w-full min-h-[120px] resize-y rounded-xl border border-foreground/10 bg-background/40 px-3 py-2 text-sm text-foreground/90 placeholder:text-foreground/40 outline-none focus:ring-2 focus:ring-foreground/15 disabled:opacity-50"
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={checkAnswer}
          disabled={state === "checking" || !userAnswer.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {state === "checking" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Ellenőrzés...
            </>
          ) : (
            "Ellenőrzés"
          )}
        </button>

        {state !== "idle" && state !== "checking" && (
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-foreground/10 text-foreground/70 text-sm font-medium hover:bg-foreground/15 transition-colors"
          >
            <RotateCw className="w-4 h-4" />
            Újra
          </button>
        )}
      </div>

      {/* Feedback display */}
      {feedback && (
        <div
          className={`rounded-xl p-4 ${
            state === "correct"
              ? "bg-green-500/10 border border-green-500/20"
              : "bg-yellow-500/10 border border-yellow-500/20"
          }`}
        >
          <div className="flex items-start gap-3">
            {state === "correct" ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="space-y-2">
              <p
                className={`text-sm font-medium ${
                  state === "correct" ? "text-green-400" : "text-yellow-400"
                }`}
              >
                {state === "correct" ? "Helyes!" : "Javítható"}
              </p>
              <p className="text-sm text-foreground/80">{feedback.feedback}</p>
              {feedback.suggestions && (
                <p className="text-sm text-foreground/60 italic">
                  💡 {feedback.suggestions}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InteractivePractice;
