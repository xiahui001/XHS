import { describe, expect, it } from "vitest";
import {
  chooseDiverseGalleryItems,
  countDistinctStyleBuckets,
  type EventwangGallerySearchItem
} from "./eventwang-gallery";

describe("eventwang gallery selector", () => {
  it("prioritizes decor/display items and keeps at least five different style buckets", () => {
    const items: EventwangGallerySearchItem[] = [
      buildItem("1", "美陈"),
      buildItem("2", "花艺美陈"),
      buildItem("3", "展示"),
      buildItem("4", "场景"),
      buildItem("5", "艺术展"),
      buildItem("6", "快闪"),
      buildItem("7", "策划案例图片"),
      buildItem("8", "活动方案")
    ];

    const result = chooseDiverseGalleryItems(items, 6, 5);

    expect(result).toHaveLength(6);
    expect(new Set(result.map((item) => item.styleBucket)).size).toBeGreaterThanOrEqual(5);
    expect(result.map((item) => item.styleTag)).toEqual(
      expect.arrayContaining(["美陈", "花艺美陈", "展示", "场景", "艺术展"])
    );
  });

  it("counts distinct style buckets from picked gallery items", () => {
    const items = chooseDiverseGalleryItems(
      [
        buildItem("1", "已布置"),
        buildItem("2", "美陈"),
        buildItem("3", "美陈"),
        buildItem("4", "展示"),
        buildItem("5", "场景")
      ],
      5,
      3
    );

    expect(countDistinctStyleBuckets(items)).toBe(4);
  });
});

function buildItem(galleryId: string, tagName: string): EventwangGallerySearchItem {
  return {
    galleryId,
    imgDataSourceId: `source-${galleryId}`,
    title: `${tagName} 示例`,
    imageUrl: `https://img.example/${galleryId}.jpg`,
    tagName
  };
}
