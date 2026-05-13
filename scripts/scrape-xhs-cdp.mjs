import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const args = parseArgs(process.argv.slice(2));
const keyword = args.keyword;
const limit = Number(args.limit || 10);
const cdpUrl = args["cdp-url"] || process.env.XHS_CDP_URL || "http://127.0.0.1:9222";

if (!keyword) {
  throw new Error("缺少 --keyword");
}

let context;
let page;
let browser;
let createdContext = false;
process.once("SIGTERM", closePageAndExit);
process.once("SIGINT", closePageAndExit);

try {
  browser = await connectRealBrowser(cdpUrl);
  context = browser.contexts()[0];
  if (!context) {
    context = await browser.newContext({
      locale: "zh-CN",
      viewport: { width: 1440, height: 1600 }
    });
    createdContext = true;
  }

  page = await context.newPage();
  page.setDefaultTimeout(15_000);

  const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await humanDelay(8000, 18000);

  const searchBlocker = await detectAccessBlocker(page);
  if (searchBlocker) {
    stopForBlocker(searchBlocker);
  } else {
    await browseSearchResults(page);
    const items = [];
    let blocked = false;
    const maxCandidates = Math.min(Math.max(limit * 4, limit), 12);

    for (let candidateIndex = 0; candidateIndex < maxCandidates; candidateIndex += 1) {
      if (items.length >= limit) break;
      await humanDelay(8000, 18000);
      const detailSession = await openSearchResultByClick(page, candidateIndex);
      if (!detailSession) {
        await humanScroll(page, 320, 760);
        continue;
      }

      await humanDelay(8000, 16000);

      try {
        const detailBlocker = await detectAccessBlocker(detailSession.detailPage);
        if (detailBlocker) {
          stopForBlocker(detailBlocker);
          blocked = true;
          break;
        }

        const sourceUrl = await resolveCurrentDetailUrl(detailSession.detailPage);
        const item = await extractReferenceFromDetail(detailSession.detailPage, sourceUrl, items.length + 1);
        if ((item.title || item.content) && !isUnavailableReference(item)) items.push(item);
      } finally {
        await closeDetailSession(detailSession, searchUrl);
      }

      if ((candidateIndex + 1) % 3 === 0) await humanScroll(page, 260, 620);
    }

    if (!blocked) {
      const runId = new Date().toISOString().replace(/[:.]/g, "-");
      const outputDir = path.join("data", "xhs-cdp-scrapes", runId);
      await mkdir(outputDir, { recursive: true });
      await writeFile(path.join(outputDir, "references.json"), JSON.stringify({ keyword, searchUrl, items }, null, 2), "utf8");

      process.stdout.write(
        `XHS_CDP_SCRAPE_DONE ${JSON.stringify({
          keyword,
          searchUrl,
          outputDir,
          itemCount: items.length,
          items
        })}\n`
      );
    }
  }
} finally {
  await page?.close().catch(() => {});
  if (createdContext) await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

async function connectRealBrowser(activeCdpUrl) {
  try {
    return await chromium.connectOverCDP(activeCdpUrl);
  } catch (error) {
    throw new Error(`XHS_CDP_UNAVAILABLE ${activeCdpUrl}: ${error instanceof Error ? error.message : "无法连接真实浏览器"}`);
  }
}

async function browseSearchResults(activePage) {
  for (let index = 0; index < 2; index += 1) {
    await humanScroll(activePage, 240, 620);
    await humanDelay(6000, 14000);
  }
}

async function openSearchResultByClick(activePage, resultIndex) {
  const target = await searchResultCardLocator(activePage, resultIndex);
  if (!target) return null;

  const beforeUrl = activePage.url();
  await target.scrollIntoViewIfNeeded({ timeout: 6000 }).catch(() => {});
  await humanDelay(1200, 3200);
  await target.hover({ timeout: 5000 }).catch(() => {});

  const popupPromise = activePage.waitForEvent("popup", { timeout: 3000 }).catch(() => null);
  try {
    await target.click({ button: "left", delay: randomInt(80, 220), timeout: 12000 });
  } catch (error) {
    const nestedAnchor = target.locator("a[href*='/explore/']").first();
    if (!(await nestedAnchor.count().catch(() => 0))) throw error;
    await nestedAnchor.click({ button: "left", delay: randomInt(80, 220), timeout: 12000 });
  }

  const popup = await popupPromise;
  const detailPage = popup ?? activePage;
  await detailPage.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await detailPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await waitForDetailSurface(detailPage, beforeUrl);

  return { detailPage, popup, beforeUrl };
}

async function searchResultCardLocator(activePage, resultIndex) {
  const selectors = [
    "section[class*='note-item']",
    "div[class*='note-item']",
    "a[href*='/explore/']"
  ];

  for (const selector of selectors) {
    const locator = activePage.locator(selector);
    const count = await locator.count().catch(() => 0);
    if (count > resultIndex) return locator.nth(resultIndex);
  }

  return null;
}

async function waitForDetailSurface(activePage, previousUrl) {
  await activePage
    .waitForFunction(
      (oldUrl) => {
        const detailNode = document.querySelector(
          "#detail-title, #detail-desc, [class*='note-detail'], [class*='note-content'], [class*='comments-container']"
        );
        const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ");
        return location.href !== oldUrl || Boolean(detailNode) || /收藏|评论|点赞|发布于/.test(bodyText);
      },
      previousUrl,
      { timeout: 12000 }
    )
    .catch(() => {});
}

async function resolveCurrentDetailUrl(activePage) {
  return activePage
    .evaluate(() => {
      const canonical = document.querySelector("link[rel='canonical']")?.getAttribute("href")?.trim();
      const ogUrl = document.querySelector("meta[property='og:url']")?.getAttribute("content")?.trim();
      return canonical || ogUrl || location.href;
    })
    .catch(() => activePage.url());
}

async function closeDetailSession(session, searchUrl) {
  if (session.popup) {
    await session.detailPage.close().catch(() => {});
    return;
  }

  const currentUrl = session.detailPage.url();
  if (currentUrl !== session.beforeUrl) {
    await session.detailPage.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await session.detailPage.waitForURL((url) => url.href.startsWith(searchUrl.split("?")[0]), { timeout: 8000 }).catch(() => {});
    return;
  }

  const closeSelectors = [
    "button[aria-label*='关闭']",
    "[class*='close']",
    ".close"
  ];
  for (const selector of closeSelectors) {
    const closeButton = session.detailPage.locator(selector).first();
    const count = await closeButton.count().catch(() => 0);
    if (!count) continue;
    const visible = await closeButton.isVisible().catch(() => false);
    if (!visible) continue;
    await closeButton.click({ timeout: 3000 }).catch(() => {});
    await humanDelay(800, 1800);
    return;
  }

  await session.detailPage.keyboard.press("Escape").catch(() => {});
  await humanDelay(800, 1800);
}

async function extractReferenceFromDetail(activePage, sourceUrl, index) {
  return activePage.evaluate(
    ({ detailUrl, itemIndex }) => {
      const now = new Date().toISOString();
      const textOf = (selector) => {
        const node = document.querySelector(selector);
        return (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
      };
      const meta = (name) =>
        document.querySelector(`meta[property='${name}'], meta[name='${name}']`)?.getAttribute("content")?.trim() || "";
      const bodyText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
      const title =
        textOf("#detail-title") ||
        textOf("[class*='note-detail'] [class*='title']") ||
        textOf("[class*='note-content'] [class*='title']") ||
        textOf("[class*='modal'] [class*='title']") ||
        meta("og:title") ||
        document.title.replace(/- 小红书$/, "").trim();
      const content =
        textOf("#detail-desc") ||
        textOf("[class*='note-detail'] [class*='desc']") ||
        textOf("[class*='note-content'] [class*='desc']") ||
        textOf("[class*='modal'] [class*='desc']") ||
        meta("og:description") ||
        bodyText.slice(0, 600);
      const authorLink = Array.from(document.querySelectorAll("a[href*='/user/profile/']")).find((anchor) =>
        (anchor.innerText || anchor.textContent || "").trim()
      );
      const images = Array.from(document.querySelectorAll("img"))
        .map((image) => image.currentSrc || image.src)
        .filter((src) => src && !src.startsWith("data:"))
        .slice(0, 9);

      return {
        id: `xhs-cdp-${itemIndex}`,
        title: title.slice(0, 80),
        content,
        author: (authorLink?.innerText || authorLink?.textContent || "").replace(/\s+/g, " ").trim() || undefined,
        sourceUrl: detailUrl,
        imageUrls: images,
        scrapedAt: now
      };
    },
    { detailUrl: sourceUrl, itemIndex: index }
  );
}

async function detectAccessBlocker(activePage) {
  const state = await activePage
    .evaluate(() => ({
      title: document.title || "",
      body: (document.body?.innerText || "").replace(/\s+/g, " "),
      url: location.href
    }))
    .catch(() => ({ title: "", body: "", url: activePage.url() }));
  const combined = `${state.title} ${state.body} ${state.url}`;

  if (!/xiaohongshu\.com/i.test(state.url)) return "redirected_offsite";
  if (/captcha/i.test(combined) || /验证码|请完成验证/.test(combined)) return "captcha_required";
  if (/安全限制|安全验证|账号存在风险|IP存在风险|访问过于频繁|异常流量|当前账号存在风险/.test(combined)) {
    return "access_blocked";
  }
  if (/登录后查看搜索结果|扫码登录|手机号登录|马上登录即可|请登录/.test(combined)) return "login_required";
  return null;
}

function stopForBlocker(reason) {
  process.stdout.write(`XHS_BLOCKED ${reason}\n`);
  process.exitCode = 3;
}

function isUnavailableReference(item) {
  const text = `${item.title || ""} ${item.content || ""}`;
  return /当前笔记暂时无法浏览|打开小红书App扫码查看|小红书如何扫码/.test(text);
}

async function humanScroll(activePage, minDelta, maxDelta) {
  await activePage.mouse.wheel(randomInt(-24, 24), randomInt(minDelta, maxDelta)).catch(() => {});
}

async function humanDelay(minMs, maxMs) {
  await new Promise((resolve) => setTimeout(resolve, randomInt(minMs, maxMs)));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function closePageAndExit() {
  await page?.close().catch(() => {});
  if (createdContext) await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  process.exit(1);
}

function parseArgs(rawArgs) {
  return rawArgs.reduce((acc, arg) => {
    if (!arg.startsWith("--")) return acc;
    const [key, value = "true"] = arg.slice(2).split("=");
    acc[key] = value;
    return acc;
  }, {});
}
