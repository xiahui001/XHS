import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseServerClientOptions = {
  requireAccessToken?: boolean;
};

export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function hasSupabaseAuthConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function readBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function createSupabaseServerClient(
  accessToken?: string | null,
  options: SupabaseServerClientOptions = {}
): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = accessToken && publishableKey ? publishableKey : process.env.SUPABASE_SERVICE_ROLE_KEY || publishableKey;

  if (!url || !key || (options.requireAccessToken && !accessToken)) {
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      : undefined
  });
}

export async function resolveSupabaseAccessTokenUserId(supabase: SupabaseClient, accessToken: string) {
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user?.id) {
    throw new Error(error?.message || "登录状态已过期，请重新登录");
  }

  return data.user.id;
}
