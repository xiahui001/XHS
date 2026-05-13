export type WorkflowErrorLike = {
  code?: string;
  message?: string;
} | null | undefined;

const HUMAN_ACTION_PATTERNS = /风控|验证|captcha|Prompt|登录|真实在线检测未通过|NOT_USABLE|USER_ID_REQUIRED|FORBIDDEN|UNAUTHORIZED|DAILY_QUOTA_EXHAUSTED|权益已用完|明天更新/i;
const TRANSIENT_PATTERNS = /REQUEST_FAILED|HTTP_5\d\d|HTTP 5\d\d|HTTP_429|429|超时|timeout|fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|temporarily/i;

export function shouldRetryWorkflowError(error: WorkflowErrorLike) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (!text.trim()) return false;
  if (HUMAN_ACTION_PATTERNS.test(text)) return false;
  return TRANSIENT_PATTERNS.test(text);
}

export function workflowRetryDelayMs(attempt: number) {
  const boundedAttempt = Math.max(1, Math.min(attempt, 4));
  return Math.min(30_000, 8_000 * boundedAttempt);
}

export function buildWorkflowRetryStatus(label: string, attempt: number, maxAttempts: number) {
  const delaySeconds = Math.round(workflowRetryDelayMs(attempt - 1) / 1000);
  return `${label}失败，${delaySeconds} 秒后自动重试 ${attempt}/${maxAttempts}`;
}
