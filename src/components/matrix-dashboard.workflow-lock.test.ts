import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("matrix dashboard workflow locking", () => {
  it("locks selectors and one-click generation during any running task", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain('const taskBusy = Boolean(busyAction && busyAction !== "mobile-publish-package")');
    expect(source).toContain("if (taskBusy) return");
    expect(source).toContain('id="contentDomain" value={targetAccountId} disabled={taskBusy}');
    expect(source).toContain('id="draftAccount" value={draftAccountId} disabled={taskBusy}');
    expect(source).toContain("disabled={taskBusy}");
    expect(source).toContain("disabled={taskBusy || !targetKeywordOptions.length}");
    expect(source).toContain('id="keywordAccount" value={keywordAccountId} disabled={taskBusy}');
    expect(source).toContain('onClick={addKeywordPreset} disabled={taskBusy}');
  });

  it("keeps draft switching controls usable during background mobile package generation", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const detailStart = source.indexOf("function renderDraftDetail");
    const detailEnd = source.indexOf("if (!authChecked)", detailStart);
    const detailSource = source.slice(detailStart, detailEnd);

    expect(source).toContain('const mobilePackageBusy = busyAction === "mobile-publish-package"');
    expect(detailSource).toContain("disabled={taskBusy || mobilePackageBusy}");
    expect(source).not.toContain("const taskBusy = Boolean(busyAction);");
  });
});
