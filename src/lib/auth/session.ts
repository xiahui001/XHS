"use client";

export type AuthUser = {
  id: string;
  email?: string;
};

export type AuthSessionSnapshot = {
  user: AuthUser;
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
  } | null;
};

const AUTH_STORAGE_KEY = "xhs-matrix-auth-session";
const REFRESH_SKEW_SECONDS = 60;

export function readStoredAuthSession(): AuthSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const snapshot = JSON.parse(raw) as AuthSessionSnapshot;
    return snapshot?.user?.id ? snapshot : null;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function storeAuthSession(snapshot: AuthSessionSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearStoredAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function authSessionNeedsRefresh(
  snapshot: AuthSessionSnapshot,
  nowSeconds = Math.floor(Date.now() / 1000),
  skewSeconds = REFRESH_SKEW_SECONDS
) {
  if (!snapshot.session?.accessToken || !snapshot.session.refreshToken || !snapshot.session.expiresAt) return true;
  return snapshot.session.expiresAt <= nowSeconds + skewSeconds;
}

export async function readFreshStoredAuthSession(): Promise<AuthSessionSnapshot | null> {
  const snapshot = readStoredAuthSession();
  if (!snapshot) return null;
  if (!authSessionNeedsRefresh(snapshot)) return snapshot;

  const refreshToken = snapshot.session?.refreshToken;
  if (!refreshToken) {
    clearStoredAuthSession();
    return null;
  }

  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: AuthSessionSnapshot;
    } | null;

    if (!response.ok || !payload?.ok || !payload.data?.session?.accessToken) {
      clearStoredAuthSession();
      return null;
    }

    storeAuthSession(payload.data);
    return payload.data;
  } catch {
    return snapshot;
  }
}
