import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("matrix dashboard mobile package entry", () => {
  it("does not block mobile package creation when a draft has fewer than twelve images", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).not.toContain("请先重新采集补足后再生成手机发布包");
    expect(source).not.toContain("busyAction === \"mobile-publish-package\" || draftImageCount !== IMAGES_PER_DRAFT");
  });
  it("allows partial ActivityWang image assignment before draft storage", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("allowPartial: true");
    expect(source).toContain("buildEventwangFallbackSearchTerms");
    expect(source).toContain("buildEventwangPartialStatus");
  });

  it("passes the selected account to ActivityWang and labels local image pool quota fallback", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("accountId: targetAccountId");
    expect(source).toContain("quotaFallback");
    expect(source).toContain("活动汪下载权益已用完");
    expect(source).toContain("本地图片池");
    expect(source).toContain("本地图片池补图");
    expect(source).toContain("prepareDraftMediaImages");
    expect(source).toContain('poolOnly: mode === "preview"');
  });

  it("labels mixed ActivityWang and local pool images without calling the whole batch local", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("function buildEventwangSourceLabel");
    expect(source).toContain("图库原图 ${liveImageCount} 张 + 本地图片池 ${poolImageCount} 张");
    expect(source).toContain('source?: "eventwang_live" | "image_pool" | "mixed"');
  });

  it("tells draft library users that phone packages backfill from the local image pool", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("生成手机发布码前会再走正式补图流程");
  });

  it("runs live ActivityWang collection before local fallback for mobile packages", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const ensureStart = source.indexOf("async function prepareDraftMediaImages");
    const ensureEnd = source.indexOf("async function createMobilePublishPackage", ensureStart);
    const ensureSource = source.slice(ensureStart, ensureEnd);

    expect(ensureSource).toContain("const requiredImageCount = mode === \"preview\" ? EVENTWANG_IMAGE_POOL_MIN_IMAGES_PER_DRAFT : IMAGES_PER_DRAFT");
    expect(ensureSource).not.toContain("if (existingImages.length >= EVENTWANG_IMAGE_POOL_MIN_IMAGES_PER_DRAFT) return draft;");
    expect(ensureSource).toContain("const draftHydrationKey = `${draft.id}:${mode}`");
    expect(ensureSource).toContain("draftImageHydrationPromisesRef.current.get(draftHydrationKey)");
    expect(ensureSource).not.toContain("draftImageHydrationPromisesRef.current.get(draft.id)");
    expect(ensureSource).toContain('poolOnly: mode === "preview"');
    expect(ensureSource).toContain("keywordAlternates: mode === \"package\"");
    expect(ensureSource).toContain("quickMode: mode === \"package\"");
    expect(ensureSource).not.toContain("keyword: mediaKeyword,\n          limit: IMAGES_PER_DRAFT,\n          poolOnly: true");
  });

  it("does not abort mobile package creation when the local image pool is short", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const ensureStart = source.indexOf("async function prepareDraftMediaImages");
    const ensureEnd = source.indexOf("async function createMobilePublishPackage", ensureStart);
    const ensureSource = source.slice(ensureStart, ensureEnd);

    expect(ensureSource).not.toContain("\u672c\u5730\u56fe\u7247\u6c60\u6ca1\u6709\u5f53\u524d\u677f\u5757\u53ef\u7528\u56fe");
    expect(ensureSource).not.toContain("\u672c\u5730\u56fe\u7247\u6c60\u4ec5\u8865\u5230");
  });

  it("automatically starts mobile package generation when a draft detail is open", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("autoMobilePackageDraftIdsRef");
    expect(source).toContain('activeSection !== "section-3" || !selectedDraft');
    expect(source).toContain('void createMobilePublishPackage({ draft: selectedDraft, source: "auto" });');
    expect(source).toContain('onClick={() => void createMobilePublishPackage({ source: "manual" })}');
  });

  it("guards automatic mobile package generation from duplicates and stale responses", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("autoMobilePackageDraftIdsRef.current.has(selectedDraft.id)");
    expect(source).toContain("autoMobilePackageDraftIdsRef.current.add(selectedDraft.id)");
    expect(source).toContain("mobilePackageInFlightDraftIdRef.current");
    expect(source).toContain("selectedDraftIdRef.current === draftForPackage.id");
  });

  it("caches generated mobile packages per draft so selection changes do not restart the flow", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");

    expect(source).toContain("MOBILE_PACKAGE_CACHE_STORAGE_KEY");
    expect(source).toContain("mobilePublishPackageCacheRef");
    expect(source).toContain("cacheMobilePublishPackage(draftForPackage.id, response.data)");
    expect(source).toContain("mobilePublishPackageCacheRef.current.has(selectedDraft.id)");
    expect(source).not.toContain(`useEffect(() => {
    setMobilePublishPackage(null);
    setMobilePublishPackageDraftId(null);
  }, [selectedDraftId]);`);
  });

  it("does not report zero candidate images when a draft has publish images or image structure", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const detailStart = source.indexOf("function renderDraftDetail");
    const detailEnd = source.indexOf("async function prepareDraftMediaImages", detailStart);
    const detailSource = source.slice(detailStart, detailEnd);

    expect(source).toContain("function getDraftCandidateImageCount");
    expect(source).toContain("function getDraftPublishImages");
    expect(source).toContain("function getDraftPublishImageCount");
    expect(source).toContain("function getUsableDraftPublishImages");
    expect(detailSource).toContain("const draftImageCount = getDraftPublishImageCount(draft)");
    expect(detailSource).toContain("const requestedImageCount = Math.min(IMAGES_PER_DRAFT, draft.imageStructure?.length ?? 0)");
    expect(detailSource).not.toContain("const draftImageCount = draft.generatedImages?.length ?? 0");
    expect(source).toContain("draft.publishImages?.length");
    expect(source).toContain("draft.imageStructure?.length");
  });

  it("shows photo previews from draft images and generated mobile package image urls", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const detailStart = source.indexOf("function renderDraftDetail");
    const detailEnd = source.indexOf("async function prepareDraftMediaImages", detailStart);
    const detailSource = source.slice(detailStart, detailEnd);

    expect(source).toContain("function getDraftPreviewImages");
    expect(source).toContain('buildEventwangMediaUrl(image.localPath || "")');
    expect(source).toContain("mobilePackage?.imageUrls.map");
    expect(detailSource).toContain("const activeMobilePackage = getActiveMobilePackageForDraft(draft.id)");
    expect(detailSource).toContain("const previewImages = getDraftPreviewImages(draft, activeMobilePackage, getCachedDraftPreviewImages(draft))");
    expect(detailSource).toContain("previewImages.map");
    expect(detailSource).not.toContain("const draftImages = getDraftPublishImages(draft);");
  });

  it("keeps generated package images ahead of preview-only local cache when returning to a draft", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const previewStart = source.indexOf("function getDraftPreviewImages");
    const previewEnd = source.indexOf("function mergeDraftPreviewImages", previewStart);
    const previewSource = source.slice(previewStart, previewEnd);
    const detailStart = source.indexOf("function renderDraftDetail");
    const detailEnd = source.indexOf("async function prepareDraftMediaImages", detailStart);
    const detailSource = source.slice(detailStart, detailEnd);

    expect(previewSource.indexOf("getDraftPublishImages(draft)")).toBeLessThan(previewSource.indexOf("mobilePackage?.imageUrls.map"));
    expect(previewSource.indexOf("mobilePackage?.imageUrls.map")).toBeLessThan(previewSource.indexOf("return previewCache"));
    expect(detailSource).not.toContain("getDraftWithCachedPreview");
    expect(source).not.toContain("function getDraftWithCachedPreview");
  });

  it("shows a preview loading state while local pool images are being prepared", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const detailStart = source.indexOf("function renderDraftDetail");
    const detailEnd = source.indexOf("async function prepareDraftMediaImages", detailStart);
    const detailSource = source.slice(detailStart, detailEnd);

    expect(source).toContain("const [draftPreviewLoadingId, setDraftPreviewLoadingId]");
    expect(source).toContain("setDraftPreviewLoadingId(draft.id)");
    expect(source).toContain("setDraftPreviewLoadingId((current) => (current === draft.id ? null : current))");
    expect(detailSource).toContain("const previewLoading = draftPreviewLoadingId === draft.id");
    expect(detailSource).toContain("正在从本地图片池准备预览图");
  });

  it("only shows a generated mobile package on the draft it belongs to", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const detailStart = source.indexOf("function renderDraftDetail");
    const detailEnd = source.indexOf("async function prepareDraftMediaImages", detailStart);
    const detailSource = source.slice(detailStart, detailEnd);

    expect(source).toContain("mobilePublishPackageDraftId");
    expect(detailSource).toContain("const activeMobilePackage = getActiveMobilePackageForDraft(draft.id)");
    expect(detailSource).toContain("getDraftPreviewImages(draft, activeMobilePackage, getCachedDraftPreviewImages(draft))");
    expect(detailSource).toContain("{activeMobilePackage ? (");
  });

  it("treats cached preview or cached mobile packages as already loaded during draft switching", async () => {
    const source = await readFile(path.join(process.cwd(), "src/components/matrix-dashboard.tsx"), "utf8");
    const previewEffectStart = source.indexOf('if (activeSection !== "section-3" || !selectedDraft) return;');
    const previewEffectEnd = source.indexOf("draftPreviewHydrationAttemptedRef.current.add", previewEffectStart);
    const previewEffectSource = source.slice(previewEffectStart, previewEffectEnd);

    expect(previewEffectSource).toContain("getActiveMobilePackageForDraft(selectedDraft.id)");
    expect(previewEffectSource).toContain("getDraftPreviewImages(selectedDraft, activeMobilePackage, getCachedDraftPreviewImages(selectedDraft)).length");
    expect(previewEffectSource).not.toContain("getDraftWithCachedPreview");
  });
});
