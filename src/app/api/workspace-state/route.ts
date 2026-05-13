import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";
import {
  createSupabaseServerClient,
  hasSupabaseAuthConfig,
  readBearerToken,
  resolveSupabaseAccessTokenUserId
} from "@/lib/supabase/server";
import { createDefaultWorkspaceState, normalizeWorkspacePrompts } from "@/lib/workspace/state";

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
  const authFailure = requireSupabaseAccessToken(accessToken);
  if (authFailure) return authFailure;

  const supabase = createSupabaseServerClient(accessToken, { requireAccessToken: true });
  if (!supabase) return ok({ state: fallback, mode: "demo" });
  const authUserId = await resolveRequestUserId(supabase, accessToken, userId);
  if (!authUserId.ok) return authUserId.response;

  const [{ data: workspace }, { data: binding }] = await Promise.all([
    supabase.from("user_workspace_states").select("*").eq("user_id", authUserId.value).maybeSingle(),
    supabase.from("xhs_binding_states").select("*").eq("user_id", authUserId.value).maybeSingle()
  ]);

  return ok({
    state: {
      ...fallback,
      prompts: normalizeWorkspacePrompts({
        textRemix: workspace?.text_remix_prompt,
        imageRemix: workspace?.image_remix_prompt
      }),
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
    const authFailure = requireSupabaseAccessToken(accessToken);
    if (authFailure) return authFailure;

    const supabase = createSupabaseServerClient(accessToken, { requireAccessToken: true });
    if (!supabase) return ok({ saved: false, mode: "demo" });
    const authUserId = await resolveRequestUserId(supabase, accessToken, input.userId);
    if (!authUserId.ok) return authUserId.response;

    const { error } = await supabase.from("user_workspace_states").upsert({
      user_id: authUserId.value,
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

function requireSupabaseAccessToken(accessToken: string | null) {
  if (!accessToken && hasSupabaseAuthConfig()) {
    return fail("AUTH_TOKEN_REQUIRED", "登录令牌缺失，请重新登录", 401);
  }
  return null;
}

async function resolveRequestUserId(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
  accessToken: string | null,
  requestedUserId: string
): Promise<{ ok: true; value: string } | { ok: false; response: Response }> {
  if (!accessToken) return { ok: false, response: fail("AUTH_TOKEN_REQUIRED", "登录令牌缺失，请重新登录", 401) };

  try {
    const authenticatedUserId = await resolveSupabaseAccessTokenUserId(supabase, accessToken);
    if (requestedUserId !== authenticatedUserId) {
      return { ok: false, response: fail("AUTH_USER_MISMATCH", "登录用户与请求用户不一致", 403) };
    }
    return { ok: true, value: authenticatedUserId };
  } catch (error) {
    return {
      ok: false,
      response: fail("AUTH_SESSION_INVALID", error instanceof Error ? error.message : "登录状态已过期，请重新登录", 401)
    };
  }
}
