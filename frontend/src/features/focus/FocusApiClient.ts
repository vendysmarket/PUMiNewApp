// src/features/focus/focusApiClient.ts
import { supabase } from "@/integrations/supabase/client";

const BASE = import.meta.env.VITE_PUMI_BACKEND_URL; // pl. https://api.emoria.life

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post<T>(path: string, body: any): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
  };

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Focus API ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const headers = {
    ...(await authHeaders()),
  };

  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Focus API ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

type FocusMode = "learning" | "project";

export type CreatePlanInput = {
  title: string;
  domain: string;
  level?: string;
  lang?: "hu";
  mode?: FocusMode;
  minutes_per_day?: number;
  tone?: string;
  difficulty?: string;
  pacing?: string;
  force_new?: boolean;
  duration_days?: number;
  /** Pre-built days from syllabus generator. If provided, overrides buildDays(). */
  prebuilt_days?: Array<{
    dayIndex: number;
    title: string;
    intro: string;
    items: Array<{
      itemKey: string;
      type: string;
      practiceType: string | null;
      topic: string;
      label: string;
      estimatedMinutes: number;
    }>;
  }>;
};

function buildDays(durationDays: number, title: string) {
  const n = Math.max(1, Math.min(14, durationDays || 7));
  return Array.from({ length: n }, (_, i) => ({
    dayIndex: i,
    title: `${title} • Nap ${i + 1}`,
    intro: "",
    items: [],
  }));
}

export const focusApi = {
  createPlan: (input: CreatePlanInput) => {
    const mode: FocusMode =
      input.mode ?? (input.domain === "project" ? "project" : "learning");

    const days = input.prebuilt_days || buildDays(input.duration_days ?? 7, input.title);

    return post<{ ok: boolean; plan_id: string }>("/focus/create-plan", {
      title: input.title,
      domain: input.domain,
      level: input.level ?? "beginner",
      lang: "hu",
      mode,
      minutes_per_day: input.minutes_per_day ?? 100,
      tone: input.tone ?? "",
      difficulty: input.difficulty ?? "",
      pacing: input.pacing ?? "",
      force_new: input.force_new ?? false,
      days,
    });
  },

  active: () => get<{ ok: boolean; plan?: any; day?: any }>("/focus/active"),

  startDay: (plan_id: string) =>
    post<{ ok: boolean; plan_id: string; day: any; status: string }>(
      "/focus/start-day",
      { plan_id },
    ),

  getDay: (plan_id: string, day_index: number) =>
    post<{ ok: boolean; day: any; items?: any[]; status?: string }>(
      "/focus/get-day",
      { plan_id, day_index },
    ),
};
