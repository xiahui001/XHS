import { ok } from "@/lib/http";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET() {
  return ok({
    status: "ok",
    supabase: hasSupabaseConfig() ? "configured" : "demo_mode",
    timestamp: new Date().toISOString()
  });
}
