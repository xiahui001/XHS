import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { getEventwangUsabilityError } from "@/lib/collectors/eventwang-usability";
import { fail, ok, parseJson } from "@/lib/http";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

const schema = z.object({
  keyword: z.string().min(1),
  keywordAlternates: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(12).optional(),
  maxCandidates: z.number().int().min(6).max(24).optional(),
  quickMode: z.boolean().optional()
});

type EventwangCollectAttempt = {
  attempt: number;
  maxCandidates: number;
  timeoutMs: number;
  status: "success" | "empty" | "failed";
  selectedCount: number;
  imageCount: number;
  styleBucketCount: number;
  reason: string;
};

type EventwangGallerySummary = {
  requestedKeyword?: string;
  searchedTerms?: string[];
  keyword: string;
  galleryUrl: string;
  outputDir: string;
  selectedCount: number;
  imageCount: number;
  styleBucketCount: number;
  requiredStyleBuckets: number;
  attempts?: EventwangCollectAttempt[];
  blockingReason?: string | null;
  items: Array<{
    galleryId: string;
    ownerId: string;
    resultIndex: number;
    tagName: string;
    styleTag: string;
    styleBucket: string;
    detailUrl: string;
    sourceUrl: string;
    previewUrl: string | null;
    localPath: string;
    downloadFilename: string;
  }>;
  skipped: Array<{
    galleryId: string;
    detailUrl: string;
    tagName: string;
    styleTag: string;
    styleBucket: string;
    reason: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const scriptPath = path.join(process.cwd(), "scripts", "collect-eventwang-free-keyword.mjs");
    const attempts: EventwangCollectAttempt[] = [];
    const searchTerms = normalizeSearchTerms(input.keyword, input.keywordAlternates).slice(0, input.quickMode ? 2 : 3);
    const candidatePlan = input.quickMode
      ? [Math.max(input.maxCandidates ?? 12, input.limit ?? 6)]
      : [
          Math.max(input.maxCandidates ?? 12, input.limit ?? 6),
          Math.min(24, Math.max(input.maxCandidates ?? 12, 18)),
          24
        ];
    const limit = input.limit ?? 6;
    let bestResult: EventwangGallerySummary | null = null;
    let lastReason = "未找到满足五种以上风格的活动汪图库原图素材";

    for (const searchTerm of searchTerms) {
      for (const maxCandidates of candidatePlan) {
        const timeoutMs = input.quickMode ? 360000 : 900000;
        try {
          const { stdout } = await execFileAsync(
            process.execPath,
            [scriptPath, `--keyword=${searchTerm}`, `--limit=${limit}`, `--maxCandidates=${maxCandidates}`],
            {
              cwd: process.cwd(),
              timeout: timeoutMs,
              maxBuffer: 1024 * 1024 * 12
            }
          );
          const result = {
            ...parseScriptSummary(stdout),
            requestedKeyword: input.keyword,
            searchedTerms: searchTerms
          };
          bestResult = pickBetterResult(bestResult, result);
          lastReason = summarizeBlockingReason(result);
          attempts.push({
            attempt: attempts.length + 1,
            maxCandidates,
            timeoutMs,
            status: result.selectedCount > 0 ? "success" : "empty",
            selectedCount: result.selectedCount,
            imageCount: result.imageCount,
            styleBucketCount: result.styleBucketCount,
            reason:
              result.selectedCount > 0
                ? `搜索词“${searchTerm}”已采集 ${result.styleBucketCount} 种风格`
                : `搜索词“${searchTerm}”：${lastReason}`
          });
          if (!getEventwangUsabilityError(result, limit)) {
            return ok({ ...result, attempts, blockingReason: null });
          }
        } catch (error) {
          lastReason = cleanError(error, input.quickMode);
          attempts.push({
            attempt: attempts.length + 1,
            maxCandidates,
            timeoutMs,
            status: "failed",
            selectedCount: 0,
            imageCount: 0,
            styleBucketCount: 0,
            reason: `搜索词“${searchTerm}”：${lastReason}`
          });
        }
      }
    }

    const finalResult = {
      ...(bestResult ?? emptySummary(input.keyword, Math.min(5, limit))),
      requestedKeyword: input.keyword,
      searchedTerms: searchTerms,
      attempts,
      blockingReason: lastReason
    };
    return fail(
      "EVENTWANG_GALLERY_NOT_USABLE",
      getEventwangUsabilityError(finalResult, limit) || lastReason,
      400
    );
  } catch (error) {
    return fail("EVENTWANG_GALLERY_COLLECT_FAILED", cleanError(error), 400);
  }
}

function parseScriptSummary(stdout: string): EventwangGallerySummary {
  const marker = stdout.split(/\r?\n/).find((line) => line.startsWith("EVENTWANG_FREE_KEYWORD_DONE "));
  if (!marker) throw new Error("脚本未返回活动汪图库采集结果");
  return JSON.parse(marker.replace("EVENTWANG_FREE_KEYWORD_DONE ", "")) as EventwangGallerySummary;
}

function cleanError(error: unknown, quickMode = false) {
  const message = error instanceof Error ? error.message : "活动汪图库素材采集失败";
  if (message.includes(".auth/eventwang.json")) return "缺少 .auth/eventwang.json，请先人工登录活动汪";
  if (message.includes("timed out") || message.includes("timeout")) {
    return quickMode ? "本次图库采集超时，请重试当前步骤" : "本次图库采集超时，已进入下一次重试";
  }
  return message.split(/\r?\n/)[0] || "活动汪图库素材采集失败";
}

function pickBetterResult(current: EventwangGallerySummary | null, next: EventwangGallerySummary) {
  if (!current) return next;
  if (next.styleBucketCount > current.styleBucketCount) return next;
  if (next.selectedCount > current.selectedCount) return next;
  if (next.imageCount > current.imageCount) return next;
  return current;
}

function summarizeBlockingReason(result: EventwangGallerySummary) {
  if (result.selectedCount > 0) return "已找到活动汪图库原图素材";
  const reasons = result.skipped.map((item) => item.reason).filter(Boolean);
  if (!reasons.length) return "图库搜索结果为空或未能触发“下载原图”";
  const counts = reasons.reduce<Record<string, number>>((acc, reason) => {
    acc[reason] = (acc[reason] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? reasons[0];
}

function emptySummary(keyword: string, requiredStyleBuckets: number): EventwangGallerySummary {
  return {
    keyword,
    galleryUrl: "https://www.eventwang.cn/Gallery",
    outputDir: "",
    selectedCount: 0,
    imageCount: 0,
    styleBucketCount: 0,
    requiredStyleBuckets,
    items: [],
    skipped: []
  };
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
