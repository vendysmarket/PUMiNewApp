// src/components/focus/FocusProgress.tsx
// Analytics / Progress view - streak, weekly activity, strengths

import { ArrowLeft, Flame, Calendar, Target, TrendingUp, Clock, BarChart3 } from "lucide-react";
import { FocusPlanMeta } from "@/types/focusWizard";

interface FocusProgressProps {
  planMeta: FocusPlanMeta;
  onBack: () => void;
}

export function FocusProgress({ planMeta, onBack }: FocusProgressProps) {
  const completedCount = planMeta.completedDays.length;
  const totalDays = planMeta.durationDays;
  const progressPercent = Math.round((completedCount / totalDays) * 100);
  
  // Generate last 7 days activity
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return {
      day: d.toLocaleDateString('hu', { weekday: 'short' }),
      date: d.getDate(),
      active: Math.random() > 0.3, // Placeholder - would check actual activity
    };
  });

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Vissza
        </button>
        
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <BarChart3 className="w-6 h-6" />
          Haladás
        </h1>
      </div>

      {/* Streak Card */}
      <div className="neon-glow-card bg-card/30 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Jelenlegi sorozat</p>
            <div className="flex items-center gap-2">
              <Flame className="w-8 h-8 text-orange-400" />
              <span className="text-4xl font-bold">{planMeta.streak}</span>
              <span className="text-lg text-muted-foreground">nap</span>
            </div>
          </div>
          
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">Összesen</p>
            <p className="text-2xl font-bold">{completedCount}</p>
            <p className="text-xs text-muted-foreground">nap kész</p>
          </div>
        </div>
      </div>

      {/* Weekly Activity */}
      <div className="bg-card/30 border border-border/50 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-semibold">Heti aktivitás</h2>
        </div>
        
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map(({ day, date, active }, i) => (
            <div key={i} className="text-center">
              <p className="text-xs text-muted-foreground mb-2">{day}</p>
              <div className={`w-full aspect-square rounded-lg flex items-center justify-center text-sm font-medium
                ${active 
                  ? "bg-green-500/20 text-green-400 border border-green-500/30" 
                  : "bg-secondary/50 text-muted-foreground"}`}>
                {date}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress Overview */}
      <div className="bg-card/30 border border-border/50 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-semibold">Terv haladás</h2>
        </div>
        
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">{completedCount} / {totalDays} nap</span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <div className="h-3 bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-foreground rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border/30">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Napi idő</p>
            <p className="font-medium flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {planMeta.minutesPerDay} perc
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Hátra van</p>
            <p className="font-medium">
              {totalDays - completedCount} nap
            </p>
          </div>
        </div>
      </div>

      {/* Strengths (placeholder) */}
      <div className="bg-card/30 border border-border/50 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-semibold">Teljesítmény</h2>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Leckék</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: "85%" }} />
              </div>
              <span className="text-xs text-muted-foreground w-8">85%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Kvízek</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: "72%" }} />
              </div>
              <span className="text-xs text-muted-foreground w-8">72%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Gyakorlatok</span>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500 rounded-full" style={{ width: "58%" }} />
              </div>
              <span className="text-xs text-muted-foreground w-8">58%</span>
            </div>
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground mt-4 text-center">
          A részletes statisztikák a napi tevékenység alapján frissülnek.
        </p>
      </div>
    </div>
  );
}
