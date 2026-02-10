import { useState } from "react";
import { Check, Square } from "lucide-react";
import type { ChecklistContent } from "@/types/focusItem";

interface ChecklistRendererProps {
  content: ChecklistContent;
  minChars: number;
  onValidationChange: (state: { itemsCompleted: number; charCount: number; proofText: string }) => void;
}

export function ChecklistRenderer({ content, minChars, onValidationChange }: ChecklistRendererProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [proofText, setProofText] = useState("");

  const toggleStep = (index: number) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(index)) {
      newCompleted.delete(index);
    } else {
      newCompleted.add(index);
    }
    setCompletedSteps(newCompleted);
    onValidationChange({
      itemsCompleted: newCompleted.size,
      charCount: proofText.length,
      proofText,
    });
  };

  const handleProofChange = (value: string) => {
    setProofText(value);
    onValidationChange({
      itemsCompleted: completedSteps.size,
      charCount: value.length,
      proofText: value,
    });
  };

  const allStepsCompleted = completedSteps.size === content.steps.length;
  const charProgress = Math.min(100, (proofText.length / minChars) * 100);
  const isValidProof = proofText.length >= minChars;

  return (
    <div className="space-y-4">
      {/* Steps */}
      <div className="space-y-2">
        {content.steps.map((step, index) => {
          const isCompleted = completedSteps.has(index);
          
          return (
            <button
              key={index}
              onClick={() => toggleStep(index)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left ${
                isCompleted
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-foreground/20 hover:border-primary/50 hover:bg-foreground/5"
              }`}
            >
              <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                isCompleted
                  ? "bg-green-500 text-white"
                  : "border-2 border-foreground/30"
              }`}>
                {isCompleted ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Square className="w-3 h-3 opacity-0" />
                )}
              </div>
              <span className={`text-sm ${isCompleted ? "text-foreground/70 line-through" : "text-foreground"}`}>
                {step.instruction}
              </span>
            </button>
          );
        })}
      </div>

      {/* Progress */}
      <div className="text-sm text-muted-foreground text-center">
        {completedSteps.size} / {content.steps.length} lépés kész
      </div>

      {/* Proof text */}
      {allStepsCompleted && (
        <div className="space-y-2 pt-4 border-t border-foreground/10">
          <label className="block text-sm font-medium text-foreground">
            {content.proof_prompt || "Írd le, hogyan végezted el a feladatot:"}
          </label>
          <textarea
            value={proofText}
            onChange={(e) => handleProofChange(e.target.value)}
            placeholder={`Min. ${minChars} karakter...`}
            rows={4}
            className="w-full px-4 py-3 rounded-lg border border-foreground/20 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          
          {/* Character progress */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex-1 h-1 bg-foreground/10 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${isValidProof ? "bg-green-500" : "bg-primary"}`}
                style={{ width: `${charProgress}%` }}
              />
            </div>
            <span className={isValidProof ? "text-green-600" : "text-muted-foreground"}>
              {proofText.length} / {minChars}
            </span>
          </div>
        </div>
      )}

      {/* Hint if not all completed */}
      {!allStepsCompleted && (
        <p className="text-xs text-muted-foreground text-center">
          Jelöld be az összes lépést a folytatáshoz
        </p>
      )}
    </div>
  );
}
