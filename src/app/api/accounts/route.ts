import { DEFAULT_ACCOUNTS } from "@/lib/generation/planner";
import { ok } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("xhs_accounts")
      .select("*")
      .order("code", { ascending: true });

    if (!error && data) {
      return ok({ accounts: data, mode: "supabase" });
    }
  }

  return ok({ accounts: DEFAULT_ACCOUNTS, mode: "demo" });
}
