import { describe, expect, it } from "vitest";
import { extractEventwangLocalPath } from "./draft-images";

describe("xhs draft image path extraction", () => {
  it("prefers the persisted local path when present", () => {
    expect(
      extractEventwangLocalPath({
        localPath: "data/eventwang-gallery/a/photo.jpg",
        url: "/api/materials/eventwang-file?path=data%2Feventwang-gallery%2Fwrong.jpg"
      })
    ).toBe("data/eventwang-gallery/a/photo.jpg");
  });

  it("extracts local eventwang paths from material API URLs", () => {
    expect(
      extractEventwangLocalPath({
        url: "/api/materials/eventwang-file?path=data%5Ceventwang-gallery%5Ckeyword-a%5Cphoto.jpg"
      })
    ).toBe("data\\eventwang-gallery\\keyword-a\\photo.jpg");
  });

  it("rejects non-eventwang image URLs for local upload", () => {
    expect(extractEventwangLocalPath({ url: "https://cdn.example/photo.jpg" })).toBe("");
  });
});

