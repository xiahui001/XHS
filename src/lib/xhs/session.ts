import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { isHostedRuntime } from "@/lib/runtime/deployment";
import { getXhsProbeCacheDecision } from "@/lib/xhs/probe-policy";

export type XhsLoginStatus = {
  loggedIn: boolean;
  savedLogin: boolean;
  riskBlocked: boolean;
  storageStatePath: string;
  lastSavedAt: string | null;
  detail: string;
  verificationMode?: "file" | "live" | "cache" | "hosted";
  checkedAt?: string | null;
};

const STORAGE_STATE_PATH = path.join(process.cwd(), ".auth", "xhs.json");
const LIVE_CHECK_TTL_MS = readDurationMs("XHS_LIVE_CHECK_TTL_MINUTES", 30, 60 * 1000);
const FRESH_CHECK_COOLDOWN_MS = readDurationMs("XHS_FRESH_CHECK_COOLDOWN_MINUTES", 30, 60 * 1000);
const RISK_BLOCK_COOLDOWN_MS = readDurationMs("XHS_RISK_BLOCK_COOLDOWN_HOURS", 2, 60 * 60 * 1000);
const LIVE_CHECK_TIMEOUT_MS = 45_000;
const LIVE_CHECK_HEADLESS = process.env.XHS_LIVE_CHECK_HEADLESS === "true";

let liveStatusCache: {
  checkedAtMs: number;
  status: XhsLoginStatus;
} | null = null;

export async function getXhsLoginStatus(options?: { fresh?: boolean }): Promise<XhsLoginStatus> {
  if (isHostedRuntime()) {
    return {
      loggedIn: false,
      savedLogin: false,
      riskBlocked: false,
      storageStatePath: ".auth/xhs.json",
      lastSavedAt: null,
      detail: "Vercel 公网版无法判定本机小红书登录态；请在 localhost 本机版查看真实状态",
      verificationMode: "hosted",
      checkedAt: null
    };
  }

  const fileStatus = await getStoredXhsLoginStatus();
  if (!fileStatus.savedLogin) return fileStatus;

  const now = Date.now();
  const cacheDecision = getXhsProbeCacheDecision({
    cachedStatus: liveStatusCache?.status ?? null,
    checkedAtMs: liveStatusCache?.checkedAtMs ?? null,
    currentLastSavedAt: fileStatus.lastSavedAt,
    nowMs: now,
    fresh: Boolean(options?.fresh),
    ttlMs: LIVE_CHECK_TTL_MS,
    freshCooldownMs: FRESH_CHECK_COOLDOWN_MS,
    riskCooldownMs: RISK_BLOCK_COOLDOWN_MS
  });

  if (cacheDecision.shouldReuse && liveStatusCache) {
    return {
      ...liveStatusCache.status,
      verificationMode: "cache",
      detail: `${liveStatusCache.status.detail}（为降低探测频率，${formatRemaining(cacheDecision.remainingMs)}内复用真实探测结果）`
    };
  }

  const liveStatus = await probeXhsOnlineStatus(fileStatus);
  liveStatusCache = {
    checkedAtMs: now,
    status: liveStatus
  };
  return liveStatus;
}

function readDurationMs(envName: string, fallback: number, unitMs: number) {
  const raw = process.env[envName];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed * unitMs : fallback * unitMs;
}

function formatRemaining(ms: number) {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes >= 60) return `${Math.ceil(minutes / 60)}小时`;
  return `${minutes}分钟`;
}

async function getStoredXhsLoginStatus(): Promise<XhsLoginStatus> {
  try {
    await access(STORAGE_STATE_PATH);
    const content = await readFile(STORAGE_STATE_PATH, "utf8");
    const payload = JSON.parse(content) as {
      cookies?: Array<{ name?: string; value?: string }>;
    };
    const cookies = Array.isArray(payload.cookies) ? payload.cookies : [];
    const savedLogin = cookies.some((cookie) => Boolean(cookie.name && cookie.value && cookie.value.length > 8));
    const fileStat = await stat(STORAGE_STATE_PATH);

    return {
      loggedIn: false,
      savedLogin,
      riskBlocked: false,
      storageStatePath: ".auth/xhs.json",
      lastSavedAt: fileStat.mtime.toISOString(),
      detail: savedLogin ? "已保存人工登录态，等待真实在线探测" : "文件存在但未解析到有效 Cookie",
      verificationMode: "file",
      checkedAt: null
    };
  } catch {
    return {
      loggedIn: false,
      savedLogin: false,
      riskBlocked: false,
      storageStatePath: ".auth/xhs.json",
      lastSavedAt: null,
      detail: "未检测到登录态文件",
      verificationMode: "file",
      checkedAt: null
    };
  }
}

async function probeXhsOnlineStatus(fileStatus: XhsLoginStatus): Promise<XhsLoginStatus> {
  let browser;
  const checkedAt = new Date().toISOString();

  try {
    browser = await chromium.launch({
      headless: LIVE_CHECK_HEADLESS,
      args: LIVE_CHECK_HEADLESS ? [] : ["--start-minimized"]
    });
    const context = await browser.newContext({
      storageState: STORAGE_STATE_PATH,
      locale: "zh-CN",
      viewport: { width: 1360, height: 940 }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12_000);
    await page.goto("https://www.xiaohongshu.com/", {
      waitUntil: "domcontentloaded",
      timeout: LIVE_CHECK_TIMEOUT_MS
    });
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(4200);

    const result = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const url = location.href;
      const hasLoginDialog = /登录后|验证码登录|手机号登录|密码登录|扫码登录/.test(text);
      const hasLoggedInSurface = /发布|消息|通知|创作中心|我/.test(text);
      const hasLoginUrl = /login|signin/.test(url);
      const riskBlocked = /error_code=300012/.test(url) || /安全限制|IP存在风险|可靠网络环境/.test(text);

      return {
        url,
        hasLoginDialog,
        hasLoginUrl,
        hasLoggedInSurface,
        riskBlocked
      };
    });

    await browser.close();
    browser = null;

    const loggedIn = !result.hasLoginUrl && !result.hasLoginDialog && !result.riskBlocked;
    return {
      ...fileStatus,
      loggedIn,
      riskBlocked: result.riskBlocked,
      detail: loggedIn
        ? result.hasLoggedInSurface
          ? "真实在线探测通过，已识别登录后页面元素"
          : "真实在线探测通过，未出现登录拦截"
        : result.riskBlocked
          ? "已检测到本地登录态，但小红书当前将该 IP / 网络判为风险，真实在线探测未通过"
          : "真实在线探测未通过，请重新人工登录小红书",
      verificationMode: "live",
      checkedAt
    };
  } catch (error) {
    return {
      ...fileStatus,
      loggedIn: false,
      riskBlocked: false,
      detail: `真实在线探测失败：${error instanceof Error ? error.message : "无法打开小红书"}`,
      verificationMode: "live",
      checkedAt
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
