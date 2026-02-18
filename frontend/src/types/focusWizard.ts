// src/types/focusWizard.ts
// Types for the Focus creation wizard (3-step flow)

export type FocusType = "language" | "project" | "smart_learning";
export type LanguageLevel = "beginner" | "basic" | "intermediate";
export type LanguageTrack = "foundations_language" | "career_language";
export type ProjectType = "product" | "learning" | "admin" | "creative";
export type ProjectConstraint = "time" | "budget" | "focus";
export type SmartLearningCategory =
  | "financial_basics"
  | "digital_literacy"
  | "communication_social"
  | "study_brain_skills"
  | "knowledge_bites";

export type Tone = "casual" | "neutral" | "strict";
export type Difficulty = "easy" | "normal" | "hard";
export type Pacing = "small_steps" | "big_blocks";

export interface WizardStep1 {
  focusType: FocusType | null;
}

export interface WizardStep2Language {
  targetLanguage: string;
  level: LanguageLevel;
  track: LanguageTrack;
  minutesPerDay: 10 | 20 | 45;
  durationDays: 7 | 14 | 21 | 30;
}

export interface WizardStep2Generic {
  context: string;
  minutesPerDay: 10 | 20 | 45;
  durationDays: 7 | 14 | 21 | 30;
}

export interface WizardStep2SmartLearning {
  category: SmartLearningCategory;
  minutesPerDay: 10 | 20 | 45;
  durationDays: 7 | 14 | 21 | 30;
}

export type WizardStep2 = WizardStep2Language | WizardStep2Generic | WizardStep2SmartLearning;

export interface WizardStep3 {
  tone: Tone;
  difficulty: Difficulty;
  pacing: Pacing;
}

export interface WizardData {
  step1: WizardStep1;
  step2: WizardStep2 | null;
  step3: WizardStep3;
}

export const DEFAULT_WIZARD_DATA: WizardData = {
  step1: { focusType: null },
  step2: null,
  step3: { tone: "casual", difficulty: "normal", pacing: "small_steps" },
};

// Helper type guards
export function isLanguageStep2(step2: WizardStep2 | null): step2 is WizardStep2Language {
  return step2 !== null && "targetLanguage" in step2;
}

export function isSmartLearningStep2(step2: WizardStep2 | null): step2 is WizardStep2SmartLearning {
  return step2 !== null && "category" in step2;
}

// Legacy type aliases for backward compatibility with imports
export type LanguageGoal = "speaking" | "reading" | "travel" | "work";
export type WizardStep3Language = WizardStep2Language;
export type WizardStep3Generic = WizardStep2Generic;
export type WizardStep4 = WizardStep3;

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
  /** Smart learning category or language track — single source of truth */
  track?: string;
}
