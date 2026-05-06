import { describe, expect, it } from "vitest";
import { calculateWorkflowProgress } from "./progress";

describe("workflow progress", () => {
  it("calculates progress only from completed real workflow steps", () => {
    const progress = calculateWorkflowProgress(
      [
        { status: "done" },
        { status: "done" },
        { status: "running" },
        { status: "waiting" },
        { status: "waiting" },
        { status: "waiting" }
      ],
      "文案二创",
      "等待模型返回"
    );

    expect(progress).toEqual({
      completed: 2,
      total: 6,
      percent: 33,
      label: "文案二创",
      detail: "等待模型返回",
      stalled: true
    });
  });

  it("reports a failed workflow without pretending to advance progress", () => {
    const progress = calculateWorkflowProgress(
      [{ status: "done" }, { status: "failed" }, { status: "waiting" }],
      "素材采集",
      "活动汪阻断"
    );

    expect(progress.percent).toBe(33);
    expect(progress.label).toBe("流程已中断");
    expect(progress.detail).toBe("请查看失败步骤并重新执行");
  });
});
