import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("matrix dashboard draft list", () => {
  it("does not repeat draft copy inside the expanded detail panel", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const detailStart = source.indexOf("function renderDraftDetail");
    const detailEnd = source.indexOf("if (!authChecked)", detailStart);
    const detailSource = source.slice(detailStart, detailEnd);

    expect(detailSource).not.toContain("<strong>{draft.title}</strong>");
    expect(detailSource).not.toContain("<p>{draft.body}</p>");
    expect(detailSource).not.toContain('draft.tags.map((tag) => `#${tag}`).join(" ")');
  });

  it("lets the draft library switch between A1-A5 account histories", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("const [draftAccountId, setDraftAccountId] = useState(DEFAULT_DRAFT_LIBRARY_ACCOUNT_ID);");
    expect(source).toContain("DRAFT_LIBRARY_ACCOUNT_OPTIONS.map");
    expect(source).toContain("buildDraftLibraryStatus");
    expect(source).toContain("buildDraftLibrarySummary");
    expect(source).toContain('htmlFor="draftAccount"');
    expect(source).toContain('id="draftAccount"');
    expect(source).toContain("value={draftAccountId}");
    expect(source).toContain("changeDraftAccount(event.target.value)");
    expect(source).toContain("setDraftAccountId(accountCode)");
  });

  it("keeps empty account histories empty instead of falling back to all drafts", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const loadDraftsStart = source.indexOf("async function loadDrafts");
    const loadDraftsEnd = source.indexOf("async function fetchDrafts", loadDraftsStart);
    const loadDraftsSource = source.slice(loadDraftsStart, loadDraftsEnd);

    expect(loadDraftsSource).not.toContain("fallbackResponse");
    expect(loadDraftsSource).not.toContain("fetchDrafts(null");
  });

  it("loads local draft history before the Supabase-backed account sync", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const loadDraftsStart = source.indexOf("async function loadDrafts");
    const loadDraftsEnd = source.indexOf("async function fetchDrafts", loadDraftsStart);
    const loadDraftsSource = source.slice(loadDraftsStart, loadDraftsEnd);

    expect(loadDraftsSource).toContain("fetchDrafts(accountCode, null)");
    expect(loadDraftsSource.indexOf("fetchDrafts(accountCode, null)")).toBeLessThan(
      loadDraftsSource.indexOf("fetchDrafts(accountCode, userId)")
    );
    expect(source).toContain("async function fetchDrafts(accountCode: string | null, userId?: string | null)");
  });

  it("shows concrete draft timestamps in the draft library list", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("formatDraftTimestamp");
    expect(source).toContain("生成时间");
    expect(source).toContain("阅读时间");
    expect(source).toContain("draft.batchCreatedAt");
    expect(source).toContain("draft.readAt");
  });

  it("counts existing draft candidate images as ready in global checks", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("hasDraftCandidateImages");
    expect(source).toContain("drafts.some((draft) => getDraftCandidateImageCount(draft) > 0)");
    expect(source).toContain("imageGenerationReady: Boolean(workspaceState.prompts.imageRemix.trim()) && (images.length > 0 || hasDraftCandidateImages)");
  });

  it("removes the right-side draft score and renders a single-draft delete button", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const draftPanelStart = source.indexOf('id="section-3"');
    const draftPanelEnd = source.indexOf('id="section-6"', draftPanelStart);
    const draftPanelSource = source.slice(draftPanelStart, draftPanelEnd);

    expect(draftPanelSource).not.toContain("<strong>{draft.qualityScore}</strong>");
    expect(draftPanelSource).toContain("deleteDraft(draft)");
    expect(draftPanelSource).toContain("draft-delete-button");
    expect(draftPanelSource).toContain("删除草稿");
  });

  it("deletes the selected draft through the drafts API and clears stale package state", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("async function deleteDraft(draft: Draft)");
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("setMobilePublishPackage(null)");
    expect(source).toContain("setSelectedDraftId(nextDrafts[0]?.id ?? null)");
  });

  it("hydrates preview images immediately when a draft becomes selected", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const ensureStart = source.indexOf("async function prepareDraftMediaImages");
    const ensureEnd = source.indexOf("async function createMobilePublishPackage", ensureStart);
    const ensureSource = source.slice(ensureStart, ensureEnd);
    const previewStart = ensureSource.indexOf('if (mode === "preview")');
    const previewEnd = ensureSource.indexOf("const imageAssignment", previewStart);
    const previewSource = ensureSource.slice(previewStart, previewEnd);

    expect(source).toContain("draftImageHydrationPromisesRef");
    expect(source).toContain("draftPreviewCacheRef");
    expect(source).toContain("cacheDraftPreviewImages");
    expect(source).toContain("getActiveMobilePackageForDraft");
    expect(source).toContain("draftPreviewHydrationAttemptedRef");
    expect(source).toContain("buildDraftPreviewImagesFromCandidates");
    expect(source).toContain("window.localStorage.getItem(DRAFT_PREVIEW_CACHE_STORAGE_KEY)");
    expect(source).toContain("window.localStorage.setItem(DRAFT_PREVIEW_CACHE_STORAGE_KEY, serialized)");
    expect(source).toContain("if (!addedImages.length) return draft;");
    expect(source).toContain('void prepareDraftMediaImages(selectedDraft, "preview");');
    expect(source).toContain('await prepareDraftMediaImages(draftForRequest, "package")');
    expect(previewSource).toContain("buildDraftPreviewImagesFromCandidates(candidateImages, existingImages.length, neededImageCount)");
    expect(previewSource).toContain("cacheDraftPreviewImages(draft.id, enrichedImages)");
    expect(previewSource).not.toContain("/api/draft-images/assign");
    expect(previewSource).not.toContain("setDrafts((current) => current.map((item) => (item.id === draft.id ? enrichedDraft : item)))");
  });

  it("keeps preview cache separate from official draft image counts", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const draftPanelStart = source.indexOf('id="section-3"');
    const draftPanelEnd = source.indexOf('id="section-6"', draftPanelStart);
    const draftPanelSource = source.slice(draftPanelStart, draftPanelEnd);
    const ensureStart = source.indexOf("async function prepareDraftMediaImages");
    const ensureEnd = source.indexOf("async function createMobilePublishPackage", ensureStart);
    const ensureSource = source.slice(ensureStart, ensureEnd);
    const packageAssignmentStart = ensureSource.indexOf("const imageAssignment");
    const packageAssignmentSource = ensureSource.slice(packageAssignmentStart);

    expect(source).toContain("function getDraftPublishImageCount");
    expect(source).toContain("const existingImages = getUsableDraftPublishImages(draft)");
    expect(source).toContain("draft.publishImages?.some((image) => image.url?.trim() || image.localPath?.trim())");
    expect(draftPanelSource).toContain("const draftImageCount = getDraftPublishImageCount(draft)");
    expect(draftPanelSource).toContain("配图需求");
    expect(draftPanelSource).toContain("原图待补");
    expect(packageAssignmentSource).toContain('/api/draft-images/assign');
  });

  it("reuses generated package images as draft preview cache", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const packageStart = source.indexOf("async function createMobilePublishPackage");
    const packageEnd = source.indexOf("async function collectEventwangImages", packageStart);
    const packageSource = source.slice(packageStart, packageEnd);

    expect(source).toContain("buildDraftPreviewImagesFromUrls");
    expect(packageSource).toContain("cacheDraftPreviewImages(draftForPackage.id, buildDraftPreviewImagesFromUrls(response.data.imageUrls))");
  });

  it("visually groups each draft as one integrated unit with stronger transitions", async () => {
    const css = await readFile(path.join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain(".draft-row-group + .draft-row-group");
    expect(css).toContain(".draft-row-group.active::before");
    expect(css).toContain(".draft-row-group.active .draft-detail.inline");
    expect(css).toContain(".draft-row-group.active .draft-delete-button");
  });

  it("does not continuously poll the CDP login status after local auth restores", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const cdpEffectStart = source.indexOf("void refreshXhsCdpStatus(false);");
    const cdpEffectEnd = source.indexOf("useEffect(() => {\n    setMobilePublishPackage(null);", cdpEffectStart);
    const cdpEffectSource = source.slice(cdpEffectStart, cdpEffectEnd);

    expect(cdpEffectSource).not.toContain("window.setInterval");
    expect(cdpEffectSource).not.toContain("window.clearInterval");
    expect(source).toContain("xhsCdpStatusInFlightRef");
  });
});
