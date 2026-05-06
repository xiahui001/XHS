import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";
import { createSupabaseServerClient, readBearerToken } from "@/lib/supabase/server";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().uuid(),
  accountCode: z.string().nullable().optional(),
  state: z.enum(["unbound", "binding", "bound", "failed"]),
  detail: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const accessToken = readBearerToken(request.headers.get("authorization"));
    const supabase = createSupabaseServerClient(accessToken);
    if (!supabase) return ok({ saved: false, mode: "demo" });

    const { error } = await supabase.from("xhs_binding_states").upsert({
      user_id: input.userId,
      account_code: input.accountCode ?? null,
      state: input.state,
      detail: input.detail,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (error) throw new Error(error.message);
    return ok({ saved: true, mode: "supabase" });
  } catch (error) {
    return fail("BINDING_STATE_SAVE_FAILED", error instanceof Error ? error.message : "绑定状态保存失败", 400);
  }
}
