import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("xhs cdp click flow", () => {
  it("opens notes by clicking search result cards instead of navigating collected note URLs", () => {
    const scriptPath = path.join(process.cwd(), "scripts", "scrape-xhs-cdp.mjs");
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("openSearchResultByClick");
    expect(script).not.toMatch(/page\.goto\(\s*sourceUrl/);
    expect(script).not.toContain("collectSearchResultUrls");
  });
});
