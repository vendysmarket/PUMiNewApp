// learningFocus.ts - BACKWARDS COMPATIBLE VERSION
// Works with both existing code AND new lazy loading

export type LearningDomain = "language" | "programming" | "math" | "fitness" | "business" | "other";
export type LearningLevel = "beginner" | "intermediate";
export type ItemType = "lesson" | "quiz" | "practice" | "flashcard" | "task";
export type PracticeType = "exercise" | "writing" | "speaking" | "coding" | "translation" | "roleplay";

export interface LearningFocusConfig {
  goal: string;
  domain: LearningDomain;
  targetLang?: string;
  durationDays?: number;
  minutesPerDay: number;
  newItemsPerDay: number;
  level: LearningLevel;
}

// ============================================================================
// HYBRID PlanItem - Works with both old and new code
// ============================================================================

export interface PlanItem {
  id: string;
  type: ItemType;
  label: string;

  // NEW: For lazy loading (optional for backwards compatibility)
  topic?: string;
  estimated_minutes?: number;
  practice_type?: PracticeType;

  // OLD: For backwards compatibility (optional)
  content?: string;

  // Quiz specific (old format)
  quiz?: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation?: string; // ← FIXED: made optional
  }>;

  // Flashcard specific (old format)
  flashcards?: Array<{
    front: string;
    back: string;
  }>;

  // Practice specific (old format)
  writePrompt?: string;
}

// ============================================================================
// Content Types (for NEW lazy loading)
// ============================================================================

export interface LessonContent {
  type: "lesson";
  text: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string; // ← FIXED: made optional
  selectedIndex?: number;
}

export interface QuizContent {
  type: "quiz";
  questions: QuizQuestion[];
}

export interface PracticeContent {
  type: "practice";
  practice_type: PracticeType;
  text: string;
}

export interface FlashCard {
  front: string;
  back: string;
  revealed?: boolean;
}

export interface FlashcardContent {
  type: "flashcard";
  cards: FlashCard[];
}

export interface TaskContent {
  type: "task";
  text: string;
}

export type ItemContent = LessonContent | QuizContent | PracticeContent | FlashcardContent | TaskContent;

// ============================================================================
// Day & Plan structures
// ============================================================================

export interface OutlineDay {
  day: number;
  title: string;
  intro?: string;
}

export interface PlanDay {
  day: number;
  title: string;
  intro?: string;
  items: PlanItem[];
}

export interface FocusOutline {
  title: string;
  days: OutlineDay[];
  domain?: LearningDomain;
  level?: LearningLevel;
  minutes_per_day?: number;
  focus_type?: "learning" | "project";
}

export interface StructuredPlan {
  title: string;
  days: PlanDay[];
  domain?: LearningDomain;
  level?: LearningLevel;
  minutes_per_day?: number;
  focus_type?: "learning" | "project";
}

// ============================================================================
// API Types
// ============================================================================

export interface FocusItemContentRequest {
  item_type: ItemType;
  item_id: string;
  topic: string;
  context: {
    day_title: string;
    day_intro?: string;
  };
  domain?: string;
  level?: string;
  lang?: string;
  practice_type?: PracticeType;
  topics_list?: string[];
  num_questions?: number;
  num_cards?: number;
}

export interface FocusItemContentResponse {
  ok: boolean;
  content: ItemContent;
  item_id: string;
  error?: string;
}

export interface FocusApiResponse {
  ok: boolean;
  type?: "chat" | "focus_outline" | "focus_day" | "focus_plan" | string;
  text?: string;
  outline?: FocusOutline;
  day?: PlanDay;
  plan?: StructuredPlan;
  reply?: string;
  error?: string;
  memory_saved?: number;
  usage?: {
    tokens_used_today?: number;
    token_limit?: number;
    remaining?: number;
    reset_at?: string;
  };
}

// ============================================================================
// Session Types
// ============================================================================

export interface DayData {
  replyPreview?: string;
  day?: PlanDay;
  completed?: boolean;
  completedAt?: string;
  itemContents?: Record<string, ItemContent>;
}

export interface FocusChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: string;
  isDraftPlan?: boolean;
}

export interface FocusSession {
  type: "learning" | "project";
  status: "draft" | "active";
  draftPlanMarkdown: string | null;
  createdAt: string;
  currentDayIndex: number;
  minutesPerDay: number;
  progress: {
    completedDays: number;
    streak: number;
  };
  focus: {
    outline?: FocusOutline;
    plan?: StructuredPlan;
    replyPreview?: string;
    // REMOVED 'lesson' - not needed anymore
  };
  days: Record<number, DayData>;
  focusChatHistory: FocusChatMessage[];
  config?: LearningFocusConfig;
}

// ============================================================================
// Legacy Types (full backwards compatibility)
// ============================================================================

export interface LessonCard {
  front: string;
  back: string;
  audio?: string;
}

export interface PracticeTask {
  instruction: string;
  completed?: boolean;
}

export interface Lesson {
  dayIndex: number;
  newItems: LessonCard[];
  practice: PracticeTask[];
  quiz: QuizQuestion[];
  producePrompt: string;
  wrapPrompt: string;
}

export interface DayOutline {
  day: number;
  title: string;
  objectives: string[];
}

export interface LearningOutline {
  summary: string;
  days: DayOutline[];
}

export interface LearningFocusSession {
  type: "learning";
  config: LearningFocusConfig;
  outline: LearningOutline;
  currentLesson: Lesson;
  startedAt: string;
  dayIndex: number;
  lastDoneDay: string | null;
}

export interface LearningFocusResponse {
  ok: boolean;
  mode: "focus_plan";
  reply: string;
  focus?: {
    type: "learning";
    outline: LearningOutline;
    lesson: Lesson;
  };
}
