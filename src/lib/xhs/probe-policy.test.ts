import { describe, expect, it } from "vitest";
import { getXhsProbeCacheDecision } from "./probe-policy";

const baseInput = {
  cachedStatus: { riskBlocked: false, lastSavedAt: "2026-05-07T01:00:00.000Z" },
  checkedAtMs: 1_000,
  currentLastSavedAt: "2026-05-07T01:00:00.000Z",
  nowMs: 2_000,
  fresh: false,
  ttlMs: 30_000,
  freshCooldownMs: 30_000,
  riskCooldownMs: 120_000
};

describe("getXhsProbeCacheDecision", () => {
  it("reuses a normal cached probe inside the default TTL", () => {
    expect(getXhsProbeCacheDecision(baseInput)).toMatchObject({
      shouldReuse: true,
      reason: "cache-ttl"
    });
  });

  it("does not reuse the cache after a rebuilt login state is saved", () => {
    expect(
      getXhsProbeCacheDecision({
        ...baseInput,
        currentLastSavedAt: "2026-05-07T02:00:00.000Z"
      })
    ).toEqual({ shouldReuse: false, remainingMs: 0, reason: "login-state-changed" });
  });

  it("keeps risk-blocked probes cooled down for the longer window", () => {
    expect(
      getXhsProbeCacheDecision({
        ...baseInput,
        cachedStatus: { riskBlocked: true, lastSavedAt: baseInput.currentLastSavedAt },
        nowMs: 31_000
      })
    ).toMatchObject({
      shouldReuse: true,
      reason: "risk-cooldown"
    });
  });

  it("forces a live probe when the user explicitly refreshes", () => {
    expect(
      getXhsProbeCacheDecision({
        ...baseInput,
        fresh: true
      })
    ).toEqual({ shouldReuse: false, remainingMs: 0, reason: "expired" });
  });
});
