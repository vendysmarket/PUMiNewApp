// src/components/focus/FocusOutlineView.tsx
// Outline view with day-based locking - only current day is accessible

import { ChevronRight, Loader2, Target, Lock, CheckCircle, Clock, MoreHorizontal, Flame, Calendar, TrendingUp } from "lucide-react";
import { FocusOutline, OutlineDay } from "@/types/learningFocus";
import { FocusPlanMeta } from "@/types/focusWizard";

interface FocusOutlineViewProps {
  outline: FocusOutline;
  planMeta: FocusPlanMeta;
  selectedDayIndex: number;
  loadingDay: number | null;
  inProgressDay: boolean;
  streak: number;
  todayCompleted: boolean;
  onStartDay: (dayIndex: number) => void;
  onContinueDay: () => void;
  onBack: () => void;
  onNewPlan: () => void;
}

type DayStatus = "done" | "today" | "locked";

export function FocusOutlineView({
  outline,
  planMeta,
  selectedDayIndex,
  loadingDay,
  inProgressDay,
  streak,
  todayCompleted,
  onStartDay,
  onContinueDay,
  onBack,
  onNewPlan,
}: FocusOutlineViewProps) {
  
  const todayIndex = planMeta.currentDayIndex;
  const progressPercent = Math.round((planMeta.completedDays.length / planMeta.durationDays) * 100);

  // Day status: done, today (accessible), or locked
  const getDayStatus = (dayNum: number): DayStatus => {
    if (planMeta.completedDays.includes(dayNum)) return "done";
    if (dayNum === todayIndex) return "today";
    return "locked";
  };

  const getStatusIcon = (status: DayStatus) => {
    switch (status) {
      case "done": return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "today": return <Clock className="w-4 h-4 text-foreground" />;
      case "locked": return <Lock className="w-4 h-4 text-muted-foreground/50" />;
    }
  };

  const getStatusLabel = (status: DayStatus) => {
    switch (status) {
      case "done": return "Kész";
      case "today": return inProgressDay ? "Folyamatban" : todayCompleted ? "Befejezve" : "Ma";
      case "locked": return "Zárolva";
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 pb-28 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors"
          >
            ← Vissza
          </button>
          
          <button
            onClick={onNewPlan}
            className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
            title="Új terv"
          >
            <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        
        {/* Plan Info */}
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
            <Target className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold truncate">{outline.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="neon-badge px-3 py-1 rounded-full text-xs">
                {outline.days?.length || 0} nap
              </span>
              <span className="neon-badge px-3 py-1 rounded-full text-xs">
                {outline.minutes_per_day || 45} perc/nap
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-lg border border-border/50 bg-card/30 p-2 text-center">
            <Calendar className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-bold">{todayIndex}. nap</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/30 p-2 text-center">
            <Flame className="w-3 h-3 mx-auto mb-1 text-orange-400" />
            <p className="text-sm font-bold">{streak}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/30 p-2 text-center">
            <TrendingUp className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
            <p className="text-sm font-bold">{progressPercent}%</p>
          </div>
        </div>
      </div>

      {/* Day Cards - Visual list, not interactive (except today) */}
      <div className="space-y-2">
        {outline.days?.map((day, index) => {
          const dayNum = index + 1;
          const status = getDayStatus(dayNum);
          const isToday = dayNum === todayIndex;
          const isLocked = status === "locked";
          const isDone = status === "done";
          const isLoading = loadingDay === dayNum;
          
          return (
            <div
              key={dayNum}
              className={`w-full p-4 rounded-xl transition-all duration-200
                ${isToday && !todayCompleted
                  ? "neon-glow-card bg-secondary/50 border border-foreground/20"
                  : isDone
                    ? "bg-green-500/10 border border-green-500/20"
                    : "bg-card/20 border border-border/30 opacity-60"
                }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Day Number Badge */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm
                    ${isDone 
                      ? "bg-green-500/20 text-green-400"
                      : isToday 
                        ? "bg-foreground text-background" 
                        : "bg-secondary text-muted-foreground"}`}>
                    {dayNum}
                  </div>
                  
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className={`font-medium truncate ${isLocked ? "text-muted-foreground" : ""}`}>
                        {day.title}
                      </h3>
                    </div>
                    {day.intro && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {day.intro}
                      </p>
                    )}
                  </div>
                </div>
                
                {/* Status indicator */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1">
                    {getStatusIcon(status)}
                    <span className={`text-xs ${isDone ? "text-green-400" : "text-muted-foreground"}`}>
                      {getStatusLabel(status)}
                    </span>
                  </div>
                  
                  {isLoading && (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Locked info */}
      <p className="text-xs text-muted-foreground text-center mt-6">
        A következő napok zárolva vannak, amíg a mai napot nem fejezed be.
      </p>

      {/* Sticky Bottom CTA - Single main action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-2xl mx-auto">
          {todayCompleted ? (
            <button
              disabled
              className="w-full py-4 px-6 rounded-xl font-semibold
                       bg-foreground/20 text-foreground/50
                       cursor-not-allowed
                       flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              Mai nap befejezve – holnap jöhetsz
            </button>
          ) : inProgressDay ? (
            <button
              onClick={onContinueDay}
              disabled={loadingDay !== null}
              className="w-full py-4 px-6 rounded-xl font-semibold
                       bg-foreground text-background
                       hover:bg-foreground/90 active:scale-[0.98]
                       disabled:opacity-50
                       transition-all duration-200 start-button-glow
                       flex items-center justify-center gap-2"
            >
              {loadingDay ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Betöltés...
                </>
              ) : (
                <>
                  <ChevronRight className="w-5 h-5" />
                  Folytatás
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => onStartDay(todayIndex)}
              disabled={loadingDay !== null}
              className="w-full py-4 px-6 rounded-xl font-semibold
                       bg-foreground text-background
                       hover:bg-foreground/90 active:scale-[0.98]
                       disabled:opacity-50
                       transition-all duration-200 start-button-glow
                       flex items-center justify-center gap-2"
            >
              {loadingDay ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Nap indítása...
                </>
              ) : (
                <>
                  <Clock className="w-5 h-5" />
                  Indítsd a mai fókuszt
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
