import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateArkImage } = vi.hoisted(() => ({
  generateArkImage: vi.fn()
}));

vi.mock("@/lib/ark/client", () => ({
  generateArkImage
}));

import { POST } from "./route";

const draft = {
  id: "draft-1",
  title: "校园艺术节出片攻略",
  imageStructure: [
    {
      visualBrief: "校园艺术节舞台主视觉，学生互动打卡"
    }
  ]
};

describe("/api/remix/images", () => {
  beforeEach(() => {
    generateArkImage.mockReset();
  });

  it("rejects image generation when the required image prompt is missing", async () => {
    const response = await POST(
      jsonRequest({
        drafts: [draft],
        imagesPerDraft: 1
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.message).toContain("图片 Prompt");
    expect(generateArkImage).not.toHaveBeenCalled();
  });

  it("prepends the required image prompt to every image model request", async () => {
    generateArkImage.mockResolvedValue("https://image.local/test.png");

    const response = await POST(
      jsonRequest({
        drafts: [draft],
        customPrompt: "必须优先匹配已选领域号，画面要贴近真实活动现场和热点场景。",
        imagesPerDraft: 1
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(generateArkImage).toHaveBeenCalledWith(expect.stringContaining("必须优先匹配已选领域号"));
    expect(generateArkImage).toHaveBeenCalledWith(expect.stringContaining("校园艺术节舞台主视觉"));
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/remix/images", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    }
  });
}
