import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LearningFocusConfig, LearningDomain, LearningLevel } from "@/types/learningFocus";

interface LearningFocusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGoal?: string;
  onStart: (config: LearningFocusConfig) => void;
}

const LearningFocusModal = ({ 
  open, 
  onOpenChange, 
  initialGoal = "", 
  onStart 
}: LearningFocusModalProps) => {
  const { t } = useTranslation();
  const [goal, setGoal] = useState(initialGoal);
  const [domain, setDomain] = useState<LearningDomain>("language");
  const [targetLang, setTargetLang] = useState("it");
  const [durationDays, setDurationDays] = useState(7);
  const [minutesPerDay, setMinutesPerDay] = useState(45);
  const [newItemsPerDay, setNewItemsPerDay] = useState(6);
  const [level, setLevel] = useState<LearningLevel>("beginner");

  const durationOptions = [
    { value: 7, label: "7 nap" },
    { value: 14, label: "14 nap" },
    { value: 21, label: "21 nap" },
  ];

  const handleStart = () => {
    const config: LearningFocusConfig = {
      goal,
      domain,
      targetLang: domain === "language" ? targetLang : undefined,
      durationDays,
      minutesPerDay,
      newItemsPerDay,
      level,
    };
    onStart(config);
  };

  const domainOptions: { value: LearningDomain; label: string }[] = [
    { value: "language", label: t("domainLanguage") },
    { value: "programming", label: t("domainProgramming") },
    { value: "math", label: t("domainMath") },
    { value: "fitness", label: t("domainFitness") },
    { value: "business", label: t("domainBusiness") },
    { value: "other", label: t("domainOther") },
  ];

  const levelOptions: { value: LearningLevel; label: string }[] = [
    { value: "beginner", label: t("levelBeginner") },
    { value: "intermediate", label: t("levelIntermediate") },
  ];

  const isValid = goal.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background border-foreground/20">
        <DialogHeader>
          <DialogTitle className="text-foreground/90 font-light">
            {t("startLearningFocus")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {/* Goal */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground/60">{t("learningGoal")}</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={t("enterYourFocus")}
              className="w-full min-h-[80px] px-4 py-3 rounded-xl border border-foreground/20 bg-transparent text-foreground/90 text-sm font-light placeholder:text-foreground/30 focus:outline-none focus:border-foreground/40 resize-none"
            />
          </div>

          {/* Domain */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground/60">{t("domain")}</label>
            <Select value={domain} onValueChange={(v) => setDomain(v as LearningDomain)}>
              <SelectTrigger className="border-foreground/20 bg-transparent text-foreground/90">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-foreground/20">
                {domainOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-foreground/90">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target Language (only if domain === language) */}
          {domain === "language" && (
            <div className="flex flex-col gap-2">
              <label className="text-sm text-foreground/60">{t("targetLanguage")}</label>
              <input
                type="text"
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                placeholder="it, es, de, fr..."
                className="w-full px-4 py-3 rounded-xl border border-foreground/20 bg-transparent text-foreground/90 text-sm font-light placeholder:text-foreground/30 focus:outline-none focus:border-foreground/40"
              />
            </div>
          )}

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

          {/* Minutes per day & New items per day */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-sm text-foreground/60">{t("minutesPerDay")}</label>
              <input
                type="number"
                value={minutesPerDay}
                onChange={(e) => setMinutesPerDay(Number(e.target.value))}
                min={5}
                max={180}
                className="w-full px-4 py-3 rounded-xl border border-foreground/20 bg-transparent text-foreground/90 text-sm font-light focus:outline-none focus:border-foreground/40"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm text-foreground/60">{t("newItemsPerDay")}</label>
              <input
                type="number"
                value={newItemsPerDay}
                onChange={(e) => setNewItemsPerDay(Number(e.target.value))}
                min={1}
                max={20}
                className="w-full px-4 py-3 rounded-xl border border-foreground/20 bg-transparent text-foreground/90 text-sm font-light focus:outline-none focus:border-foreground/40"
              />
            </div>
          </div>

          {/* Level */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground/60">{t("level")}</label>
            <Select value={level} onValueChange={(v) => setLevel(v as LearningLevel)}>
              <SelectTrigger className="border-foreground/20 bg-transparent text-foreground/90">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border-foreground/20">
                {levelOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-foreground/90">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={!isValid}
          className="w-full py-3 rounded-full border border-foreground/40 text-foreground/70 text-sm font-light tracking-wider hover:border-foreground/60 hover:text-foreground/90 transition-colors duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {t("startLearning")}
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default LearningFocusModal;
