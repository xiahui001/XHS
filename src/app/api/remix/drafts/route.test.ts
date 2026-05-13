import { beforeEach, describe, expect, it, vi } from "vitest";

const { callArkJson } = vi.hoisted(() => ({
  callArkJson: vi.fn()
}));

vi.mock("@/lib/ark/client", () => ({
  callArkJson
}));

import { POST } from "./route";

const reference = {
  title: "校园艺术节舞台",
  content: "校园艺术节开场、社团演出、拍照打卡和毕业季互动场景",
  sourceUrl: "https://www.xiaohongshu.com/explore/test",
  imageUrls: []
};

describe("/api/remix/drafts", () => {
  beforeEach(() => {
    callArkJson.mockReset();
  });

  it("rejects draft generation when the required text prompt is missing", async () => {
    const response = await POST(
      jsonRequest({
        keyword: "校园艺术节",
        references: [reference],
        accountId: "A2",
        count: 1
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error.message).toContain("文案 Prompt");
    expect(callArkJson).not.toHaveBeenCalled();
  });

  it("passes the required text prompt into the Ark payload and system hint", async () => {
    callArkJson.mockResolvedValue({
      drafts: [
        {
          accountId: "A2",
          title: "校园艺术节出片攻略",
          body: "把舞台、社团演出和互动打卡串成一条动线，学生愿意拍，学校也方便传播。",
          tags: ["校园活动", "校园艺术节", "舞台搭建", "活动策划", "拍照打卡"],
          coverTitleOptions: ["校园艺术节出片攻略"],
          imagePrompts: ["校园艺术节舞台主视觉"],
          sourceUrls: ["https://www.xiaohongshu.com/explore/test"]
        }
      ]
    });

    const response = await POST(
      jsonRequest({
        keyword: "校园艺术节",
        references: [reference],
        accountId: "A2",
        customPrompt: "必须围绕已选领域号，优先捕捉热点趋势，文案要有原创表达。",
        count: 1
      })
    );
    const payload = await response.json();
    const [messages, schemaHint] = callArkJson.mock.calls[0];
    const modelPayload = JSON.parse(messages[0].content);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(modelPayload.userFineTunePrompt).toContain("已选领域号");
    expect(schemaHint).toContain("强制执行用户 Prompt");
  });

  it("asks Ark for twelve image prompts and keeps all twelve on the draft", async () => {
    callArkJson.mockResolvedValue({
      drafts: [
        {
          accountId: "A2",
          title: "校园艺术节动线方案",
          body: "把舞台主视觉、社团演出、互动打卡和毕业季合影串成一条完整动线，方便学生拍照和学校传播。",
          tags: ["校园活动", "校园艺术节", "舞台搭建", "活动策划", "拍照打卡", "毕业季", "互动装置", "活动执行"],
          coverTitleOptions: ["校园艺术节动线方案"],
          imagePrompts: makeImagePrompts(12),
          sourceUrls: ["https://www.xiaohongshu.com/explore/test"]
        }
      ]
    });

    const response = await POST(
      jsonRequest({
        keyword: "校园艺术节",
        references: [reference],
        accountId: "A2",
        customPrompt: "每次只生成一个草稿，但保留 12 张候选图给用户手机端自行筛选。",
        count: 1
      })
    );
    const payload = await response.json();
    const [, schemaHint] = callArkJson.mock.calls[0];

    expect(response.status).toBe(200);
    expect(schemaHint).toContain("12个中文配图需求");
    expect(payload.data.drafts).toHaveLength(1);
    expect(payload.data.drafts[0].imageStructure).toHaveLength(12);
    expect(payload.data.drafts[0].status).toBe("pending_review");
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/remix/drafts", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    }
  });
}

function makeImagePrompts(count: number) {
  return Array.from({ length: count }, (_, index) => `候选图 ${index + 1}`);
}
