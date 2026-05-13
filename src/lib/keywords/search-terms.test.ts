import { describe, expect, it } from "vitest";
import { buildCoreSearchTerms, buildEventwangFallbackSearchTerms } from "./search-terms";

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
  it("adds same-domain keyword pool terms after core ActivityWang terms", () => {
    const terms = buildEventwangFallbackSearchTerms("primary-keyword", [
      "primary-keyword",
      "domain-alt-1",
      "domain-alt-2"
    ], 6);

    expect(terms[0]).toBe("primary-keyword");
    expect(terms).toContain("domain-alt-1");
    expect(terms).toContain("domain-alt-2");
    expect(new Set(terms).size).toBe(terms.length);
  });
});
