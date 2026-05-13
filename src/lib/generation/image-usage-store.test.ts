import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readUsedImageKeys, recordAssignedDraftImages } from "./image-usage-store";

describe("image usage store", () => {
  let tempDir: string;
  let storePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "xhs-image-usage-"));
    storePath = path.join(tempDir, "usage.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("persists used image keys so later tasks can avoid duplicates", async () => {
    await recordAssignedDraftImages(
      [
        {
          draftId: "draft-1",
          missingImageCount: 0,
          images: [
            {
              prompt: "cover",
              role: "cover",
              usageKey: "local:data/eventwang-gallery/a.jpg",
              url: "/api/materials/eventwang-file?path=data%2Feventwang-gallery%2Fa.jpg",
              localPath: "data/eventwang-gallery/a.jpg"
            },
            {
              prompt: "body",
              role: "body",
              usageKey: "local:data/eventwang-gallery/b.jpg",
              url: "/api/materials/eventwang-file?path=data%2Feventwang-gallery%2Fb.jpg",
              localPath: "data/eventwang-gallery/b.jpg"
            }
          ]
        }
      ],
      { storePath }
    );

    const usedKeys = await readUsedImageKeys({ storePath });
    expect([...usedKeys].sort()).toEqual([
      "local:data/eventwang-gallery/a.jpg",
      "local:data/eventwang-gallery/b.jpg"
    ]);
  });

  it("keeps existing usage records when a later task records more images", async () => {
    await recordAssignedDraftImages(
      [
        {
          draftId: "draft-1",
          missingImageCount: 0,
          images: [{ prompt: "cover", role: "cover", usageKey: "url:https://cdn.example/a.jpg", url: "https://cdn.example/a.jpg" }]
        }
      ],
      { storePath }
    );
    await recordAssignedDraftImages(
      [
        {
          draftId: "draft-2",
          missingImageCount: 0,
          images: [{ prompt: "cover", role: "cover", usageKey: "url:https://cdn.example/b.jpg", url: "https://cdn.example/b.jpg" }]
        }
      ],
      { storePath }
    );

    const usedKeys = await readUsedImageKeys({ storePath });
    expect([...usedKeys].sort()).toEqual(["url:https://cdn.example/a.jpg", "url:https://cdn.example/b.jpg"]);
  });
});
