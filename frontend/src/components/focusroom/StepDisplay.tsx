// components/focusroom/StepDisplay.tsx
// Center area: chat-like vertical scroll of session steps

import { useRef, useEffect } from "react";
import { Bot, User, BookOpen, PenTool, CheckCircle2, Sparkles, AlertCircle, Lightbulb } from "lucide-react";
import type { StepEntry, SessionPhase } from "@/types/focusRoom";

interface StepDisplayProps {
  steps: StepEntry[];
  /** Active task renderer (quiz/translation/writing) injected at bottom */
  activeTaskSlot?: React.ReactNode;
  phase: SessionPhase;
}

export function StepDisplay({ steps, activeTaskSlot, phase }: StepDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [steps.length, activeTaskSlot]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-4"
    >
      {steps.map((step) => (
        <StepBubble key={step.id} step={step} />
      ))}

      {/* Active task renderer slot */}
      {activeTaskSlot && (
        <div className="mt-4 p-4 rounded-xl border border-border/50 bg-card/30">
          {activeTaskSlot}
        </div>
      )}

      {/* Phase loading indicator */}
      {phase === "loading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
          <div className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" />
          Tartalom generálása...
        </div>
      )}
    </div>
  );
}

function StepBubble({ step }: { step: StepEntry }) {
  const isUser = step.type === "user_answer";

  const Icon =
    step.type === "tutor" ? Bot :
    step.type === "lesson_note" ? BookOpen :
    step.type === "task_prompt" ? PenTool :
    step.type === "evaluation" ? CheckCircle2 :
    step.type === "hint" ? Lightbulb :
    step.type === "summary" ? Sparkles :
    isUser ? User : Bot;

  const bubbleClass = isUser
    ? "ml-auto bg-primary/10 border-primary/20"
    : step.type === "evaluation"
      ? step.metadata?.correct
        ? "mr-auto bg-green-500/10 border-green-500/20"
        : "mr-auto bg-red-500/10 border-red-500/20"
      : step.type === "hint"
        ? "mr-auto bg-amber-500/10 border-amber-500/20"
        : step.type === "lesson_note"
          ? "mr-auto bg-blue-500/5 border-blue-500/20"
          : step.type === "summary"
            ? "mr-auto bg-emerald-500/10 border-emerald-500/20"
            : "mr-auto bg-secondary/50 border-border/30";

  return (
    <div className={`flex gap-3 max-w-[90%] ${isUser ? "ml-auto flex-row-reverse" : ""}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0
        ${isUser ? "bg-primary/20" :
          step.type === "hint" ? "bg-amber-500/20" :
          step.type === "evaluation" && step.metadata?.correct ? "bg-green-500/20" :
          step.type === "evaluation" ? "bg-red-500/20" :
          "bg-secondary"}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>

      <div className={`rounded-xl px-4 py-3 border text-sm leading-relaxed ${bubbleClass}`}>
        {step.type === "lesson_note" ? (
          <div
            className="prose prose-sm prose-invert max-w-none
              prose-headings:text-foreground prose-headings:mb-2 prose-headings:mt-4
              prose-p:text-foreground/90 prose-li:text-foreground/90
              prose-strong:text-foreground"
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(step.content) }}
          />
        ) : (
          <p className="whitespace-pre-wrap">{step.content}</p>
        )}

        {step.metadata?.score !== undefined && step.metadata.score > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Pontszám: {step.metadata.score}/100
          </p>
        )}

        {step.metadata?.canRetry && (
          <p className="text-xs text-amber-400 mt-1">
            Próbáld újra! (Próbálkozás: {step.metadata.attempt}/{3})
          </p>
        )}
      </div>
    </div>
  );
}

/** Minimal markdown → HTML for lesson content */
function simpleMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}
