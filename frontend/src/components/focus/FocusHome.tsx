// src/components/focus/FocusHome.tsx
// Focus Home with 3 states: No active focus, Active plan, In-progress day

import { Sparkles, Play, Flame, MoreHorizontal, BarChart3, List, Plus, BookOpen, Target, Calendar, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import { FocusPlanMeta } from "@/types/focusWizard";
import pumiLogo from "@/assets/pumi-logo.png";

interface FocusHomeProps {
  activePlan: FocusPlanMeta | null;
  inProgressDay: boolean;
  streak: number; // New: pass streak from parent (fresh from stats API)
  todayCompleted: boolean; // New: whether today's day is already done
  onStartWizard: () => void;
  onContinueDay: () => void;
  onViewOutline: () => void;
  onViewProgress: () => void;
  onNewPlan: () => void;
}

export function FocusHome({
  activePlan,
  inProgressDay,
  streak,
  todayCompleted,
  onStartWizard,
  onContinueDay,
  onViewOutline,
  onViewProgress,
  onNewPlan,
}: FocusHomeProps) {
  // ============================================================================
  // STATE 1: No active focus
  // ============================================================================
  if (!activePlan) {
    return (
      <div className="min-h-[80vh] flex flex-col px-4 md:px-6 animate-fade-in">
        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="relative mb-6">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-secondary/50 flex items-center justify-center focus-icon-glow p-4">
              <img src={pumiLogo} alt="PUMi" className="w-full h-full object-contain" />
            </div>
            <div className="absolute -top-1 -right-1">
              <Sparkles className="w-5 h-5 text-muted-foreground animate-pulse" />
            </div>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold mb-2 welcome-glow-block">
            Indíts új fókuszt
          </h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-sm mb-8">
            Strukturált tanulási vagy projekt terv, napi feladatokkal
          </p>

          {/* Template Buttons */}
          <div className="w-full max-w-sm space-y-3 mb-8">
            <button
              onClick={onStartWizard}
              className="w-full py-4 px-6 rounded-xl font-semibold
                       bg-foreground text-background
                       hover:bg-foreground/90 active:scale-[0.98]
                       transition-all duration-200 start-button-glow
                       flex items-center justify-center gap-3"
            >
              <Plus className="w-5 h-5" />
              Új fókusz létrehozása
            </button>

            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: BookOpen, label: "Nyelvtanulás", type: "language" },
                { icon: Target, label: "Projekt", type: "project" },
              ].map(({ icon: Icon, label, type }) => (
                <button
                  key={type}
                  onClick={onStartWizard}
                  className="py-3 px-4 rounded-xl text-sm
                           bg-secondary/50 border border-border/50
                           hover:bg-secondary hover:border-foreground/30
                           transition-all duration-200
                           flex items-center justify-center gap-2"
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* How it works */}
          <p className="text-xs text-muted-foreground max-w-xs">
            A fókusz mód napi feladatokat generál a célod eléréséhez, 
            és követi a haladásodat.
          </p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // STATE 2 & 3: Active plan (with or without in-progress day)
  // ============================================================================
  
  // Determine day status
  const getDayStatus = () => {
    if (inProgressDay) return { label: "Folyamatban", color: "text-emerald-400", bg: "bg-emerald-500/20" };
    if (todayCompleted) return { label: "Kész ✓", color: "text-green-400", bg: "bg-green-500/20" };
    return { label: "Indítható", color: "text-blue-400", bg: "bg-blue-500/20" };
  };
  
  const dayStatus = getDayStatus();
  const progressPercent = Math.round((activePlan.completedDays.length / activePlan.durationDays) * 100);

  return (
    <div className="min-h-[80vh] flex flex-col px-4 md:px-6 animate-fade-in">
      {/* Status Bar */}
      <div className="py-4 border-b border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="neon-badge px-3 py-1 rounded-full text-xs font-medium">
              {activePlan.focusType === "language" ? "Nyelv" : 
               activePlan.focusType === "project" ? "Projekt" :
               activePlan.focusType === "study" ? "Tanulás" : "Fókusz"}
            </span>
            {inProgressDay && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Fókusz fut
              </span>
            )}
          </div>
          
          {/* Overflow menu */}
          <button
            onClick={onNewPlan}
            className="p-2 rounded-lg hover:bg-secondary/50 transition-colors"
          >
            <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Dashboard Cards - 3 compact cards */}
      <div className="grid grid-cols-3 gap-2 py-4">
        {/* Mai nap card */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-3 text-center">
          <Calendar className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
          <p className="text-lg font-bold">{activePlan.currentDayIndex}. nap</p>
          <p className={`text-[10px] px-2 py-0.5 rounded-full inline-block ${dayStatus.bg} ${dayStatus.color}`}>
            {dayStatus.label}
          </p>
        </div>
        
        {/* Streak card */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-3 text-center">
          <Flame className="w-4 h-4 mx-auto mb-1 text-orange-400" />
          <p className="text-lg font-bold">{streak}</p>
          <p className="text-[10px] text-muted-foreground">nap streak</p>
        </div>
        
        {/* Progress card */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-3 text-center">
          <TrendingUp className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
          <p className="text-lg font-bold">{progressPercent}%</p>
          <p className="text-[10px] text-muted-foreground">{activePlan.completedDays.length}/{activePlan.durationDays}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center py-4">
        {/* Goal Card */}
        <div className="neon-glow-card bg-card/30 rounded-2xl p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <Target className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground mb-1">Cél</p>
              <p className="font-medium line-clamp-2">{activePlan.goal}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{activePlan.durationDays} nap</span>
                <span>•</span>
                <span>{activePlan.minutesPerDay} perc/nap</span>
              </div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{activePlan.completedDays.length} / {activePlan.durationDays} nap</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden progress-bar-glow">
              <div 
                className="h-full bg-foreground rounded-full transition-all duration-500 progress-bar-fill-glow"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Secondary Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={onViewOutline}
            className="py-3 px-4 rounded-xl text-sm
                     bg-secondary/50 border border-border/50
                     hover:bg-secondary hover:border-foreground/30
                     transition-all duration-200
                     flex items-center justify-center gap-2"
          >
            <List className="w-4 h-4" />
            Napok
          </button>
          <button
            onClick={onViewProgress}
            className="py-3 px-4 rounded-xl text-sm
                     bg-secondary/50 border border-border/50
                     hover:bg-secondary hover:border-foreground/30
                     transition-all duration-200
                     flex items-center justify-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            Haladás
          </button>
        </div>
      </div>

      {/* Sticky Bottom CTA */}
      <div className="sticky bottom-0 py-4 bg-gradient-to-t from-background via-background to-transparent">
        {todayCompleted && !inProgressDay ? (
          // Today already completed - show disabled state
          <button
            disabled
            className="w-full py-4 px-6 rounded-xl font-semibold text-lg
                     bg-foreground/20 text-foreground/50
                     cursor-not-allowed
                     flex items-center justify-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5" />
            Mai nap teljesítve
          </button>
        ) : (
          <button
            onClick={onContinueDay}
            className="w-full py-4 px-6 rounded-xl font-semibold text-lg
                     bg-foreground text-background
                     hover:bg-foreground/90 active:scale-[0.98]
                     transition-all duration-200 start-button-glow
                     flex items-center justify-center gap-3"
          >
            <Play className="w-5 h-5" />
            {inProgressDay ? "Nap folytatása" : "Mai nap indítása"}
          </button>
        )}
      </div>
    </div>
  );
}
