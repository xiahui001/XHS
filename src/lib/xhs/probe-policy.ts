export type XhsProbeCacheStatus = {
  riskBlocked: boolean;
  lastSavedAt: string | null;
};

export type XhsProbeCacheDecision = {
  shouldReuse: boolean;
  remainingMs: number;
  reason: "cache-ttl" | "fresh-cooldown" | "risk-cooldown" | "login-state-changed" | "expired";
};

export function getXhsProbeCacheDecision(input: {
  cachedStatus: XhsProbeCacheStatus | null;
  checkedAtMs: number | null;
  currentLastSavedAt: string | null;
  nowMs: number;
  fresh: boolean;
  ttlMs: number;
  freshCooldownMs: number;
  riskCooldownMs: number;
}): XhsProbeCacheDecision {
  if (!input.cachedStatus || input.checkedAtMs === null) {
    return { shouldReuse: false, remainingMs: 0, reason: "expired" };
  }

  if (input.cachedStatus.lastSavedAt !== input.currentLastSavedAt) {
    return { shouldReuse: false, remainingMs: 0, reason: "login-state-changed" };
  }

  if (input.fresh) {
    return { shouldReuse: false, remainingMs: 0, reason: "expired" };
  }

  const ageMs = Math.max(0, input.nowMs - input.checkedAtMs);
  const reuseWindowMs = input.cachedStatus.riskBlocked
    ? input.riskCooldownMs
    : input.ttlMs;
  const reason = input.cachedStatus.riskBlocked
    ? "risk-cooldown"
    : "cache-ttl";

  if (ageMs < reuseWindowMs) {
    return {
      shouldReuse: true,
      remainingMs: reuseWindowMs - ageMs,
      reason
    };
  }

  return { shouldReuse: false, remainingMs: 0, reason: "expired" };
}
