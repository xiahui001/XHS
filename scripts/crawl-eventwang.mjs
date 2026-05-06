import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const EVENTWANG_HOSTS = new Set(["eventwang.cn", "www.eventwang.cn"]);
const DEFAULT_START_URL = "https://eventwang.cn/";

const args = parseArgs(process.argv.slice(2));
let startUrl = args.url || process.env.EVENTWANG_START_URL || DEFAULT_START_URL;
const maxPages = toNumber(args.maxPages || process.env.EVENTWANG_MAX_PAGES, 3);
const maxImages = toNumber(args.maxImages || process.env.EVENTWANG_MAX_IMAGES, 60);
const loginWaitMs = toNumber(args.loginWaitMs || process.env.EVENTWANG_LOGIN_WAIT_MS, 180000);
const headless = (args.headless || process.env.EVENTWANG_HEADLESS || "false") === "true";
const shouldDownload = (args.download || process.env.EVENTWANG_DOWNLOAD_IMAGES || "true") !== "false";
const storageStatePath = args.storageState || process.env.EVENTWANG_STORAGE_STATE || ".auth/eventwang.json";
const continueFlagPath = args.continueFlag || process.env.EVENTWANG_CONTINUE_FLAG || ".auth/eventwang.continue";
const outputRoot = args.output || process.env.EVENTWANG_OUTPUT_DIR || "data/eventwang";
const imageType = args.imageType || process.env.EVENTWANG_IMAGE_TYPE || "all";
const minWidth = toNumber(args.minWidth || process.env.EVENTWANG_MIN_WIDTH, 320);
const minHeight = toNumber(args.minHeight || process.env.EVENTWANG_MIN_HEIGHT, 240);
const requireKeyword = args.requireKeyword || process.env.EVENTWANG_REQUIRE_KEYWORD || "";

assertEventwangUrl(startUrl);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, runId);
const imageDir = path.join(outputDir, "images");

await mkdir(outputDir, { recursive: true });
if (shouldDownload) {
  await mkdir(imageDir, { recursive: true });
}
await mkdir(path.dirname(storageStatePath), { recursive: true });
await rm(continueFlagPath, { force: true }).catch(() => undefined);

const browser = await chromium.launch({
  headless
});

const storageState = await readJsonIfExists(storageStatePath);
const context = await browser.newContext(storageState ? { storageState } : {});
const page = await context.newPage();

const pageAfterLogin = await maybeLogin(page, context);
if (pageAfterLogin) {
  startUrl = pageAfterLogin;
}

const pages = await crawlPages(page, startUrl, maxPages);
const images = filterImages(uniqueImages(pages.flatMap((item) => item.images))).slice(0, maxImages);
const downloaded = shouldDownload ? await downloadImages(context, images, imageDir) : [];

const manifest = {
  runId,
  startUrl,
  maxPages,
  maxImages,
  downloaded: shouldDownload,
  imageType,
  minWidth,
  minHeight,
  requireKeyword,
  storageStatePath,
  pageCount: pages.length,
  imageCount: images.length,
  pages,
  images: images.map((image) => ({
    ...image,
    localPath: downloaded.find((item) => item.url === image.url)?.localPath || null
  }))
};

await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
await writeFile(
  path.join(outputDir, "summary.json"),
  JSON.stringify(
    {
      runId,
      startUrl,
      pageCount: pages.length,
      imageCount: images.length,
      outputDir
    },
    null,
    2
  ),
  "utf8"
);

await browser.close();

print(`EVENTWANG_CRAWL_DONE ${JSON.stringify({ outputDir, pageCount: pages.length, imageCount: images.length })}`);

async function maybeLogin(activePage, activeContext) {
  const loginUrl = process.env.EVENTWANG_LOGIN_URL;
  const username = process.env.EVENTWANG_USERNAME;
  const password = process.env.EVENTWANG_PASSWORD;
  const userSelector = process.env.EVENTWANG_USER_SELECTOR;
  const passwordSelector = process.env.EVENTWANG_PASSWORD_SELECTOR;
  const submitSelector = process.env.EVENTWANG_SUBMIT_SELECTOR;

  if (loginUrl && username && password && userSelector && passwordSelector && submitSelector) {
    assertEventwangUrl(loginUrl);
    await activePage.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await activePage.fill(userSelector, username);
    await activePage.fill(passwordSelector, password);
    await Promise.all([
      activePage.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => undefined),
      activePage.click(submitSelector)
    ]);
    await activeContext.storageState({ path: storageStatePath });
    return activePage.url();
  }

  if (loginWaitMs > 0) {
    await activePage.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    print(`MANUAL_LOGIN_WINDOW ${loginWaitMs}ms`);
    print(`CONTINUE_FLAG ${continueFlagPath}`);
    print("Please finish login and captcha in the visible browser window. Search the target keyword, stop on the result page, then create the continue flag or wait for timeout.");
    await waitForContinueFlagOrTimeout(activePage, continueFlagPath, loginWaitMs);
    await activeContext.storageState({ path: storageStatePath });
    return activePage.url();
  }

  return null;
}

async function waitForContinueFlagOrTimeout(activePage, flagPath, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await stat(flagPath);
      return;
    } catch {
      await activePage.waitForTimeout(1000);
    }
  }
}

async function crawlPages(activePage, firstUrl, pageLimit) {
  const queue = [firstUrl];
  const seen = new Set();
  const results = [];

  while (queue.length > 0 && results.length < pageLimit) {
    const url = queue.shift();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);

    await activePage.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await autoScroll(activePage);
    const snapshot = await extractPageSnapshot(activePage);
    results.push(snapshot);

    for (const link of snapshot.links) {
      if (queue.length + seen.size >= pageLimit) {
        break;
      }
      if (!seen.has(link)) {
        queue.push(link);
      }
    }
  }

  return results;
}

async function autoScroll(activePage) {
  await activePage.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0;
      const distance = 640;
      const timer = window.setInterval(() => {
        window.scrollBy(0, distance);
        total += distance;
        if (total >= document.body.scrollHeight || total > 8000) {
          window.clearInterval(timer);
          resolve(undefined);
        }
      }, 120);
    });
  });
  await activePage.waitForTimeout(600);
}

async function extractPageSnapshot(activePage) {
  return activePage.evaluate(() => {
    const pageUrl = window.location.href;
    const pageTitle = document.title;
    const imageAttrs = ["currentSrc", "src", "data-src", "data-original", "data-lazy-src", "data-url"];

    const images = Array.from(document.images)
      .map((img) => {
        const rawUrl =
          img.currentSrc ||
          imageAttrs
            .map((attr) => img.getAttribute(attr))
            .find((value) => value && !value.startsWith("data:"));
        if (!rawUrl || rawUrl.startsWith("data:")) {
          return null;
        }
        return {
          url: new URL(rawUrl, pageUrl).toString(),
          alt: img.getAttribute("alt") || "",
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
          pageUrl,
          pageTitle
        };
      })
      .filter(Boolean);

    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((anchor) => new URL(anchor.getAttribute("href"), pageUrl).toString())
      .filter((href) => {
        const url = new URL(href);
        return ["eventwang.cn", "www.eventwang.cn"].includes(url.hostname) && !url.hash;
      });

    return {
      url: pageUrl,
      title: pageTitle,
      images,
      links: Array.from(new Set(links)).slice(0, 30)
    };
  });
}

function uniqueImages(images) {
  const seen = new Set();
  return images.filter((image) => {
    if (!image || !image.url || seen.has(image.url)) {
      return false;
    }
    const url = new URL(image.url);
    if (!EVENTWANG_HOSTS.has(url.hostname)) {
      return false;
    }
    seen.add(image.url);
    return true;
  });
}

function filterImages(images) {
  return images.filter((image) => {
    if (image.width && image.width < minWidth) {
      return false;
    }
    if (image.height && image.height < minHeight) {
      return false;
    }
    if (requireKeyword) {
      const haystack = `${image.alt || ""} ${image.url || ""} ${image.pageTitle || ""}`.toLowerCase();
      if (!haystack.includes(requireKeyword.toLowerCase())) {
        return false;
      }
    }
    if (imageType === "poster") {
      return image.height >= image.width;
    }
    if (imageType === "landscape") {
      return image.width >= image.height;
    }
    if (imageType === "square") {
      const ratio = image.width / image.height;
      return ratio >= 0.85 && ratio <= 1.18;
    }
    return true;
  });
}

async function downloadImages(activeContext, images, targetDir) {
  const downloaded = [];

  for (const image of images) {
    const response = await activeContext.request.get(image.url).catch(() => null);
    if (!response || !response.ok()) {
      continue;
    }

    const contentType = response.headers()["content-type"] || "";
    if (!contentType.startsWith("image/")) {
      continue;
    }

    const extension = extensionFromContentType(contentType) || extensionFromUrl(image.url) || ".jpg";
    const fileName = `${hashUrl(image.url)}${extension}`;
    const localPath = path.join(targetDir, fileName);
    await writeFile(localPath, await response.body());
    downloaded.push({ url: image.url, localPath });
  }

  return downloaded;
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
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

function assertEventwangUrl(input) {
  const url = new URL(input);
  if (url.protocol !== "https:" || !EVENTWANG_HOSTS.has(url.hostname)) {
    throw new Error("Only https://eventwang.cn or https://www.eventwang.cn URLs are allowed.");
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function parseArgs(rawArgs) {
  return rawArgs.reduce((acc, arg) => {
    if (!arg.startsWith("--")) {
      return acc;
    }
    const [key, value = "true"] = arg.slice(2).split("=");
    acc[key] = value;
    return acc;
  }, {});
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function print(message) {
  process.stdout.write(`${message}\n`);
}
