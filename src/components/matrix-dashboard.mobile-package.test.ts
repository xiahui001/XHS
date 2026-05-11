import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("matrix dashboard mobile package entry", () => {
  it("automatically starts mobile package generation when a draft detail is open", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("autoMobilePackageDraftIdsRef");
    expect(source).toContain('activeSection !== "section-3" || !selectedDraft');
    expect(source).toContain("void createMobilePublishPackage(selectedDraft);");
    expect(source).toContain('onClick={() => void createMobilePublishPackage()}');
  });

  it("guards automatic mobile package generation from duplicates and stale responses", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("autoMobilePackageDraftIdsRef.current.has(selectedDraft.id)");
    expect(source).toContain("mobilePackageInFlightDraftIdRef.current");
    expect(source).toContain("selectedDraftIdRef.current === draftForRequest.id");
    expect(source).not.toContain('|| !selectedDraft.generatedImages?.length');
  });
});
