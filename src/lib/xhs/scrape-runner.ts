import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { XhsReference } from "@/lib/xhs/types";

const execFileAsync = promisify(execFile);
const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
const SCRAPE_TIMEOUT_MS = 720_000;
const SCRAPE_MAX_BUFFER = 1024 * 1024 * 8;

export type XhsScrapeInput = {
  keyword: string;
  keywordAlternates?: string[];
  limit?: number;
};

export type XhsScrapeStrategy = "cdp" | "storageState";

export type XhsScrapeSummary = {
  requestedKeyword?: string;
  searchedTerms?: string[];
  keyword: string;
  outputDir: string;
  itemCount: number;
  items: XhsReference[];
  strategy: XhsScrapeStrategy;
  fallbackReason?: string;
};

export type XhsScrapeExec = (
  file: string,
  args: string[],
  options: {
    cwd: string;
    timeout: number;
    maxBuffer: number;
  }
) => Promise<{ stdout: string; stderr?: string }>;

type RunnerOptions = {
  execFileAsync?: XhsScrapeExec;
  cwd?: string;
  nodePath?: string;
  cdpUrl?: string;
};

export async function runXhsScrape(input: XhsScrapeInput, options: RunnerOptions = {}): Promise<XhsScrapeSummary> {
  const cwd = options.cwd ?? process.cwd();
  const exec = options.execFileAsync ?? (execFileAsync as XhsScrapeExec);
  const nodePath = options.nodePath ?? process.execPath;
  const cdpUrl = options.cdpUrl ?? process.env.XHS_CDP_URL ?? DEFAULT_CDP_URL;
  const limit = input.limit ?? 10;
  const searchTerms = normalizeSearchTerms(input.keyword, input.keywordAlternates).slice(0, 2);
  let bestResult: XhsScrapeSummary | null = null;
  let fallbackReason: string | undefined;
  let lastError: unknown = null;

  for (const searchTerm of searchTerms) {
    try {
      const result = await runScript(exec, nodePath, buildCdpArgs(searchTerm, limit, cdpUrl), cwd, "XHS_CDP_SCRAPE_DONE", "cdp");
      const summary = withRequestContext(result, input.keyword, searchTerms);
      if (!bestResult || summary.itemCount > bestResult.itemCount) bestResult = summary;
      if (summary.itemCount > 0) return summary;
    } catch (error) {
      lastError = error;
      const classification = classifyCdpFailure(error);
      if (classification.kind === "blocked") {
        throw new Error(`小红书触发验证或风控：${classification.detail}。已停止采集，未切换备用方案。`);
      }
      fallbackReason = classification.detail;
      break;
    }
  }

  if (!fallbackReason && bestResult?.strategy === "cdp" && bestResult.itemCount === 0) {
    fallbackReason = "CDP 未返回可用热门文案，已切换到 storageState 备用采集";
  }

  for (const searchTerm of searchTerms) {
    try {
      const result = await runScript(
        exec,
        nodePath,
        buildStorageStateArgs(searchTerm, limit),
        cwd,
        "XHS_SCRAPE_DONE",
        "storageState"
      );
      const summary = {
        ...withRequestContext(result, input.keyword, searchTerms),
        fallbackReason
      };
      if (!bestResult || summary.itemCount > bestResult.itemCount) bestResult = summary;
      if (summary.itemCount > 0) return summary;
    } catch (error) {
      lastError = error;
    }
  }

  if (bestResult) return bestResult;
  throw lastError ?? new Error("小红书采集失败");
}

async function runScript(
  exec: XhsScrapeExec,
  nodePath: string,
  args: string[],
  cwd: string,
  marker: string,
  strategy: XhsScrapeStrategy
): Promise<XhsScrapeSummary> {
  const { stdout } = await exec(nodePath, args, {
    cwd,
    timeout: SCRAPE_TIMEOUT_MS,
    maxBuffer: SCRAPE_MAX_BUFFER
  });
  return {
    ...parseScriptSummary(stdout, marker),
    strategy
  };
}

function buildCdpArgs(keyword: string, limit: number, cdpUrl: string) {
  return [
    path.join("scripts", "scrape-xhs-cdp.mjs"),
    `--keyword=${keyword}`,
    `--limit=${limit}`,
    `--cdp-url=${cdpUrl}`
  ];
}

function buildStorageStateArgs(keyword: string, limit: number) {
  return [path.join("scripts", "scrape-xhs-keyword.mjs"), `--keyword=${keyword}`, `--limit=${limit}`];
}

function withRequestContext(summary: XhsScrapeSummary, requestedKeyword: string, searchedTerms: string[]) {
  return {
    ...summary,
    requestedKeyword,
    searchedTerms
  };
}

function parseScriptSummary(stdout: string, markerName: string): Omit<XhsScrapeSummary, "strategy"> {
  const marker = stdout.split(/\r?\n/).find((line) => line.startsWith(`${markerName} `));
  if (!marker) throw new Error("脚本未返回小红书采集结果");
  return JSON.parse(marker.replace(`${markerName} `, "")) as Omit<XhsScrapeSummary, "strategy">;
}

function classifyCdpFailure(error: unknown): { kind: "blocked" | "fallback"; detail: string } {
  const text = errorText(error);
  const blocker = text.match(/XHS_BLOCKED\s+([^\s]+)/);
  if (blocker?.[1]) return { kind: "blocked", detail: blocker[1] };

  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED|connect.*127\.0\.0\.1:9222|CDP.*unavailable/i.test(text)) {
    return { kind: "fallback", detail: "CDP 浏览器不可用，已切换到 storageState 备用采集" };
  }

  return { kind: "fallback", detail: `CDP 采集失败，已切换到 storageState 备用采集：${firstLine(text)}` };
}

function errorText(error: unknown) {
  const maybeError = error as { stdout?: string; stderr?: string; message?: string };
  return [maybeError.stdout, maybeError.stderr, maybeError.message]
    .filter(Boolean)
    .join("\n");
}

function firstLine(value: string) {
  return value.split(/\r?\n/).find(Boolean) || "未知错误";
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
