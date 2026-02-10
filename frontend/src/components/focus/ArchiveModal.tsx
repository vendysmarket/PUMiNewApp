// src/components/focus/ArchiveModal.tsx
// Confirmation modal for archiving current plan and starting new one

import { AlertTriangle, X, Archive, Flame } from "lucide-react";

interface ArchiveModalProps {
  streak: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ArchiveModal({ streak, onConfirm, onCancel }: ArchiveModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* Modal */}
      <div className="relative bg-card border border-border/50 rounded-2xl p-6 max-w-sm w-full shadow-xl animate-scale-in">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-secondary/50 transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
        
        {/* Icon */}
        <div className="w-14 h-14 rounded-xl bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
          <Archive className="w-7 h-7 text-orange-400" />
        </div>
        
        {/* Title */}
        <h2 className="text-xl font-bold text-center mb-2">
          Archiválás és új terv
        </h2>
        
        {/* Description */}
        <p className="text-sm text-muted-foreground text-center mb-4">
          A jelenlegi terved archiválásra kerül. Később visszanézheted a haladást.
        </p>
        
        {/* Streak info */}
        {streak > 0 && (
          <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-6">
            <Flame className="w-5 h-5 text-orange-400" />
            <span className="text-sm">
              A <strong>{streak} napos</strong> sorozatod megmarad!
            </span>
          </div>
        )}
        
        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-xl font-medium
                     bg-secondary hover:bg-secondary/80
                     transition-all duration-200"
          >
            Mégse
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 px-4 rounded-xl font-medium
                     bg-orange-500 text-white hover:bg-orange-400
                     transition-all duration-200"
          >
            Archiválás
          </button>
        </div>
      </div>
    </div>
  );
}
