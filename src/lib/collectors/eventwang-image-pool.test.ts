import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { readEventwangImagePool } from "./eventwang-image-pool";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("eventwang image pool", () => {
  it("uses only the current account section and skips missing or duplicate local files", async () => {
    const workspaceRoot = await makeTempDir();
    const rootDir = path.join(workspaceRoot, "data", "eventwang-gallery");
    const campusPath = await writeManifestImage(workspaceRoot, "校园宣讲会", "campus-1", "campus image");
    await writeManifest(workspaceRoot, "校园宣讲会", [
      makeItem("campus-1", campusPath),
      makeItem("campus-duplicate", campusPath),
      makeItem("campus-missing", "data/eventwang-gallery/keyword-校园宣讲会/run/missing.jpg")
    ]);
    const buildingPath = await writeManifestImage(workspaceRoot, "工地开放日", "building-1", "building image");
    await writeManifest(workspaceRoot, "工地开放日", [makeItem("building-1", buildingPath)]);

    const result = await readEventwangImagePool({
      rootDir,
      workspaceRoot,
      accountId: "A2",
      requestedKeyword: "校园活动",
      limit: 12
    });

    expect(result.source).toBe("image_pool");
    expect(result.quotaFallback).toBe(true);
    expect(result.imageCount).toBe(1);
    expect(result.selectedCount).toBe(1);
    expect(result.items.map((item) => item.galleryId)).toEqual(["campus-1"]);
    expect(result.skipped.map((item) => item.reason)).toContain("本地图片池文件缺失");
    expect(result.skipped.map((item) => item.reason)).toContain("本地图片池重复图");
    expect(result.blockingReason).toContain("活动汪下载权益已用完");
    expect(result.blockingReason).toContain("本地图片池");
  });

  it("prioritizes local fallback manifests that match the requested keyword or search terms", async () => {
    const workspaceRoot = await makeTempDir();
    const rootDir = path.join(workspaceRoot, "data", "eventwang-gallery");
    const genericPath = await writeManifestImage(workspaceRoot, "校园zz宣讲会", "generic-1", "generic image");
    const requestedPath = await writeManifestImage(workspaceRoot, "校园赛事", "requested-1", "requested image");
    await writeManifest(workspaceRoot, "校园zz宣讲会", [makeItem("generic-1", genericPath)]);
    await writeManifest(workspaceRoot, "校园赛事", [makeItem("requested-1", requestedPath)]);

    const result = await readEventwangImagePool({
      rootDir,
      workspaceRoot,
      accountId: "A2",
      requestedKeyword: "校园赛事",
      searchedTerms: ["校园赛事", "校园活动"],
      limit: 1
    });

    expect(result.items.map((item) => item.galleryId)).toEqual(["requested-1"]);
  });

  it("returns a usable empty pool result when the current section has no local images", async () => {
    const workspaceRoot = await makeTempDir();
    const rootDir = path.join(workspaceRoot, "data", "eventwang-gallery");
    await mkdir(rootDir, { recursive: true });

    const result = await readEventwangImagePool({
      rootDir,
      workspaceRoot,
      accountId: "A5",
      requestedKeyword: "企业年会",
      limit: 12
    });

    expect(result.source).toBe("image_pool");
    expect(result.quotaFallback).toBe(true);
    expect(result.imageCount).toBe(0);
    expect(result.partialSuccess).toBe(true);
    expect(result.blockingReason).toContain("有效原图 0/12");
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "eventwang-pool-"));
  tempDirs.push(dir);
  return dir;
}

async function writeManifestImage(workspaceRoot: string, keyword: string, id: string, content: string) {
  const imagePath = path.join(workspaceRoot, "data", "eventwang-gallery", `keyword-${keyword}`, "run", id, "photo.jpg");
  await mkdir(path.dirname(imagePath), { recursive: true });
  await writeFile(imagePath, content);
  return path.relative(workspaceRoot, imagePath);
}

async function writeManifest(workspaceRoot: string, keyword: string, items: ReturnType<typeof makeItem>[]) {
  const manifestDir = path.join(workspaceRoot, "data", "eventwang-gallery", `keyword-${keyword}`, "run");
  await mkdir(manifestDir, { recursive: true });
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

function makeItem(galleryId: string, localPath: string) {
  return {
    galleryId,
    ownerId: "",
    resultIndex: 0,
    tagName: "已布置",
    styleTag: "已布置",
    styleBucket: "installed",
    detailUrl: `https://www.eventwang.cn/Gallery/detail-${galleryId}`,
    sourceUrl: `https://www.eventwang.cn/Gallery/detail-${galleryId}`,
    previewUrl: null,
    localPath,
    downloadFilename: "photo.jpg"
  };
}
