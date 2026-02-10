// src/components/focus/TranslationPractice.tsx
// Translation practice with multiple input fields and AI checking

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, RotateCw } from "lucide-react";

interface TranslationPracticeProps {
  practiceText: string;
  topic: string;
  dayTitle: string;
  lang?: string;
  onInteraction?: (hasInteracted: boolean) => void; // NEW: notify parent of interaction
}

interface SentenceResult {
  index: number;
  userTranslation: string;
  isCorrect: boolean;
  feedback: string;
  correctTranslation?: string;
}

export function TranslationPractice({
  practiceText,
  topic,
  dayTitle,
  lang = "hu",
  onInteraction,
}: TranslationPracticeProps) {
  // Parse sentences from text (numbered list)
  const sentences = practiceText
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^\d+\./.test(line)) // Lines starting with number
    .map(line => line.replace(/^\d+\.\s*/, '')); // Remove number prefix

  const [answers, setAnswers] = useState<string[]>(Array(sentences.length).fill(''));
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<SentenceResult[] | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Notify parent when user has submitted
  useEffect(() => {
    onInteraction?.(hasSubmitted);
  }, [hasSubmitted, onInteraction]);

  const handleAnswerChange = (index: number, value: string) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    setAnswers(newAnswers);
  };

  const checkTranslations = async () => {
    const filledAnswers = answers.filter(a => a.trim());
    if (filledAnswers.length === 0) return;

    setChecking(true);
    setResults(null);

    try {
      const translationList = sentences
        .map((sentence, i) => `${i + 1}. Magyar: "${sentence}" → Olasz: "${answers[i] || '[üres]'}"`)
        .join('\n');

      const { pumiInvoke } = await import("@/lib/pumiInvoke");
      const data = await pumiInvoke<{ ok: boolean; text?: string }>("/chat/enhanced", {
        mode: "chat",
        message: `Ellenőrizd ezeket a fordításokat magyar-olaszra:

**Téma:** ${topic}
**Kontextus:** ${dayTitle}

**Fordítások:**
${translationList}

Adj visszajelzést JSON formátumban minden mondathoz:
{
  "results": [
    {
      "index": 0,
      "isCorrect": true/false,
      "feedback": "Rövid értékelés (1 mondat)",
      "correctTranslation": "Helyes verzió (ha rossz volt)"
    },
    ...
  ]
}

STRICT JSON! Csak a JSON objektumot add vissza!`,
        lang: lang,
      });

      if (data.ok && data.text) {
        try {
          let feedbackText = data.text;
          
          // Strip markdown fences
          if (typeof feedbackText === 'string') {
            feedbackText = feedbackText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          }
          
          const parsedFeedback = JSON.parse(feedbackText);

          if (parsedFeedback.results) {
            setResults(parsedFeedback.results.map((r: any) => ({
              ...r,
              userTranslation: answers[r.index] || '',
            })));
            setHasSubmitted(true); // Mark as interacted after successful check
          }
        } catch (err) {
          console.error("Failed to parse feedback:", err);
          setResults([{
            index: 0,
            userTranslation: answers[0],
            isCorrect: false,
            feedback: "Hiba a visszajelzés feldolgozásában.",
          }]);
          setHasSubmitted(true);
        }
      }
    } catch (err) {
      console.error("Check error:", err);
      setResults([{
        index: 0,
        userTranslation: answers[0],
        isCorrect: false,
        feedback: "Hiba történt. Próbáld újra!",
      }]);
    } finally {
      setChecking(false);
    }
  };

  const reset = () => {
    setAnswers(Array(sentences.length).fill(''));
    setResults(null);
    // Keep hasSubmitted true - they already interacted once
  };

  const allFilled = answers.every(a => a.trim());
  const correctCount = results?.filter(r => r.isCorrect).length || 0;

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <div className="p-3 bg-foreground/5 rounded-lg border border-foreground/10">
        <p className="text-sm font-medium mb-1">📝 Fordítási feladat</p>
        <p className="text-sm text-foreground/70">
          Fordítsd le magyarról olaszra a következő mondatokat:
        </p>
      </div>

      {/* Translation inputs */}
      <div className="space-y-3">
        {sentences.map((sentence, index) => {
          const result = results?.find(r => r.index === index);
          
          return (
            <div key={index} className="space-y-2">
              {/* Hungarian sentence */}
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium text-foreground/50 mt-2">
                  {index + 1}.
                </span>
                <div className="flex-1">
                  <p className="text-sm text-foreground/80 mb-2 p-2 bg-foreground/5 rounded">
                    {sentence}
                  </p>
                  
                  {/* Input field */}
                  <input
                    type="text"
                    value={answers[index]}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    disabled={checking || !!results}
                    placeholder="Olasz fordítás..."
                    className="w-full px-3 py-2 rounded-lg border border-foreground/20 bg-background text-foreground disabled:opacity-50"
                  />
                  
                  {/* Result feedback */}
                  {result && (
                    <div
                      className={`mt-2 p-2 rounded-lg border text-sm ${
                        result.isCorrect
                          ? "bg-green-500/10 border-green-500/30"
                          : "bg-yellow-500/10 border-yellow-500/30"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {result.isCorrect ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className="text-foreground/80">{result.feedback}</p>
                          {result.correctTranslation && (
                            <p className="mt-1 text-xs text-foreground/60">
                              ✓ Helyes: <span className="font-medium">{result.correctTranslation}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 items-center">
        <button
          onClick={checkTranslations}
          disabled={!allFilled || checking || !!results}
          className="flex-1 py-2 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
        >
          {checking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Ellenőrzés...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Ellenőrzés ({answers.filter(a => a.trim()).length}/{sentences.length})
            </>
          )}
        </button>

        {results && (
          <button
            onClick={reset}
            className="py-2 px-4 border border-foreground/20 rounded-lg hover:bg-foreground/5 flex items-center gap-2"
          >
            <RotateCw className="w-4 h-4" />
            Újra
          </button>
        )}
      </div>

      {/* Summary */}
      {results && (
        <div className="p-3 bg-foreground/5 rounded-lg border border-foreground/10 text-center">
          <p className="text-sm font-medium">
            {correctCount === sentences.length ? (
              <span className="text-green-600 dark:text-green-400">
                🎉 Tökéletes! Mind a {sentences.length} helyes!
              </span>
            ) : (
              <span className="text-foreground/80">
                {correctCount}/{sentences.length} helyes fordítás
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export default TranslationPractice;
