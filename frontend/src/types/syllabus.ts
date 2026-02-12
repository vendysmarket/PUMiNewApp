// src/types/syllabus.ts
// Syllabus types for structured daily plans

export type SyllabusBlockType =
  | "lesson"
  | "lightning"
  | "roleplay"
  | "flashcards"
  | "translation"
  | "quiz"
  | "writing"
  | "recap_mix";

export interface SyllabusBlock {
  block_id: string;
  block_type: SyllabusBlockType;
  title_hu: string;
  topic_seed: string;
  grammar_focus?: string;
  vocab_hint?: string[];
  estimated_minutes: number;
}

export interface SyllabusDay {
  day: number;
  theme_hu: string;
  theme_en?: string;
  grammar_focus: string;
  key_vocab: string[];
  blocks: SyllabusBlock[];
}

export interface WeekPlan {
  language: string;
  level: string;
  goal: string;
  days: SyllabusDay[];
}

/** Main task rotation per day (Day 1-7) */
export const MAIN_TASK_ROTATION: SyllabusBlockType[] = [
  "roleplay",
  "flashcards",
  "translation",
  "quiz",
  "writing",
  "quiz",
  "recap_mix",
];

/** Maps syllabus block types to backend item type + practiceType */
export const BLOCK_TYPE_TO_ITEM_TYPE: Record<SyllabusBlockType, { type: string; practiceType?: string }> = {
  lesson:      { type: "lesson" },
  lightning:   { type: "quiz" },
  roleplay:    { type: "roleplay" },
  flashcards:  { type: "flashcard" },
  translation: { type: "translation" },
  quiz:        { type: "quiz" },
  writing:     { type: "writing" },
  recap_mix:   { type: "quiz" },
};
