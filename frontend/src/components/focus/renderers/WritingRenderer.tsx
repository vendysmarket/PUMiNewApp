import { useState } from "react";
import { Loader2, CheckCircle } from "lucide-react";
import { pumiInvoke } from "@/lib/pumiInvoke";
import ReactMarkdown from "react-markdown";
import type { WritingContent } from "@/types/focusItem";

interface WritingRendererProps {
  content: WritingContent;
  topic: string;
  minChars: number;
  onValidationChange: (state: { charCount: number }) => void;
}

interface Feedback {
  correct: boolean;
  feedback: string;
  suggestions?: string[];
}

export function WritingRenderer({ content, topic, minChars, onValidationChange }: WritingRendererProps) {
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (value: string) => {
    setAnswer(value);
    onValidationChange({ charCount: value.length });
  };

  const checkWriting = async () => {
    setChecking(true);
    try {
      const prompt = `Te egy nyelvtanár vagy. Értékeld a következő írásgyakorlatot.

Feladat: ${content.prompt}
Cél szószám: ${content.word_count_target || "nincs megadva"}

A tanuló válasza:
"${answer}"

Válaszolj CSAK JSON formátumban:
{
  "correct": true/false,
  "feedback": "rövid, konstruktív visszajelzés",
  "suggestions": ["javítási javaslat 1", "javaslat 2"]
}`;

      const response = await pumiInvoke<{ reply?: string; text?: string }>("/chat/enhanced", { message: prompt, mode: "chat" });
      const text = response.reply || response.text || "";
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setFeedback(parsed);
        setSubmitted(true);
      }
    } catch (error) {
      console.error("Writing check failed:", error);
      setFeedback({
        correct: true,
        feedback: "A válaszod elmentve. Folytasd a gyakorlást!",
      });
      setSubmitted(true);
    } finally {
      setChecking(false);
    }
  };

  const reset = () => {
    setAnswer("");
    setFeedback(null);
    setSubmitted(false);
    onValidationChange({ charCount: 0 });
  };

  const charCount = answer.length;
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const isValidLength = charCount >= minChars;
  const charProgress = Math.min(100, (charCount / minChars) * 100);

  return (
    <div className="space-y-4">
      {/* Prompt */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown>{content.prompt}</ReactMarkdown>
      </div>

      {/* Example if provided */}
      {content.example && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-xs text-muted-foreground mb-1">Példa:</p>
          <p className="text-sm text-foreground italic">{content.example}</p>
        </div>
      )}

      {/* Text area */}
      <div className="space-y-2">
        <textarea
          value={answer}
          onChange={(e) => handleChange(e.target.value)}
          disabled={submitted}
          placeholder="Írd ide a válaszod..."
          rows={6}
          className="w-full px-4 py-3 rounded-lg border border-foreground/20 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
        />

        {/* Progress bar */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex-1 h-1 bg-foreground/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${isValidLength ? "bg-green-500" : "bg-primary"}`}
              style={{ width: `${charProgress}%` }}
            />
          </div>
          <span className={isValidLength ? "text-green-600" : "text-muted-foreground"}>
            {charCount} / {minChars} karakter
          </span>
          <span className="text-muted-foreground">
            ({wordCount} szó)
          </span>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`p-4 rounded-lg ${
          feedback.correct 
            ? "bg-green-500/10 border border-green-500/20" 
            : "bg-amber-500/10 border border-amber-500/20"
        }`}>
          <div className="flex items-start gap-2">
            <CheckCircle className={`w-5 h-5 mt-0.5 ${
              feedback.correct ? "text-green-500" : "text-amber-500"
            }`} />
            <div>
              <p className="font-medium text-foreground">{feedback.feedback}</p>
              {feedback.suggestions && feedback.suggestions.length > 0 && (
                <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                  {feedback.suggestions.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {!submitted ? (
          <button
            onClick={checkWriting}
            disabled={checking || !isValidLength}
            className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {checking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Ellenőrzés...
              </>
            ) : (
              "Ellenőrzés"
            )}
          </button>
        ) : (
          <button
            onClick={reset}
            className="flex-1 py-2 px-4 bg-foreground/10 text-foreground rounded-lg font-medium hover:bg-foreground/20"
          >
            Újrakezdés
          </button>
        )}
      </div>
    </div>
  );
}
