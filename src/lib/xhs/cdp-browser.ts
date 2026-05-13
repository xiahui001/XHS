import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const DEFAULT_CDP_PORT = 9222;
const DEFAULT_XHS_URL = "https://www.xiaohongshu.com/";

export type XhsCdpStatus = {
  available: boolean;
  loggedIn: boolean;
  loginState: "unknown" | "logged_in" | "logged_out";
  loginDetail: string;
  cdpUrl: string;
  browser: string | null;
  userAgent: string | null;
  pageCount: number;
  xhsPageCount: number;
  pages: Array<{
    id: string;
    title: string;
    url: string;
  }>;
  message: string;
};

type StatusOptions = {
  fetchImpl?: typeof fetch;
  cdpUrl?: string;
  liveProbe?: (cdpUrl: string) => Promise<XhsCdpLoginProbe>;
  timeoutMs?: number;
};

type XhsCdpLoginProbe = {
  loggedIn: boolean;
  reason: string;
};

type StartOptions = {
  cwd?: string;
  platform?: NodeJS.Platform;
  port?: number;
  profileDir?: string;
  browserCommand?: string;
  fileExists?: (filePath: string) => boolean;
  launch?: (command: string, args: string[]) => void;
};

export async function getXhsCdpStatus(options: StatusOptions = {}): Promise<XhsCdpStatus> {
  const cdpUrl = normalizeCdpUrl(options.cdpUrl ?? process.env.XHS_CDP_URL ?? `http://127.0.0.1:${DEFAULT_CDP_PORT}`);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 1500);

  try {
    const [versionResponse, pagesResponse] = await Promise.all([
      fetchImpl(`${cdpUrl}/json/version`, { signal: controller.signal }),
      fetchImpl(`${cdpUrl}/json/list`, { signal: controller.signal })
    ]);
    if (!versionResponse.ok || !pagesResponse.ok) throw new Error("CDP status endpoint returned an error");

    const version = (await versionResponse.json()) as Record<string, unknown>;
    const rawPages = (await pagesResponse.json()) as unknown[];
    const pages = rawPages
      .filter((page): page is Record<string, unknown> => Boolean(page && typeof page === "object"))
      .filter((page) => page.type === "page")
      .map((page) => ({
        id: String(page.id ?? ""),
        title: String(page.title ?? ""),
        url: String(page.url ?? "")
      }));
    const xhsPageCount = pages.filter((page) => /xiaohongshu\.com/i.test(page.url)).length;
    const loginProbe = xhsPageCount
      ? await (options.liveProbe ?? probeXhsCdpLoginState)(cdpUrl).catch((error) => ({
          loggedIn: false,
          reason: `真实登录探针失败：${error instanceof Error ? error.message : "无法读取 cookie"}`
        }))
      : {
          loggedIn: false,
          reason: "未打开小红书页面"
        };

    return {
      available: true,
      loggedIn: loginProbe.loggedIn,
      loginState: loginProbe.loggedIn ? "logged_in" : "logged_out",
      loginDetail: loginProbe.reason,
      cdpUrl,
      browser: stringOrNull(version.Browser),
      userAgent: stringOrNull(version["User-Agent"]),
      pageCount: pages.length,
      xhsPageCount,
      pages: pages.slice(0, 8),
      message: xhsPageCount
        ? loginProbe.loggedIn
          ? `真实浏览器 CDP 已连接，检测到 ${xhsPageCount} 个小红书页面，账号已登录`
          : `真实浏览器 CDP 已连接，检测到 ${xhsPageCount} 个小红书页面，但未检测到登录态`
        : "真实浏览器 CDP 已连接，尚未打开小红书页面"
    };
  } catch (error) {
    return {
      available: false,
      loggedIn: false,
      loginState: "unknown",
      loginDetail: "CDP 未连接",
      cdpUrl,
      browser: null,
      userAgent: null,
      pageCount: 0,
      xhsPageCount: 0,
      pages: [],
      message: `真实浏览器 CDP 未连接：${error instanceof Error ? error.message : "无法访问 9222 端口"}`
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeXhsCdpLoginState(cdpUrl: string): Promise<XhsCdpLoginProbe> {
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const context = browser.contexts()[0];
    if (!context) return { loggedIn: false, reason: "CDP 浏览器没有可用上下文" };

    const cookies = await context.cookies("https://www.xiaohongshu.com");
    const nowSeconds = Date.now() / 1000;
    const cookieNames = new Set(cookies.map((cookie) => cookie.name));
    const hasSessionCookie = cookies.some(
      (cookie) =>
        cookie.name === "web_session" &&
        cookie.value.length > 10 &&
        (cookie.expires === -1 || cookie.expires > nowSeconds)
    );
    const hasIdentityCookies = ["webId", "gid", "a1"].filter((name) => cookieNames.has(name)).length >= 2;

    if (hasSessionCookie) return { loggedIn: true, reason: "CDP 小红书 web_session 有效" };
    if (hasIdentityCookies) return { loggedIn: true, reason: "CDP 小红书身份 Cookie 有效" };
    return { loggedIn: false, reason: "CDP 小红书页面已打开，但缺少有效登录 Cookie" };
  } finally {
    await browser.close().catch(() => {});
  }
}

export function startXhsCdpBrowser(options: StartOptions = {}) {
  const cwd = options.cwd ?? process.cwd();
  const port = options.port ?? DEFAULT_CDP_PORT;
  const cdpUrl = `http://127.0.0.1:${port}`;
  const profileDir = options.profileDir ?? path.join(cwd, "data", "xhs-cdp-profile");
  const fileExists = options.fileExists ?? existsSync;
  const command = options.browserCommand ?? defaultBrowserCommand(options.platform ?? process.platform, fileExists);
  const args = buildXhsCdpLaunchArgs({ cdpPort: port, profileDir });

  mkdirSync(profileDir, { recursive: true });
  const launch = options.launch ?? launchDetached;
  launch(command, args);

  return {
    started: true,
    cdpUrl,
    profileDir,
    message: "已拉起真实浏览器 CDP，请在打开的 Edge 窗口内完成人工登录"
  };
}

export function buildXhsCdpLaunchArgs(input: { cdpPort: number; profileDir: string }) {
  return [
    `--remote-debugging-port=${input.cdpPort}`,
    `--user-data-dir=${input.profileDir}`,
    DEFAULT_XHS_URL
  ];
}

function launchDetached(command: string, args: string[]) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
}

function defaultBrowserCommand(platform: NodeJS.Platform, fileExists: (filePath: string) => boolean) {
  if (platform === "win32") {
    const edgePath = [
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
    ].find(fileExists);
    return edgePath ?? "msedge";
  }
  if (platform === "darwin") return "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
  return "microsoft-edge";
}

function normalizeCdpUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
