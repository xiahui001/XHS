import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  mode: z.enum(["sign-in", "sign-up"]),
  email: z.string().email(),
  password: z.string().min(6)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !publishableKey) {
      return fail("SUPABASE_AUTH_CONFIG_MISSING", "Supabase Auth 前端 key 未配置", 500);
    }

    const supabase = createClient(url, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    const result =
      input.mode === "sign-up"
        ? await signUpOrCreateUser({
            url,
            publishableKey,
            serviceRoleKey,
            email: input.email,
            password: input.password
          })
        : await supabase.auth.signInWithPassword({ email: input.email, password: input.password });

    if (result.error || !result.data.user) {
      const status = "status" in (result.error ?? {}) ? Number(result.error?.status) || 400 : 400;
      const message = normalizeSupabaseAuthMessage(
        result.error?.message,
        input.mode,
        Boolean(serviceRoleKey)
      );
      return fail("SUPABASE_AUTH_FAILED", message, status);
    }

    return ok({
      user: {
        id: result.data.user.id,
        email: result.data.user.email
      },
      session: result.data.session
        ? {
            accessToken: result.data.session.access_token,
            refreshToken: result.data.session.refresh_token,
            expiresAt: result.data.session.expires_at
          }
        : null
    });
  } catch (error) {
    return fail("SUPABASE_AUTH_REQUEST_FAILED", error instanceof Error ? error.message : "注册登录请求失败", 400);
  }
}

async function signUpOrCreateUser(input: {
  url: string;
  publishableKey: string;
  serviceRoleKey?: string;
  email: string;
  password: string;
}) {
  if (input.serviceRoleKey) {
    const admin = createClient(input.url, input.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    const adminResult = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true
    });

    if (adminResult.error && !adminResult.error.message.toLowerCase().includes("already")) {
      return {
        data: {
          user: null,
          session: null
        },
        error: adminResult.error
      };
    }

    const client = createClient(input.url, input.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    return client.auth.signInWithPassword({
      email: input.email,
      password: input.password
    });
  }

  const client = createClient(input.url, input.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return client.auth.signUp({
    email: input.email,
    password: input.password
  });
}

function normalizeSupabaseAuthMessage(
  message: string | undefined,
  mode: "sign-in" | "sign-up",
  hasServiceRoleKey: boolean
) {
  if (!message) return mode === "sign-up" ? "注册失败" : "登录失败";

  const lower = message.toLowerCase();

  if (lower.includes("rate limit")) {
    return hasServiceRoleKey ? "email rate limit exceeded" : "email rate limit exceeded; missing SUPABASE_SERVICE_ROLE_KEY fallback";
  }
  if (lower.includes("invalid login credentials")) return "邮箱或密码错误";
  if (lower.includes("user already registered")) return "该邮箱已注册，请直接登录";
  if (lower.includes("email not confirmed")) return "邮箱尚未完成验证";
  if (lower.includes("password should be at least")) return "密码至少需要 6 位";

  return message;
}
