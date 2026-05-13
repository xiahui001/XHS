import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFile, execFileAsync } = vi.hoisted(() => {
  const execFileAsync = vi.fn();
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: execFileAsync
  });

  return { execFile, execFileAsync };
});

vi.mock("node:child_process", () => ({
  execFile
}));

import { POST } from "./route";

const tempDirs: string[] = [];
const originalImagePoolRoot = process.env.EVENTWANG_IMAGE_POOL_ROOT;
const originalImagePoolWorkspaceRoot = process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT;

describe("/api/materials/collect-eventwang-free", () => {
  beforeEach(() => {
    execFile.mockReset();
    execFileAsync.mockReset();
    restoreEnv("EVENTWANG_IMAGE_POOL_ROOT", originalImagePoolRoot);
    restoreEnv("EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT", originalImagePoolWorkspaceRoot);
  });

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
    restoreEnv("EVENTWANG_IMAGE_POOL_ROOT", originalImagePoolRoot);
    restoreEnv("EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT", originalImagePoolWorkspaceRoot);
  });

  it("backfills with alternate keywords and returns partial success when fewer originals are available", async () => {
    execFileAsync
      .mockResolvedValueOnce({
        stdout: `EVENTWANG_FREE_KEYWORD_DONE ${JSON.stringify(makeSummary(3, "campus-art", 0, 12))}`,
        stderr: ""
      })
      .mockResolvedValueOnce({
        stdout: `EVENTWANG_FREE_KEYWORD_DONE ${JSON.stringify(makeSummary(5, "graduation-decor", 3, 12))}`,
        stderr: ""
      });

    const response = await POST(
      jsonRequest({
        keyword: "campus-art",
        keywordAlternates: ["graduation-decor"],
        limit: 12,
        maxCandidates: 120,
        quickMode: true
      })
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.data.imageCount).toBe(8);
    expect(payload.data.selectedCount).toBe(8);
    expect(payload.data.partialSuccess).toBe(true);
    expect(payload.data.fallbackKeywordsUsed).toEqual(["graduation-decor"]);
    expect(payload.data.skipped).toHaveLength(3);
    expect(payload.data.blockingReason).toContain("有效原图 8/12");
    expect(execFileAsync).toHaveBeenCalledTimes(2);
  });

  it("returns an empty usable response when searches run but no non-duplicate image is available", async () => {
    execFileAsync.mockResolvedValue({
      stdout: `EVENTWANG_FREE_KEYWORD_DONE ${JSON.stringify(makeSummary(0, "campus-art", 4, 12))}`,
      stderr: ""
    });

    const response = await POST(
      jsonRequest({
        keyword: "campus-art",
        limit: 12,
        maxCandidates: 120,
        quickMode: true
      })
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.data.imageCount).toBe(0);
    expect(payload.data.partialSuccess).toBe(true);
    expect(payload.data.blockingReason).toContain("有效原图 0/12");
  });

  it("uses the current account image pool when live collection returns zero usable images", async () => {
    const workspaceRoot = await makeTempDir();
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(workspaceRoot, "data", "eventwang-gallery");
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = workspaceRoot;
    await writePoolManifest(workspaceRoot, "校园宣讲会", 12);
    execFileAsync.mockResolvedValue({
      stdout: `EVENTWANG_FREE_KEYWORD_DONE ${JSON.stringify(makeSummary(0, "campus-art", 4, 12))}`,
      stderr: ""
    });

    const response = await POST(
      jsonRequest({
        accountId: "A2",
        keyword: "校园活动",
        limit: 12,
        maxCandidates: 120,
        quickMode: true
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe("image_pool");
    expect(payload.data.quotaFallback).toBe(false);
    expect(payload.data.imageCount).toBe(12);
    expect(payload.data.selectedCount).toBe(12);
    expect(payload.data.blockingReason).toContain("本地图片池补图 12 张");
  });

  it("can read the current account image pool without touching ActivityWang", async () => {
    const workspaceRoot = await makeTempDir();
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(workspaceRoot, "data", "eventwang-gallery");
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = workspaceRoot;
    await writePoolManifest(workspaceRoot, "校园宣讲会", 12);

    const response = await POST(
      jsonRequest({
        accountId: "A2",
        keyword: "校园活动",
        limit: 12,
        poolOnly: true
      })
    );
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(execFileAsync).not.toHaveBeenCalled();
    expect(payload.data.source).toBe("image_pool");
    expect(payload.data.quotaFallback).toBe(false);
    expect(payload.data.imageCount).toBe(12);
  });

  it("tops up fewer than twelve live images from the current account image pool", async () => {
    const workspaceRoot = await makeTempDir();
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(workspaceRoot, "data", "eventwang-gallery");
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = workspaceRoot;
    await writePoolManifest(workspaceRoot, "校园宣讲会", 4);
    execFileAsync.mockResolvedValue({
      stdout: `EVENTWANG_FREE_KEYWORD_DONE ${JSON.stringify(makeSummary(8, "campus-art", 0, 12))}`,
      stderr: ""
    });

    const response = await POST(
      jsonRequest({
        accountId: "A2",
        keyword: "校园活动",
        limit: 12,
        maxCandidates: 120,
        quickMode: true
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe("mixed");
    expect(payload.data.quotaFallback).toBe(false);
    expect(payload.data.liveImageCount).toBe(8);
    expect(payload.data.poolImageCount).toBe(4);
    expect(payload.data.imageCount).toBe(12);
    expect(payload.data.blockingReason).toContain("本地图片池补图 4 张");
  });

  it("tops up ten live images with two local fallback images", async () => {
    const workspaceRoot = await makeTempDir();
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(workspaceRoot, "data", "eventwang-gallery");
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = workspaceRoot;
    await writePoolManifest(workspaceRoot, "校园宣讲会", 2);
    execFileAsync.mockResolvedValue({
      stdout: `EVENTWANG_FREE_KEYWORD_DONE ${JSON.stringify(makeSummary(10, "campus-art", 0, 12))}`,
      stderr: ""
    });

    const response = await POST(
      jsonRequest({
        accountId: "A2",
        keyword: "校园活动",
        limit: 12,
        maxCandidates: 120,
        quickMode: true
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe("mixed");
    expect(payload.data.liveImageCount).toBe(10);
    expect(payload.data.poolImageCount).toBe(2);
    expect(payload.data.imageCount).toBe(12);
    expect(payload.data.blockingReason).toContain("有效原图 10/12");
    expect(payload.data.blockingReason).toContain("本地图片池补图 2 张");
  });

  it("keeps three live images and fills only the nine missing slots from the local pool", async () => {
    const workspaceRoot = await makeTempDir();
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(workspaceRoot, "data", "eventwang-gallery");
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = workspaceRoot;
    await writePoolManifest(workspaceRoot, "校园赛事", 12);
    execFileAsync.mockResolvedValue({
      stdout: `EVENTWANG_FREE_KEYWORD_DONE ${JSON.stringify(makeSummary(3, "campus-contest", 0, 12))}`,
      stderr: ""
    });

    const response = await POST(
      jsonRequest({
        accountId: "A2",
        keyword: "校园赛事",
        limit: 12,
        maxCandidates: 120,
        quickMode: true
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe("mixed");
    expect(payload.data.liveImageCount).toBe(3);
    expect(payload.data.poolImageCount).toBe(9);
    expect(payload.data.imageCount).toBe(12);
    expect(payload.data.items.slice(0, 3).map((item: { galleryId: string }) => item.galleryId)).toEqual([
      "campus-contest-0",
      "campus-contest-1",
      "campus-contest-2"
    ]);
    expect(payload.data.blockingReason).toContain("本地图片池补图 9 张");
  });

  it("falls back to the current account image pool when ActivityWang quota is exhausted", async () => {
    const workspaceRoot = await makeTempDir();
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(workspaceRoot, "data", "eventwang-gallery");
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = workspaceRoot;
    await writePoolManifest(workspaceRoot, "校园宣讲会", 2);
    execFileAsync.mockRejectedValueOnce(Object.assign(new Error("EVENTWANG_GALLERY_DAILY_QUOTA_EXHAUSTED"), { stderr: "" }));

    const response = await POST(
      jsonRequest({
        accountId: "A2",
        keyword: "校园活动",
        limit: 12,
        maxCandidates: 120,
        quickMode: true
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe("image_pool");
    expect(payload.data.quotaFallback).toBe(true);
    expect(payload.data.imageCount).toBe(2);
    expect(payload.data.partialSuccess).toBe(true);
    expect(payload.data.blockingReason).toContain("活动汪下载权益已用完");
    expect(payload.data.blockingReason).toContain("本地图片池");
  });

  it("keeps the workflow usable with zero pool images after quota exhaustion", async () => {
    const workspaceRoot = await makeTempDir();
    process.env.EVENTWANG_IMAGE_POOL_ROOT = path.join(workspaceRoot, "data", "eventwang-gallery");
    process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT = workspaceRoot;
    await mkdir(process.env.EVENTWANG_IMAGE_POOL_ROOT, { recursive: true });
    execFileAsync.mockRejectedValueOnce(Object.assign(new Error("EVENTWANG_GALLERY_DAILY_QUOTA_EXHAUSTED"), { stderr: "" }));

    const response = await POST(
      jsonRequest({
        accountId: "A2",
        keyword: "校园活动",
        limit: 12,
        maxCandidates: 120,
        quickMode: true
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.source).toBe("image_pool");
    expect(payload.data.imageCount).toBe(0);
    expect(payload.data.blockingReason).toContain("有效原图 0/12");
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/materials/collect-eventwang-free", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    }
  });
}

function makeSummary(imageCount: number, keyword = "campus-art", skippedCount = 0, requiredCount = 5) {
  return {
    keyword,
    galleryUrl: "https://www.eventwang.cn/Gallery",
    outputDir: `data/eventwang-gallery/${keyword}`,
    selectedCount: imageCount,
    imageCount,
    styleBucketCount: imageCount,
    requiredStyleBuckets: Math.min(5, requiredCount),
    items: Array.from({ length: imageCount }, (_, index) => ({
      galleryId: `${keyword}-${index}`,
      ownerId: "",
      resultIndex: index,
      tagName: "installed",
      styleTag: "installed",
      styleBucket: "installed",
      detailUrl: `https://www.eventwang.cn/Gallery/detail-${keyword}-${index}`,
      sourceUrl: `https://www.eventwang.cn/Gallery/detail-${keyword}-${index}`,
      previewUrl: null,
      localPath: `data/eventwang-gallery/${keyword}/${index}/photo.jpg`,
      downloadFilename: `${index}.jpg`
    })),
    skipped: Array.from({ length: skippedCount }, (_, index) => ({
      galleryId: `${keyword}-skipped-${index}`,
      detailUrl: "",
      tagName: "installed",
      styleTag: "installed",
      styleBucket: "installed",
      reason: "历史重复(content_hash)"
    }))
  };
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "eventwang-route-pool-"));
  tempDirs.push(dir);
  return dir;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function writePoolManifest(workspaceRoot: string, keyword: string, imageCount: number) {
  const manifestDir = path.join(workspaceRoot, "data", "eventwang-gallery", `keyword-${keyword}`, "run");
  await mkdir(manifestDir, { recursive: true });
  const items = [];
  for (let index = 0; index < imageCount; index += 1) {
    const imagePath = path.join(manifestDir, `${index}.jpg`);
    await writeFile(imagePath, `image ${index}`);
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
      selectedCount: imageCount,
      imageCount,
      styleBucketCount: 1,
      requiredStyleBuckets: 5,
      items,
      skipped: []
    })
  );
}
