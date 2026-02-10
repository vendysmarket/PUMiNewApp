// src/lib/pumiInvoke.ts
// Unified API wrapper - ALL backend calls go through this single function

import { supabase } from "@/integrations/supabase/client";

export async function pumiInvoke<T>(
  path: string,
  body: Record<string, any> = {},
  method: "GET" | "POST" = "POST"
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("pumi-proxy", {
    body: {
      _path: path,
      _method: method,
      ...body,
    },
  });

  if (error) {
    throw new Error(`API error (${path}): ${error.message}`);
  }

  return data as T;
}
