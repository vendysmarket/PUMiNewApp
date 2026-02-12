import { useState } from "react";
import { BookOpen, Lightbulb, AlertTriangle, CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { LessonContent } from "@/types/focusItem";

interface LessonRendererProps {
  content: LessonContent;
  onValidationChange: (state: { itemsCompleted: number }) => void;
}

export function LessonRenderer({ content, onValidationChange }: LessonRendererProps) {
  const [read, setRead] = useState(false);
  const [microAnswer, setMicroAnswer] = useState("");

  const handleMarkRead = () => {
    setRead(true);
    onValidationChange({ itemsCompleted: 1 });
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      {content.summary && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{content.summary}</ReactMarkdown>
        </div>
      )}

      {/* Key points */}
      {content.key_points && content.key_points.length > 0 && (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Kulcspontok</span>
          </div>
          <ul className="space-y-1">
            {content.key_points.map((point, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Example */}
      {content.example && (
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">Példa</span>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{content.example}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Common mistakes */}
      {content.common_mistakes && content.common_mistakes.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium">Gyakori hibák</span>
          </div>
          <ul className="space-y-1">
            {content.common_mistakes.map((mistake, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">!</span>
                <span>{mistake}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Micro task */}
      {content.micro_task && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-sm font-medium mb-2">{content.micro_task.instruction}</p>
          <textarea
            value={microAnswer}
            onChange={(e) => setMicroAnswer(e.target.value)}
            placeholder="Írd ide a válaszod..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-foreground/20 bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {content.micro_task.expected_output && microAnswer.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Elvárt válasz: {content.micro_task.expected_output}
            </p>
          )}
        </div>
      )}

      {/* Mark as read */}
      {!read ? (
        <button
          onClick={handleMarkRead}
          className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          Elolvastam
        </button>
      ) : (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 justify-center py-2">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm font-medium">Elolvasva</span>
        </div>
      )}
    </div>
  );
}
