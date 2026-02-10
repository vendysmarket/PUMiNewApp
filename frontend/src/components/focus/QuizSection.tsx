import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { QuizQuestion } from "@/types/learningFocus";

interface QuizSectionProps {
  questions: QuizQuestion[];
  onAnswersChange?: (questions: QuizQuestion[]) => void;
  dimmed?: boolean;
}

export default function QuizSection({ questions, onAnswersChange, dimmed }: QuizSectionProps) {
  const { t } = useTranslation();

  const initial = useMemo(() => {
    return (questions || []).map((q, i) => ({
      id: String(i),
      question: q.question ?? "",
      options: Array.isArray(q.options) ? q.options : [],
      correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : undefined,
      selectedIndex: typeof q.selectedIndex === "number" ? q.selectedIndex : undefined,
      explanation: q.explanation ?? "",
    }));
  }, [questions]);

  const [local, setLocal] = useState(initial);

  useEffect(() => {
    setLocal(initial);
  }, [initial]);

  const choose = (qid: string, idx: number) => {
    const next = local.map((q) => (q.id === qid ? { ...q, selectedIndex: idx } : q));
    setLocal(next);
    onAnswersChange?.(next.map(({ id, ...rest }) => rest));
  };

  if (!local.length) return null;

  return (
    <section className={dimmed ? "opacity-50 pointer-events-none" : ""}>
      <h3 className="text-sm font-medium text-foreground/60 mb-2">{t("quiz") ?? "Quiz"}</h3>

      <div className="flex flex-col gap-4">
        {local.map((q) => (
          <div key={q.id} className="rounded-xl border border-foreground/10 bg-background/10 p-3">
            <p className="text-sm text-foreground/80 mb-2">{q.question}</p>

            <div className="flex flex-col gap-1.5">
              {q.options.map((opt, idx) => {
                const chosen = q.selectedIndex === idx;
                const correct = typeof q.correctIndex === "number" ? q.correctIndex === idx : undefined;
                const showCorrect = typeof q.correctIndex === "number" && typeof q.selectedIndex === "number";
                const isGood = showCorrect ? (chosen && correct) : false;
                const isBad = showCorrect ? (chosen && !correct) : false;

                return (
                  <button
                    key={idx}
                    onClick={() => choose(q.id, idx)}
                    className={[
                      "w-full text-left rounded-xl border px-3 py-2 transition",
                      "border-foreground/10 bg-background/10 hover:bg-foreground/5",
                      chosen ? "ring-2 ring-foreground/15" : "",
                      isGood ? "border-foreground/30 bg-foreground/10" : "",
                      isBad ? "border-red-500/30 bg-red-500/10" : "",
                    ].join(" ")}
                  >
                    <span className="text-sm text-foreground/70">{opt}</span>
                  </button>
                );
              })}
            </div>

            {typeof q.correctIndex === "number" && typeof q.selectedIndex === "number" ? (
              <p className="mt-2 text-xs text-foreground/50">
                {q.selectedIndex === q.correctIndex ? (t("correct") ?? "Correct") : (t("incorrect") ?? "Try again")}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
