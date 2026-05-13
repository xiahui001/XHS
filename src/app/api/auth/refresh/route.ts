import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  refreshToken: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !publishableKey) {
      return fail("SUPABASE_AUTH_CONFIG_MISSING", "Supabase Auth 前端 key 未配置", 500);
    }

    const supabase = createClient(url, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    const result = await supabase.auth.refreshSession({ refresh_token: input.refreshToken });
    if (result.error || !result.data.user || !result.data.session) {
      return fail("AUTH_REFRESH_FAILED", "登录状态已过期，请重新登录", 401);
    }

    return ok({
      user: {
        id: result.data.user.id,
        email: result.data.user.email
      },
      session: {
        accessToken: result.data.session.access_token,
        refreshToken: result.data.session.refresh_token,
        expiresAt: result.data.session.expires_at
      }
    });
  } catch (error) {
    return fail("AUTH_REFRESH_REQUEST_FAILED", error instanceof Error ? error.message : "登录状态刷新失败", 400);
  }
}
