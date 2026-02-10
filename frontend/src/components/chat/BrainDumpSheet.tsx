import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/useTranslation";

interface BrainDumpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusText: string;
  onFocusStarted: () => void;
}

const BrainDumpSheet = ({ open, onOpenChange, focusText, onFocusStarted }: BrainDumpSheetProps) => {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const [checkedTasks, setCheckedTasks] = useState<boolean[]>([false, false, false]);

  // Generate placeholder 7-day plan based on focus text
  const generatePlan = () => {
    const baseText = focusText.slice(0, 30);
    return [
      `${lang === "hu" ? "Nap" : "Day"} 1: ${lang === "hu" ? "Indulás, alapok" : "Getting started, basics"}`,
      `${lang === "hu" ? "Nap" : "Day"} 2: ${lang === "hu" ? "Első lépések" : "First steps"}`,
      `${lang === "hu" ? "Nap" : "Day"} 3: ${lang === "hu" ? "Gyakorlás" : "Practice"}`,
      `${lang === "hu" ? "Nap" : "Day"} 4: ${lang === "hu" ? "Elmélyítés" : "Deepening"}`,
      `${lang === "hu" ? "Nap" : "Day"} 5: ${lang === "hu" ? "Haladás" : "Progress"}`,
      `${lang === "hu" ? "Nap" : "Day"} 6: ${lang === "hu" ? "Megerősítés" : "Reinforcement"}`,
      `${lang === "hu" ? "Nap" : "Day"} 7: ${lang === "hu" ? "Összefoglalás" : "Summary"}`,
    ];
  };

  const todayTasks = [
    t("completeFirstTask"),
    t("workOnMainGoal"),
    t("reviewProgress"),
  ];

  const toggleTask = (index: number) => {
    setCheckedTasks(prev => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  };

  const handleStartFocus = () => {
    const now = new Date().toISOString();
    const session = {
      title: focusText.slice(0, 50) || (lang === "hu" ? "Új fókusz" : "New focus"),
      dayIndex: 1,
      startedAt: now,
      lastDoneDay: null,
    };
    localStorage.setItem("emoria_focus_active", JSON.stringify(session));
    window.dispatchEvent(new Event("storage"));
    onFocusStarted();
    onOpenChange(false);
  };

  const handleOpenFocus = () => {
    onOpenChange(false);
    navigate("/app/focus");
  };

  const plan = generatePlan();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-background border-t border-foreground/10 rounded-t-2xl neon-glow-card">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-center text-foreground font-light tracking-wide">
            {t("planPreviewTitle")}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pb-6 max-h-[60vh] overflow-y-auto">
          {/* Focus text preview */}
          <div className="text-center text-sm font-light text-foreground/60 italic px-4">
            "{focusText}"
          </div>

          {/* 7-day plan */}
          <div className="space-y-2 px-4">
            {plan.map((day, index) => (
              <div
                key={index}
                className="text-xs font-light text-foreground/50 py-1 border-l-2 border-foreground/10 pl-3"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Today's tasks */}
          <div className="space-y-3">
            <h4 className="text-sm font-light text-foreground/70 tracking-wide">
              {t("todaysTasks")}
            </h4>
            {todayTasks.map((task, index) => (
              <button
                key={index}
                onClick={() => toggleTask(index)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-foreground/10 hover:border-foreground/20 transition-colors duration-300"
              >
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300 ${
                    checkedTasks[index]
                      ? "bg-foreground border-foreground"
                      : "border-foreground/30"
                  }`}
                >
                  {checkedTasks[index] && (
                    <Check className="w-3 h-3 text-background" strokeWidth={2} />
                  )}
                </div>
                <span className="text-sm font-light text-foreground/70">{task}</span>
              </button>
            ))}
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleStartFocus}
              className="w-full py-4 rounded-full border border-foreground text-foreground text-sm font-light tracking-widest hover:bg-foreground hover:text-background transition-all duration-300 neon-glow-button"
            >
              {t("startThisFocus")}
            </button>
            <button
              onClick={handleOpenFocus}
              className="w-full py-3 text-foreground/50 text-sm font-light tracking-wide hover:text-foreground transition-colors duration-300"
            >
              {t("openFocus")}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default BrainDumpSheet;
