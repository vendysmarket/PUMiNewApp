// src/components/focus/FocusWizard.tsx
// 5-step guided wizard for creating a new Focus plan

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, BookOpen, Briefcase, GraduationCap, Dumbbell, Sparkles, Target, Clock, Zap, MessageSquare } from "lucide-react";
import { WizardData, DEFAULT_WIZARD_DATA, FocusType, Tone, Difficulty, Pacing } from "@/types/focusWizard";

interface FocusWizardProps {
  onComplete: (data: WizardData) => Promise<void>;
  onCancel: () => void;
  isGenerating: boolean;
}

const FOCUS_TYPES = [
  { type: "language" as FocusType, icon: BookOpen, label: "Nyelvtanulás", desc: "Új nyelv elsajátítása" },
  { type: "project" as FocusType, icon: Briefcase, label: "Projekt / munka", desc: "Feladat vagy projekt" },
  { type: "study" as FocusType, icon: GraduationCap, label: "Vizsga / tananyag", desc: "Tanulás és felkészülés" },
  { type: "habit" as FocusType, icon: Dumbbell, label: "Szokás / rutin", desc: "Pl. edzés, meditáció" },
  { type: "custom" as FocusType, icon: Sparkles, label: "Egyedi", desc: "Bármi más" },
];

const DURATIONS = [
  { days: 7, label: "7 nap" },
  { days: 14, label: "14 nap" },
  { days: 21, label: "21 nap" },
  { days: 30, label: "30 nap" },
];

const LANGUAGE_LEVELS = [
  { value: "beginner", label: "Teljesen kezdő" },
  { value: "basic", label: "Alap szint" },
  { value: "intermediate", label: "Közép szint" },
];

const LANGUAGE_GOALS = [
  { value: "speaking", label: "Beszéd" },
  { value: "reading", label: "Olvasás" },
  { value: "travel", label: "Utazás" },
  { value: "work", label: "Munka" },
];

const LANGUAGES = [
  { value: "italian", label: "Olasz" },
  { value: "greek", label: "Görög" },
  { value: "english", label: "Angol" },
  { value: "german", label: "Német" },
  { value: "spanish", label: "Spanyol" },
];

const MINUTES_OPTIONS = [
  { value: 10, label: "10 perc" },
  { value: 20, label: "20 perc" },
  { value: 45, label: "45 perc" },
];

const TONES = [
  { value: "casual" as Tone, label: "Laza", desc: "Barátságos, könnyed" },
  { value: "neutral" as Tone, label: "Tárgyilagos", desc: "Semleges, informatív" },
  { value: "strict" as Tone, label: "Szigorú", desc: "Határozott, követelő" },
];

const DIFFICULTIES = [
  { value: "easy" as Difficulty, label: "Könnyű" },
  { value: "normal" as Difficulty, label: "Normál" },
  { value: "hard" as Difficulty, label: "Kemény" },
];

const PACINGS = [
  { value: "small_steps" as Pacing, label: "Kicsi lépések", desc: "Rövid, gyakori feladatok" },
  { value: "big_blocks" as Pacing, label: "Nagyobb blokkok", desc: "Hosszabb, mélyebb munka" },
];

export function FocusWizard({ onComplete, onCancel, isGenerating }: FocusWizardProps) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(DEFAULT_WIZARD_DATA);
  
  // Step 3 specific states
  const [languageLevel, setLanguageLevel] = useState<string>("beginner");
  const [targetLanguage, setTargetLanguage] = useState<string>("italian");
  const [languageGoal, setLanguageGoal] = useState<string>("speaking");
  const [minutesPerDay, setMinutesPerDay] = useState<number>(20);
  const [customContext, setCustomContext] = useState<string>("");

  const totalSteps = 5;
  const canProceed = () => {
    switch (step) {
      case 1: return data.step1.focusType !== null;
      case 2: return data.step2.goalSentence.trim().length > 0;
      case 3: return true; // Always can proceed from step 3
      case 4: return true; // Always can proceed from step 4
      case 5: return true; // Summary step
      default: return false;
    }
  };

  const handleNext = () => {
    if (step === 3) {
      // Save step 3 data based on focus type
      if (data.step1.focusType === "language") {
        setData({
          ...data,
          step3: {
            level: languageLevel as any,
            targetLanguage,
            goal: languageGoal as any,
            minutesPerDay: minutesPerDay as any,
          },
        });
      } else {
        setData({
          ...data,
          step3: {
            context: customContext,
            minutesPerDay: minutesPerDay as any,
          },
        });
      }
    }
    
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      onCancel();
    }
  };

  const handleComplete = async () => {
    await onComplete(data);
  };

  // ============================================================================
  // STEP 1: Focus Type
  // ============================================================================
  const renderStep1 = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-center mb-6">Milyen fókuszt akarsz?</h2>
      <div className="grid gap-3">
        {FOCUS_TYPES.map(({ type, icon: Icon, label, desc }) => (
          <button
            key={type}
            onClick={() => setData({ ...data, step1: { focusType: type } })}
            className={`p-4 rounded-xl border transition-all duration-200 text-left flex items-center gap-4
              ${data.step1.focusType === type 
                ? "neon-glow-card bg-secondary/50" 
                : "bg-card/30 border-border/50 hover:border-foreground/30"}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
              ${data.step1.focusType === type ? "bg-foreground text-background" : "bg-secondary"}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  // ============================================================================
  // STEP 2: Goal & Duration
  // ============================================================================
  const renderStep2 = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-center mb-2">Cél és időtáv</h2>
      <p className="text-sm text-muted-foreground text-center mb-6">
        Mit tekintünk sikernek?
      </p>
      
      <div className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-2">
            <Target className="w-4 h-4" />
            {data.step2.durationDays} nap múlva azt szeretném, hogy…
          </label>
          <textarea
            value={data.step2.goalSentence}
            onChange={(e) => setData({ ...data, step2: { ...data.step2, goalSentence: e.target.value } })}
            placeholder="Pl. tudjak alapszinten olaszul beszélni"
            className="w-full p-4 rounded-xl bg-secondary/50 border border-border/50 
                     focus:border-foreground/50 focus:outline-none resize-none
                     text-foreground placeholder:text-muted-foreground"
            rows={3}
          />
        </div>
        
        <div>
          <label className="text-sm text-muted-foreground mb-3 block flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Időtartam
          </label>
          <div className="grid grid-cols-4 gap-2">
            {DURATIONS.map(({ days, label }) => (
              <button
                key={days}
                onClick={() => setData({ ...data, step2: { ...data.step2, durationDays: days as any } })}
                className={`py-3 px-2 rounded-xl text-sm font-medium transition-all
                  ${data.step2.durationDays === days 
                    ? "bg-foreground text-background" 
                    : "bg-secondary/50 hover:bg-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // STEP 3: Context (dynamic based on focus type)
  // ============================================================================
  const renderStep3 = () => {
    if (data.step1.focusType === "language") {
      return (
        <div className="space-y-5">
          <h2 className="text-xl font-bold text-center mb-6">Nyelvtanulás részletei</h2>
          
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Szint</label>
            <div className="grid grid-cols-3 gap-2">
              {LANGUAGE_LEVELS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setLanguageLevel(value)}
                  className={`py-2 px-3 rounded-lg text-sm transition-all
                    ${languageLevel === value ? "bg-foreground text-background" : "bg-secondary/50 hover:bg-secondary"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Nyelv</label>
            <div className="grid grid-cols-3 gap-2">
              {LANGUAGES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setTargetLanguage(value)}
                  className={`py-2 px-3 rounded-lg text-sm transition-all
                    ${targetLanguage === value ? "bg-foreground text-background" : "bg-secondary/50 hover:bg-secondary"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Cél</label>
            <div className="grid grid-cols-2 gap-2">
              {LANGUAGE_GOALS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setLanguageGoal(value)}
                  className={`py-2 px-3 rounded-lg text-sm transition-all
                    ${languageGoal === value ? "bg-foreground text-background" : "bg-secondary/50 hover:bg-secondary"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Napi idő</label>
            <div className="grid grid-cols-3 gap-2">
              {MINUTES_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setMinutesPerDay(value)}
                  className={`py-2 px-3 rounded-lg text-sm transition-all
                    ${minutesPerDay === value ? "bg-foreground text-background" : "bg-secondary/50 hover:bg-secondary"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Generic step 3 for other focus types
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-center mb-6">Kontextus</h2>
        
        <div>
          <label className="text-sm text-muted-foreground mb-2 block">
            Adj meg egy kis kontextust (opcionális)
          </label>
          <textarea
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            placeholder="Pl. már van némi tapasztalatom, de szeretném rendszerezni"
            className="w-full p-4 rounded-xl bg-secondary/50 border border-border/50 
                     focus:border-foreground/50 focus:outline-none resize-none
                     text-foreground placeholder:text-muted-foreground"
            rows={3}
          />
        </div>

        <div>
          <label className="text-sm text-muted-foreground mb-2 block">Napi idő</label>
          <div className="grid grid-cols-3 gap-2">
            {MINUTES_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setMinutesPerDay(value)}
                className={`py-2 px-3 rounded-lg text-sm transition-all
                  ${minutesPerDay === value ? "bg-foreground text-background" : "bg-secondary/50 hover:bg-secondary"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // STEP 4: Style & Difficulty
  // ============================================================================
  const renderStep4 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-center mb-6">Stílus és nehézség</h2>
      
      <div>
        <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Hangnem
        </label>
        <div className="space-y-2">
          {TONES.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setData({ ...data, step4: { ...data.step4, tone: value } })}
              className={`w-full p-3 rounded-xl text-left transition-all flex items-center justify-between
                ${data.step4.tone === value 
                  ? "bg-foreground text-background" 
                  : "bg-secondary/50 hover:bg-secondary"}`}
            >
              <span className="font-medium">{label}</span>
              <span className={`text-xs ${data.step4.tone === value ? "text-background/70" : "text-muted-foreground"}`}>
                {desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Nehézség
        </label>
        <div className="grid grid-cols-3 gap-2">
          {DIFFICULTIES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setData({ ...data, step4: { ...data.step4, difficulty: value } })}
              className={`py-3 px-3 rounded-xl text-sm font-medium transition-all
                ${data.step4.difficulty === value ? "bg-foreground text-background" : "bg-secondary/50 hover:bg-secondary"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm text-muted-foreground mb-2 block">Tempó</label>
        <div className="space-y-2">
          {PACINGS.map(({ value, label, desc }) => (
            <button
              key={value}
              onClick={() => setData({ ...data, step4: { ...data.step4, pacing: value } })}
              className={`w-full p-3 rounded-xl text-left transition-all flex items-center justify-between
                ${data.step4.pacing === value 
                  ? "bg-foreground text-background" 
                  : "bg-secondary/50 hover:bg-secondary"}`}
            >
              <span className="font-medium">{label}</span>
              <span className={`text-xs ${data.step4.pacing === value ? "text-background/70" : "text-muted-foreground"}`}>
                {desc}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // STEP 5: Summary
  // ============================================================================
  const renderStep5 = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-center mb-6">Összefoglaló</h2>
      
      <div className="neon-glow-card bg-card/30 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-border/30">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fókusz típus</p>
            <p className="font-medium capitalize">
              {data.step1.focusType === "language" ? "Nyelvtanulás" :
               data.step1.focusType === "project" ? "Projekt" :
               data.step1.focusType === "study" ? "Tanulás" :
               data.step1.focusType === "habit" ? "Szokás" : "Egyedi"}
            </p>
          </div>
        </div>
        
        <div>
          <p className="text-xs text-muted-foreground mb-1">Cél</p>
          <p className="text-sm">{data.step2.goalSentence || "—"}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Időtartam</p>
            <p className="text-sm font-medium">{data.step2.durationDays} nap</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Napi idő</p>
            <p className="text-sm font-medium">{minutesPerDay} perc</p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="text-center p-2 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Hang</p>
            <p className="text-xs font-medium capitalize">{data.step4.tone === "casual" ? "Laza" : data.step4.tone === "neutral" ? "Semleges" : "Szigorú"}</p>
          </div>
          <div className="text-center p-2 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Nehézség</p>
            <p className="text-xs font-medium capitalize">{data.step4.difficulty === "easy" ? "Könnyű" : data.step4.difficulty === "normal" ? "Normál" : "Kemény"}</p>
          </div>
          <div className="text-center p-2 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground">Tempó</p>
            <p className="text-xs font-medium">{data.step4.pacing === "small_steps" ? "Kicsi" : "Nagy"}</p>
          </div>
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground text-center">
        A terv létrehozása után látni fogod a napok címsorait.
      </p>
    </div>
  );

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="min-h-[80vh] flex flex-col px-4 md:px-6 animate-fade-in">
      {/* Progress Bar */}
      <div className="py-4">
        <div className="flex items-center justify-between mb-2">
          <button onClick={handleBack} className="p-2 -ml-2 rounded-lg hover:bg-secondary/50 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-muted-foreground">{step} / {totalSteps}</span>
          <div className="w-9" /> {/* Spacer */}
        </div>
        <div className="h-1 bg-secondary rounded-full overflow-hidden">
          <div 
            className="h-full bg-foreground rounded-full transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 py-4">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </div>

      {/* Bottom CTA */}
      <div className="sticky bottom-0 py-4 bg-gradient-to-t from-background via-background to-transparent">
        {step < totalSteps ? (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="w-full py-4 px-6 rounded-xl font-semibold
                     bg-foreground text-background
                     hover:bg-foreground/90 active:scale-[0.98]
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200
                     flex items-center justify-center gap-2"
          >
            Tovább
            <ArrowRight className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={isGenerating}
            className="w-full py-4 px-6 rounded-xl font-semibold
                     bg-foreground text-background
                     hover:bg-foreground/90 active:scale-[0.98]
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200
                     flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Terv generálása...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Terv létrehozása
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
