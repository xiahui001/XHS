import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const { createEventwangImageDedupeStore, normalizeEventwangImageUrl } = await import(
  new URL("../../../scripts/lib/eventwang-image-dedupe.mjs", import.meta.url).href
);

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("eventwang image dedupe store", () => {
  it("normalizes transient URL params before checking persistent URL duplicates", async () => {
    const tempDir = await makeTempDir();
    const store = createEventwangImageDedupeStore(path.join(tempDir, "eventwang.sqlite"));

    expect(normalizeEventwangImageUrl("http://IMG3.Eventwang.com.cn/a/photo.jpg?utm_source=x&b=2&a=1#top")).toBe(
      "https://img3.eventwang.com.cn/a/photo.jpg?a=1&b=2"
    );

    const imagePath = path.join(tempDir, "photo.jpg");
    await writeFile(imagePath, "first image");
    expect(
      store.hasSeenCandidate({
        galleryId: "1001",
        detailUrl: "https://www.eventwang.cn/Gallery/detail-1001_291988",
        previewUrl: "http://IMG3.Eventwang.com.cn/a/photo.jpg?utm_source=x&b=2&a=1#top"
      })
    ).toEqual({ duplicate: false });
    store.recordDownloadedImage({
      galleryId: "1001",
      detailUrl: "https://www.eventwang.cn/Gallery/detail-1001_291988",
      previewUrl: "http://IMG3.Eventwang.com.cn/a/photo.jpg?utm_source=x&b=2&a=1#top",
      localPath: imagePath,
      keyword: "校园活动"
    });

    expect(
      store.hasSeenCandidate({
        galleryId: "1001",
        detailUrl: "https://www.eventwang.cn/Gallery/detail-1001_291988",
        previewUrl: "https://img3.eventwang.com.cn/a/photo.jpg?b=2&a=1&utm_medium=y"
      })
    ).toEqual({ duplicate: true, reason: "url" });

    expect(
      store.hasSeenCandidate({
        galleryId: "1001",
        detailUrl: "https://www.eventwang.cn/Gallery/detail-1001_291988?from=home",
        previewUrl: ""
      })
    ).toEqual({ duplicate: true, reason: "url" });

    store.close();
  });

  it("detects downloaded duplicates by content hash across store instances", async () => {
    const tempDir = await makeTempDir();
    const dbPath = path.join(tempDir, "eventwang.sqlite");
    const firstPath = path.join(tempDir, "first.jpg");
    const secondPath = path.join(tempDir, "second.jpg");
    await writeFile(firstPath, "same bytes");
    await writeFile(secondPath, "same bytes");

    const firstStore = createEventwangImageDedupeStore(dbPath);
    firstStore.recordDownloadedImage({
      galleryId: "2001",
      detailUrl: "https://www.eventwang.cn/Gallery/detail-2001_291988",
      previewUrl: "https://img3.eventwang.com.cn/a/one.jpg",
      localPath: firstPath,
      keyword: "校园活动"
    });
    firstStore.close();

    const secondStore = createEventwangImageDedupeStore(dbPath);
    expect(
      secondStore.hasDuplicateContent({
        galleryId: "2002",
        detailUrl: "https://www.eventwang.cn/Gallery/detail-2002_291988",
        previewUrl: "https://img3.eventwang.com.cn/a/two.jpg",
        localPath: secondPath,
        keyword: "校园活动"
      })
    ).toEqual({ duplicate: true, reason: "content" });
    secondStore.close();
  });

  it("allows cleanup to call close more than once", async () => {
    const tempDir = await makeTempDir();
    const store = createEventwangImageDedupeStore(path.join(tempDir, "eventwang.sqlite"));

    expect(() => {
      store.close();
      store.close();
    }).not.toThrow();
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "eventwang-dedupe-"));
  tempDirs.push(dir);
  return dir;
}
