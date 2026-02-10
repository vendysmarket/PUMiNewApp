import { useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import type { QuizContent } from "@/types/focusItem";

interface QuizRendererProps {
  content: QuizContent;
  onValidationChange: (state: { itemsCompleted: number }) => void;
}

export function QuizRenderer({ content, onValidationChange }: QuizRendererProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>(() =>
    content.questions.map(() => null)
  );
  const [revealed, setRevealed] = useState<boolean[]>(() =>
    content.questions.map(() => false)
  );

  const handleSelect = (questionIndex: number, optionIndex: number) => {
    if (revealed[questionIndex]) return;

    const newSelected = [...selectedAnswers];
    newSelected[questionIndex] = optionIndex;
    setSelectedAnswers(newSelected);

    const newRevealed = [...revealed];
    newRevealed[questionIndex] = true;
    setRevealed(newRevealed);

    // Update validation state
    const answeredCount = newRevealed.filter(Boolean).length;
    onValidationChange({ itemsCompleted: answeredCount });
  };

  const answeredCount = revealed.filter(Boolean).length;
  const correctCount = content.questions.reduce((count, q, i) => {
    if (revealed[i] && selectedAnswers[i] === q.correct_index) {
      return count + 1;
    }
    return count;
  }, 0);

  return (
    <div className="space-y-6">
      {content.questions.map((question, qIndex) => {
        const isRevealed = revealed[qIndex];
        const isCorrect = selectedAnswers[qIndex] === question.correct_index;

        return (
          <div key={qIndex} className="space-y-3">
            <p className="font-medium text-foreground">
              {qIndex + 1}. {question.question}
            </p>

            <div className="grid gap-2">
              {question.options.map((option, oIndex) => {
                const isSelected = selectedAnswers[qIndex] === oIndex;
                const isCorrectOption = oIndex === question.correct_index;

                let buttonClass = "w-full text-left px-4 py-3 rounded-lg border transition-colors ";
                
                if (!isRevealed) {
                  buttonClass += isSelected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-foreground/20 hover:border-primary/50 hover:bg-foreground/5 text-foreground";
                } else {
                  if (isCorrectOption) {
                    buttonClass += "border-green-500 bg-green-500/10 text-green-600 dark:text-green-400";
                  } else if (isSelected && !isCorrectOption) {
                    buttonClass += "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400";
                  } else {
                    buttonClass += "border-foreground/10 text-foreground/50";
                  }
                }

                return (
                  <button
                    key={oIndex}
                    onClick={() => handleSelect(qIndex, oIndex)}
                    disabled={isRevealed}
                    className={buttonClass}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-sm font-medium">
                        {String.fromCharCode(65 + oIndex)}
                      </span>
                      <span className="flex-1">{option}</span>
                      {isRevealed && isCorrectOption && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                      {isRevealed && isSelected && !isCorrectOption && (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Explanation */}
            {isRevealed && question.explanation && (
              <div className={`p-3 rounded-lg text-sm ${
                isCorrect 
                  ? "bg-green-500/10 text-green-600 dark:text-green-400" 
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}>
                <p className="font-medium mb-1">
                  {isCorrect ? "✓ Helyes!" : "✗ Helytelen"}
                </p>
                <p>{question.explanation}</p>
              </div>
            )}
          </div>
        );
      })}

      {/* Summary */}
      {answeredCount === content.questions.length && (
        <div className="mt-4 p-4 rounded-lg bg-primary/10 text-center">
          <p className="text-lg font-semibold text-foreground">
            Eredmény: {correctCount} / {content.questions.length} helyes
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {correctCount === content.questions.length
              ? "🎉 Tökéletes!"
              : correctCount >= content.questions.length / 2
              ? "👍 Jó munka!"
              : "📚 Gyakorolj tovább!"}
          </p>
        </div>
      )}
    </div>
  );
}
