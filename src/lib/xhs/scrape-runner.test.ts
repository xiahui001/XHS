import { describe, expect, it } from "vitest";
import path from "node:path";
import { runXhsScrape, type XhsScrapeExec } from "./scrape-runner";

const cdpDone = (items = 1) =>
  `XHS_CDP_SCRAPE_DONE ${JSON.stringify({
    keyword: "年会舞台",
    searchUrl: "https://www.xiaohongshu.com/search_result?keyword=%E5%B9%B4%E4%BC%9A%E8%88%9E%E5%8F%B0",
    outputDir: "data/xhs-cdp-scrapes/run-1",
    itemCount: items,
    items: Array.from({ length: items }, (_, index) => ({
      id: `xhs-cdp-${index + 1}`,
      title: `热门文案 ${index + 1}`,
      content: `热门文案正文 ${index + 1}`,
      sourceUrl: `https://www.xiaohongshu.com/explore/${index + 1}`,
      imageUrls: [],
      scrapedAt: "2026-05-07T12:00:00.000Z"
    }))
  })}\n`;

const fallbackDone = `XHS_SCRAPE_DONE ${JSON.stringify({
  keyword: "年会舞台",
  searchUrl: "https://www.xiaohongshu.com/search_result?keyword=%E5%B9%B4%E4%BC%9A%E8%88%9E%E5%8F%B0",
  outputDir: "data/xhs-scrapes/run-1",
  itemCount: 1,
  items: [
    {
      id: "xhs-1",
      title: "备用文案",
      content: "备用文案正文",
      sourceUrl: "https://www.xiaohongshu.com/explore/fallback",
      imageUrls: [],
      scrapedAt: "2026-05-07T12:00:00.000Z"
    }
  ]
})}\n`;

describe("runXhsScrape", () => {
  it("uses the CDP browser worker before the storageState fallback", async () => {
    const calls: string[][] = [];
    const execFileAsync: XhsScrapeExec = async (_file, args) => {
      calls.push(args);
      return { stdout: cdpDone(1) };
    };

    const result = await runXhsScrape(
      { keyword: "年会舞台", limit: 3 },
      { execFileAsync, cwd: "C:/workspace", nodePath: "node", cdpUrl: "http://127.0.0.1:9222" }
    );

    expect(result.strategy).toBe("cdp");
    expect(result.itemCount).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].some((arg) => arg.endsWith(path.join("scripts", "scrape-xhs-cdp.mjs")))).toBe(true);
    expect(calls[0]).toContain("--cdp-url=http://127.0.0.1:9222");
  });

  it("keeps a long timeout for CDP click-through scraping with human pauses", async () => {
    let timeoutMs = 0;
    const execFileAsync: XhsScrapeExec = async (_file, _args, options) => {
      timeoutMs = options.timeout;
      return { stdout: cdpDone(1) };
    };

    await runXhsScrape(
      { keyword: "å¹´ä¼šèˆžå°", limit: 3 },
      { execFileAsync, cwd: "C:/workspace", nodePath: "node", cdpUrl: "http://127.0.0.1:9222" }
    );

    expect(timeoutMs).toBeGreaterThanOrEqual(720_000);
  });

  it("falls back to the current storageState scraper when CDP is unavailable", async () => {
    const calls: string[][] = [];
    const execFileAsync: XhsScrapeExec = async (_file, args) => {
      calls.push(args);
      if (args.some((arg) => arg.endsWith(path.join("scripts", "scrape-xhs-cdp.mjs")))) {
        const error = new Error("connect ECONNREFUSED 127.0.0.1:9222") as Error & { stdout?: string };
        error.stdout = "";
        throw error;
      }
      return { stdout: fallbackDone };
    };

    const result = await runXhsScrape(
      { keyword: "年会舞台", keywordAlternates: ["年会布置"], limit: 3 },
      { execFileAsync, cwd: "C:/workspace", nodePath: "node", cdpUrl: "http://127.0.0.1:9222" }
    );

    expect(result.strategy).toBe("storageState");
    expect(result.fallbackReason).toContain("CDP 浏览器不可用");
    expect(calls).toHaveLength(2);
    expect(calls[1].some((arg) => arg.endsWith(path.join("scripts", "scrape-xhs-keyword.mjs")))).toBe(true);
  });

  it("falls back when CDP returns no usable references", async () => {
    const calls: string[][] = [];
    const execFileAsync: XhsScrapeExec = async (_file, args) => {
      calls.push(args);
      if (args.some((arg) => arg.endsWith(path.join("scripts", "scrape-xhs-cdp.mjs")))) {
        return { stdout: cdpDone(0) };
      }
      return { stdout: fallbackDone };
    };

    const result = await runXhsScrape(
      { keyword: "年会舞台", limit: 1 },
      { execFileAsync, cwd: "C:/workspace", nodePath: "node", cdpUrl: "http://127.0.0.1:9222" }
    );

    expect(result.strategy).toBe("storageState");
    expect(result.fallbackReason).toBe("CDP 未返回可用热门文案，已切换到 storageState 备用采集");
    expect(calls).toHaveLength(2);
  });

  it("stops instead of falling back when CDP reports a platform blocker", async () => {
    const calls: string[][] = [];
    const execFileAsync: XhsScrapeExec = async (_file, args) => {
      calls.push(args);
      const error = new Error("blocked") as Error & { stdout?: string };
      error.stdout = "XHS_BLOCKED captcha_required\n";
      throw error;
    };

    await expect(
      runXhsScrape(
        { keyword: "年会舞台", limit: 3 },
        { execFileAsync, cwd: "C:/workspace", nodePath: "node", cdpUrl: "http://127.0.0.1:9222" }
      )
    ).rejects.toThrow("小红书触发验证或风控");

    expect(calls).toHaveLength(1);
  });
});
