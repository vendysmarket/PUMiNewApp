import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface ProjectFocusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (goal: string, minutesPerDay: number, durationDays: number) => void;
}

const ProjectFocusModal = ({
  open,
  onOpenChange,
  onStart,
}: ProjectFocusModalProps) => {
  const { t } = useTranslation();
  const [goal, setGoal] = useState("");
  const [minutesPerDay, setMinutesPerDay] = useState(45);
  const [durationDays, setDurationDays] = useState(7);

  const durationOptions = [
    { value: 7, label: "7 nap" },
    { value: 14, label: "14 nap" },
    { value: 21, label: "21 nap" },
  ];

  const handleStart = () => {
    if (!goal.trim()) return;
    onStart(goal.trim(), minutesPerDay, durationDays);
    setGoal("");
    setMinutesPerDay(45);
    setDurationDays(7);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background border-foreground/20">
        <DialogHeader>
          <DialogTitle className="text-foreground/80 font-light">
            {t("projectFocus")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-4">
          {/* Goal */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground/60">
              {t("projectGoal")}
            </label>
            <Textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={t("enterProjectGoal")}
              className="min-h-[100px] bg-foreground/5 border-foreground/20 text-foreground/80 placeholder:text-foreground/30 resize-none"
            />
          </div>

          {/* Duration */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground/60">Terv hossza</label>
            <div className="flex gap-2">
              {durationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDurationDays(opt.value)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm border transition-colors ${
                    durationDays === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-foreground/70 border-foreground/20 hover:border-foreground/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Minutes per day */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground/60">
              {t("minutesPerDay")}
            </label>
            <Input
              type="number"
              value={minutesPerDay}
              onChange={(e) => setMinutesPerDay(Number(e.target.value))}
              min={15}
              max={180}
              className="bg-foreground/5 border-foreground/20 text-foreground/80"
            />
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={!goal.trim()}
            className="w-full py-3 rounded-full border border-foreground/40 text-foreground/70 text-sm font-light tracking-wider hover:border-foreground/60 hover:text-foreground/90 transition-colors duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t("start")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectFocusModal;
