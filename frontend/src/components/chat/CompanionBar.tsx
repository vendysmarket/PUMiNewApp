import { Sparkles, Flame, Archive } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface FocusSession {
  title: string;
  dayIndex: number;
  lastDoneDay?: string;
}

interface CompanionBarProps {
  onFocusClick: () => void;
  onProgressClick?: () => void;
  onVaultClick?: () => void;
  focusMode?: boolean;
  activeSession?: FocusSession | null;
}

const CompanionBar = ({ 
  onFocusClick, 
  onProgressClick, 
  onVaultClick,
  focusMode = false,
  activeSession
}: CompanionBarProps) => {
  const { t, lang } = useTranslation();

  const pillBaseClass = "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-light tracking-wide transition-all duration-300 border";
  const pillInactiveClass = "border-foreground/20 text-foreground/70 hover:border-foreground/40 hover:text-foreground hover:shadow-[0_0_12px_rgba(255,255,255,0.15)]";
  const pillActiveClass = "neon-glow-button border-foreground/60 text-foreground";

  // Check if today's task is done
  const today = new Date().toISOString().split("T")[0];
  const needsPulse = activeSession && activeSession.lastDoneDay !== today;
  
  // Progress label with Day X/7
  const progressLabel = activeSession 
    ? (lang === "hu" ? `Nap ${activeSession.dayIndex}/7` : `Day ${activeSession.dayIndex}/7`)
    : t("progress");

  return (
    <div className="fixed bottom-0 left-16 right-0 pb-4 pt-2 px-8">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <button
          onClick={onFocusClick}
          className={cn(
            pillBaseClass,
            focusMode ? pillActiveClass : pillInactiveClass
          )}
        >
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t("focusModeLabel")}
        </button>
        
        {activeSession && (
          <button
            onClick={onProgressClick}
            className={cn(
              pillBaseClass,
              pillInactiveClass,
              needsPulse && "animate-pulse-soft"
            )}
          >
            <Flame className="w-3.5 h-3.5" strokeWidth={1.5} />
            {progressLabel}
          </button>
        )}
        
        <button
          onClick={onVaultClick}
          className={cn(pillBaseClass, pillInactiveClass)}
        >
          <Archive className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t("vault")}
        </button>
      </div>
    </div>
  );
};

export default CompanionBar;
