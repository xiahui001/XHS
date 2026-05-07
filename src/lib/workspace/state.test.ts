import { describe, expect, it } from "vitest";
import {
  buildKeywordOptions,
  buildGlobalChecks,
  createDefaultWorkspaceState,
  createKeywordPreset,
  pickRandomKeyword,
  planKeywordDraftBatches
} from "./state";

describe("workspace state", () => {
  it("creates editable defaults for prompts and binding state", () => {
    const state = createDefaultWorkspaceState("user-1");

    expect(state.userId).toBe("user-1");
    expect(state.binding.state).toBe("unbound");
    expect(state.binding.detail).toContain("手机发布账号");
    expect(state.prompts.textRemix).toContain("文案二创");
    expect(state.prompts.imageRemix).toContain("图片二创");
  });

  it("maps pipeline facts into traffic-light global checks", () => {
    const checks = buildGlobalChecks({
      textScrapeReady: true,
      imageScrapeReady: false,
      textGenerationReady: true,
      imageGenerationReady: false,
      authReady: true,
      bindingReady: false
    });

    expect(checks.map((check) => check.key)).toEqual([
      "auth",
      "binding",
      "text_scrape",
      "image_scrape",
      "text_generation",
      "image_generation"
    ]);
    expect(checks.find((check) => check.key === "binding")?.label).toBe("手机发布账号");
    expect(checks.map((check) => check.light)).toEqual(["green", "red", "green", "red", "green", "red"]);
  });

  it("expands each account keyword preset into two category batches with three drafts each", () => {
    const preset = createKeywordPreset({
      accountId: "A2",
      rawText: "毕业典礼舞台搭建\n校园市集摊位布置",
      categories: ["校园活动", "舞台搭建"]
    });

    const batches = planKeywordDraftBatches([preset], "A2");

    expect(batches).toEqual([
      { accountId: "A2", category: "校园活动", keywords: ["毕业典礼舞台搭建", "校园市集摊位布置"], draftCount: 3 },
      { accountId: "A2", category: "舞台搭建", keywords: ["毕业典礼舞台搭建", "校园市集摊位布置"], draftCount: 3 }
    ]);
  });

  it("builds unique keyword options for the selected account", () => {
    const presets = [
      createKeywordPreset({
        accountId: "A2",
        rawText: "毕业典礼舞台搭建\n校园市集摊位布置",
        categories: ["校园活动", "舞台搭建"]
      }),
      createKeywordPreset({
        accountId: "A2",
        rawText: "校园市集摊位布置\n开学季迎新美陈",
        categories: ["校园活动", "空间布置"]
      }),
      createKeywordPreset({
        accountId: "A4",
        rawText: "商场快闪店",
        categories: ["商业美陈", "空间布置"]
      })
    ];

    expect(buildKeywordOptions(presets, "A2")).toEqual(["毕业典礼舞台搭建", "校园市集摊位布置", "开学季迎新美陈"]);
  });

  it("picks a deterministic default keyword when a random value is provided", () => {
    expect(pickRandomKeyword(["A", "B", "C"], 0.5)).toBe("B");
    expect(pickRandomKeyword([], 0.5)).toBeNull();
  });
});
