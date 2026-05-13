import { describe, expect, it } from "vitest";
import { buildEventwangPartialStatus, countEventwangDuplicateSkips } from "./eventwang-fallback";

describe("eventwang fallback status", () => {
  it("counts duplicate skips from historical and same-run reasons", () => {
    expect(
      countEventwangDuplicateSkips([
        { reason: "历史重复(content_hash)" },
        { reason: "同批重复(preview_url)" },
        { reason: "未进入多风格优先采集队列" }
      ])
    ).toBe(2);
  });

  it("summarizes partial success with fallback keywords", () => {
    expect(
      buildEventwangPartialStatus({
        imageCount: 8,
        targetCount: 12,
        duplicateSkipCount: 34,
        fallbackKeywordsUsed: ["毕业季布置", "校园市集"]
      })
    ).toBe("本次有效原图 8/12，已跳过重复图 34 张；已补抓关键词：毕业季布置 / 校园市集。可继续生成手机发布包。");
  });

  it("summarizes the zero-image path as text-only draft continuation", () => {
    expect(
      buildEventwangPartialStatus({
        imageCount: 0,
        targetCount: 12,
        duplicateSkipCount: 9,
        fallbackKeywordsUsed: []
      })
    ).toBe("本次有效原图 0/12，已跳过重复图 9 张；草稿会先以文案入库，后续补图后再生成发布包。");
  });
});
