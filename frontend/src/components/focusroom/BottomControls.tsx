// components/focusroom/BottomControls.tsx
// Bottom control bar for session navigation
// Phases: loading → intro → teach → task → evaluate → retry → summary → end

import { Play, Pause, SkipForward, Volume2, VolumeX, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";
import type { SessionPhase } from "@/types/focusRoom";

interface BottomControlsProps {
  phase: SessionPhase;
  isAudioPlaying: boolean;
  isMuted: boolean;
  isLoading: boolean;
  onPlayPause: () => void;
  onMuteToggle: () => void;
  onNext: () => void;
  onCompleteDay: () => void;
  onExit: () => void;
  scriptProgress?: { current: number; total: number };
  taskProgress?: { current: number; total: number };
}

const PHASE_LABELS: Record<SessionPhase, string> = {
  loading: "Betöltés",
  intro: "Bevezető",
  teach: "Lecke",
  task: "Gyakorlat",
  evaluate: "Értékelés",
  retry: "Újrapróbálkozás",
  summary: "Összefoglaló",
  end: "",
};

export function BottomControls({
  phase,
  isAudioPlaying,
  isMuted,
  isLoading,
  onPlayPause,
  onMuteToggle,
  onNext,
  onCompleteDay,
  onExit,
  scriptProgress,
  taskProgress,
}: BottomControlsProps) {
  if (phase === "loading") {
    return (
      <div className="border-t border-border/30 px-4 py-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Tartalom generálása...
      </div>
    );
  }

  if (phase === "end") return null;

  // Determine next button label
  const nextLabel =
    phase === "intro" ? "Lecke indítása" :
    phase === "teach" ? "Tovább" :
    phase === "evaluate" ? "Következő feladat" :
    phase === "retry" ? "Újra próbálom" :
    "Tovább";

  // Disable next during task (user must submit answer)
  const nextDisabled = phase === "task" || isLoading;

  return (
    <div className="border-t border-border/30 px-4 py-3 flex items-center gap-3">
      {/* Audio controls — during teach phase */}
      {phase === "teach" && (
        <>
          {isAudioPlaying && (
            <button
              onClick={onPlayPause}
              className="p-2.5 rounded-lg bg-secondary/50 border border-border/50
                       hover:bg-secondary transition-colors"
              title="Hang leállítása"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onMuteToggle}
            className="p-2.5 rounded-lg bg-secondary/50 border border-border/50
                     hover:bg-secondary transition-colors"
            title={isMuted ? "Hang be" : "Hang ki"}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Phase indicator + progress */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground hidden md:block">
          {PHASE_LABELS[phase]}
        </span>
        {phase === "teach" && scriptProgress && (
          <span className="text-[10px] text-muted-foreground/70 hidden md:block">
            ({scriptProgress.current}/{scriptProgress.total})
          </span>
        )}
        {(phase === "task" || phase === "retry" || phase === "evaluate") && taskProgress && (
          <span className="text-[10px] text-muted-foreground/70 hidden md:block">
            ({taskProgress.current}/{taskProgress.total})
          </span>
        )}
      </div>

      {/* Summary phase: complete day */}
      {phase === "summary" && (
        <button
          onClick={onCompleteDay}
          disabled={isLoading}
          className="py-2.5 px-6 rounded-xl font-semibold text-sm
                   bg-foreground text-background
                   hover:bg-foreground/90 active:scale-[0.98]
                   disabled:opacity-50
                   transition-all flex items-center gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          Nap befejezése
        </button>
      )}

      {/* Next / retry button */}
      {phase !== "summary" && phase !== "end" && phase !== "task" && (
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="py-2.5 px-6 rounded-xl font-semibold text-sm
                   bg-foreground text-background
                   hover:bg-foreground/90 active:scale-[0.98]
                   disabled:opacity-30 disabled:cursor-not-allowed
                   transition-all flex items-center gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : phase === "retry" ? (
            <RotateCcw className="w-4 h-4" />
          ) : (
            <SkipForward className="w-4 h-4" />
          )}
          {nextLabel}
        </button>
      )}

      {/* Task phase — input is handled by the task renderer, just show a label */}
      {phase === "task" && (
        <span className="text-xs text-muted-foreground italic">
          Válaszolj a feladatra fent
        </span>
      )}
    </div>
  );
}
