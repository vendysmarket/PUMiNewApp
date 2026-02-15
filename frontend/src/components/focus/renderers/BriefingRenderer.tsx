import { useState } from "react";
import { Briefcase, Target, CheckCircle2 } from "lucide-react";
import type { BriefingContent } from "@/types/focusItem";

interface BriefingRendererProps {
  content: BriefingContent;
  onValidationChange: (state: { itemsCompleted: number }) => void;
}

export function BriefingRenderer({ content, onValidationChange }: BriefingRendererProps) {
  const [read, setRead] = useState(false);

  const handleMarkRead = () => {
    setRead(true);
    onValidationChange({ itemsCompleted: 1 });
  };

  return (
    <div className="space-y-4">
      {/* Situation Card */}
      <div className="rounded-lg border border-primary/20 overflow-hidden">
        <div className="flex items-center gap-2 p-3 bg-primary/10">
          <Briefcase className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Mai helyzet</span>
        </div>
        <div className="p-4">
          <p className="text-sm leading-relaxed text-foreground/90">
            {content.situation}
          </p>
        </div>
      </div>

      {/* Outcome Highlight */}
      {content.outcome && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4">
          <div className="flex items-start gap-3">
            <Target className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                Ma elered:
              </p>
              <p className="text-sm font-medium text-foreground">
                {content.outcome}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Vocabulary Preview */}
      {content.key_vocabulary_preview && content.key_vocabulary_preview.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground/60 uppercase tracking-wide">
            Kulcs kifejezesek
          </p>
          <div className="flex flex-wrap gap-2">
            {content.key_vocabulary_preview.map((term, i) => (
              <span
                key={i}
                className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
              >
                {term}
              </span>
            ))}
          </div>
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
