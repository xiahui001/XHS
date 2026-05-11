import { describe, expect, it } from "vitest";
import {
  buildMobilePublishHtml,
  buildMobilePublishPackage,
  buildXhsDiscoverPostUrl,
  selectMobilePublishImages
} from "./mobile-package";

describe("mobile publish package", () => {
  it("selects twelve unique images and removes duplicates before publishing", () => {
    const images = selectMobilePublishImages(
      {
        id: "draft-1",
        title: "Campus art festival",
        body: "Start with venue and visitor flow.",
        generatedImages: [
          { url: "https://example.com/a.jpg", localPath: "data/eventwang-gallery/a/photo.jpg" },
          { url: "https://example.com/a.jpg", localPath: "data/eventwang-gallery/a/photo.jpg" },
          ...makePublishImages(12, 1)
        ]
      }
    );

    expect(images).toHaveLength(12);
    expect(new Set(images.map((image) => image.url)).size).toBe(12);
  });

  it("builds publish packages even when images are incomplete", () => {
    const pkg = buildMobilePublishPackage(
      {
        id: "draft-short",
        title: "Campus art festival",
        body: "Start with venue and visitor flow.",
        generatedImages: makePublishImages(4)
      },
      "pkg-short"
    );

    expect(pkg.imageUrls).toHaveLength(4);
    expect(pkg.shareText).toContain("Campus art festival");
  });

  it("builds a text-only publish package when no images are available", () => {
    const pkg = buildMobilePublishPackage(
      {
        id: "draft-text-only",
        title: "Text only plan",
        body: "Copy this first, images can be added later."
      },
      "pkg-text-only"
    );

    expect(pkg.imageUrls).toEqual([]);
    expect(pkg.shareText).toContain("Text only plan");
  });

  it("builds the xhs deeplink and share text from a draft", () => {
    const pkg = buildMobilePublishPackage(
      {
        id: "draft-2",
        title: "Graduation party setup",
        body: "Put the cover and body images into the phone package.",
        tags: ["graduation", "stage", "graduation"],
        generatedImages: makePublishImages(12)
      },
      "pkg-1"
    );

    expect(buildXhsDiscoverPostUrl()).toBe("xhsdiscover://post");
    expect(pkg.shareText).toContain("Graduation party setup");
    expect(pkg.shareText).toContain("Put the cover and body images into the phone package.");
    expect(pkg.shareText).toContain("#graduation");
    expect(pkg.shareText).toContain("#stage");
    expect(pkg.imageUrls).toHaveLength(12);
  });

  it("renders the phone package as the three-step publishing workbench", () => {
    const pkg = buildMobilePublishPackage(
      {
        id: "draft-3",
        accountName: "Campus events",
        title: "Graduation party plan",
        body: "Save images, copy text, then open Xiaohongshu.",
        tags: ["graduation"],
        generatedImages: makePublishImages(12)
      },
      "pkg-3"
    );

    const html = buildMobilePublishHtml(pkg);

    expect(html).toContain("Step 1");
    expect(html).toContain("Step 2");
    expect(html).toContain("Step 3");
    expect(html).not.toContain("one-click import");
  });
});

function makePublishImages(count: number, start = 0) {
  return Array.from({ length: count }, (_, index) => {
    const id = index + start;
    return {
      url: `https://example.com/${id}.jpg`,
      localPath: `data/eventwang-gallery/${id}/photo.jpg`
    };
  });
}
