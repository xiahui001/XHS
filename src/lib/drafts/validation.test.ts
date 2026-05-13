import { describe, expect, it } from "vitest";
import { validateDraftForSelection } from "./validation";

const validDraft = {
  title: "年会舞台别只问总价",
  body: "年会舞台费用通常和尺寸、灯光、LED、音响、搭建时间有关。先确认人数、场地和流程，再做预算会更稳。",
  tags: ["年会策划", "舞台搭建", "企业年会", "活动执行", "会议布置", "灯光音响", "LED大屏", "团建活动"],
  imageCount: 12,
  licenseComplete: true
};

describe("draft selection validation", () => {
  it("allows a draft that satisfies the publishing checklist", () => {
    const result = validateDraftForSelection(validDraft);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("blocks drafts with missing checklist items", () => {
    const result = validateDraftForSelection({
      ...validDraft,
      title: "这是一个超过二十个字的小红书草稿标题不能选中",
      tags: ["年会策划"],
      imageCount: 5,
      licenseComplete: false
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "标题需控制在 20 字内",
      "标签需保持 8-12 个",
      "图片需保持12张候选图",
      "素材授权信息不完整"
    ]);
  });
});
