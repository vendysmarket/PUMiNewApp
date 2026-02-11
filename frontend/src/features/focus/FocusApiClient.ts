// src/features/focus/focusApiClient.ts
import { supabase } from "@/integrations/supabase/client";

const BASE = import.meta.env.VITE_PUMI_BACKEND_URL; // pl. https://your-railway-app.up.railway.app

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

  if (!res.ok) throw new Error(`Focus API ${path} failed: ${res.status}`);
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const headers = {
    ...(await authHeaders()),
  };

  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`Focus API ${path} failed: ${res.status}`);
  return res.json();
}

export const focusApi = {
  outline: (
    goal: string,
    opts?: {
      domain?: string;
      level?: string;
      minutes_per_day?: number;
      duration_days?: number;
    },
  ) =>
    post<{ ok: boolean; outline: any }>("/focus/outline", {
      goal,
      mode: "learning",
      domain: opts?.domain ?? "learning",
      level: opts?.level ?? "beginner",
      minutes_per_day: opts?.minutes_per_day ?? 20,
      duration_days: opts?.duration_days ?? 7,
      lang: "hu",
    }),

  createPlan: (plan: {
    title: string;
    domain: string;
    level: string;
    mode: "learning" | "project";
    minutes_per_day?: number;
    days: any[];
  }) => post<{ ok: boolean; plan_id: string }>("/focus/create-plan", plan),

  active: () => get<{ ok: boolean; plan?: any; day?: any }>("/focus/active"),

  startDay: (plan_id: string) =>
    post<{ ok: boolean; plan_id: string; day: any; status: string }>("/focus/start-day", { plan_id }),

  getDay: (plan_id: string, day_index: number) =>
    post<{ ok: boolean; day: any; items: any[] }>("/focus/get-day", { plan_id, day_index }),

  generateItemContent: (item_id: string) =>
    post<{ ok: boolean; item_id: string; content: any }>("/focus/generate-item-content", { item_id }),
};
