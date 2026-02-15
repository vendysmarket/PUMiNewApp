// src/lib/focusApi.ts
// Focus API - All requests go through pumiInvoke

import { pumiInvoke } from "./pumiInvoke";

export type FocusMode = "learning" | "project";
export type CreatePlanResp = { ok: boolean; plan_id: string; days_count: number };
export type StartDayResp = { ok: boolean; plan_id: string; day: any; done?: boolean };
export type CompleteItemResp = { ok: boolean; progress: any };
export type CompleteDayResp = { ok: boolean; day_completed?: boolean; already_completed?: boolean; streak?: number };
export type ResetResp = { ok: boolean; status: string };
export type FocusStatsResp = { ok: boolean; streak: number; last_streak_date?: string | null };
export type FocusActiveResp = { ok: boolean; plan?: any | null; day?: any | null; plan_id?: string | null };
export type FocusGetDayResp = { ok: boolean; day: any; items: any[] };
export type GenerateItemContentResp = { ok: boolean; item?: any; content?: any; error?: string };
export type ChatResp = { ok: boolean; reply?: string; message?: string; error?: string };
export type ValidateAnswerResp = { ok: boolean; correct?: boolean; feedback?: string; correct_answer?: string; suggestions?: string[] };
export type GenerateSimpleResp = {
  ok: boolean;
  data?: {
    type: string;
    content?: {
      title?: string;
      summary?: string;
      key_points?: string[];
      example?: string;
      micro_task?: { instruction?: string; expected_output?: string };
      common_mistakes?: string[];
      estimated_minutes?: number;
    };
    text?: string;
    cards?: Array<{ front: string; back: string }>;
  };
  error?: string;
};

export type CreatePlanPayload = {
  title: string;
  message: string;
  days: any[];
  domain?: string;
  level?: string;
  minutes_per_day?: number;
  lang?: string;
  mode: FocusMode;
  // Wizard settings that affect content generation
  tone?: "casual" | "neutral" | "strict";
  difficulty?: "easy" | "normal" | "hard";
  pacing?: "small_steps" | "big_blocks";
  // Force new plan creation (skip idempotency, archive old plan)
  force_new?: boolean;
  // Track system fields
  target_language?: string;    // explicit target language (e.g., "english", "greek")
  track?: string;              // "foundations_language" | "career_language"
  week_outline?: any;          // WeekPlan JSON for backend scope enforcement
};

export const focusApi = {
  createPlan: (payload: CreatePlanPayload) => 
    pumiInvoke<CreatePlanResp>("/focus/create-plan", payload),
  
  startDay: (payload: { plan_id: string; mode: FocusMode }) => 
    pumiInvoke<StartDayResp>("/focus/start-day", payload),
  
  completeItem: (payload: { mode: FocusMode } & Record<string, any>) => 
    pumiInvoke<CompleteItemResp>("/focus/complete-item", payload),
  
  completeDay: (payload: { plan_id: string; day_index: number; mode: FocusMode }) =>
    pumiInvoke<CompleteDayResp>("/focus/complete-day", payload),
  
  reset: (payload: { plan_id: string; reset_mode: "archive" | "delete"; mode: FocusMode }) => 
    pumiInvoke<ResetResp>("/focus/reset", payload),
  
  stats: (mode: FocusMode) => 
    pumiInvoke<FocusStatsResp>("/focus/stats", { mode }, "GET"),
  
  active: (mode: FocusMode) => 
    pumiInvoke<FocusActiveResp>("/focus/active", { mode }, "GET"),
  
  getDay: (payload: { plan_id: string; day_index: number; mode: FocusMode }) => 
    pumiInvoke<FocusGetDayResp>("/focus/get-day", payload),

  generateItemContent: async (payload: { item_id: string; topic?: string; label?: string; day_title?: string; user_goal?: string; mode: FocusMode; domain?: string; level?: string; lang?: string }) => {
    const attempt = async (retryNum: number): Promise<GenerateItemContentResp> => {
      try {
        return await pumiInvoke<GenerateItemContentResp>("/focus/generate-item-content", {
          ...payload,
          ...(retryNum > 0 ? { force: true } : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isConflict = message.includes("409") || message.includes("Conflict");
        const isTimeout = message.includes("timeout") || message.includes("504") || message.includes("timed out");

        if (isConflict && retryNum < 1) {
          console.log("generate-item-content 409 → retry");
          await new Promise(resolve => setTimeout(resolve, 400));
          return attempt(retryNum + 1);
        }
        if (isTimeout && retryNum < 1) {
          console.log("generate-item-content timeout → retry");
          await new Promise(resolve => setTimeout(resolve, 2000));
          return attempt(retryNum + 1);
        }
        throw err;
      }
    };
    return attempt(0);
  },

  // Roleplay chat - calls /chat/enhanced with mode=roleplay
  chat: async (payload: {
    message: string;
    history?: Array<{ role: string; content: string }>;
    lang?: string;
    chatMode?: "chat" | "roleplay";
  }): Promise<ChatResp> => {
    try {
      const resp = await pumiInvoke<{ reply?: string; message?: string; error?: string }>("/chat/enhanced", {
        message: payload.message,
        history: payload.history,
        lang: payload.lang || "hu",
        mode: "learning",
      });
      return { ok: true, reply: resp.reply || resp.message };
    } catch (err) {
      console.error("Chat error:", err);
      return { ok: false, error: err instanceof Error ? err.message : "Chat failed" };
    }
  },

  // Validate translation answers
  validateTranslation: async (payload: {
    source: string;
    userAnswer: string;
    targetLang: string;
    hint?: string;
  }): Promise<ValidateAnswerResp> => {
    try {
      const resp = await pumiInvoke<ValidateAnswerResp>("/focus/validate-translation", payload);
      return { ok: true, ...resp };
    } catch (err) {
      // Fallback: simple validation not available
      return { ok: true, correct: false, feedback: "Az automatikus ellenőrzés jelenleg nem elérhető." };
    }
  },

  // Validate writing submission
  validateWriting: async (payload: {
    prompt: string;
    userText: string;
    minChars?: number;
  }): Promise<ValidateAnswerResp> => {
    try {
      const resp = await pumiInvoke<ValidateAnswerResp>("/focus/validate-writing", payload);
      return { ok: true, ...resp };
    } catch (err) {
      // Fallback: mark as complete if min chars met
      const meetsMinChars = (payload.userText?.length || 0) >= (payload.minChars || 50);
      return {
        ok: true,
        correct: meetsMinChars,
        feedback: meetsMinChars
          ? "Szép munka! Az írásod el lett mentve."
          : "Írj még egy kicsit többet a feladat teljesítéséhez."
      };
    }
  },

  // Generate simple AI content for quick focus sessions (no plan required)
  generateSimple: async (payload: {
    topic: string;
    task_type: "lesson" | "practice" | "quiz" | "flashcard" | "writing";
    lang?: string;
    domain?: string;
    round_index?: number;
  }): Promise<GenerateSimpleResp> => {
    try {
      const resp = await pumiInvoke<GenerateSimpleResp>("/focus/generate-simple", {
        topic: payload.topic,
        task_type: payload.task_type,
        lang: payload.lang || "hu",
        domain: payload.domain || "general",
        round_index: payload.round_index || 0,
        mode: "learning", // Required by pumiInvoke
      });
      return resp;
    } catch (err) {
      console.error("generateSimple error:", err);
      return { ok: false, error: err instanceof Error ? err.message : "Content generation failed" };
    }
  },
};
