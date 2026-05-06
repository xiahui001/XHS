import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const args = parseArgs(process.argv.slice(2));
const keyword = args.keyword || "护士节";
const row = Number(args.row || 2);
const columns = Number(args.columns || 4);
const maxImagesPerScheme = Number(args.maxImagesPerScheme || 20);
const outputRoot = args.output || "data/eventwang-designs";
const storageStatePath = args.storageState || ".auth/eventwang.json";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: storageStatePath });

const items = await searchDesignResources(context, keyword);
const start = (row - 1) * columns;
const selected = items.slice(start, start + columns);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, runId);
await mkdir(outputDir, { recursive: true });

const schemes = [];
for (const [schemeIndex, item] of selected.entries()) {
  const cleanTitle = stripHtml(item.design_resource_name || item.title || `scheme-${schemeIndex + 1}`);
  const schemeDir = path.join(outputDir, `${schemeIndex + 1}-${sanitizeFileName(cleanTitle).slice(0, 48)}`);
  await mkdir(schemeDir, { recursive: true });

  const images = normalizeImages(item).slice(0, maxImagesPerScheme);
  const downloaded = [];

  for (const [imageIndex, image] of images.entries()) {
    const downloadedImage = await downloadImage(context, image.url, schemeDir, imageIndex + 1);
    if (downloadedImage) {
      downloaded.push({
        ...image,
        localPath: downloadedImage.localPath,
        contentType: downloadedImage.contentType
      });
    }
  }

  schemes.push({
    row,
    columns,
    resultIndex: start + schemeIndex,
    title: cleanTitle,
    designResourceId: item.design_resource_id,
    detailUrl: `https://www.eventwang.cn/DesignResource/detail-${item.design_resource_id}?from_app=62`,
    imageCount: downloaded.length,
    images: downloaded
  });
}

const manifest = {
  runId,
  keyword,
  row,
  columns,
  selectedCount: schemes.length,
  outputDir,
  schemes
};

await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
await writeFile(
  path.join(outputDir, "summary.json"),
  JSON.stringify(
    {
      runId,
      keyword,
      selectedCount: schemes.length,
      imageCount: schemes.reduce((sum, scheme) => sum + scheme.imageCount, 0),
      outputDir,
      titles: schemes.map((scheme) => scheme.title)
    },
    null,
    2
  ),
  "utf8"
);

await browser.close();

process.stdout.write(
  `EVENTWANG_DESIGN_ROW_DONE ${JSON.stringify({
    outputDir,
    selectedCount: schemes.length,
    imageCount: schemes.reduce((sum, scheme) => sum + scheme.imageCount, 0)
  })}\n`
);

async function searchDesignResources(activeContext, searchKeyword) {
  const params = new URLSearchParams({
    type: "4",
    p: "1",
    orderby: "sort_buy_click_rate",
    page_size: "24",
    keywords: searchKeyword
  });

  const response = await activeContext.request.post(
    "https://www.eventwang.cn/Api/DesignResourceV2/getDesignResourceList",
    {
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
      data: params.toString()
    }
  );

  if (!response.ok()) {
    throw new Error(`Design resource search failed: ${response.status()}`);
  }

  const payload = await response.json();
  return payload?.data_list?.data?.data || [];
}

function normalizeImages(item) {
  const webImages = Array.isArray(item.web_img) ? item.web_img : [];
  const images = webImages
    .map((image, index) => ({
      order: index + 1,
      url: image.img_url || image.url || image.web_img_url || image.list_img_url,
      width: Number(image.width || 0),
      height: Number(image.height || 0)
    }))
    .filter((image) => image.url);

  if (item.list_img_url) {
    images.unshift({
      order: 0,
      url: item.list_img_url,
      width: 0,
      height: 0
    });
  }

  return dedupeByUrl(images);
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

  const extension = extensionFromContentType(contentType) || extensionFromUrl(imageUrl) || ".jpg";
  const localPath = path.join(targetDir, `${String(order).padStart(2, "0")}-${hashUrl(imageUrl)}${extension}`);
  await writeFile(localPath, await response.body());
  return { localPath, contentType };
}

function dedupeByUrl(images) {
  const seen = new Set();
  return images.filter((image) => {
    if (seen.has(image.url)) {
      return false;
    }
    seen.add(image.url);
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

function stripHtml(input) {
  return String(input).replace(/<[^>]+>/g, "");
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
