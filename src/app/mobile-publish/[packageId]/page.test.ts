import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mobile publish page package loading", () => {
  it("loads package data from the short package id URL without requiring a data query", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/app/mobile-publish/[packageId]/page.tsx"),
      "utf8"
    );

    expect(source).toContain("resolvePackageDataUrl");
    expect(source).toContain("currentUrl.pathname");
    expect(source).toContain("/api/mobile-publish-packages/");
    expect(source).not.toContain("缺少发布包数据链接");
  });
});
