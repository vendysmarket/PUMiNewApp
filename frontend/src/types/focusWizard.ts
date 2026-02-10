// src/types/focusWizard.ts
// Types for the Focus creation wizard

export type FocusType = "language" | "project" | "study" | "habit" | "custom";
export type LanguageLevel = "beginner" | "basic" | "intermediate";
export type LanguageGoal = "speaking" | "reading" | "travel" | "work";
export type ProjectType = "product" | "learning" | "admin" | "creative";
export type ProjectConstraint = "time" | "budget" | "focus";
export type Tone = "casual" | "neutral" | "strict";
export type Difficulty = "easy" | "normal" | "hard";
export type Pacing = "small_steps" | "big_blocks";

export interface WizardStep1 {
  focusType: FocusType | null;
}

export interface WizardStep2 {
  goalSentence: string;
  durationDays: 7 | 14 | 21 | 30;
}

export interface WizardStep3Language {
  level: LanguageLevel;
  targetLanguage: string;
  goal: LanguageGoal;
  minutesPerDay: 10 | 20 | 45;
}

export interface WizardStep3Project {
  projectType: ProjectType;
  deliverable: string;
  constraint: ProjectConstraint;
}

export interface WizardStep3Generic {
  context: string;
  minutesPerDay: 10 | 20 | 45;
}

export type WizardStep3 = WizardStep3Language | WizardStep3Project | WizardStep3Generic;

export interface WizardStep4 {
  tone: Tone;
  difficulty: Difficulty;
  pacing: Pacing;
}

export interface WizardData {
  step1: WizardStep1;
  step2: WizardStep2;
  step3: WizardStep3 | null;
  step4: WizardStep4;
}

export const DEFAULT_WIZARD_DATA: WizardData = {
  step1: { focusType: null },
  step2: { goalSentence: "", durationDays: 7 },
  step3: null,
  step4: { tone: "casual", difficulty: "normal", pacing: "small_steps" },
};

export interface FocusPlanMeta {
  id: string;
  focusType: FocusType;
  goal: string;
  durationDays: number;
  minutesPerDay: number;
  startedAt: string;
  currentDayIndex: number;
  completedDays: number[];
  streak: number;
  archived: boolean;
}
