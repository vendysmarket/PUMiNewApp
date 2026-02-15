import { useState } from "react";
import { Lock, CheckCircle2, ArrowRight, Star, MessageSquare, Repeat2 } from "lucide-react";
import type { FeedbackContent } from "@/types/focusItem";

interface FeedbackRendererProps {
  content: FeedbackContent;
  onValidationChange: (state: { itemsCompleted: number }) => void;
}

export function FeedbackRenderer({ content, onValidationChange }: FeedbackRendererProps) {
  const [read, setRead] = useState(false);

  const handleMarkRead = () => {
    setRead(true);
    onValidationChange({ itemsCompleted: 1 });
  };

  // Placeholder: production not yet completed
  if (content.placeholder || (!content.corrections?.length && !content.improved_version)) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
        <Lock className="w-8 h-8 text-foreground/30" />
        <p className="text-sm text-foreground/60 font-medium">
          {content.message || "Eloszor fejezd be a szovegalkotas feladatot!"}
        </p>
        <p className="text-xs text-foreground/40">
          A visszajelzes automatikusan megjelenik, ha kesz az irasos feladat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* User's Original Text */}
      {content.user_text && (
        <div className="rounded-lg border border-foreground/10 overflow-hidden">
          <div className="flex items-center gap-2 p-3 bg-foreground/5">
            <MessageSquare className="w-4 h-4 text-foreground/60" />
            <span className="text-sm font-medium text-foreground/70">A te verziod</span>
          </div>
          <div className="p-4">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{content.user_text}</p>
          </div>
        </div>
      )}

      {/* Corrections */}
      {content.corrections && content.corrections.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 overflow-hidden">
          <div className="flex items-center gap-2 p-3 bg-amber-500/10">
            <ArrowRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Javitasok ({content.corrections.length})
            </span>
          </div>
          <div className="divide-y divide-foreground/5">
            {content.corrections.map((c, i) => (
              <div key={i} className="p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="line-through text-red-500/70">{c.original}</span>
                  <ArrowRight className="w-3 h-3 text-foreground/30 shrink-0" />
                  <span className="font-medium text-green-600 dark:text-green-400">{c.corrected}</span>
                </div>
                {c.explanation && (
                  <p className="text-xs text-foreground/50 pl-1">{c.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improved Version */}
      {content.improved_version && (
        <div className="rounded-lg border border-green-500/20 overflow-hidden">
          <div className="flex items-center gap-2 p-3 bg-green-500/10">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-700 dark:text-green-300">Javitott verzio</span>
          </div>
          <div className="p-4">
            <p className="text-sm text-foreground whitespace-pre-wrap">{content.improved_version}</p>
          </div>
        </div>
      )}

      {/* Alternative Tone */}
      {content.alternative_tone && (
        <div className="rounded-lg border border-blue-500/20 overflow-hidden">
          <div className="flex items-center gap-2 p-3 bg-blue-500/10">
            <Repeat2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Mas hangnem</span>
          </div>
          <div className="p-4">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{content.alternative_tone}</p>
          </div>
        </div>
      )}

      {/* Score + Praise */}
      {(content.score || content.praise) && (
        <div className="rounded-lg bg-primary/5 border border-primary/10 p-4 space-y-2">
          {content.score && (
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < content.score! ? "text-yellow-500 fill-yellow-500" : "text-foreground/20"
                  }`}
                />
              ))}
              <span className="text-xs text-foreground/50 ml-2">{content.score}/5</span>
            </div>
          )}
          {content.praise && (
            <p className="text-sm text-foreground/70">{content.praise}</p>
          )}
        </div>
      )}

      {/* Mark as Read */}
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
