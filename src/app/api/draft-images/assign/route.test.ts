import { beforeEach, describe, expect, it, vi } from "vitest";

const { assignDraftImagesWithUsageStore } = vi.hoisted(() => ({
  assignDraftImagesWithUsageStore: vi.fn()
}));

vi.mock("@/lib/generation/draft-image-assignment-service", () => ({
  assignDraftImagesWithUsageStore
}));

import { POST } from "./route";

describe("/api/draft-images/assign", () => {
  beforeEach(() => {
    assignDraftImagesWithUsageStore.mockReset();
  });

  it("accepts twelve ActivityWang images per draft", async () => {
    assignDraftImagesWithUsageStore.mockResolvedValue({
      assignments: [{ draftId: "draft-1", images: [], missingImageCount: 0 }],
      assignedImageCount: 12,
      missingImageCount: 0,
      completeDraftCount: 1
    });

    const response = await POST(
      jsonRequest({
        drafts: [{ id: "draft-1" }],
        images: makeImages(12),
        imagesPerDraft: 12
      })
    );

    expect(response.status).toBe(200);
    expect(assignDraftImagesWithUsageStore).toHaveBeenCalledWith(
      expect.objectContaining({
        imagesPerDraft: 12
      })
    );
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/draft-images/assign", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    }
  });
}

function makeImages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    url: "",
    alt: `candidate ${index + 1}`,
    sourceUrl: `https://eventwang.cn/Gallery/detail-${index}`,
    localPath: `data/eventwang-gallery/${index}/photo.jpg`
  }));
}
