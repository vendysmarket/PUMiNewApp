// Supabase Edge Function — focus-proxy
// Robust proxy: supports _path routing + _method GET/POST
// Public CORS gateway

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

// Railway backend base
const BACKEND_BASE = "https://api.emoria.life";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  // We accept POST only from frontend; routing method can be simulated via _method
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  // Routing
  let path = "/chat/enhanced"; // default
  if (typeof payload?._path === "string" && payload._path.trim()) {
    path = payload._path.trim();
    delete payload._path;
  }

  let method = "POST";
  if (typeof payload?._method === "string" && payload._method.trim()) {
    method = payload._method.trim().toUpperCase();
    delete payload._method;
  }

  const targetUrl = `${BACKEND_BASE}${path}`;

  try {
    const headers: Record<string, string> = {
      ...(req.headers.get("authorization") ? { Authorization: req.headers.get("authorization")! } : {}),
    };

    const init: RequestInit = { method, headers };

    // Only attach JSON body for POST/PUT/PATCH
    if (["POST", "PUT", "PATCH"].includes(method)) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(payload ?? {});
    }

    // GET must not send body
    const upstream = await fetch(targetUrl, init);
    const text = await upstream.text();

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: upstream.ok, raw: text };
    }

    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return json(500, { ok: false, error: "Upstream request failed", detail: String(e) });
  }
});
