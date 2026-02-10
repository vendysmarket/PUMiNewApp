// src/components/focus/InProgressBanner.tsx
// Warning banner shown when a focus day is in-progress

import { Lock, CheckCircle, RotateCcw } from "lucide-react";

interface InProgressBannerProps {
  onComplete: () => void;
  onReset: () => void;
}

export function InProgressBanner({ onComplete, onReset }: InProgressBannerProps) {
  return (
    <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <div className="flex items-start gap-3">
        <Lock className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
        
        <div className="flex-1">
          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-1">
            Fókusz nap fut
          </h3>
          <p className="text-xs text-yellow-700 dark:text-yellow-400 mb-3">
            Más menüpontok ideiglenesen zárolva vannak. Fejezd be a napot vagy archiváld a fókuszt a kilépéshez.
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={onComplete}
              className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
            >
              <CheckCircle className="w-3 h-3" />
              Nap befejezése
            </button>
            
            <button
              onClick={onReset}
              className="text-xs px-3 py-1.5 border border-foreground/20 rounded hover:bg-foreground/5 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Fókusz archiválása
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
