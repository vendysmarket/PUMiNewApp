// components/focusroom/PlanSidebar.tsx
// Right sidebar showing 7-day plan with status indicators

import { CheckCircle2, Circle, Play, Lock } from "lucide-react";
import type { PlanDaySummary } from "@/types/focusRoom";

interface PlanSidebarProps {
  days: PlanDaySummary[];
  currentDayIndex: number;
  streak: number;
  onSelectDay: (dayIndex: number) => void;
}

export function PlanSidebar({ days, currentDayIndex, streak, onSelectDay }: PlanSidebarProps) {
  return (
    <div className="w-full h-full flex flex-col border-l border-border/30 bg-card/10">
      {/* Header */}
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold">7 napos terv</h3>
        {streak > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            {streak} napos sorozat
          </p>
        )}
      </div>

      {/* Day list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {days.map((day) => {
          const isActive = day.dayIndex === currentDayIndex;
          const StatusIcon =
            day.status === "completed" ? CheckCircle2 :
            day.status === "in_progress" ? Play :
            day.status === "locked" ? Lock :
            Circle;

          return (
            <button
              key={day.dayIndex}
              onClick={() => {
                if (day.status !== "locked") onSelectDay(day.dayIndex);
              }}
              disabled={day.status === "locked"}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all
                flex items-center gap-3
                ${isActive
                  ? "bg-foreground/10 border border-foreground/20"
                  : day.status === "locked"
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:bg-secondary/50"
                }`}
            >
              <StatusIcon className={`w-4 h-4 shrink-0 ${
                day.status === "completed" ? "text-green-400" :
                day.status === "in_progress" ? "text-blue-400" :
                "text-muted-foreground"
              }`} />
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-medium truncate ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {day.title}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
