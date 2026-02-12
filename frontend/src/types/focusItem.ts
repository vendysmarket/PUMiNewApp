// ============================================================================
// STRICT FOCUS ITEM CONTRACT v1.0
// Every focus item must conform to this schema for reliable rendering
// ============================================================================

export const FOCUS_ITEM_SCHEMA_VERSION = "1.0";

// Canonical item kinds - deterministic mapping from backend modes
export type FocusItemKind = "lesson" | "translation" | "quiz" | "cards" | "roleplay" | "writing" | "checklist";

// Input types for different kinds
export type FocusInputType = "text" | "multi_text" | "choice" | "flip" | "chat" | "checkbox";

// UI display modes
export type FocusUIMode = "inline" | "modal" | "fullscreen";

// ============================================================================
// Validation Configuration
// ============================================================================

export interface FocusValidation {
  require_interaction: boolean;
  min_chars?: number;       // Minimum characters for text input
  min_items?: number;       // Minimum items to complete (e.g., flashcards flipped)
  min_messages?: number;    // Minimum messages for roleplay
  require_proof?: boolean;  // Require proof text for checklist
}

// ============================================================================
// Scoring Configuration
// ============================================================================

export interface FocusScoring {
  max_points: number;
  partial_credit: boolean;
  auto_grade?: boolean;
}

// ============================================================================
// Content Structures per Kind
// ============================================================================

// Translation: multiple sentences to translate
export interface TranslationContent {
  sentences: Array<{
    source: string;
    target_lang: string;
    hint?: string;
  }>;
}

// Quiz: multiple choice questions
export interface QuizContent {
  questions: Array<{
    question: string;
    options: string[];
    correct_index: number;
    explanation?: string;
  }>;
}

// Cards: flashcards
export interface CardsContent {
  cards: Array<{
    front: string;
    back: string;
    audio_url?: string;
  }>;
}

// Roleplay: dialogue scenario
export interface RoleplayContent {
  scenario: string;
  roles: {
    user: string;
    ai: string;
  };
  starter_prompt?: string;
  sample_exchanges?: Array<{
    user: string;
    ai: string;
  }>;
}

// Writing: freeform writing prompt
export interface WritingContent {
  prompt: string;
  example?: string;
  word_count_target?: number;
}

// Checklist: steps to complete with proof
export interface ChecklistContent {
  steps: Array<{
    instruction: string;
    completed?: boolean;
  }>;
  proof_prompt?: string;
}

// Lesson: rich educational content (tananyag)
export interface LessonContent {
  title: string;
  summary: string;
  key_points: string[];
  example?: string;
  micro_task?: {
    instruction: string;
    expected_output?: string;
  };
  common_mistakes?: string[];
  estimated_minutes?: number;
}

export type FocusItemContent =
  | { kind: "lesson"; data: LessonContent }
  | { kind: "translation"; data: TranslationContent }
  | { kind: "quiz"; data: QuizContent }
  | { kind: "cards"; data: CardsContent }
  | { kind: "roleplay"; data: RoleplayContent }
  | { kind: "writing"; data: WritingContent }
  | { kind: "checklist"; data: ChecklistContent };

// ============================================================================
// STRICT FOCUS ITEM INTERFACE
// ============================================================================

export interface StrictFocusItem {
  // Schema version for future migrations
  schema_version: string;
  
  // Canonical kind - determines renderer
  kind: FocusItemKind;
  
  // Display fields
  title: string;
  subtitle?: string;
  
  // Rich content
  instructions_md: string;
  rubric_md?: string;
  
  // UI configuration
  ui: {
    mode: FocusUIMode;
    estimated_minutes?: number;
    icon?: string;
  };
  
  // Input configuration
  input: {
    type: FocusInputType;
    placeholder?: string;
  };
  
  // Structured content based on kind
  content: FocusItemContent;
  
  // Validation rules
  validation: FocusValidation;
  
  // Scoring configuration
  scoring: FocusScoring;
}

// ============================================================================
// BACKEND MODE MAPPING
// ============================================================================

export const BACKEND_MODE_TO_KIND: Record<string, FocusItemKind> = {
  // Lesson / content mappings
  lesson: "lesson",
  content: "lesson",
  tananyag: "lesson",

  // Direct mappings
  translation: "translation",
  quiz: "quiz",
  cards: "cards",
  flashcard: "cards",
  flashcards: "cards",
  roleplay: "roleplay",
  dialogue: "roleplay",
  exercise: "roleplay",
  writing: "writing",
  write: "writing",
  practice: "writing",

  // Offline/speaking -> checklist with proof
  speaking: "checklist",
  offline: "checklist",
  listening: "checklist",
  reading: "checklist",
  task: "checklist",
  feladat: "checklist",
};

// ============================================================================
// VALIDATION DEFAULTS BY KIND
// ============================================================================

export const DEFAULT_VALIDATION: Record<FocusItemKind, FocusValidation> = {
  lesson: {
    require_interaction: true,
  },
  translation: {
    require_interaction: true,
    min_items: 1,
  },
  quiz: {
    require_interaction: true,
    min_items: 1,
  },
  cards: {
    require_interaction: true,
    min_items: 1,
  },
  roleplay: {
    require_interaction: true,
    min_chars: 80,
    min_messages: 2,
  },
  writing: {
    require_interaction: true,
    min_chars: 50,
  },
  checklist: {
    require_interaction: true,
    require_proof: true,
    min_chars: 20,
  },
};

// ============================================================================
// SCORING DEFAULTS BY KIND
// ============================================================================

export const DEFAULT_SCORING: Record<FocusItemKind, FocusScoring> = {
  lesson: { max_points: 100, partial_credit: false, auto_grade: false },
  translation: { max_points: 100, partial_credit: true, auto_grade: true },
  quiz: { max_points: 100, partial_credit: true, auto_grade: true },
  cards: { max_points: 100, partial_credit: false, auto_grade: false },
  roleplay: { max_points: 100, partial_credit: true, auto_grade: false },
  writing: { max_points: 100, partial_credit: true, auto_grade: true },
  checklist: { max_points: 100, partial_credit: false, auto_grade: false },
};

// ============================================================================
// INPUT TYPE MAPPING BY KIND
// ============================================================================

export const KIND_TO_INPUT_TYPE: Record<FocusItemKind, FocusInputType> = {
  lesson: "text",
  translation: "multi_text",
  quiz: "choice",
  cards: "flip",
  roleplay: "chat",
  writing: "text",
  checklist: "checkbox",
};
