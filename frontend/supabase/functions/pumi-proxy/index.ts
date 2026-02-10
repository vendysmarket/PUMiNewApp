// Supabase Edge Function — pumi-proxy
// Uses RAILWAY_TOKEN for upstream auth and X-User-ID header for user identification

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Normalize base URL - remove trailing slashes
const BACKEND_BASE = (Deno.env.get("PUMI_BACKEND_URL")?.trim() ?? "https://api.emoria.life").replace(/\/+$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const auth = req.headers.get("authorization");

  if (!auth) {
    return json(401, { ok: false, error: "Missing Authorization" });
  }

  // Validate Supabase JWT and extract user ID
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.error("[pumi-proxy] JWT validation failed:", authError?.message);
    return json(401, { ok: false, error: "Invalid token" });
  }

  console.log(`[pumi-proxy] User validated: ${user.id}`);

  // Get RAILWAY_TOKEN for upstream authentication
  const railwayToken = Deno.env.get("RAILWAY_TOKEN");
  if (!railwayToken) {
    console.error("[pumi-proxy] RAILWAY_TOKEN not configured");
    return json(500, { ok: false, error: "Server configuration error" });
  }

  let payload: any = null;
  let targetPath = "";
  let method = req.method;

  if (req.method === "POST") {
    try {
      payload = await req.json();
    } catch {
      return json(400, { ok: false, error: "Invalid JSON" });
    }

    targetPath = payload._path;
    delete payload._path;

    // If caller wants GET → real GET, no body
    if (payload._method === "GET") {
      method = "GET";
      delete payload._method;
      payload = null;
    } else {
      method = "POST";
    }
  }

  // Normalize path - ensure exactly one leading slash, no double slashes
  const normalizedPath = ("/" + targetPath).replace(/\/+/g, "/");
  const url = `${BACKEND_BASE}${normalizedPath}`;
  
  console.log(`[pumi-proxy] ${method} ${url} (user: ${user.id})`);

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${railwayToken}`,
      "X-User-ID": user.id,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" && payload ? { body: JSON.stringify(payload) } : {}),
  };

  try {
    const upstream = await fetch(url, options);
    const text = await upstream.text();

    console.log(`[pumi-proxy] Response: ${upstream.status}`);

    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pumi-proxy] Upstream error:", e);
    return json(500, { ok: false, error: String(e) });
  }
});
