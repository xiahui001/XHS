import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNTS, createGenerationPlan } from "./planner";

describe("generation planner", () => {
  it("creates 30 candidates across 5 industry accounts by default", () => {
    const plan = createGenerationPlan({
      keyword: "活动舞台搭建",
      accounts: DEFAULT_ACCOUNTS
    });

    expect(plan.totalTargetCount).toBe(30);
    expect(plan.accounts).toHaveLength(5);
    expect(plan.accounts.map((account) => account.candidateTarget)).toEqual([6, 6, 6, 6, 6]);
    expect(plan.accounts.map((account) => account.positioning)).toEqual([
      "美业大健康微商活动",
      "校园活动",
      "建筑行业活动",
      "商超美陈",
      "企业年会团建"
    ]);
  });
});
