import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/useTranslation";

interface FocusSession {
  title: string;
  dayIndex: number;
  lastDoneDay?: string;
}

interface FocusSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: FocusSession;
  onSessionUpdate: (session: FocusSession) => void;
}

const FocusSheet = ({ open, onOpenChange, session, onSessionUpdate }: FocusSheetProps) => {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [checkedTasks, setCheckedTasks] = useState<boolean[]>([false, false, false]);

  const tasks = [
    t("completeFirstTask"),
    t("workOnMainGoal"),
    t("reviewProgress"),
  ];

  useEffect(() => {
    if (open) {
      setStatusMessage(null);
      setCheckedTasks([false, false, false]);
    }
  }, [open]);

  const handleDone = () => {
    const today = new Date().toISOString().split("T")[0];

    if (session.lastDoneDay === today) {
      setStatusMessage(t("alreadyDoneToday"));
      return;
    }

    // Increment streak
    const currentStreak = parseInt(localStorage.getItem("pumi_focus_streak") || "0", 10);
    localStorage.setItem("pumi_focus_streak", String(currentStreak + 1));

    // Update session
    const newDayIndex = Math.min(session.dayIndex + 1, 7);
    const updatedSession: FocusSession = {
      ...session,
      dayIndex: newDayIndex,
      lastDoneDay: today,
    };
    localStorage.setItem("pumi_focus_active", JSON.stringify(updatedSession));
    onSessionUpdate(updatedSession);

    // Dispatch storage event for TopBar sync
    window.dispatchEvent(new Event("storage"));

    // Show appropriate message
    if (newDayIndex === 7) {
      setStatusMessage(t("firstWeekDone"));
    } else {
      setStatusMessage(t("doneWeContinue"));
    }
  };

  const toggleTask = (index: number) => {
    setCheckedTasks(prev => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  };

  const handleOpenFocus = () => {
    onOpenChange(false);
    navigate("/app/focus");
  };

  const dayLabel = lang === "hu" ? `Nap ${session.dayIndex}/7` : `Day ${session.dayIndex}/7`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-background border-t border-foreground/10 rounded-t-2xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-center text-foreground font-light tracking-wide">
            {dayLabel} — {session.title}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pb-6">
          {/* Task checkboxes */}
          <div className="space-y-3">
            {tasks.map((task, index) => (
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

          {/* Status message */}
          {statusMessage && (
            <p className="text-center text-sm font-light text-foreground/60 py-2">
              {statusMessage}
            </p>
          )}

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleDone}
              disabled={session.lastDoneDay === new Date().toISOString().split("T")[0]}
              className="w-full py-4 rounded-full border border-foreground text-foreground text-sm font-light tracking-widest hover:bg-foreground hover:text-background transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("imDone")}
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

export default FocusSheet;
