import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const { createSupabaseServerClient, listBuckets, updateBucket, uploadFile } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  listBuckets: vi.fn(),
  updateBucket: vi.fn(),
  uploadFile: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient
}));

import { POST } from "./route";

const TEST_IMAGE_DIR = path.join(process.cwd(), "data", "eventwang-gallery", "__mobile_publish_route_test__");
const LOCAL_PACKAGE_DIR = path.join(process.cwd(), "data", "mobile-publish-packages");
const originalImagePoolRoot = process.env.EVENTWANG_IMAGE_POOL_ROOT;
const originalImagePoolWorkspaceRoot = process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT;
const originalAppPublicUrl = process.env.APP_PUBLIC_URL;

describe("/api/mobile-publish-packages", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    listBuckets.mockReset();
    updateBucket.mockReset();
    uploadFile.mockReset();

    listBuckets.mockResolvedValue({
      data: [{ name: "xhs-mobile-publish-packages" }],
      error: null
    });
    updateBucket.mockResolvedValue({ error: null });
    createSupabaseServerClient.mockReturnValue({
      storage: {
        listBuckets,
        updateBucket,
        from: () => ({
          upload: uploadFile,
          getPublicUrl: (storagePath: string) => ({
            data: { publicUrl: `https://storage.local/${storagePath}` }
          })
        })
      }
    });
    restoreEnv("EVENTWANG_IMAGE_POOL_ROOT", originalImagePoolRoot);
    restoreEnv("EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT", originalImagePoolWorkspaceRoot);
    restoreEnv("APP_PUBLIC_URL", originalAppPublicUrl);
    vi.unstubAllGlobals();
  });

  afterEach(async () => {
    await rm(TEST_IMAGE_DIR, { recursive: true, force: true });
    await rm(path.join(process.cwd(), "data", "eventwang-gallery", "__mobile_publish_route_pool_test__"), {
      recursive: true,
      force: true
    });
    await rmLocalTestPackages(["historical-storage-fallback"]);
    restoreEnv("EVENTWANG_IMAGE_POOL_ROOT", originalImagePoolRoot);
    restoreEnv("EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT", originalImagePoolWorkspaceRoot);
    restoreEnv("APP_PUBLIC_URL", originalAppPublicUrl);
    vi.unstubAllGlobals();
  });

  it("starts ActivityWang image uploads concurrently so slow files do not exhaust the request timeout", async () => {
    await writeTestImages(3);
    const deferredUploads = [createDeferred(), createDeferred(), createDeferred()];
    const imageUploadPaths: string[] = [];

    uploadFile.mockImplementation((storagePath: string) => {
      if (storagePath.includes("/images/")) {
        imageUploadPaths.push(storagePath);
        return deferredUploads[imageUploadPaths.length - 1].promise;
      }

      return Promise.resolve({ error: null });
    });

    const responsePromise = POST(
      jsonRequest({
        draft: {
          id: "draft-concurrent",
          title: "Concurrent package",
          body: "Upload images without blocking on the first slow file.",
          generatedImages: makeDraftImages(3)
        }
      })
    );

    await waitForImageUploadStarts(imageUploadPaths, 3);
    expect(new Set(imageUploadPaths).size).toBe(3);

    for (const upload of deferredUploads) upload.resolve({ error: null });

    const response = await responsePromise;
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.imageCount).toBe(3);
  });

  it("limits Supabase image upload bursts so transient network failures do not cascade", async () => {
    await writeTestImages(6);
    const deferredUploads = Array.from({ length: 6 }, () => createDeferred());
    const imageUploadPaths: string[] = [];

    uploadFile.mockImplementation((storagePath: string) => {
      if (storagePath.includes("/images/")) {
        imageUploadPaths.push(storagePath);
        return deferredUploads[imageUploadPaths.length - 1].promise;
      }

      return Promise.resolve({ error: null });
    });

    const responsePromise = POST(
      jsonRequest({
        draft: {
          id: "draft-limited-concurrency",
          title: "Limited package",
          body: "Upload images in a bounded burst.",
          generatedImages: makeDraftImages(6)
        }
      })
    );

    await waitForImageUploadStarts(imageUploadPaths, 4);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(imageUploadPaths).toHaveLength(4);

    deferredUploads[0].resolve({ error: null });
    await waitForImageUploadStarts(imageUploadPaths, 5);

    for (const upload of deferredUploads.slice(1)) upload.resolve({ error: null });

    const response = await responsePromise;
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.storageProvider).toBe("supabase");
    expect(payload.data.imageCount).toBe(6);
  });

  it("retries transient Supabase image upload failures instead of falling back to a local package", async () => {
    await writeTestImages(1);
    let imageUploadAttempt = 0;
    uploadFile.mockImplementation((storagePath: string) => {
      if (storagePath.includes("/images/")) {
        imageUploadAttempt += 1;
        return Promise.resolve({
          error: imageUploadAttempt === 1 ? new Error("fetch failed") : null
        });
      }

      return Promise.resolve({ error: null });
    });

    const response = await POST(
      jsonRequest({
        draft: {
          id: "draft-retry-image-upload",
          title: "Retry package",
          body: "Retry transient image upload failures.",
          generatedImages: makeDraftImages(1)
        }
      })
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.data.storageProvider).toBe("supabase");
    expect(payload.data.imageCount).toBe(1);
    expect(imageUploadAttempt).toBe(2);
  });

  it("backfills draft library phone packages from the current account image pool", async () => {
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(
      process.cwd(),
      "data",
      "eventwang-gallery",
      "__mobile_publish_route_pool_test__"
    );
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = process.cwd();
    await writePoolManifest("校园活动", 12);
    uploadFile.mockResolvedValue({ error: null });

    const response = await POST(
      jsonRequest({
        draft: {
          id: "draft-library-empty",
          accountId: "A2",
          title: "Pool fallback package",
          body: "Draft library entries should still get local pool images.",
          topic: "校园活动",
          generatedImages: []
        }
      })
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.data.imageCount).toBe(12);
    expect(payload.data.storageProvider).toBe("supabase");
    expect(payload.data.packageDataUrl).toMatch(/^https:\/\/storage\.local\/packages\/[^/]+\/package\.json$/);
    expect(payload.data.packageUrl).toMatch(/^http:\/\/localhost\/mobile-publish\/[^?]+$/);
    expect(payload.data.packageUrl).not.toContain("?data=");
    expect(payload.data.packageUrl.length).toBeLessThan(180);
    expect(
      uploadFile.mock.calls.filter(([storagePath]) => String(storagePath).includes("/images/"))
    ).toHaveLength(12);
  });

  it("creates a text-only package for historical drafts when no usable local image exists", async () => {
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(
      process.cwd(),
      "data",
      "eventwang-gallery",
      "__mobile_publish_route_pool_test__"
    );
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = process.cwd();
    await mkdir(process.env.EVENTWANG_IMAGE_POOL_ROOT, { recursive: true });
    uploadFile.mockResolvedValue({ error: null });

    const response = await POST(
      jsonRequest({
        draft: {
          id: "historical-a3-empty",
          accountId: "A3",
          accountName: "建筑行业",
          title: "售房部开业活动，快来参加！",
          body: "售房部开业啦！现场布置到位，可留下印记。",
          topic: "售房部开业活动",
          generatedImages: []
        }
      })
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.data.imageCount).toBe(0);
    expect(uploadFile).toHaveBeenCalledWith(
      expect.stringContaining("/package.json"),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/json" })
    );
  });

  it("delegates to the public Vercel app when local Supabase package storage fails", async () => {
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(
      process.cwd(),
      "data",
      "eventwang-gallery",
      "__mobile_publish_route_pool_test__"
    );
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = process.cwd();
    process.env.APP_PUBLIC_URL = "https://xhs-sandy.vercel.app";
    await mkdir(process.env.EVENTWANG_IMAGE_POOL_ROOT, { recursive: true });
    const remotePackage = {
      packageId: "remote-package",
      packageUrl: "https://xhs-sandy.vercel.app/mobile-publish/remote-package",
      packageDataUrl: "https://storage.local/package.json",
      deeplinkUrl: "xhsdiscover://post",
      shareText: "remote share text",
      imageCount: 0,
      imageUrls: [],
      skippedImageCount: 0,
      storageProvider: "supabase",
      bucket: "xhs-mobile-publish-packages",
      storagePath: "packages/remote-package/package.json",
      phoneScanReady: true,
      shareReady: true,
      publicAccessWarning: null,
      createdAt: "2026-05-12T00:00:00.000Z"
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: remotePackage }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    uploadFile.mockImplementation((storagePath: string) => {
      if (String(storagePath).includes("/package.json")) {
        return Promise.reject(new Error("fetch failed"));
      }

      return Promise.resolve({ error: null });
    });

    const response = await POST(
      jsonRequest({
        draft: {
          id: "historical-storage-fallback",
          accountId: "A3",
          accountName: "建筑行业",
          title: "售房部开业活动，快来参加！",
          body: "售房部开业啦！现场布置到位，可留下印记。",
          topic: "售房部开业活动",
          generatedImages: []
        }
      })
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.data).toEqual(remotePackage);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://xhs-sandy.vercel.app/api/mobile-publish-packages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "x-mobile-publish-forwarded": "1"
        })
      })
    );
  });

  it("falls back to local package data when no public app URL is configured", async () => {
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(
      process.cwd(),
      "data",
      "eventwang-gallery",
      "__mobile_publish_route_pool_test__"
    );
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = process.cwd();
    await mkdir(process.env.EVENTWANG_IMAGE_POOL_ROOT, { recursive: true });
    uploadFile.mockImplementation((storagePath: string) => {
      if (String(storagePath).includes("/package.json")) {
        return Promise.reject(new Error("fetch failed"));
      }

      return Promise.resolve({ error: null });
    });

    const response = await POST(
      jsonRequest({
        draft: {
          id: "historical-storage-fallback",
          accountId: "A3",
          accountName: "建筑行业",
          title: "售房部开业活动，快来参加！",
          body: "售房部开业啦！现场布置到位，可留下印记。",
          topic: "售房部开业活动",
          generatedImages: []
        }
      })
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.data.imageCount).toBe(0);
    expect(payload.data.storageProvider).toBe("local");
    expect(payload.data.packageDataUrl).toMatch(/^http:\/\/localhost\/api\/mobile-publish-packages\/[^/]+$/);
    expect(payload.data.packageUrl).toMatch(/^http:\/\/localhost\/mobile-publish\/[^?]+$/);
    expect(payload.data.packageUrl).not.toContain("?data=");
    expect(payload.data.packageUrl.length).toBeLessThan(180);
    expect(payload.data.phoneScanReady).toBe(false);
  });

  it("falls back to a short local package when the public API fallback is unavailable", async () => {
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(
      process.cwd(),
      "data",
      "eventwang-gallery",
      "__mobile_publish_route_pool_test__"
    );
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = process.cwd();
    process.env.APP_PUBLIC_URL = "https://xhs-sandy.vercel.app";
    await mkdir(process.env.EVENTWANG_IMAGE_POOL_ROOT, { recursive: true });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: { code: "OLD_DEPLOYMENT", message: "missing gallery" } }), {
        status: 400,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    uploadFile.mockImplementation((storagePath: string) => {
      if (String(storagePath).includes("/package.json")) {
        return Promise.reject(new Error("fetch failed"));
      }

      return Promise.resolve({ error: null });
    });

    const response = await POST(
      jsonRequest({
        draft: {
          id: "historical-storage-fallback",
          accountId: "A3",
          accountName: "建筑行业",
          title: "售房部开业活动，快来参加！",
          body: "售房部开业啦！现场布置到位，可留下印记。",
          topic: "售房部开业活动",
          generatedImages: []
        }
      })
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.data.storageProvider).toBe("local");
    expect(payload.data.packageUrl).toMatch(/^http:\/\/localhost\/mobile-publish\/[^?]+$/);
    expect(payload.data.packageUrl).not.toContain("?data=");
    expect(payload.data.packageDataUrl).toMatch(/^http:\/\/localhost\/api\/mobile-publish-packages\/[^/]+$/);
    expect(payload.data.phoneScanReady).toBe(false);
    expect(payload.data.publicAccessWarning).toContain("Supabase Storage");
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/mobile-publish-packages", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    }
  });
}

async function writeTestImages(count: number) {
  for (let index = 0; index < count; index += 1) {
    const dir = path.join(TEST_IMAGE_DIR, String(index + 1));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "photo.jpg"), `test image ${index + 1}`, "utf8");
  }
}

function makeDraftImages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    url: `/api/materials/eventwang-file?path=${encodeURIComponent(localImagePath(index))}`,
    localPath: localImagePath(index)
  }));
}

function localImagePath(index: number) {
  return path.join("data", "eventwang-gallery", "__mobile_publish_route_test__", String(index + 1), "photo.jpg");
}

async function writePoolManifest(keyword: string, imageCount: number) {
  const workspaceRoot = process.cwd();
  const manifestDir = path.join(
    workspaceRoot,
    "data",
    "eventwang-gallery",
    "__mobile_publish_route_pool_test__",
    `keyword-${keyword}`,
    "run"
  );
  await mkdir(manifestDir, { recursive: true });
  const items = [];
  for (let index = 0; index < imageCount; index += 1) {
    const imagePath = path.join(manifestDir, `${index}.jpg`);
    await writeFile(imagePath, `pool image ${index}`, "utf8");
    items.push({
      galleryId: `${keyword}-${index}`,
      ownerId: "",
      resultIndex: index,
      tagName: "已布置",
      styleTag: "已布置",
      styleBucket: "installed",
      detailUrl: `https://www.eventwang.cn/Gallery/detail-${keyword}-${index}`,
      sourceUrl: `https://www.eventwang.cn/Gallery/detail-${keyword}-${index}`,
      previewUrl: null,
      localPath: path.relative(workspaceRoot, imagePath),
      downloadFilename: `${index}.jpg`
    });
  }
  await writeFile(
    path.join(manifestDir, "manifest.json"),
    JSON.stringify({
      keyword,
      galleryUrl: `https://www.eventwang.cn/Gallery?keywords=${encodeURIComponent(keyword)}`,
      outputDir: path.relative(workspaceRoot, manifestDir),
      items,
      skipped: []
    })
  );
}

async function rmLocalTestPackages(draftIds: string[]) {
  let entries: Array<{ isDirectory(): boolean; name: string | Buffer }>;
  try {
    entries = (await readdir(LOCAL_PACKAGE_DIR, { withFileTypes: true })) as Array<{
      isDirectory(): boolean;
      name: string | Buffer;
    }>;
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }

  await Promise.all(
    entries
      .map((entry) => ({ isDirectory: entry.isDirectory(), name: String(entry.name) }))
      .filter((entry) => entry.isDirectory && draftIds.some((draftId) => entry.name.endsWith(`-${draftId}`)))
      .map((entry) => rm(path.join(LOCAL_PACKAGE_DIR, entry.name), { recursive: true, force: true }))
  );
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function waitForImageUploadStarts(paths: string[], expectedCount: number) {
  const start = Date.now();
  while (Date.now() - start < 1000) {
    if (paths.length >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Expected ${expectedCount} image uploads to start, got ${paths.length}`);
}

function createDeferred() {
  let resolve!: (value: { error: null }) => void;
  const promise = new Promise<{ error: null }>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
