import { describe, expect, it } from "vitest";
import {
  buildMobilePublishHtml,
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

  it("renders the phone package as the three-step publishing workbench", () => {
    const pkg = buildMobilePublishPackage(
      {
        id: "draft-3",
        accountName: "校园活动号",
        title: "毕业晚会策划",
        body: "先保存图片，再复制文案，最后打开小红书发布。",
        tags: ["毕业晚会"],
        generatedImages: [{ url: "https://example.com/d.jpg", localPath: "data/eventwang-gallery/d/photo.jpg" }]
      },
      "pkg-3"
    );

    const html = buildMobilePublishHtml(pkg);

    expect(html).toContain("Step 1");
    expect(html).toContain("保存图片至手机");
    expect(html).toContain("Step 2");
    expect(html).toContain("复制文案");
    expect(html).toContain("Step 3");
    expect(html).toContain("打开小红书发布");
    expect(html).not.toContain("一键导入小红书");
    expect(html).not.toContain("系统分享已打开，请选择小红书并在发布页确认内容");
  });
});
