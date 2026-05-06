import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";
import { createSupabaseServerClient, readBearerToken } from "@/lib/supabase/server";
import { createDefaultWorkspaceState } from "@/lib/workspace/state";

export const runtime = "nodejs";

const saveSchema = z.object({
  userId: z.string().uuid(),
  textRemixPrompt: z.string().min(1),
  imageRemixPrompt: z.string().min(1),
  lastAccountCode: z.string().optional()
});

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId) return fail("USER_ID_REQUIRED", "缺少用户 ID", 400);

  const fallback = createDefaultWorkspaceState(userId);
  const accessToken = readBearerToken(request.headers.get("authorization"));
  const supabase = createSupabaseServerClient(accessToken);
  if (!supabase) return ok({ state: fallback, mode: "demo" });

  const [{ data: workspace }, { data: binding }] = await Promise.all([
    supabase.from("user_workspace_states").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("xhs_binding_states").select("*").eq("user_id", userId).maybeSingle()
  ]);

  return ok({
    state: {
      ...fallback,
      prompts: {
        textRemix: workspace?.text_remix_prompt || fallback.prompts.textRemix,
        imageRemix: workspace?.image_remix_prompt || fallback.prompts.imageRemix
      },
      binding: {
        state: binding?.state || fallback.binding.state,
        accountId: binding?.account_code || fallback.binding.accountId,
        detail: binding?.detail || fallback.binding.detail
      }
    },
    lastAccountCode: workspace?.last_account_code || null,
    mode: "supabase"
  });
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, saveSchema);
    const accessToken = readBearerToken(request.headers.get("authorization"));
    const supabase = createSupabaseServerClient(accessToken);
    if (!supabase) return ok({ saved: false, mode: "demo" });

    const { error } = await supabase.from("user_workspace_states").upsert({
      user_id: input.userId,
      text_remix_prompt: input.textRemixPrompt,
      image_remix_prompt: input.imageRemixPrompt,
      last_account_code: input.lastAccountCode ?? null,
      updated_at: new Date().toISOString()
    });

    if (error) throw new Error(error.message);
    return ok({ saved: true, mode: "supabase" });
  } catch (error) {
    return fail("WORKSPACE_STATE_SAVE_FAILED", error instanceof Error ? error.message : "工作区状态保存失败", 400);
  }
}
