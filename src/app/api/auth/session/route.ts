import { createClient } from "@supabase/supabase-js";
import { fail, ok } from "@/lib/http";
import { readBearerToken } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get("authorization"));
  if (!accessToken) return fail("AUTH_TOKEN_REQUIRED", "缺少登录令牌，请重新登录", 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) return fail("SUPABASE_AUTH_CONFIG_MISSING", "Supabase Auth 前端 key 未配置", 500);

  const supabase = createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return fail("AUTH_SESSION_INVALID", "登录状态已失效，请重新登录", 401);

  return ok({
    user: {
      id: data.user.id,
      email: data.user.email
    }
  });
}
