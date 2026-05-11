import { describe, expect, it } from "vitest";
import { assignEventwangImagesToDrafts } from "./draft-images";

describe("draft image placement", () => {
  it("defaults to twelve candidate images for one workflow draft", () => {
    const result = assignEventwangImagesToDrafts([{ id: "draft-1" }], makeImages(12));

    expect(result).toHaveLength(1);
    expect(result[0].images).toHaveLength(12);
    expect(result[0].missingImageCount).toBe(0);
  });

  it("assigns twelve candidate images to each draft without reusing images across drafts", () => {
    const result = assignEventwangImagesToDrafts(
      [{ id: "draft-1" }, { id: "draft-2" }],
      makeImages(24),
      { imagesPerDraft: 12 }
    );

    expect(result).toHaveLength(2);
    for (const assignment of result) {
      expect(assignment.images).toHaveLength(12);
      expect(assignment.images[0].role).toBe("cover");
      expect(assignment.images.slice(1).every((image) => image.role === "body")).toBe(true);
      expect(assignment.missingImageCount).toBe(0);
    }

    const assignedKeys = result.flatMap((assignment) => assignment.images.map((image) => image.usageKey));
    expect(new Set(assignedKeys).size).toBe(24);
  });

  it("skips images that were already used by earlier tasks", () => {
    const result = assignEventwangImagesToDrafts([{ id: "draft-1" }], makeImages(14), {
      imagesPerDraft: 12,
      usedImageKeys: new Set(["local:data/eventwang-gallery/00.jpg", "local:data/eventwang-gallery/01.jpg"])
    });

    expect(result[0].images).toHaveLength(12);
    expect(result[0].images.map((image) => image.usageKey)).not.toContain("local:data/eventwang-gallery/00.jpg");
    expect(result[0].images.map((image) => image.usageKey)).not.toContain("local:data/eventwang-gallery/01.jpg");
  });

  it("fails before assigning when there are not enough unused unique images by default", () => {
    expect(() =>
      assignEventwangImagesToDrafts([{ id: "draft-1" }, { id: "draft-2" }], makeImages(23), {
        imagesPerDraft: 12
      })
    ).toThrow(/24/);
  });

  it("assigns available unique images when partial assignment is allowed", () => {
    const result = assignEventwangImagesToDrafts([{ id: "draft-1" }, { id: "draft-2" }], makeImages(13), {
      imagesPerDraft: 12,
      allowPartial: true
    });

    expect(result.map((assignment) => assignment.images.length)).toEqual([12, 1]);
    expect(result.map((assignment) => assignment.missingImageCount)).toEqual([0, 11]);
    expect(new Set(result.flatMap((assignment) => assignment.images.map((image) => image.usageKey))).size).toBe(13);
  });
});

function makeImages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    url: "",
    alt: `scene ${index}`,
    sourceUrl: `https://eventwang.cn/Gallery/detail-${index}`,
    localPath: `data/eventwang-gallery/${String(index).padStart(2, "0")}.jpg`,
    styleTag: "display",
    styleBucket: `bucket-${index}`
  }));
}
