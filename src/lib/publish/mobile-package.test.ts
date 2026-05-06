import { describe, expect, it } from "vitest";
import {
  buildMobilePublishPackage,
  buildXhsDiscoverPostUrl,
  selectMobilePublishImages
} from "./mobile-package";

describe("mobile publish package", () => {
  it("keeps available images, removes duplicates, and does not fail when fewer than ten exist", () => {
    const images = selectMobilePublishImages(
      {
        id: "draft-1",
        title: "校园艺术节",
        body: "先看场地，再看动线。",
        generatedImages: [
          { url: "https://example.com/a.jpg", localPath: "data/eventwang-gallery/a/photo.jpg" },
          { url: "https://example.com/a.jpg", localPath: "data/eventwang-gallery/a/photo.jpg" },
          { url: "https://example.com/b.jpg", localPath: "data/eventwang-gallery/b/photo.jpg" }
        ]
      },
      10
    );

    expect(images).toHaveLength(2);
    expect(images.map((image) => image.url)).toEqual([
      "https://example.com/a.jpg",
      "https://example.com/b.jpg"
    ]);
  });

  it("builds the xhs deeplink and share text from a draft", () => {
    const pkg = buildMobilePublishPackage(
      {
        id: "draft-2",
        title: "毕业晚会布置",
        body: "封面和正文都放进手机发送包。",
        tags: ["毕业晚会", "舞台搭建", "毕业晚会"],
        generatedImages: [{ url: "https://example.com/c.jpg", localPath: "data/eventwang-gallery/c/photo.jpg" }]
      },
      "pkg-1"
    );

    expect(buildXhsDiscoverPostUrl()).toBe("xhsdiscover://post");
    expect(pkg.shareText).toContain("毕业晚会布置");
    expect(pkg.shareText).toContain("封面和正文都放进手机发送包。");
    expect(pkg.shareText).toContain("#毕业晚会");
    expect(pkg.shareText).toContain("#舞台搭建");
    expect(pkg.imageUrls).toEqual(["https://example.com/c.jpg"]);
  });
});
