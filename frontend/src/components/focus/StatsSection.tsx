import { useTranslation } from "@/hooks/useTranslation";
import { TrendingUp, Clock, Zap, Target } from "lucide-react";

interface StatsSectionProps {
  minutesPerDay: number;
  completedDays: number;
  streak: number;
}

const StatsSection = ({ minutesPerDay, completedDays, streak }: StatsSectionProps) => {
  const { t } = useTranslation();

  // Calculate activity level based on streak
  const activityLevel = streak >= 7 ? "high" : streak >= 3 ? "medium" : "low";
  const activityColor = activityLevel === "high" 
    ? "text-green-400" 
    : activityLevel === "medium" 
    ? "text-yellow-400" 
    : "text-foreground/40";

  return (
    <div className="w-full max-w-sm space-y-3">
      {/* Daily Focus Minutes */}
      <div className="flex items-center justify-between px-4 py-2 rounded-xl border border-foreground/10 bg-foreground/5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-foreground/50" />
          <span className="text-xs text-foreground/60">{t("dailyFocusMinutes")}</span>
        </div>
        <span className="text-sm font-medium text-foreground/80">{minutesPerDay} perc</span>
      </div>

      {/* Activity Level */}
      <div className="flex items-center justify-between px-4 py-2 rounded-xl border border-foreground/10 bg-foreground/5">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${activityColor}`} />
          <span className="text-xs text-foreground/60">{t("activityLevel")}</span>
        </div>
        <span className={`text-sm font-medium ${activityColor}`}>
          {activityLevel === "high" ? "Magas" : activityLevel === "medium" ? "Közepes" : "Alacsony"}
        </span>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between px-4 py-2 rounded-xl border border-foreground/10 bg-foreground/5">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-foreground/50" />
          <span className="text-xs text-foreground/60">{t("completedDays")}</span>
        </div>
        <span className="text-sm font-medium text-foreground/80">{completedDays} nap</span>
      </div>

      {/* Trend */}
      {streak > 0 && (
        <div className="flex items-center justify-between px-4 py-2 rounded-xl border border-foreground/10 bg-foreground/5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-xs text-foreground/60">{t("trend")}</span>
          </div>
          <span className="text-sm font-medium text-green-400">+{streak} nap</span>
        </div>
      )}
    </div>
  );
};

export default StatsSection;
