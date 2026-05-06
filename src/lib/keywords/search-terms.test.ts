import { describe, expect, it } from "vitest";
import { buildCoreSearchTerms } from "./search-terms";

describe("core search terms", () => {
  it("keeps the original keyword first and adds broader campus terms", () => {
    expect(buildCoreSearchTerms("一站式校园活动搭建", 3)).toEqual([
      "一站式校园活动搭建",
      "校园活动布置",
      "校园活动"
    ]);
  });

  it("adds scenario terms for niche recruiting keywords", () => {
    expect(buildCoreSearchTerms("校园宣讲会", 3)).toEqual(["校园宣讲会", "校园活动布置", "校园活动"]);
  });

  it("falls back to general activity terms", () => {
    expect(buildCoreSearchTerms("品牌互动体验", 3)).toEqual(["品牌互动体验", "活动布置", "活动现场"]);
  });
});

