import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const args = parseArgs(process.argv.slice(2));
const keyword = args.keyword;
const limit = Number(args.limit || 10);
const storageStatePath = args.storageState || ".auth/xhs.json";

if (!keyword) {
  throw new Error("缺少 --keyword");
}

await access(storageStatePath).catch(() => {
  throw new Error("缺少 .auth/xhs.json，请先由人工登录小红书并保存登录态");
});

let browser;
process.once("SIGTERM", closeBrowserAndExit);
process.once("SIGINT", closeBrowserAndExit);
try {
browser = await chromium.launch({ headless: args.headless === "true" });
const context = await browser.newContext({ storageState: storageStatePath });
const page = await context.newPage();

const searchUrl = await openXhsSearch(page, keyword);

const items = await page.evaluate((maxItems) => {
  const now = new Date().toISOString();
  const anchors = Array.from(document.querySelectorAll("a[href*='/explore/'], a[href*='/search_result/']"));
  const results = [];
  const seen = new Set();

  for (const anchor of anchors) {
    const href = anchor.href;
    const text = (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim();
    if (!href || !text || text.length < 6 || seen.has(href)) continue;
    seen.add(href);

    const container = anchor.closest("section, article, div") || anchor;
    const images = Array.from(container.querySelectorAll("img"))
      .map((image) => image.currentSrc || image.src)
      .filter((src) => src && !src.startsWith("data:"))
      .slice(0, 9);

    results.push({
      id: `xhs-${results.length + 1}`,
      title: text.slice(0, 60),
      content: text,
      sourceUrl: href,
      imageUrls: images,
      scrapedAt: now
    });

    if (results.length >= maxItems) break;
  }

  return results;
}, limit);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join("data", "xhs-scrapes", runId);
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "references.json"), JSON.stringify({ keyword, items }, null, 2), "utf8");
await browser.close();
browser = null;

process.stdout.write(
  `XHS_SCRAPE_DONE ${JSON.stringify({
    keyword,
    searchUrl,
    outputDir,
    itemCount: items.length,
    items
  })}\n`
);
} finally {
  await browser?.close().catch(() => {});
}

async function closeBrowserAndExit() {
  await browser?.close().catch(() => {});
  process.exit(1);
}

async function openXhsSearch(activePage, searchKeyword) {
  await humanDelay(5200, 9800);
  await activePage.goto("https://www.xiaohongshu.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await activePage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await humanScroll(activePage, 120, 360);
  await humanDelay(6200, 12800);

  const searchInput = await firstVisibleLocator(
    activePage,
    "input[placeholder*='搜索'], input.search-input, input[type='text']"
  ).catch(() => null);

  if (searchInput) {
    await humanClick(activePage, searchInput).catch(() => {});
    await humanDelay(1800, 4200);
    await searchInput.fill("");
    await activePage.keyboard.type(searchKeyword, { delay: randomInt(90, 220) });
    await humanDelay(3200, 7200);
    await Promise.all([
      activePage
        .waitForURL((url) => url.href.includes("search_result") || url.searchParams.has("keyword"), { timeout: 25000 })
        .catch(() => null),
      searchInput.press("Enter").catch(() => null)
    ]);
  }

  if (!activePage.url().includes("search_result")) {
    await humanDelay(5200, 9800);
    await activePage.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(searchKeyword)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
  }

  await activePage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await humanDelay(6200, 12800);
  await browseSearchResults(activePage);
  return activePage.url();
}

async function browseSearchResults(activePage) {
  for (let index = 0; index < 3; index += 1) {
    await humanScroll(activePage, 180, 520);
    await humanDelay(5200, 11800);
    await hoverVisibleNote(activePage).catch(() => {});
    await humanDelay(3600, 8200);
  }
}

async function hoverVisibleNote(activePage) {
  const cards = activePage.locator("section, article, div").filter({ has: activePage.locator("a[href*='/explore/']") });
  const count = await cards.count().catch(() => 0);
  if (!count) return;
  const target = cards.nth(randomInt(0, Math.min(count - 1, 8)));
  await humanHover(activePage, target);
}

async function firstVisibleLocator(activePage, selector) {
  const locator = activePage.locator(selector);
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  throw new Error(`未找到可见节点: ${selector}`);
}

async function humanClick(activePage, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    await activePage.mouse.move(box.x + box.width / 2 + randomInt(-10, 10), box.y + box.height / 2 + randomInt(-8, 8), { steps: 18 });
    await humanDelay(360, 980);
    await activePage.mouse.down();
    await humanDelay(160, 420);
    await activePage.mouse.up();
    return;
  }

  await locator.click({ force: true });
}

async function humanHover(activePage, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox().catch(() => null);
  if (!box) {
    await locator.hover({ force: true }).catch(() => {});
    return;
  }

  await activePage.mouse.move(box.x + box.width / 2 + randomInt(-12, 12), box.y + box.height / 2 + randomInt(-10, 10), { steps: 16 });
}

async function humanScroll(activePage, minDelta, maxDelta) {
  const amount = randomInt(minDelta, maxDelta);
  await activePage.mouse.wheel(randomInt(-20, 20), amount).catch(() => {});
}

async function humanDelay(minMs, maxMs) {
  const wait = randomInt(minMs, maxMs);
  await new Promise((resolve) => setTimeout(resolve, wait));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseArgs(rawArgs) {
  return rawArgs.reduce((acc, arg) => {
    if (!arg.startsWith("--")) return acc;
    const [key, value = "true"] = arg.slice(2).split("=");
    acc[key] = value;
    return acc;
  }, {});
}
