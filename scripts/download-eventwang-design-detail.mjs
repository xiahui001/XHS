import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const args = parseArgs(process.argv.slice(2));
const designResourceId = args.id || "498465";
const title = args.title || "高坪五院512护士节团建活动策划案";
const detailUrl =
  args.url || `https://www.eventwang.cn/DesignResource/detail-${designResourceId}?from_app=62`;
const outputRoot = args.output || "data/eventwang-designs";
const storageStatePath = args.storageState || ".auth/eventwang.json";
const headless = args.headless !== "false";
const autoDownloadFile = args.autoDownloadFile === "true";

const browser = await chromium.launch({ headless });
const context = await browser.newContext({ acceptDownloads: true, storageState: storageStatePath });
const page = await context.newPage();

await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
await autoScroll(page);

const pageInfo = await collectPageInfo(page, designResourceId);
const imageCandidates = pageInfo.imageUrls.map((url) => ({
  sourceUrl: url,
  downloadUrl: preferLargeImage(url)
}));

const images = dedupeByBaseUrl(imageCandidates);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(
  outputRoot,
  `full-${designResourceId}-${sanitizeFileName(title).slice(0, 48)}`,
  runId
);
await mkdir(outputDir, { recursive: true });

const downloaded = [];
for (const [index, image] of images.entries()) {
  const result = await downloadImage(context, image.downloadUrl, outputDir, index + 1);
  if (result) {
    downloaded.push({
      order: index + 1,
      sourceUrl: image.sourceUrl,
      downloadUrl: image.downloadUrl,
      localPath: result.localPath,
      contentType: result.contentType,
      bytes: result.bytes
    });
  }
}

const fileDownload = autoDownloadFile ? await downloadFileWhenOrderIsFree(page, outputDir) : null;

const manifest = {
  runId,
  title,
  designResourceId,
  detailUrl,
  outputDir,
  visiblePageText: pageInfo.visiblePageText,
  detectedTotalPages: pageInfo.detectedTotalPages,
  detectedRemainingPages: pageInfo.detectedRemainingPages,
  imageCandidateCount: images.length,
  imageCount: downloaded.length,
  fileDownload,
  images: downloaded
};

await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
await writeFile(
  path.join(outputDir, "summary.json"),
  JSON.stringify(
    {
      runId,
      title,
      designResourceId,
      outputDir,
      imageCount: downloaded.length,
      detectedTotalPages: pageInfo.detectedTotalPages,
      detectedRemainingPages: pageInfo.detectedRemainingPages,
      fileDownload
    },
    null,
    2
  ),
  "utf8"
);

await browser.close();

process.stdout.write(
  `EVENTWANG_DESIGN_DETAIL_DONE ${JSON.stringify({
    outputDir,
    imageCount: downloaded.length,
    detectedTotalPages: pageInfo.detectedTotalPages,
    detectedRemainingPages: pageInfo.detectedRemainingPages,
    fileDownload
  })}\n`
);

async function autoScroll(activePage) {
  await activePage.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 700;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight + window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 180);
    });
  });
  await activePage.waitForTimeout(1200);
}

async function collectPageInfo(activePage, id) {
  return activePage.evaluate((resourceId) => {
    const urls = new Set();
    const addUrl = (value) => {
      if (!value || typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return;
      try {
        urls.add(new URL(trimmed, window.location.href).href);
      } catch {
        // Ignore invalid DOM attributes.
      }
    };

    for (const image of Array.from(document.images)) {
      addUrl(image.currentSrc);
      addUrl(image.src);
      for (const attr of ["data-src", "data-original", "data-url", "srcset"]) {
        const value = image.getAttribute(attr);
        if (attr === "srcset" && value) {
          for (const part of value.split(",")) addUrl(part.trim().split(/\s+/)[0]);
        } else {
          addUrl(value);
        }
      }
    }

    for (const element of Array.from(document.querySelectorAll("*"))) {
      const style = window.getComputedStyle(element);
      const matches = style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g);
      for (const match of matches) addUrl(match[1]);
    }

    const targetPattern = new RegExp(`/design\\d+/${resourceId}/`, "i");
    const imageUrls = Array.from(urls).filter((url) => targetPattern.test(url));
    const text = document.body.innerText || "";
    const totalPageMatches = Array.from(text.matchAll(/(\d+)\s*\/\s*(\d+)/g)).map((match) => ({
      current: Number(match[1]),
      total: Number(match[2])
    }));
    const detectedTotalPages = totalPageMatches.reduce(
      (max, item) => Math.max(max, item.total || 0),
      0
    );
    const remainingMatch = text.match(/阅读剩余\s*(\d+)\s*页/);

    return {
      imageUrls,
      detectedTotalPages: detectedTotalPages || null,
      detectedRemainingPages: remainingMatch ? Number(remainingMatch[1]) : null,
      visiblePageText: Array.from(new Set(totalPageMatches.map((item) => `${item.current}/${item.total}`)))
    };
  }, id);
}

async function downloadImage(activeContext, imageUrl, targetDir, order) {
  const response = await activeContext.request.get(imageUrl).catch(() => null);
  if (!response || !response.ok()) {
    return null;
  }

  const contentType = response.headers()["content-type"] || "";
  if (!contentType.startsWith("image/")) {
    return null;
  }

  const body = await response.body();
  const extension = extensionFromContentType(contentType) || extensionFromUrl(imageUrl) || ".jpg";
  const localPath = path.join(targetDir, `${String(order).padStart(2, "0")}-${hashUrl(imageUrl)}${extension}`);
  await writeFile(localPath, body);
  return { localPath, contentType, bytes: body.length };
}

async function downloadFileWhenOrderIsFree(activePage, targetDir) {
  const clicked = await clickFirstAvailable(activePage, [
    activePage.locator(".detail_right_btn").filter({ hasText: "下载文件" }).first(),
    activePage.locator("button,a,div").filter({ hasText: "下载文件" }).last()
  ]);

  if (!clicked) {
    return {
      status: "blocked",
      totalCoins: null,
      orderText: "",
      message: "未找到下载文件按钮"
    };
  }

  const orderVisible = await activePage
    .getByText("确定订单", { exact: false })
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!orderVisible) {
    const blockingText = await collectVisibleText(activePage);
    return {
      status: "blocked",
      totalCoins: null,
      orderText: compactText(blockingText),
      message: inferBlockingReason(blockingText)
    };
  }

  await activePage.waitForTimeout(600);

  const orderText = await activePage.evaluate(() => document.body.innerText || "");
  const totalCoins = parseTotalCoins(orderText);
  if (totalCoins !== 0) {
    return {
      status: "blocked",
      totalCoins,
      orderText: compactText(orderText),
      message: totalCoins === null ? "未能识别订单总计，已停止下载" : `订单总计为 ${totalCoins} 汪币，已停止下载`
    };
  }

  const finalButton = activePage.getByText("立即下载", { exact: true }).last();
  const [download] = await Promise.all([
    activePage.waitForEvent("download", { timeout: 60000 }),
    finalButton.click()
  ]);

  const suggestedName = sanitizeFileName(download.suggestedFilename() || `eventwang-${designResourceId}`);
  const localPath = path.join(targetDir, suggestedName);
  await download.saveAs(localPath);

  return {
    status: "downloaded",
    totalCoins,
    localPath,
    suggestedFilename: download.suggestedFilename(),
    orderText: compactText(orderText),
    message: "订单总计 0 汪币，已通过官方下载按钮保存文件"
  };
}

async function clickFirstAvailable(activePage, locators) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    await locator.scrollIntoViewIfNeeded().catch(() => {});
    const box = await locator.boundingBox().catch(() => null);
    if (!box) continue;

    await locator.click({ timeout: 10000 }).catch(async () => {
      await activePage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    });
    return true;
  }
  return false;
}

function parseTotalCoins(text) {
  const compact = text.replace(/\s+/g, " ");
  const segmentMatch = compact.match(/(?:总计|合计)(.{0,180}?)(?:立即下载|确认下载|下载文件|$)/);
  if (!segmentMatch) return null;

  const numbers = Array.from(segmentMatch[1].matchAll(/(\d+)\s*汪币/g)).map((match) => Number(match[1]));
  return numbers.length ? numbers[numbers.length - 1] : null;
}

function compactText(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function collectVisibleText(activePage) {
  return activePage.evaluate(() => {
    const blocks = [document.body.innerText || ""];
    for (const element of Array.from(document.querySelectorAll(".el-dialog,.el-message-box,[role=dialog]"))) {
      const text = element.textContent || "";
      if (text.trim()) blocks.push(text);
    }
    return blocks.join("\n");
  });
}

function inferBlockingReason(text) {
  if (text.includes("绑定手机号")) return "点击下载后要求绑定手机号，已停止下载";
  if (text.includes("关注公众号")) return "点击下载后要求关注公众号，已停止下载";
  if (text.includes("登录") || text.includes("注册")) return "点击下载后要求登录或注册，已停止下载";
  return "点击下载后未出现确认订单弹窗，已停止下载";
}

function preferLargeImage(input) {
  const url = new URL(input);
  const base = `${url.origin}${url.pathname}`;
  return `${base}?imageView2/2/w/1920`;
}

function dedupeByBaseUrl(images) {
  const seen = new Set();
  return images.filter((image) => {
    const url = new URL(image.downloadUrl);
    const key = `${url.origin}${url.pathname}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extensionFromContentType(contentType) {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  return null;
}

function extensionFromUrl(input) {
  const ext = path.extname(new URL(input).pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : null;
}

function hashUrl(input) {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function sanitizeFileName(input) {
  return input.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() || "scheme";
}

function parseArgs(rawArgs) {
  return rawArgs.reduce((acc, arg) => {
    if (!arg.startsWith("--")) return acc;
    const [key, value = "true"] = arg.slice(2).split("=");
    acc[key] = value;
    return acc;
  }, {});
}
