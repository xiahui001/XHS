import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const SAVE_DRAFT_TEXT = "\u6682\u5b58\u79bb\u5f00";
const IMAGE_TEXT_TAB = "\u4e0a\u4f20\u56fe\u6587";
const LOGIN_HINTS = ["\u77ed\u4fe1\u767b\u5f55", "\u9a8c\u8bc1\u7801\u767b\u5f55", "\u626b\u7801\u767b\u5f55"];
const PUBLISH_ERROR_HINTS = ["\u8bf7\u586b\u5199", "\u4e0a\u4f20\u5931\u8d25", "\u4fdd\u5b58\u5931\u8d25", "\u6682\u5b58\u5931\u8d25"];
const SAVE_SUCCESS_HINTS = ["\u4fdd\u5b58\u6210\u529f", "\u8349\u7a3f\u7bb1", "\u56fe\u6587\u7b14\u8bb0"];
const HEADLESS_DEFAULT = false;

const args = parseArgs(process.argv.slice(2));
const jobPath = args.job;
const storageStatePath = args.storageState || ".auth/xhs.json";
const profileDir = args.profileDir || path.join("data", "xhs-browser-profile");
const headless = args.headless === undefined ? HEADLESS_DEFAULT : args.headless !== "false";

if (!jobPath) throw new Error("缺少 --job");

const job = JSON.parse(await readFile(jobPath, "utf8"));
const debugDir = path.join(path.dirname(jobPath), "debug");
await mkdir(debugDir, { recursive: true });
await access(storageStatePath).catch(() => {
  throw new Error("缺少 .auth/xhs.json，请先由人工登录小红书并保存登录态");
});

let browser;
let context;
let page;
process.once("SIGTERM", closeBrowserAndExit);
process.once("SIGINT", closeBrowserAndExit);

try {
  for (const imagePath of job.imagePaths) {
    await access(imagePath);
  }

  await mkdir(profileDir, { recursive: true });
  context = await chromium.launchPersistentContext(profileDir, {
    acceptDownloads: true,
    headless,
    viewport: { width: 1440, height: 1100 }
  });
  await applyStorageState(context, storageStatePath);
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  await warmUpCreatorSession(page);

  await openPublishPage(page);
  await saveDebugSnapshot(page, "01-open-publish");

  await switchToImageTextTab(page);
  await saveDebugSnapshot(page, "02-image-text-tab");

  const uploadedCount = await uploadImages(page, job.imagePaths.slice(0, 10));
  await saveDebugSnapshot(page, "03-images-uploaded");

  await fillDraftFields(page, job.draft);
  await saveDebugSnapshot(page, "04-fields-filled");

  const detail = await clickSaveDraft(page);
  await saveDebugSnapshot(page, "05-save-clicked");

  await context.storageState({ path: storageStatePath }).catch(() => {});
  await context.close();
  context = null;

  process.stdout.write(
    `XHS_DRAFT_SAVE_DONE ${JSON.stringify({
      jobId: job.jobId,
      status: "saved",
      detail,
      debugDir,
      uploadedCount,
      imageCount: job.imagePaths.length,
      title: job.draft.title,
      savedAt: new Date().toISOString()
    })}\n`
  );
} catch (error) {
  await saveDebugSnapshot(page, "error").catch(() => {});
  process.stderr.write(
    `XHS_DRAFT_SAVE_FAILED ${JSON.stringify({
      jobId: job.jobId,
      message: error instanceof Error ? error.message : "小红书草稿保存失败",
      debugDir
    })}\n`
  );
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

async function applyStorageState(activeContext, statePath) {
  const rawState = JSON.parse(await readFile(statePath, "utf8"));
  if (Array.isArray(rawState.cookies) && rawState.cookies.length) {
    await activeContext.addCookies(rawState.cookies).catch(() => {});
  }
}

async function openPublishPage(activePage) {
  await humanDelay(5200, 9800);
  await activePage.goto("https://creator.xiaohongshu.com/publish/publish?source=official", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await activePage.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await humanDelay(5600, 11000);
  await humanScroll(activePage, 120, 280);
  await humanDelay(2400, 5200);

  const bodyText = await readBodyText(activePage);
  if (LOGIN_HINTS.some((hint) => bodyText.includes(hint))) {
    throw new Error("小红书创作平台要求重新登录，请先刷新小红书登录态");
  }
}

async function warmUpCreatorSession(activePage) {
  await humanDelay(3200, 6800);
  await activePage.goto("https://creator.xiaohongshu.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await activePage.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await humanDelay(6200, 12800);
  await humanScroll(activePage, 120, 360);
  await humanDelay(2600, 6200);
}

async function switchToImageTextTab(activePage) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tabBox = await activePage.locator(".header-tabs .creator-tab").evaluateAll((tabs, text) => {
      return tabs
        .map((tab) => {
          const rect = tab.getBoundingClientRect();
          return {
            text: (tab.innerText || tab.textContent || "").trim(),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          };
        })
        .find((tab) => tab.text.includes(text) && tab.x >= 0 && tab.y >= 0 && tab.width > 0 && tab.height > 0);
    }, IMAGE_TEXT_TAB);

    if (!tabBox) {
      await humanDelay(2200, 5200);
      continue;
    }

    await humanClickAt(activePage, tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
    await humanDelay(4200, 8200);

    const imageInput = activePage.locator('input[type="file"][accept*="jpg"], input.upload-input').first();
    if (await imageInput.count().catch(() => 0)) {
      const acceptsImages = await imageInput.evaluate((input) => input.accept.includes("jpg")).catch(() => false);
      if (acceptsImages) return;
    }
  }

  throw new Error("未能切换到小红书上传图文入口");
}

async function uploadImages(activePage, imagePaths) {
  const input = activePage.locator('input[type="file"][accept*="jpg"], input.upload-input').first();
  await input.waitFor({ state: "attached", timeout: 30000 });
  await humanDelay(5200, 11800);
  await input.setInputFiles(imagePaths);
  return waitForUploadedImageCount(activePage, imagePaths.length);
}

async function waitForUploadedImageCount(activePage, expectedCount) {
  const startedAt = Date.now();
  let lastCount = 0;

  while (Date.now() - startedAt < 240000) {
    await humanDelay(5200, 9800);
    const count = await activePage.evaluate(() => {
      const text = document.body?.innerText || "";
      const match = text.match(/\u56fe\u7247\u7f16\u8f91\s*(\d+)\/18/);
      return match ? Number(match[1]) : 0;
    });

    lastCount = Math.max(lastCount, Number.isFinite(count) ? count : 0);
    if (lastCount >= Math.min(expectedCount, 10)) return lastCount;
    if (lastCount > 0 && Date.now() - startedAt > 45000) return lastCount;
  }

  throw new Error(`图片上传未完成，当前识别到 ${lastCount}/${expectedCount} 张`);
}

async function fillDraftFields(activePage, draft) {
  const title = String(draft.title || "").trim().slice(0, 50);
  const body = String(draft.body || "").trim().slice(0, 980);
  if (!title || !body) throw new Error("草稿标题或正文为空，不能保存到小红书");

  const titleInput = activePage.locator('input[placeholder*="\u6807\u9898"], input[placeholder*="\u8d5e"]').first();
  await titleInput.waitFor({ state: "visible", timeout: 60000 });
  await humanClick(activePage, titleInput);
  await titleInput.fill("");
  await humanDelay(1200, 2800);
  await activePage.keyboard.type(title, { delay: randomInt(90, 210) });
  await humanDelay(2800, 6200);

  const editor = activePage.locator('.ProseMirror[contenteditable="true"], [contenteditable="true"]').first();
  await editor.waitFor({ state: "visible", timeout: 30000 });
  await humanClick(activePage, editor);
  await activePage.keyboard.press("Control+A").catch(() => {});
  await humanDelay(900, 2200);
  await typeTextInChunks(activePage, body);
  await humanDelay(4200, 9200);
}

async function clickSaveDraft(activePage) {
  const saveButton = activePage.locator("button").filter({ hasText: SAVE_DRAFT_TEXT }).first();
  await saveButton.waitFor({ state: "visible", timeout: 60000 });
  const buttonText = (await saveButton.innerText()).replace(/\s+/g, "").trim();
  if (buttonText !== SAVE_DRAFT_TEXT) {
    throw new Error("未找到明确的暂存离开按钮，已停止以避免误操作发布");
  }

  await humanScroll(activePage, 120, 320);
  await humanDelay(7200, 14800);
  await humanClick(activePage, saveButton);
  await activePage.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
  await humanDelay(9000, 16000);

  const bodyText = await readBodyText(activePage);
  const blockingHint = PUBLISH_ERROR_HINTS.find((hint) => bodyText.includes(hint));
  if (blockingHint) {
    throw new Error(`小红书暂存后返回校验提示：${blockingHint}`);
  }
  if (!SAVE_SUCCESS_HINTS.some((hint) => bodyText.includes(hint))) {
    throw new Error("已点击暂存离开，但未识别到保存成功或草稿箱结果");
  }

  return "已点击小红书“暂存离开”，未触碰发布按钮；网页草稿保存在本机持久浏览器 profile";
}

async function saveDebugSnapshot(activePage, label) {
  if (!activePage) return;
  await mkdir(debugDir, { recursive: true });
  await activePage.screenshot({ path: path.join(debugDir, `${label}.png`), fullPage: true }).catch(() => {});
  await writeFile(path.join(debugDir, `${label}.html`), await activePage.content(), "utf8").catch(() => {});
}

async function readBodyText(activePage) {
  return activePage.evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " "));
}

async function typeTextInChunks(activePage, text) {
  const paragraphs = text.split(/(\n+)/);
  for (const paragraph of paragraphs) {
    if (!paragraph) continue;
    if (/^\n+$/.test(paragraph)) {
      for (let index = 0; index < paragraph.length; index += 1) {
        await activePage.keyboard.press("Enter");
        await humanDelay(420, 1100);
      }
      continue;
    }

    for (let index = 0; index < paragraph.length; index += randomInt(5, 12)) {
      const chunk = paragraph.slice(index, index + randomInt(5, 12));
      await activePage.keyboard.type(chunk, { delay: randomInt(55, 160) });
      await humanDelay(260, 1100);
    }
  }
}

async function humanClick(activePage, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox().catch(() => null);
  if (!box) {
    await locator.click({ force: true });
    return;
  }
  await humanClickAt(activePage, box.x + box.width / 2, box.y + box.height / 2);
}

async function humanClickAt(activePage, x, y) {
  await activePage.mouse.move(x + randomInt(-18, 18), y + randomInt(-14, 14), { steps: randomInt(10, 18) });
  await humanDelay(180, 520);
  await activePage.mouse.move(x + randomInt(-4, 4), y + randomInt(-3, 3), { steps: randomInt(6, 12) });
  await humanDelay(260, 780);
  await activePage.mouse.down();
  await humanDelay(130, 360);
  await activePage.mouse.up();
}

async function humanScroll(activePage, minDelta, maxDelta) {
  await activePage.mouse.wheel(randomInt(-18, 18), randomInt(minDelta, maxDelta)).catch(() => {});
}

async function humanDelay(minMs, maxMs) {
  await new Promise((resolve) => setTimeout(resolve, randomInt(minMs, maxMs)));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function closeBrowserAndExit() {
  await context?.close().catch(() => {});
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
