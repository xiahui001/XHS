import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const args = parseArgs(process.argv.slice(2));
const storageStatePath = args.storageState || ".auth/eventwang.json";
const timeoutMs = Number(args.timeoutMs || 10 * 60 * 1000);

await mkdir(path.dirname(storageStatePath), { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto("https://www.eventwang.cn/Gallery", {
  waitUntil: "domcontentloaded",
  timeout: 60000
});

const startedAt = Date.now();
let saved = false;

while (Date.now() - startedAt < timeoutMs) {
  await page.waitForTimeout(2000);
  const cookies = await context.cookies("https://www.eventwang.cn");
  const hasLoginCookie = cookies.some((cookie) => cookie.name && cookie.value && cookie.value.length > 10);
  const hasGallerySearch = await page.locator("input.search_ipt").first().isVisible({ timeout: 500 }).catch(() => false);
  const stillShowingLogin = await page
    .locator("text=/登录|验证码|手机号|密码/")
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);

  if (hasLoginCookie && hasGallerySearch && !stillShowingLogin) {
    await context.storageState({ path: storageStatePath });
    saved = true;
    break;
  }
}

await browser.close();

if (!saved) {
  throw new Error(`登录态保存超时：${storageStatePath}`);
}

process.stdout.write(`EVENTWANG_LOGIN_SAVED ${JSON.stringify({ storageStatePath })}\n`);

function parseArgs(rawArgs) {
  return rawArgs.reduce((acc, arg) => {
    if (!arg.startsWith("--")) return acc;
    const [key, value = "true"] = arg.slice(2).split("=");
    acc[key] = value;
    return acc;
  }, {});
}
