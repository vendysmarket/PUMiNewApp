// src/lib/focusApi.ts
// Focus API - All requests go through pumiInvoke

import { pumiInvoke } from "./pumiInvoke";

export type CreatePlanResp = { ok: boolean; plan_id: string; days_count: number };
export type StartDayResp = { ok: boolean; plan_id: string; day: any; done?: boolean };
export type CompleteItemResp = { ok: boolean; progress: any };
export type CompleteDayResp = { ok: boolean; day_completed?: boolean; already_completed?: boolean; streak?: number };
export type ResetResp = { ok: boolean; status: string };
export type FocusStatsResp = { ok: boolean; streak: number; last_streak_date?: string | null };
export type FocusActiveResp = { ok: boolean; plan?: any | null; day?: any | null; plan_id?: string | null };
export type FocusGetDayResp = { ok: boolean; day: any; items: any[] };

export type CreatePlanPayload = {
  title: string;
  message: string;
  days: any[];
  domain?: string;
  level?: string;
  minutes_per_day?: number;
  lang?: string;
};

export const focusApi = {
  createPlan: (payload: CreatePlanPayload) => 
    pumiInvoke<CreatePlanResp>("/focus/create-plan", payload),
  
  startDay: (payload: { plan_id: string }) => 
    pumiInvoke<StartDayResp>("/focus/start-day", payload),
  
  completeItem: (payload: any) => 
    pumiInvoke<CompleteItemResp>("/focus/complete-item", payload),
  
  completeDay: (payload: { plan_id: string; day_index: number }) =>
    pumiInvoke<CompleteDayResp>("/focus/complete-day", payload),
  
  reset: (payload: { plan_id: string; mode: "archive" | "delete" }) => 
    pumiInvoke<ResetResp>("/focus/reset", payload),
  
  stats: () => 
    pumiInvoke<FocusStatsResp>("/focus/stats", {}, "GET"),
  
  active: () => 
    pumiInvoke<FocusActiveResp>("/focus/active", {}, "GET"),
  
  getDay: (payload: { plan_id: string; day_index: number }) => 
    pumiInvoke<FocusGetDayResp>("/focus/get-day", payload),
};
