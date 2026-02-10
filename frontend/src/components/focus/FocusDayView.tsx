// src/components/focus/FocusDayView.tsx
// Day view - locked navigation, dashboard header, item cards with validation

import { useState } from "react";
import { Loader2, CheckCircle2, Flame, Clock, Calendar, Lock, Target, StopCircle } from "lucide-react";
import { LazyItemRenderer } from "@/components/focus/LazyItemRenderer";
import { PlanDay, FocusOutline, PlanItem } from "@/types/learningFocus";

interface FocusDayViewProps {
  currentDay: PlanDay;
  outline: FocusOutline;
  dayIndex: number;
  streak: number;
  completedItemIds: string[];
  onCompleteItem: (itemId: string, resultJson?: any) => void;
  onCompleteDay: () => void;
  onBack: () => void;
  onReset: () => void;
  loading: boolean;
}

export function FocusDayView({
  currentDay,
  outline,
  dayIndex,
  streak,
  completedItemIds,
  onCompleteItem,
  onCompleteDay,
  onBack,
  onReset,
  loading,
}: FocusDayViewProps) {
  const items = currentDay.items || [];
  const totalItems = items.length;
  const doneCount = completedItemIds.length;
  const progress = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0;
  
  // 60% threshold to complete day
  const canComplete = progress >= 60;
  
  // Find next incomplete item
  const nextIncompleteIndex = items.findIndex(item => !completedItemIds.includes(item.id));

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 pb-28 animate-fade-in">
      {/* Dashboard Header - Locked mode indicator */}
      <div className="mb-6 space-y-4">
        {/* Top bar with lock indicator and controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">
              <Lock className="w-3 h-3" />
              Fókusz aktív
            </span>
            <span className="px-2 py-1 rounded-full text-[10px] bg-foreground/10 text-foreground/60">
              Ma
            </span>
          </div>
          
          {/* Stop / Reset button */}
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                     border border-destructive/30 text-destructive
                     hover:bg-destructive/10 transition-colors"
          >
            <StopCircle className="w-3 h-3" />
            Leállítás
          </button>
        </div>

        {/* Day Info Card */}
        <div className="neon-glow-card bg-secondary/30 rounded-xl p-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-foreground text-background flex items-center justify-center shrink-0 font-bold text-lg">
              {dayIndex}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-xl font-bold truncate">{currentDay.title}</h1>
              {currentDay.intro && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{currentDay.intro}</p>
              )}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/50 bg-card/30 p-2 text-center">
            <Calendar className="w-3 h-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Nap</p>
            <p className="text-sm font-bold">{dayIndex}/{outline.days?.length || 7}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/30 p-2 text-center">
            <Flame className="w-3 h-3 mx-auto mb-0.5 text-orange-400" />
            <p className="text-xs text-muted-foreground">Streak</p>
            <p className="text-sm font-bold">{streak}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-card/30 p-2 text-center">
            <Target className="w-3 h-3 mx-auto mb-0.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Haladás</p>
            <p className="text-sm font-bold">{doneCount}/{totalItems}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                canComplete ? "bg-green-500" : "bg-foreground"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-center">
            {progress}% kész {!canComplete && "(60% kell a befejezéshez)"}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-3">
        {items.map((item, index) => {
          const isDone = completedItemIds.includes(item.id);
          const isNext = index === nextIncompleteIndex;
          
          return (
            <div 
              key={item.id}
              id={`item-${item.id}`}
              className={`transition-all duration-200 ${isNext ? "ring-2 ring-foreground/20 rounded-xl" : ""}`}
            >
              <LazyItemRenderer
                item={item}
                dayTitle={currentDay.title}
                dayIntro={currentDay.intro}
                domain={outline.domain || "other"}
                level={outline.level || "beginner"}
                onComplete={(completedItem) => {
                  onCompleteItem(completedItem.id);
                }}
              />
              
              {/* Completion overlay for done items */}
              {isDone && (
                <div className="relative -mt-3 mb-3">
                  <div className="flex items-center justify-center gap-1 py-1 text-xs text-green-500">
                    <CheckCircle2 className="w-3 h-3" />
                    Teljesítve
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-2xl mx-auto">
          {canComplete ? (
            <button
              onClick={onCompleteDay}
              disabled={loading}
              className="w-full py-4 px-6 rounded-xl font-semibold
                       bg-green-600 text-white
                       hover:bg-green-500 active:scale-[0.98]
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200
                       flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Mentés...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Nap befejezése
                </>
              )}
            </button>
          ) : nextIncompleteIndex !== -1 ? (
            <button
              onClick={() => {
                const element = document.getElementById(`item-${items[nextIncompleteIndex].id}`);
                element?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="w-full py-4 px-6 rounded-xl font-semibold
                       bg-foreground text-background
                       hover:bg-foreground/90 active:scale-[0.98]
                       transition-all duration-200 start-button-glow
                       flex items-center justify-center gap-2"
            >
              <Clock className="w-5 h-5" />
              Következő feladat
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
