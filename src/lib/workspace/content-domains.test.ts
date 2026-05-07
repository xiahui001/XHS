import { describe, expect, it } from "vitest";
import { CONTENT_DOMAINS, XHS_COLLECTOR_PROFILE_LABEL, getContentDomain } from "./content-domains";

describe("content domain routing", () => {
  it("keeps five preset content domains separate from the xhs collector login", () => {
    expect(CONTENT_DOMAINS.map((domain) => domain.id)).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    expect(CONTENT_DOMAINS).toHaveLength(5);
    expect(XHS_COLLECTOR_PROFILE_LABEL).toBe("小红书白号采集号");
  });

  it("falls back to the campus domain for unknown persisted routes", () => {
    expect(getContentDomain("A4")?.label).toBe("商超");
    expect(getContentDomain("missing")?.id).toBe("A2");
  });
});
