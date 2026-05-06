import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";
import type { XhsReference } from "@/lib/xhs/types";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

const schema = z.object({
  keyword: z.string().min(1),
  keywordAlternates: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(20).optional()
});

type ScrapeSummary = {
  requestedKeyword?: string;
  searchedTerms?: string[];
  keyword: string;
  outputDir: string;
  itemCount: number;
  items: XhsReference[];
};

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const scriptPath = path.join(process.cwd(), "scripts", "scrape-xhs-keyword.mjs");
    const limit = input.limit ?? 10;
    const searchTerms = normalizeSearchTerms(input.keyword, input.keywordAlternates).slice(0, 2);
    let bestResult: ScrapeSummary | null = null;
    let lastError: unknown = null;

    for (const searchTerm of searchTerms) {
      try {
        const { stdout } = await execFileAsync(
          process.execPath,
          [scriptPath, `--keyword=${searchTerm}`, `--limit=${limit}`],
          {
            cwd: process.cwd(),
            timeout: 300000,
            maxBuffer: 1024 * 1024 * 4
          }
        );
        const result = {
          ...parseScriptSummary(stdout),
          requestedKeyword: input.keyword,
          searchedTerms: searchTerms
        };
        if (!bestResult || result.itemCount > bestResult.itemCount) bestResult = result;
        if (result.itemCount > 0) return ok(result);
      } catch (error) {
        lastError = error;
      }
    }

    if (bestResult) return ok(bestResult);
    throw lastError ?? new Error("小红书采集失败");
  } catch (error) {
    return fail("XHS_SCRAPE_FAILED", cleanScrapeError(error), 400);
  }
}

function parseScriptSummary(stdout: string): ScrapeSummary {
  const marker = stdout.split(/\r?\n/).find((line) => line.startsWith("XHS_SCRAPE_DONE "));
  if (!marker) throw new Error("脚本未返回小红书采集结果");
  return JSON.parse(marker.replace("XHS_SCRAPE_DONE ", "")) as ScrapeSummary;
}

function cleanScrapeError(error: unknown) {
  const message = error instanceof Error ? error.message : "小红书采集失败";
  if (message.includes(".auth/xhs.json")) {
    return "缺少 .auth/xhs.json，请先由人工登录小红书并保存登录态";
  }
  return message.split(/\r?\n/)[0] || "小红书采集失败";
}

function normalizeSearchTerms(keyword: string, alternates: string[] | undefined) {
  const seen = new Set<string>();
  return [keyword, ...(alternates ?? [])]
    .map((term) => term.trim())
    .filter(Boolean)
    .filter((term) => {
      if (seen.has(term)) return false;
      seen.add(term);
      return true;
    });
}
