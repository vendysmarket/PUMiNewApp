// types/focusRoom.ts
// FocusRoom Interactive Learning Room — type definitions
//
// Architecture: Session Orchestrator (NOT a chat agent).
// The tutor executes a script. User input only allowed during Task phase.

// ============================================================================
// Session Phase State Machine (locked transitions)
// loading → intro → teach → task → evaluate → (retry | next_task | summary) → end
// ============================================================================

export type SessionPhase =
  | "loading"         // generating content
  | "intro"           // PUMi welcome (tutor speaks, user listens)
  | "teach"           // tutor reads script steps (user listens + reads notes)
  | "task"            // practice task — input ON (quiz/translation/writing)
  | "evaluate"        // tutor evaluates answer
  | "retry"           // wrong answer — user tries again (retry-gate)
  | "summary"         // day recap + streak
  | "end";            // session over, return to canvas

// ============================================================================
// Room Configuration
// ============================================================================

export type RoomDomain = "language" | "smart_learning";
export type RoomLevel = "beginner" | "basic" | "intermediate";

export interface FocusRoomConfig {
  domain: RoomDomain;
  targetLanguage?: string;
  track?: string;
  level: RoomLevel;
  category?: string;
  minutesPerDay: number;
  durationDays: number;
  tone?: "casual" | "neutral" | "strict";
}

// ============================================================================
// 7-Day Plan
// ============================================================================

export interface PlanDaySummary {
  dayIndex: number;
  title: string;
  status: "locked" | "available" | "in_progress" | "completed";
}

export interface FocusPlan {
  id: string;
  roomId: string;
  days: PlanDaySummary[];
  createdAt: string;
}

// ============================================================================
// Script Step — what the tutor says (NOT chat messages)
// ============================================================================

export interface ScriptStep {
  id: string;
  type: "intro" | "teach" | "transition";
  text: string;
}

// ============================================================================
// Day Session Items (tasks)
// ============================================================================

export interface DaySessionItem {
  id: string;
  kind: "quiz" | "translation" | "writing" | "cards" | "roleplay";
  title: string;
  status: "pending" | "active" | "completed" | "failed";
  content?: any;
  attempts: number;        // how many times user tried
  lastScore?: number;
}

export interface DaySession {
  dayIndex: number;
  phase: SessionPhase;
  lessonMd: string;
  scriptSteps: ScriptStep[];
  currentStepIndex: number;
  items: DaySessionItem[];
  currentItemIndex: number;
  transcript: StepEntry[];
  scoreSum: number;
  startedAt: string;
  completedAt?: string;
}

// ============================================================================
// Step Entry — chat-like transcript items (visual only)
// ============================================================================

export type StepEntryType =
  | "tutor"        // tutor speaking (intro/teach/transition)
  | "lesson_note"  // lesson content block (md)
  | "task_prompt"  // task instruction
  | "user_answer"  // user's answer
  | "evaluation"   // evaluation result
  | "hint"         // retry hint
  | "summary";     // day summary

export interface StepEntry {
  id: string;
  type: StepEntryType;
  content: string;
  metadata?: {
    itemId?: string;
    correct?: boolean;
    score?: number;
    canRetry?: boolean;
    attempt?: number;
  };
  ts: number;
}

// ============================================================================
// FocusRoom — top-level entity (localStorage persisted)
// ============================================================================

export interface FocusRoom {
  id: string;
  config: FocusRoomConfig;
  plan: FocusPlan;
  currentDayIndex: number;
  completedDays: number[];
  streak: number;
  session: DaySession | null;
  createdAt: string;
}

// ============================================================================
// API Payloads & Responses
// ============================================================================

export interface CreateRoomPayload {
  domain: RoomDomain;
  target_language?: string;
  track?: string;
  level: RoomLevel;
  category?: string;
  minutes_per_day: number;
  duration_days: number;
  tone?: string;
}

export interface CreateRoomResp {
  ok: boolean;
  room_id: string;
  plan: {
    days: Array<{ day_index: number; title: string }>;
  };
  error?: string;
}

export interface StartDayPayload {
  room_id: string;
  day_index: number;
  domain: RoomDomain;
  target_language?: string;
  track?: string;
  level?: string;
  category?: string;
  minutes_per_day?: number;
  day_title?: string;
}

export interface StartDayResp {
  ok: boolean;
  lesson_md: string;
  script_steps: Array<{ id: string; type: string; text: string }>;
  tasks: Array<{
    id: string;
    kind: string;
    title: string;
    content: any;
  }>;
  error?: string;
}

export interface EvaluatePayload {
  room_id: string;
  item_id: string;
  kind: string;
  user_answer: any;
  attempt: number;
  source?: string;
  target_lang?: string;
  question?: string;
  correct_answer?: string;
  options?: string[];
  prompt?: string;
}

export interface EvaluateResp {
  ok: boolean;
  correct: boolean;
  feedback: string;
  score?: number;
  can_retry: boolean;
  attempt?: number;
  correct_answer?: string;
  improved_version?: string;
  error?: string;
}

export interface TtsPayload {
  text: string;
  voice_id?: string;
}

export interface TtsResp {
  ok: boolean;
  audio_base64?: string;
  content_type?: string;
  error?: string;
}

export interface ClosePayload {
  room_id: string;
  day_index: number;
  items_completed: number;
  items_total: number;
  score_sum: number;
}

export interface CloseResp {
  ok: boolean;
  summary: {
    day_index: number;
    items_completed: number;
    items_total: number;
    avg_score: number;
    completion_rate: number;
    message: string;
  };
}

// ============================================================================
// localStorage Keys
// ============================================================================

export const FOCUSROOM_STORAGE_KEY = "pumi_focusroom_v1";
export const FOCUSROOM_SESSION_KEY = "pumi_focusroom_session_v1";
export const FOCUSROOM_PROGRESS_KEY = "pumi_focusroom_in_progress";
