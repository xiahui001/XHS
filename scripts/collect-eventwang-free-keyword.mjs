import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  createEventwangImageDedupeStore,
  normalizeEventwangImageUrl
} from "./lib/eventwang-image-dedupe.mjs";

const PREFERRED_STYLE_RULES = [
  { tag: "花艺美陈", bucket: "floral", score: 13 },
  { tag: "已布置", bucket: "installed", score: 14 },
  { tag: "美陈", bucket: "decor", score: 13 },
  { tag: "展示", bucket: "display", score: 12 },
  { tag: "展陈", bucket: "display", score: 12 },
  { tag: "场景", bucket: "scene", score: 11 },
  { tag: "艺术展", bucket: "art", score: 11 },
  { tag: "陈列", bucket: "display", score: 10 },
  { tag: "装置", bucket: "installation", score: 10 },
  { tag: "快闪", bucket: "popup", score: 9 },
  { tag: "商业地产活动", bucket: "commercial", score: 8 },
  { tag: "策划案例图片", bucket: "reference", score: 7 }
];

const args = parseArgs(process.argv.slice(2));
const keyword = args.keyword || "";
const limit = Math.max(1, Number(args.limit || 6));
const maxCandidates = Number(args.maxCandidates || 18);
const outputRoot = args.output || "data/eventwang-gallery";
const storageStatePath = args.storageState || ".auth/eventwang.json";
const requiredStyleBuckets = Math.min(5, limit);
const dedupeStore = createEventwangImageDedupeStore(args.sqlite || "data/eventwang-gallery/eventwang-dedupe.sqlite");

if (!keyword) throw new Error("缺少 --keyword");

let browser;
process.once("SIGTERM", closeBrowserAndExit);
process.once("SIGINT", closeBrowserAndExit);
try {
browser = await chromium.launch({ headless: args.headless === "true" });
const context = await browser.newContext({ acceptDownloads: true, storageState: storageStatePath });
const page = await context.newPage();

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, `keyword-${sanitizeFileName(keyword).slice(0, 40)}`, runId);
await mkdir(outputDir, { recursive: true });

const galleryUrl = await openGallerySearch(page, keyword);
const candidates = await collectGalleryCandidates(page, maxCandidates);
if (!candidates.length) {
  await saveDebugSnapshot(page, outputDir, "empty-candidates");
}
const rankedCandidates = await rankGalleryCandidatesWithArk(keyword, candidates);
const collectionQueue = chooseDiverseGalleryItems(rankedCandidates, rankedCandidates.length, requiredStyleBuckets);
const queuedGalleryIds = new Set(collectionQueue.map((item) => item.galleryId));
const items = [];
const skipped = candidates
  .filter((item) => !queuedGalleryIds.has(item.galleryId))
  .map((item) => ({
    galleryId: item.galleryId,
    detailUrl: "",
    tagName: item.tagName,
    styleTag: item.styleTag,
    styleBucket: item.styleBucket,
    reason: "未进入多风格优先采集队列"
  }));

for (const item of collectionQueue) {
  if (items.length >= limit) break;
  const candidateCheck = dedupeStore.hasSeenCandidate({
    galleryId: item.galleryId,
    detailUrl: item.href,
    previewUrl: normalizeEventwangImageUrl(item.imageUrl)
  });
  if (candidateCheck.duplicate) {
    skipped.push({
      galleryId: item.galleryId,
      detailUrl: "",
      tagName: item.tagName,
      styleTag: item.styleTag,
      styleBucket: item.styleBucket,
      reason: `历史重复(${candidateCheck.reason})`
    });
    continue;
  }

  const targetDir = path.join(
    outputDir,
    `${String(items.length + 1).padStart(2, "0")}-${item.galleryId}-${sanitizeFileName(item.tagName || item.styleTag).slice(0, 24)}`
  );
  await mkdir(targetDir, { recursive: true });

  const opened = await openGalleryDetail(page, galleryUrl, item);
  if (!opened.ok) {
    skipped.push({
      galleryId: item.galleryId,
      detailUrl: "",
      tagName: item.tagName,
      styleTag: item.styleTag,
      styleBucket: item.styleBucket,
      reason: opened.reason
    });
    continue;
  }

  const detailUrl = page.url();
  const ownerId = extractOwnerId(detailUrl);
  const previewUrl = await readPreviewImageUrl(page);
  const download = await downloadOriginalImage(page, targetDir);

  if (!download.ok) {
    skipped.push({
      galleryId: item.galleryId,
      detailUrl,
      tagName: item.tagName,
      styleTag: item.styleTag,
      styleBucket: item.styleBucket,
      reason: download.reason
    });
    continue;
  }

  const contentCheck = dedupeStore.hasDuplicateContent({
    galleryId: item.galleryId,
    detailUrl,
    previewUrl,
    localPath: download.localPath,
    keyword
  });
  if (contentCheck.duplicate) {
    skipped.push({
      galleryId: item.galleryId,
      detailUrl,
      tagName: item.tagName,
      styleTag: item.styleTag,
      styleBucket: item.styleBucket,
      reason: `历史重复(${contentCheck.reason})`
    });
    continue;
  }

  items.push({
    galleryId: item.galleryId,
    ownerId,
    resultIndex: item.resultIndex,
    tagName: item.tagName,
    styleTag: item.styleTag,
    styleBucket: item.styleBucket,
    detailUrl,
    sourceUrl: detailUrl,
    previewUrl,
    localPath: download.localPath,
    downloadFilename: download.downloadFilename
  });

  dedupeStore.recordDownloadedImage({
    galleryId: item.galleryId,
    detailUrl,
    previewUrl,
    localPath: download.localPath,
    keyword
  });
}

const manifest = {
  runId,
  keyword,
  galleryUrl,
  outputDir,
  selectedCount: items.length,
  imageCount: items.length,
  styleBucketCount: countDistinctStyleBuckets(items),
  requiredStyleBuckets,
  items,
  skipped
};

await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
await writeFile(
  path.join(outputDir, "summary.json"),
  JSON.stringify(
    {
      runId,
      keyword,
      galleryUrl,
      outputDir,
      selectedCount: items.length,
      imageCount: items.length,
      styleBucketCount: countDistinctStyleBuckets(items),
      requiredStyleBuckets
    },
    null,
    2
  ),
  "utf8"
);

await browser.close();
browser = null;
dedupeStore.close();

process.stdout.write(
  `EVENTWANG_FREE_KEYWORD_DONE ${JSON.stringify({
    keyword,
    galleryUrl,
    outputDir,
    selectedCount: items.length,
    imageCount: items.length,
    styleBucketCount: countDistinctStyleBuckets(items),
    requiredStyleBuckets,
    items,
    skipped
  })}\n`
);
} finally {
  await browser?.close().catch(() => {});
  dedupeStore.close();
}

async function closeBrowserAndExit() {
  await browser?.close().catch(() => {});
  process.exit(1);
}

async function openGallerySearch(activePage, searchKeyword) {
  await humanDelay(1400, 2800);
  await activePage.goto("https://www.eventwang.cn/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await humanScroll(activePage, 260, 560);
  await activePage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await humanDelay(1000, 2200);

  const directGalleryEntry = activePage.locator('a[href="/Gallery"], a[href="https://www.eventwang.cn/Gallery"]').first();
  if (await directGalleryEntry.count()) {
    await humanClick(activePage, directGalleryEntry).catch(() => {});
  }
  if (!activePage.url().includes("/Gallery")) {
    await humanDelay(1200, 2400);
    await activePage.goto("https://www.eventwang.cn/Gallery", { waitUntil: "domcontentloaded", timeout: 60000 });
  }

  await activePage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await humanScroll(activePage, 320, 720);
  await humanDelay(1500, 3000);
  const searchInput = await firstVisibleLocator(activePage, "input.search_ipt");
  await humanClick(activePage, searchInput).catch(() => {});
  await humanDelay(600, 1500);
  await searchInput.fill(searchKeyword);
  await humanDelay(900, 1800);
  await Promise.all([
    activePage.waitForURL((url) => url.pathname === "/Gallery" && url.searchParams.has("keywords"), {
      timeout: 30000
    }),
    searchInput.press("Enter")
  ]);
  await activePage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await humanScroll(activePage, 420, 860);
  await humanDelay(1800, 3600);
  return activePage.url();
}

async function collectGalleryCandidates(activePage, maxCount) {
  return activePage.evaluate(
    ({ limit, rules }) => {
      const compiledRules = rules.map((rule) => ({ ...rule }));

      const toStyleInfo = (tagName, title, galleryId) => {
        const normalizedTag = String(tagName || "").replace(/\s+/g, "");
        const normalizedTitle = String(title || "").replace(/\s+/g, "");
        const matchedRule =
          compiledRules.find((rule) => normalizedTag.includes(rule.tag)) ??
          compiledRules.find((rule) => normalizedTitle.includes(rule.tag));

        return {
          styleTag: matchedRule?.tag || tagName || "未分类",
          styleBucket: matchedRule?.bucket || tagName || galleryId,
          score: matchedRule?.score || 1
        };
      };

      const cardSelectors = [
        ".design_resource_list_box .card_box",
        ".card_box",
        "[class*='card_box']",
        "[class*='design_resource'] [class*='card']",
        "a[href*='/Gallery/detail-']",
        "a[href*='/DesignResource/detail-']"
      ];
      const cards = Array.from(new Set(cardSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))));

      return cards
        .map((card, resultIndex) => {
          const anchor =
            card.matches?.("a[href]") ? card : card.querySelector('a[href*="/Gallery/detail-"], a[href*="/DesignResource/detail-"]');
          const image = card.querySelector("img.el-image__inner, img");
          const tagName = card.querySelector(".collect_card_tit span:last-child")?.textContent?.trim() || "";
          const href = anchor?.getAttribute("href") || "";
          const galleryId = href.match(/detail-(\d+)/)?.[1] || href.match(/detail-\d+_(\d+)/)?.[1] || "";
          const imageUrl = image?.getAttribute("src") || "";
          if (!galleryId || !imageUrl) return null;

          const styleInfo = toStyleInfo(tagName, `收藏于${tagName}`, galleryId);
          return {
            galleryId,
            imgDataSourceId: galleryId,
            title: `收藏于${tagName || "图库图片"}`,
            imageUrl,
            tagName,
            href,
            resultIndex,
            ...styleInfo
          };
        })
        .filter(Boolean)
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score;
          return left.resultIndex - right.resultIndex;
        })
        .slice(0, limit);
    },
    { limit: maxCount, rules: PREFERRED_STYLE_RULES }
  );
}

function chooseDiverseGalleryItems(items, desiredCount, minimumStyleBuckets = 5) {
  const picked = [];
  const seenGalleryIds = new Set();
  const seenBuckets = new Set();

  for (const item of items) {
    if (picked.length >= desiredCount) break;
    if (seenGalleryIds.has(item.galleryId)) continue;
    if (seenBuckets.size < minimumStyleBuckets && seenBuckets.has(item.styleBucket)) continue;

    picked.push(item);
    seenGalleryIds.add(item.galleryId);
    seenBuckets.add(item.styleBucket);
  }

  for (const item of items) {
    if (picked.length >= desiredCount) break;
    if (seenGalleryIds.has(item.galleryId)) continue;

    picked.push(item);
    seenGalleryIds.add(item.galleryId);
  }

  return picked;
}

async function rankGalleryCandidatesWithArk(searchKeyword, candidates) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey || candidates.length <= 1) return candidates;

  const multimodalIds = await requestArkMultimodalCandidateIds(searchKeyword, candidates);
  if (multimodalIds.length) return sortCandidatesByArkIds(candidates, multimodalIds);

  const textIds = await requestArkTextCandidateIds(searchKeyword, candidates);
  if (textIds.length) return sortCandidatesByArkIds(candidates, textIds);

  return candidates;
}

async function requestArkMultimodalCandidateIds(searchKeyword, candidates) {
  const visionCandidates = candidates
    .slice(0, 16)
    .map((item) => ({ ...item, imageUrl: normalizeCandidateImageUrl(item.imageUrl) }))
    .filter((item) => item.imageUrl && !item.imageUrl.startsWith("data:"));
  if (!visionCandidates.length) return [];

  const content = [
    {
      type: "text",
      text:
        `请直接看图，按关键词“${searchKeyword}”筛选最适合小红书活动策划笔记的活动汪图库候选。` +
        `优先：已布置、美陈、展示、不同风格、不同场景、可作为封面+正文配图。` +
        `只输出 JSON：{"ids":["galleryId"]}，ids 按匹配度从高到低排序。`
    },
    ...visionCandidates.flatMap((item, index) => [
      {
        type: "text",
        text: `候选 ${index + 1}，galleryId=${item.galleryId}，标题=${item.title}，标签=${item.tagName}，风格=${item.styleTag}/${item.styleBucket}`
      },
      {
        type: "image_url",
        image_url: {
          url: item.imageUrl
        }
      }
    ])
  ];

  return requestArkCandidateIds({
    model: process.env.ARK_VISION_MODEL || process.env.ARK_TEXT_MODEL || "doubao-seed-1-6-vision-250815",
    messages: [
      {
        role: "system",
        content: "你是活动策划视觉选片助手。必须根据图片本身和候选元数据做排序，只输出合法 JSON。"
      },
      {
        role: "user",
        content
      }
    ],
    timeoutMs: 45000
  });
}

async function requestArkTextCandidateIds(searchKeyword, candidates) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.ARK_TEXT_MODEL || "doubao-seed-character-251128",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              '你是活动策划图片选片助手。根据关键词和候选图标题/标签/风格/图片URL，挑选最匹配“已布置、美陈、展示、不同风格不同场景”的图库原图候选。只输出 JSON：{"ids":["galleryId"]}。'
          },
          {
            role: "user",
            content: JSON.stringify({
              keyword: searchKeyword,
              requiredCount: Math.min(limit, candidates.length),
              candidates: candidates.slice(0, 24).map((item) => ({
                galleryId: item.galleryId,
                title: item.title,
                tagName: item.tagName,
                styleTag: item.styleTag,
                styleBucket: item.styleBucket,
                imageUrl: item.imageUrl
              }))
            })
          }
        ]
      })
    });
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!response.ok || !content) return [];
    return parseArkIds(content);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function requestArkCandidateIds({ model, messages, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${process.env.ARK_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages
      })
    });
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!response.ok || !content) return [];
    return parseArkIds(content);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function sortCandidatesByArkIds(candidates, ids) {
  const rank = new Map(ids.map((id, index) => [String(id), index]));
  return [...candidates].sort((left, right) => {
    const leftRank = rank.get(left.galleryId) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.galleryId) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (right.score !== left.score) return right.score - left.score;
    return left.resultIndex - right.resultIndex;
  });
}

function normalizeCandidateImageUrl(imageUrl) {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("//")) return `https:${imageUrl}`;
  if (imageUrl.startsWith("/")) return `https://www.eventwang.cn${imageUrl}`;
  return imageUrl;
}

function parseArkIds(content) {
  const normalized = String(content).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const payload = JSON.parse(normalized.slice(start, end + 1));
    return Array.isArray(payload.ids) ? payload.ids.map(String) : [];
  } catch {
    return [];
  }
}

function countDistinctStyleBuckets(items) {
  return new Set(items.map((item) => item.styleBucket)).size;
}

async function openGalleryDetail(activePage, galleryUrl, item) {
  await humanDelay(1800, 3600);
  await activePage.goto(galleryUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await activePage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await humanScroll(activePage, 380, 820);
  await humanDelay(1200, 2400);

  const detailHref = normalizeEventwangHref(item.href);
  const selectors = [
    detailHref ? `a[href="${detailHref}"]` : "",
    detailHref ? `a[href="${detailHref.replace("https://www.eventwang.cn", "")}"]` : "",
    `a[href*="detail-${item.galleryId}"]`,
    '.design_resource_list_box .card_box a[href*="/Gallery/detail-"]',
    '.design_resource_list_box .card_box a[href*="/DesignResource/detail-"]',
    '.card_box a[href*="/Gallery/detail-"]',
    '.card_box a[href*="/DesignResource/detail-"]'
  ].filter(Boolean);
  const card = await firstExistingLocator(activePage, selectors, item.resultIndex);
  if (!card) {
    return { ok: false, reason: "图库搜索结果不足，无法打开目标图片详情" };
  }

  await humanHover(activePage, card).catch(() => {});
  await humanDelay(500, 1200);
  await Promise.all([
    activePage.waitForURL(/\/Gallery\/detail-\d+_\d+/, { timeout: 30000 }),
    humanClick(activePage, card)
  ]).catch(() => null);

  if (!/\/Gallery\/detail-\d+_\d+/.test(activePage.url())) {
    return { ok: false, reason: "点击图库图片后未进入详情页" };
  }

  await activePage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await humanScroll(activePage, 280, 640);
  await humanDelay(1000, 2200);
  return { ok: true };
}

async function readPreviewImageUrl(activePage) {
  return (
    (await activePage.locator(".gallery_detail_left_img, img[class*='gallery_detail'], .gallery_detail img, img").first().getAttribute("src").catch(() => null)) ||
    null
  );
}

async function downloadOriginalImage(activePage, targetDir) {
  const button = activePage
    .locator(".gallery_detail_down_btn, button:has-text('下载原图'), a:has-text('下载原图'), [class*='down_btn']:has-text('下载'), [class*='download']:has-text('下载')")
    .first();
  const isVisible = await button.isVisible().catch(() => false);
  if (!isVisible) {
    return { ok: false, reason: "详情页右侧未找到“下载原图”按钮" };
  }

  await button.scrollIntoViewIfNeeded().catch(() => {});
  await humanHover(activePage, button).catch(() => {});
  await humanDelay(900, 2200);
  const download = await Promise.all([
    activePage.waitForEvent("download", { timeout: 30000 }).catch(() => null),
    humanClick(activePage, button).catch(() => null)
  ]).then(([result]) => result);

  if (!download) {
    return { ok: false, reason: "点击“下载原图”后未触发文件下载" };
  }

  const downloadFilename = sanitizeFileName(download.suggestedFilename() || "eventwang-original.jpg");
  const localPath = path.join(targetDir, downloadFilename);
  await download.saveAs(localPath);
  await humanDelay(1200, 2600);
  return { ok: true, localPath, downloadFilename };
}

async function humanClick(activePage, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    await activePage.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
    await humanDelay(180, 520);
    await activePage.mouse.down();
    await humanDelay(120, 260);
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

  await activePage.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
}

async function humanScroll(activePage, minDelta, maxDelta) {
  const amount = randomInt(minDelta, maxDelta) * (Math.random() > 0.5 ? 1 : -1);
  await activePage.mouse.wheel(0, amount).catch(() => {});
}

async function humanDelay(minMs, maxMs) {
  const wait = randomInt(minMs, maxMs);
  await new Promise((resolve) => setTimeout(resolve, wait));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

async function firstExistingLocator(activePage, selectors, fallbackIndex = 0) {
  for (const selector of selectors) {
    const locator = activePage.locator(selector);
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    return locator.nth(Math.min(fallbackIndex, count - 1));
  }
  return null;
}

async function saveDebugSnapshot(activePage, outputDir, label) {
  const debugDir = path.join(outputDir, "debug");
  await mkdir(debugDir, { recursive: true });
  await writeFile(path.join(debugDir, `${label}.html`), await activePage.content(), "utf8").catch(() => {});
  await activePage.screenshot({ path: path.join(debugDir, `${label}.png`), fullPage: true }).catch(() => {});
}

function extractOwnerId(detailUrl) {
  return detailUrl.match(/detail-\d+_(\d+)/)?.[1] || "";
}

function normalizeEventwangHref(href) {
  if (!href) return "";
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://www.eventwang.cn${href}`;
  return href;
}

function sanitizeFileName(input) {
  return String(input).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() || "gallery-item";
}

function parseArgs(rawArgs) {
  return rawArgs.reduce((acc, arg) => {
    if (!arg.startsWith("--")) return acc;
    const [key, value = "true"] = arg.slice(2).split("=");
    acc[key] = value;
    return acc;
  }, {});
}
