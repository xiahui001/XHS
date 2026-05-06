import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

export type XhsLoginStatus = {
  loggedIn: boolean;
  storageStatePath: string;
  lastSavedAt: string | null;
  detail: string;
  verificationMode?: "file" | "live" | "cache";
  checkedAt?: string | null;
};

const STORAGE_STATE_PATH = path.join(process.cwd(), ".auth", "xhs.json");
const LIVE_CHECK_TTL_MS = 5 * 60 * 1000;
const LIVE_CHECK_TIMEOUT_MS = 45000;

let liveStatusCache: {
  checkedAtMs: number;
  status: XhsLoginStatus;
} | null = null;

export async function getXhsLoginStatus(): Promise<XhsLoginStatus> {
  const fileStatus = await getStoredXhsLoginStatus();
  if (!fileStatus.loggedIn) return fileStatus;

  const now = Date.now();
  if (liveStatusCache && now - liveStatusCache.checkedAtMs < LIVE_CHECK_TTL_MS) {
    return {
      ...liveStatusCache.status,
      verificationMode: "cache",
      detail: `${liveStatusCache.status.detail}（${Math.ceil((LIVE_CHECK_TTL_MS - (now - liveStatusCache.checkedAtMs)) / 1000)} 秒内复用真实探测结果）`
    };
  }

  const liveStatus = await probeXhsOnlineStatus(fileStatus);
  liveStatusCache = {
    checkedAtMs: now,
    status: liveStatus
  };
  return liveStatus;
}

async function getStoredXhsLoginStatus(): Promise<XhsLoginStatus> {
  try {
    await access(STORAGE_STATE_PATH);
    const content = await readFile(STORAGE_STATE_PATH, "utf8");
    const payload = JSON.parse(content) as {
      cookies?: Array<{ name?: string; value?: string }>;
    };
    const cookies = Array.isArray(payload.cookies) ? payload.cookies : [];
    const loggedIn = cookies.some((cookie) => Boolean(cookie.name && cookie.value && cookie.value.length > 8));
    const fileStat = await stat(STORAGE_STATE_PATH);

    return {
      loggedIn,
      storageStatePath: ".auth/xhs.json",
      lastSavedAt: fileStat.mtime.toISOString(),
      detail: loggedIn ? "已保存人工登录态，等待真实在线探测" : "文件存在但未解析到有效 Cookie",
      verificationMode: "file",
      checkedAt: null
    };
  } catch {
    return {
      loggedIn: false,
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
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    await page.goto("https://www.xiaohongshu.com/explore", {
      waitUntil: "domcontentloaded",
      timeout: LIVE_CHECK_TIMEOUT_MS
    });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const result = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const url = location.href;
      const hasLoginDialog = /登录后|验证码登录|手机号登录|密码登录|扫码登录/.test(text);
      const hasLoggedInSurface = /发布|消息|通知|创作中心|我/.test(text);
      const hasLoginUrl = /login|signin/.test(url);

      return {
        url,
        hasLoginDialog,
        hasLoginUrl,
        hasLoggedInSurface,
        title: document.title
      };
    });

    await browser.close();
    browser = null;

    const loggedIn = !result.hasLoginUrl && !result.hasLoginDialog;
    return {
      ...fileStatus,
      loggedIn,
      detail: loggedIn
        ? result.hasLoggedInSurface
          ? "真实在线探测通过，已识别登录后页面元素"
          : "真实在线探测通过，未出现登录拦截"
        : "真实在线探测未通过，请重新人工登录小红书",
      verificationMode: "live",
      checkedAt
    };
  } catch (error) {
    return {
      ...fileStatus,
      loggedIn: false,
      detail: `真实在线探测失败：${error instanceof Error ? error.message : "无法打开小红书"}`,
      verificationMode: "live",
      checkedAt
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
