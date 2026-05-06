import { describe, expect, it } from "vitest";
import { assignEventwangImagesToDrafts } from "./draft-images";

describe("draft image placement", () => {
  it("assigns downloaded eventwang originals to each draft instead of generating new images", () => {
    const result = assignEventwangImagesToDrafts(
      [{ id: "draft-1" }, { id: "draft-2" }],
      [
        {
          url: "",
          alt: "已布置",
          sourceUrl: "https://eventwang.cn/Gallery/detail-1",
          localPath: "data/eventwang-gallery/a.jpg",
          styleTag: "已布置",
          styleBucket: "installed"
        },
        {
          url: "",
          alt: "美陈",
          sourceUrl: "https://eventwang.cn/Gallery/detail-2",
          localPath: "data/eventwang-gallery/b.jpg",
          styleTag: "美陈",
          styleBucket: "decor"
        },
        {
          url: "https://cdn.example/c.jpg",
          alt: "展示",
          sourceUrl: "https://eventwang.cn/Gallery/detail-3",
          styleTag: "展示",
          styleBucket: "display"
        }
      ],
      3
    );

    expect(result).toEqual([
      {
        draftId: "draft-1",
        images: [
          {
            prompt: "已布置 · https://eventwang.cn/Gallery/detail-1",
            localPath: "data/eventwang-gallery/a.jpg",
            url: "/api/materials/eventwang-file?path=data%2Feventwang-gallery%2Fa.jpg"
          },
          {
            prompt: "美陈 · https://eventwang.cn/Gallery/detail-2",
            localPath: "data/eventwang-gallery/b.jpg",
            url: "/api/materials/eventwang-file?path=data%2Feventwang-gallery%2Fb.jpg"
          },
          {
            prompt: "展示 · https://eventwang.cn/Gallery/detail-3",
            url: "https://cdn.example/c.jpg"
          }
        ]
      },
      {
        draftId: "draft-2",
        images: [
          {
            prompt: "美陈 · https://eventwang.cn/Gallery/detail-2",
            localPath: "data/eventwang-gallery/b.jpg",
            url: "/api/materials/eventwang-file?path=data%2Feventwang-gallery%2Fb.jpg"
          },
          {
            prompt: "展示 · https://eventwang.cn/Gallery/detail-3",
            url: "https://cdn.example/c.jpg"
          },
          {
            prompt: "已布置 · https://eventwang.cn/Gallery/detail-1",
            localPath: "data/eventwang-gallery/a.jpg",
            url: "/api/materials/eventwang-file?path=data%2Feventwang-gallery%2Fa.jpg"
          }
        ]
      }
    ]);
  });

  it("keeps images unique within one draft when asking for cover plus nine images", () => {
    const images = Array.from({ length: 12 }, (_, index) => ({
      url: `https://cdn.example/${index}.jpg`,
      alt: `场景${index}`,
      sourceUrl: `https://eventwang.cn/Gallery/detail-${index}`,
      styleTag: "展示",
      styleBucket: `bucket-${index}`
    }));

    const result = assignEventwangImagesToDrafts([{ id: "draft-1" }], images, 10);

    expect(result[0].images).toHaveLength(10);
    expect(new Set(result[0].images.map((image) => image.url)).size).toBe(10);
  });

  it("uses each available image at most once within a draft when fewer than ten images exist", () => {
    const images = Array.from({ length: 6 }, (_, index) => ({
      url: `https://cdn.example/${index}.jpg`,
      alt: `场景${index}`,
      sourceUrl: `https://eventwang.cn/Gallery/detail-${index}`
    }));

    const result = assignEventwangImagesToDrafts([{ id: "draft-1" }], images, 10);

    expect(result[0].images).toHaveLength(6);
    expect(new Set(result[0].images.map((image) => image.url)).size).toBe(6);
  });
});
