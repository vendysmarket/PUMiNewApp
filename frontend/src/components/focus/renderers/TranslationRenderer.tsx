import { useState } from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { pumiInvoke } from "@/lib/pumiInvoke";
import type { TranslationContent } from "@/types/focusItem";

interface TranslationRendererProps {
  content: TranslationContent;
  topic: string;
  onValidationChange: (state: { itemsCompleted: number; charCount: number }) => void;
}

interface SentenceResult {
  correct: boolean;
  feedback: string;
  correctAnswer?: string;
}

export function TranslationRenderer({ content, topic, onValidationChange }: TranslationRendererProps) {
  const [answers, setAnswers] = useState<string[]>(() => 
    content.sentences.map(() => "")
  );
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<SentenceResult[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const handleAnswerChange = (index: number, value: string) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    setAnswers(newAnswers);
    
    // Update validation state
    const filledCount = newAnswers.filter(a => a.trim().length > 0).length;
    const totalChars = newAnswers.reduce((sum, a) => sum + a.length, 0);
    onValidationChange({ itemsCompleted: filledCount, charCount: totalChars });
  };

  const checkTranslations = async () => {
    setChecking(true);
    try {
      const prompt = `Te egy olasz nyelvtanár vagy. Értékeld a következő magyar→olasz fordításokat.
      
Mondatok és fordítások:
${content.sentences.map((s, i) => `${i + 1}. Magyar: "${s.source}"\n   Fordítás: "${answers[i]}"`).join("\n")}

Válaszolj CSAK JSON formátumban, markdown nélkül:
{
  "results": [
    {"correct": true/false, "feedback": "rövid visszajelzés", "correctAnswer": "helyes fordítás ha hibás"}
  ]
}`;

      const response = await pumiInvoke<{ reply?: string; text?: string }>("/chat/enhanced", { message: prompt, mode: "chat" });
      const text = response.reply || response.text || "";
      
      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setResults(parsed.results || []);
        setSubmitted(true);
      }
    } catch (error) {
      console.error("Translation check failed:", error);
    } finally {
      setChecking(false);
    }
  };

  const reset = () => {
    setAnswers(content.sentences.map(() => ""));
    setResults([]);
    setSubmitted(false);
    onValidationChange({ itemsCompleted: 0, charCount: 0 });
  };

  const correctCount = results.filter(r => r.correct).length;
  const allFilled = answers.every(a => a.trim().length > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground mb-4">
        Fordítsd le a mondatokat olaszra:
      </p>

      {content.sentences.map((sentence, index) => (
        <div key={index} className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-sm font-medium text-foreground/60 mt-2">{index + 1}.</span>
            <div className="flex-1">
              <p className="font-medium text-foreground mb-2">{sentence.source}</p>
              {sentence.hint && (
                <p className="text-xs text-muted-foreground mb-2">💡 {sentence.hint}</p>
              )}
              <input
                type="text"
                value={answers[index]}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                disabled={submitted}
                placeholder="Írd ide az olasz fordítást..."
                className="w-full px-3 py-2 rounded-lg border border-foreground/20 bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
              />
              
              {/* Result feedback */}
              {results[index] && (
                <div className={`mt-2 p-2 rounded-lg text-sm ${
                  results[index].correct 
                    ? "bg-green-500/10 text-green-600 dark:text-green-400" 
                    : "bg-red-500/10 text-red-600 dark:text-red-400"
                }`}>
                  <div className="flex items-center gap-2">
                    {results[index].correct ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    <span>{results[index].feedback}</span>
                  </div>
                  {results[index].correctAnswer && (
                    <p className="mt-1 font-medium">
                      Helyes: {results[index].correctAnswer}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Summary */}
      {submitted && (
        <div className="mt-4 p-3 rounded-lg bg-primary/10 text-center">
          <p className="font-medium">
            Eredmény: {correctCount} / {content.sentences.length} helyes
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        {!submitted ? (
          <button
            onClick={checkTranslations}
            disabled={checking || !allFilled}
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
