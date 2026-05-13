import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assignDraftImagesWithUsageStore } from "./draft-image-assignment-service";

describe("draft image assignment service", () => {
  let tempDir: string;
  let storePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "xhs-image-assignment-"));
    storePath = path.join(tempDir, "usage.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("keeps image usage continuous across assignment tasks", async () => {
    const images = Array.from({ length: 24 }, (_, index) => ({
      url: "",
      alt: `scene ${index}`,
      sourceUrl: `https://eventwang.cn/Gallery/detail-${index}`,
      localPath: `data/eventwang-gallery/${String(index).padStart(2, "0")}.jpg`
    }));

    const first = await assignDraftImagesWithUsageStore(
      { drafts: [{ id: "draft-1" }], images },
      { storePath }
    );
    const second = await assignDraftImagesWithUsageStore(
      { drafts: [{ id: "draft-2" }], images },
      { storePath }
    );

    const firstKeys = new Set(first.assignments[0].images.map((image) => image.usageKey));
    const secondKeys = second.assignments[0].images.map((image) => image.usageKey);
    expect(first.assignments[0].images).toHaveLength(12);
    expect(second.assignments[0].images).toHaveLength(12);
    expect(secondKeys.every((key) => !firstKeys.has(key))).toBe(true);
    expect(new Set([...firstKeys, ...secondKeys]).size).toBe(24);
  });

  it("records partial assignments and reports the image shortage", async () => {
    const images = Array.from({ length: 12 }, (_, index) => ({
      url: "",
      alt: `scene ${index}`,
      sourceUrl: `https://eventwang.cn/Gallery/detail-${index}`,
      localPath: `data/eventwang-gallery/${String(index).padStart(2, "0")}.jpg`
    }));

    const result = await assignDraftImagesWithUsageStore(
      { drafts: [{ id: "draft-1" }, { id: "draft-2" }], images, allowPartial: true },
      { storePath }
    );

    expect(result.assignedImageCount).toBe(12);
    expect(result.missingImageCount).toBe(12);
    expect(result.assignments.map((assignment) => assignment.images.length)).toEqual([12, 0]);
  });
});
