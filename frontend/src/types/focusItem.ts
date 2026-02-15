// ============================================================================
// STRICT FOCUS ITEM CONTRACT v1.0
// Every focus item must conform to this schema for reliable rendering
// ============================================================================

export const FOCUS_ITEM_SCHEMA_VERSION = "1.0";

// Canonical item kinds - deterministic mapping from backend modes
export type FocusItemKind = "lesson" | "translation" | "quiz" | "cards" | "roleplay" | "writing" | "checklist" | "briefing" | "feedback";

// Input types for different kinds
export type FocusInputType = "text" | "multi_text" | "choice" | "flip" | "chat" | "checkbox" | "none";

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

// Briefing: career track situation overview
export interface BriefingContent {
  situation: string;
  outcome: string;
  key_vocabulary_preview?: string[];
}

// Feedback: AI review of user's writing submission
export interface FeedbackContent {
  user_text: string;
  corrections: Array<{
    original: string;
    corrected: string;
    explanation: string;
  }>;
  improved_version: string;
  alternative_tone?: string;
  score?: number;
  praise?: string;
  placeholder?: boolean;
  message?: string;
}

// Lesson: rich educational content (tananyag)
// Supports both legacy format (summary+key_points) and language_lesson format
export interface LessonContent {
  title: string;
  summary?: string;
  key_points?: string[];
  example?: string;
  micro_task?: {
    instruction: string;
    expected_output?: string;
  };
  common_mistakes?: string[];
  estimated_minutes?: number;

  // Language lesson fields (new, optional)
  content_type?: "language_lesson";
  introduction?: string;
  vocabulary_table?: Array<{
    word: string;
    translation: string;
    pronunciation?: string;
    example_sentence: string;
    example_translation: string;
  }>;
  grammar_explanation?: {
    rule_title: string;
    explanation: string;
    formation_pattern?: string;
    examples: Array<{
      target: string;
      hungarian: string;
      note?: string;
    }>;
    exceptions?: string[];
  };
  dialogues?: Array<{
    title: string;
    context?: string;
    lines: Array<{
      speaker: string;
      text: string;
      translation: string;
    }>;
  }>;
  cultural_note?: string;
  practice_exercises?: Array<{
    type: "fill_in_blank" | "translate" | "reorder";
    instruction: string;
    items: Array<{
      prompt: string;
      answer: string;
    }>;
  }>;
}

export type FocusItemContent =
  | { kind: "lesson"; data: LessonContent }
  | { kind: "translation"; data: TranslationContent }
  | { kind: "quiz"; data: QuizContent }
  | { kind: "cards"; data: CardsContent }
  | { kind: "roleplay"; data: RoleplayContent }
  | { kind: "writing"; data: WritingContent }
  | { kind: "checklist"; data: ChecklistContent }
  | { kind: "briefing"; data: BriefingContent }
  | { kind: "feedback"; data: FeedbackContent };

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

  // Career track kinds
  briefing: "briefing",
  feedback: "feedback",
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
  briefing: {
    require_interaction: true,
  },
  feedback: {
    require_interaction: true,
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
  briefing: { max_points: 0, partial_credit: false, auto_grade: false },
  feedback: { max_points: 100, partial_credit: true, auto_grade: false },
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
  briefing: "none",
  feedback: "none",
};
