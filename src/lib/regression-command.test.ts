import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("regression command", () => {
  it("runs tests, typecheck, and build in one command", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.regression).toBe("npm run test && npm run typecheck && npm run build");
  });

  it("keeps the ActivityWang draft baseline command wired to the guarded test set", async () => {
    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const baselineCommand = packageJson.scripts?.["test:baseline"] ?? "";

    expect(baselineCommand).toContain("vitest run");
    [
      "src/lib/collectors/eventwang-quota.test.ts",
      "src/lib/collectors/eventwang-gallery-candidates.test.ts",
      "src/app/api/materials/collect-eventwang-free/route.test.ts",
      "src/lib/generation/draft-image-assignment-service.test.ts",
      "src/app/api/drafts/route.test.ts",
      "src/components/matrix-dashboard.draft-list.test.ts",
      "src/components/matrix-dashboard.mobile-package.test.ts",
      "src/lib/publish/mobile-package.test.ts",
      "src/app/mobile-publish/[packageId]/page.test.ts"
    ].forEach((testFile) => {
      expect(baselineCommand).toContain(testFile);
    });
  });
});
