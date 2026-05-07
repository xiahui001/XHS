import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const args = parseArgs(process.argv.slice(2));
const storageStatePath = args.storageState || ".auth/xhs.json";
const statusPath = args.statusPath || ".auth/xhs-login-status.json";
const timeoutMs = Number(args.timeoutMs || 15 * 60 * 1000);

await mkdir(path.dirname(storageStatePath), { recursive: true });

const browser = await chromium.launch({ headless: false, slowMo: 120 });
const context = await browser.newContext({
  viewport: { width: 1360, height: 940 },
  locale: "zh-CN"
});
const page = await context.newPage();

await writeStatus("started", "小红书人工登录窗口已打开");
await page.goto("https://www.xiaohongshu.com/", { waitUntil: "domcontentloaded", timeout: 60000 });

const startedAt = Date.now();
let saved = false;

while (Date.now() - startedAt < timeoutMs) {
  await page.waitForTimeout(2500);
  const cookies = await context.cookies("https://www.xiaohongshu.com");
  const cookieNames = new Set(cookies.map((cookie) => cookie.name));
  const hasSessionCookie = cookies.some((cookie) => cookie.name === "web_session" && cookie.value.length > 10);
  const hasIdentityCookies = ["webId", "gid", "a1"].filter((name) => cookieNames.has(name)).length >= 2;

  const pageState = await page
    .evaluate(() => {
      const text = document.body?.innerText || "";
      return {
        hasLoginDialog: /登录后|验证码登录|手机号登录|密码登录|扫码登录|未登录/.test(text),
        hasLoggedInSurface: /发布|消息|通知|创作中心|我/.test(text),
        url: location.href
      };
    })
    .catch(() => ({ hasLoginDialog: true, hasLoggedInSurface: false, url: page.url() }));

  await writeStatus(
    "waiting",
    `等待登录完成，Cookie=${cookies.length}，web_session=${hasSessionCookie ? "yes" : "no"}，URL=${pageState.url}`
  );

  if ((hasSessionCookie || hasIdentityCookies) && pageState.hasLoggedInSurface && !pageState.hasLoginDialog) {
    await context.storageState({ path: storageStatePath });
    await writeStatus("saved", `小红书登录态已保存到 ${storageStatePath}`);
    saved = true;
    break;
  }
}

await browser.close();

if (!saved) {
  await writeStatus("timeout", `登录态保存超时：${storageStatePath}`);
  throw new Error(`登录态保存超时：${storageStatePath}`);
}

process.stdout.write(`XHS_LOGIN_SAVED ${JSON.stringify({ storageStatePath })}\n`);

async function writeStatus(state, message) {
  await writeFile(
    statusPath,
    JSON.stringify(
      {
        state,
        message,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  ).catch(() => undefined);
}

function parseArgs(rawArgs) {
  return rawArgs.reduce((acc, arg) => {
    if (!arg.startsWith("--")) return acc;
    const [key, value = "true"] = arg.slice(2).split("=");
    acc[key] = value;
    return acc;
  }, {});
}
