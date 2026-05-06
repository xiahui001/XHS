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
