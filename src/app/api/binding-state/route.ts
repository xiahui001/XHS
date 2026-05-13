import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";
import {
  createSupabaseServerClient,
  hasSupabaseAuthConfig,
  readBearerToken,
  resolveSupabaseAccessTokenUserId
} from "@/lib/supabase/server";

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
    const authFailure = requireSupabaseAccessToken(accessToken);
    if (authFailure) return authFailure;

    const supabase = createSupabaseServerClient(accessToken, { requireAccessToken: true });
    if (!supabase) return ok({ saved: false, mode: "demo" });
    const authUserId = await resolveRequestUserId(supabase, accessToken, input.userId);
    if (!authUserId.ok) return authUserId.response;

    const { error } = await supabase.from("xhs_binding_states").upsert({
      user_id: authUserId.value,
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
