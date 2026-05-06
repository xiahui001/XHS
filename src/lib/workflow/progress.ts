export type WorkflowProgressStep = {
  status: "waiting" | "running" | "done" | "failed";
};

export type WorkflowProgress = {
  completed: number;
  total: number;
  percent: number;
  label: string;
  detail: string;
  stalled: boolean;
};

export function calculateWorkflowProgress(
  steps: WorkflowProgressStep[],
  currentLabel: string,
  currentDetail: string
): WorkflowProgress {
  const total = steps.length;
  const completed = steps.filter((step) => step.status === "done").length;
  const hasFailed = steps.some((step) => step.status === "failed");
  const running = steps.some((step) => step.status === "running");
  const percent = total ? Math.round((completed / total) * 100) : 0;

  return {
    completed,
    total,
    percent,
    label: hasFailed ? "流程已中断" : completed === total && total > 0 ? "流程已完成" : currentLabel,
    detail: hasFailed ? "请查看失败步骤并重新执行" : currentDetail,
    stalled: running && completed < total
  };
}
