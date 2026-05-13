import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("matrix dashboard auth bootstrap", () => {
  it("restores the workbench from local auth before any runtime hydration", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const bootstrapStart = source.indexOf("function bootstrapAuthState");
    const bootstrapEnd = source.indexOf("function signOut", bootstrapStart);
    const bootstrapSource = source.slice(bootstrapStart, bootstrapEnd);

    expect(bootstrapSource).toContain("const cachedUser = snapshot.user");
    expect(bootstrapSource.indexOf("setAuthChecked(true)")).toBeLessThan(
      bootstrapSource.indexOf("hydrateWorkspaceFromLocalSession(cachedUser)")
    );
    expect(bootstrapSource).not.toContain("/api/auth/session");
    expect(bootstrapSource).not.toContain("snapshot?.session?.accessToken");
  });
});
