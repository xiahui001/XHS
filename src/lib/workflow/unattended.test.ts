import { describe, expect, it } from "vitest";
import {
  buildWorkflowRetryStatus,
  shouldRetryWorkflowError,
  workflowRetryDelayMs
} from "./unattended";

describe("unattended workflow stability helpers", () => {
  it("retries transient network and timeout failures", () => {
    expect(shouldRetryWorkflowError({ code: "REQUEST_FAILED", message: "fetch failed" })).toBe(true);
    expect(shouldRetryWorkflowError({ code: "HTTP_502", message: "Bad Gateway" })).toBe(true);
    expect(shouldRetryWorkflowError({ code: "XHS_SCRAPE_FAILED", message: "小红书素材采集超时，请重试当前步骤" })).toBe(true);
  });

  it("does not retry blockers that need human action or prompt fixes", () => {
    expect(shouldRetryWorkflowError({ code: "XHS_SCRAPE_FAILED", message: "小红书触发验证或风控" })).toBe(false);
    expect(shouldRetryWorkflowError({ code: "REMIX_DRAFT_FAILED", message: "文案 Prompt 是大模型生成的必填项" })).toBe(false);
    expect(shouldRetryWorkflowError({ code: "EVENTWANG_GALLERY_NOT_USABLE", message: "真实在线检测未通过" })).toBe(false);
    expect(shouldRetryWorkflowError({ code: "EVENTWANG_GALLERY_DAILY_QUOTA_EXHAUSTED", message: "今日图库会员权益已用完，请等待明天更新" })).toBe(false);
  });

  it("uses bounded retry delays and readable status labels", () => {
    expect(workflowRetryDelayMs(1)).toBe(8_000);
    expect(workflowRetryDelayMs(3)).toBeLessThanOrEqual(30_000);
    expect(buildWorkflowRetryStatus("小红书热门文案采集", 2, 3)).toBe("小红书热门文案采集失败，8 秒后自动重试 2/3");
  });
});
