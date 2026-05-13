import { describe, expect, it } from "vitest";

const {
  getEventwangGalleryOriginalQuotaState,
  shouldTreatEventwangQuotaTextAsExhausted
} = await import(new URL("../../../scripts/lib/eventwang-quota.mjs", import.meta.url).href);

describe("eventwang quota detection", () => {
  it("does not treat Eventwang's generic quota text as exhausted when original-image quota remains", () => {
    const userInfo = buildCanUseResponse({ limit: "50", remaining: 49 });

    expect(
      shouldTreatEventwangQuotaTextAsExhausted("今日图库会员权益已用完，请等待明天更新～", userInfo)
    ).toBe(false);
  });

  it("treats quota text as exhausted when original-image quota has no remaining allowance", () => {
    const userInfo = buildCanUseResponse({ limit: "50", remaining: 0 });

    expect(
      shouldTreatEventwangQuotaTextAsExhausted("今日图库会员权益已用完，请等待明天更新～", userInfo)
    ).toBe(true);
  });

  it("reads the ActivityWang original-image daily quota from getGalleryCanUse fields", () => {
    expect(getEventwangGalleryOriginalQuotaState(buildCanUseResponse({ limit: "50", remaining: 49 }))).toEqual({
      limit: 50,
      used: 1,
      remaining: 49
    });
  });

  it("does not treat gallery_today_cost as today's original-image usage", () => {
    expect(
      getEventwangGalleryOriginalQuotaState({
        gallery_vip_list: {
          gallery_vip_now_down_count: "50"
        },
        gallery_vip_cost_type_2: {
          gallery_today_cost: 50
        }
      })
    ).toBeNull();
  });
});

function buildCanUseResponse(input: { limit: string; remaining: number }) {
  return {
    vip_down_count: input.limit,
    vip_last_down_count: input.remaining
  };
}
