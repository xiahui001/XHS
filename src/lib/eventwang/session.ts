import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { isHostedRuntime } from "@/lib/runtime/deployment";

export type EventwangLoginStatus = {
  loggedIn: boolean;
  savedLogin: boolean;
  storageStatePath: string;
  lastSavedAt: string | null;
  detail: string;
  verificationMode: "file" | "live" | "cache" | "hosted";
  checkedAt: string | null;
};

const STORAGE_STATE_PATH = path.join(process.cwd(), ".auth", "eventwang.json");
const LIVE_CHECK_TTL_MS = 5 * 60 * 1000;

let liveStatusCache: {
  checkedAtMs: number;
  status: EventwangLoginStatus;
} | null = null;

export async function getEventwangLoginStatus(options?: { fresh?: boolean }): Promise<EventwangLoginStatus> {
  if (isHostedRuntime()) {
    return {
      loggedIn: false,
      savedLogin: false,
      storageStatePath: ".auth/eventwang.json",
      lastSavedAt: null,
      detail: "Vercel 公网版无法判定本机活动汪登录态；请在 localhost 本机版查看真实状态",
      verificationMode: "hosted",
      checkedAt: null
    };
  }

  const fileStatus = await getStoredEventwangLoginStatus();
  if (!fileStatus.savedLogin) return fileStatus;

  const now = Date.now();
  if (!options?.fresh && liveStatusCache && now - liveStatusCache.checkedAtMs < LIVE_CHECK_TTL_MS) {
    return {
      ...liveStatusCache.status,
      verificationMode: "cache",
      detail: `${liveStatusCache.status.detail}（${Math.ceil((LIVE_CHECK_TTL_MS - (now - liveStatusCache.checkedAtMs)) / 1000)} 秒内复用真实探测结果）`
    };
  }

  const liveStatus = await probeEventwangOnlineStatus(fileStatus);
  liveStatusCache = {
    checkedAtMs: now,
    status: liveStatus
  };
  return liveStatus;
}

async function getStoredEventwangLoginStatus(): Promise<EventwangLoginStatus> {
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
      storageStatePath: ".auth/eventwang.json",
      lastSavedAt: fileStat.mtime.toISOString(),
      detail: savedLogin ? "已保存活动汪人工登录态，等待真实在线探测" : "文件存在但未解析到有效 Cookie",
      verificationMode: "file",
      checkedAt: null
    };
  } catch {
    return {
      loggedIn: false,
      savedLogin: false,
      storageStatePath: ".auth/eventwang.json",
      lastSavedAt: null,
      detail: "未检测到活动汪登录态文件",
      verificationMode: "file",
      checkedAt: null
    };
  }
}

async function probeEventwangOnlineStatus(fileStatus: EventwangLoginStatus): Promise<EventwangLoginStatus> {
  let browser;
  const checkedAt = new Date().toISOString();

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    await page.goto("https://www.eventwang.cn/Gallery", {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const result = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const url = location.href;
      const hasGallerySearch = Boolean(document.querySelector("input.search_ipt")) || /图库|图片|下载原图/.test(text);
      const hasLoginBlock = /登录|验证码|手机号|密码/.test(text) && !hasGallerySearch;

      return {
        url,
        hasGallerySearch,
        hasLoginBlock,
        title: document.title
      };
    });

    await browser.close();
    browser = null;

    const loggedIn = result.hasGallerySearch && !result.hasLoginBlock;
    return {
      ...fileStatus,
      loggedIn,
      detail: loggedIn ? "真实在线探测通过，活动汪图库可访问" : "真实在线探测未通过，请重新人工登录活动汪",
      verificationMode: "live",
      checkedAt
    };
  } catch (error) {
    return {
      ...fileStatus,
      loggedIn: false,
      detail: `活动汪真实在线探测失败：${error instanceof Error ? error.message : "无法打开活动汪"}`,
      verificationMode: "live",
      checkedAt
    };
  } finally {
    await browser?.close().catch(() => {});
  }
}
