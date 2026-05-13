import { describe, expect, it } from "vitest";

const {
  dedupeGalleryCandidates,
  getGalleryScrollStopReason,
  isNearPageBottom,
  normalizeGalleryDetailHref
} = await import(new URL("../../../scripts/lib/eventwang-gallery-candidates.mjs", import.meta.url).href);

describe("eventwang gallery candidate discovery helpers", () => {
  it("dedupes repeated selector hits before deciding whether enough candidates exist", () => {
    const candidates = dedupeGalleryCandidates([
      { galleryId: "100", href: "/Gallery/detail-100_1", imageUrl: "https://img.example/100.jpg" },
      { galleryId: "100", href: "/DesignResource/detail-100", imageUrl: "https://img.example/100-thumb.jpg" },
      { galleryId: "101", href: "/Gallery/detail-101_1", imageUrl: "https://img.example/101.jpg" },
      { galleryId: "", href: "/Gallery/detail-102_1", imageUrl: "https://img.example/102.jpg" },
      { galleryId: "", href: "/Gallery/detail-102_1", imageUrl: "https://img.example/102-copy.jpg" }
    ]);

    expect(candidates.map((item: { galleryId: string; href: string }) => item.galleryId || item.href)).toEqual([
      "100",
      "101",
      "/Gallery/detail-102_1"
    ]);
  });

  it("keeps scrolling while the page is not at the bottom even if the current card count is unchanged", () => {
    expect(
      getGalleryScrollStopReason({
        attempt: 1,
        maxScrollAttempts: 8,
        freshCount: 0,
        minimumFreshCount: 12,
        uniqueCandidateCount: 30,
        previousUniqueCandidateCount: 30,
        diagnostics: { scrollY: 0, viewportHeight: 720, scrollHeight: 2600 }
      })
    ).toBe("");

    expect(
      getGalleryScrollStopReason({
        attempt: 2,
        maxScrollAttempts: 8,
        freshCount: 0,
        minimumFreshCount: 12,
        uniqueCandidateCount: 30,
        previousUniqueCandidateCount: 30,
        diagnostics: { scrollY: 1900, viewportHeight: 720, scrollHeight: 2600 }
      })
    ).toBe("no-new-cards-at-page-bottom");
  });

  it("normalizes ActivityWang list cards to gallery detail URLs that can be opened directly", () => {
    expect(normalizeGalleryDetailHref("/DesignResource/detail-3061930", "3061930")).toBe("/Gallery/detail-3061930_0");
    expect(normalizeGalleryDetailHref("/Gallery/detail-3061930_114249", "3061930")).toBe(
      "/Gallery/detail-3061930_114249"
    );
    expect(isNearPageBottom({ scrollY: 1900, viewportHeight: 720, scrollHeight: 2600 })).toBe(true);
  });
});
