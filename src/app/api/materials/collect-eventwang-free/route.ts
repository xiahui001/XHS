import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { buildEventwangPartialStatus, countEventwangDuplicateSkips } from "@/lib/collectors/eventwang-fallback";
import { readEventwangImagePool } from "@/lib/collectors/eventwang-image-pool";
import { getEventwangUsabilityError } from "@/lib/collectors/eventwang-usability";
import { fail, ok, parseJson } from "@/lib/http";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

const EVENTWANG_QUOTA_EXHAUSTED_CODE = "EVENTWANG_GALLERY_DAILY_QUOTA_EXHAUSTED";
const EVENTWANG_QUOTA_EXHAUSTED_MESSAGE = "活动汪下载原图权益当前不可用，接口返回超出权益次数；请检查账号原图下载权益或稍后再试。";

const schema = z.object({
  accountId: z.string().optional(),
  keyword: z.string().min(1),
  keywordAlternates: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(60).optional(),
  maxCandidates: z.number().int().min(6).max(120).optional(),
  quickMode: z.boolean().optional(),
  poolOnly: z.boolean().optional()
});

type EventwangCollectInput = z.infer<typeof schema>;

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
  partialSuccess?: boolean;
  targetImageCount?: number;
  duplicateSkipCount?: number;
  fallbackKeywordsUsed?: string[];
  source?: "eventwang_live" | "image_pool" | "mixed";
  liveImageCount?: number;
  poolImageCount?: number;
  quotaFallback?: boolean;
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
  let quotaFallbackContext: {
    input: EventwangCollectInput;
    searchTerms: string[];
    attempts: EventwangCollectAttempt[];
    limit: number;
  } | null = null;

  try {
    const input = await parseJson(request, schema);
    const scriptPath = path.join(process.cwd(), "scripts", "collect-eventwang-free-keyword.mjs");
    const attempts: EventwangCollectAttempt[] = [];
    const searchTerms = normalizeSearchTerms(input.keyword, input.keywordAlternates).slice(0, input.quickMode ? 6 : 8);
    const baseCandidateCount = Math.max(input.maxCandidates ?? 12, input.limit ?? 6);
    const candidatePlan = input.quickMode
      ? uniqueNumbers([baseCandidateCount, Math.min(120, Math.max(baseCandidateCount * 2, input.limit ?? 6))])
      : [baseCandidateCount, Math.min(120, Math.max(baseCandidateCount, 18)), 120];
    const limit = input.limit ?? 6;
    quotaFallbackContext = { input, searchTerms, attempts, limit };
    if (input.poolOnly) {
      return ok(await buildEventwangPoolOnlyResult(input, searchTerms, limit));
    }
    let bestResult: EventwangGallerySummary | null = null;
    let aggregateResult: EventwangGallerySummary | null = null;
    let lastReason = "未找到可用的活动汪图库原图素材";

    for (const searchTerm of searchTerms) {
      for (const maxCandidates of candidatePlan) {
        const timeoutMs = input.quickMode ? 360000 : 900000;
        try {
          const { stdout } = await execFileAsync(
            process.execPath,
            [scriptPath, `--keyword=${searchTerm}`, `--limit=${limit}`, `--maxCandidates=${maxCandidates}`, "--fast=true"],
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
          aggregateResult = mergeEventwangResults(aggregateResult, result, input.keyword, searchTerms, limit);
          const usabilityError = getEventwangUsabilityError(aggregateResult, limit);
          lastReason = usabilityError || summarizeBlockingReason(result);
          attempts.push({
            attempt: attempts.length + 1,
            maxCandidates,
            timeoutMs,
            status: result.selectedCount > 0 ? "success" : "empty",
            selectedCount: result.selectedCount,
            imageCount: result.imageCount,
            styleBucketCount: result.styleBucketCount,
            reason: buildAttemptReason(searchTerm, aggregateResult.imageCount, limit, Boolean(usabilityError), result.selectedCount, lastReason)
          });
          if (!usabilityError) {
            return ok(finalizeEventwangResult(aggregateResult, attempts, input.keyword, searchTerms, limit, null));
          }
        } catch (error) {
          if (isEventwangQuotaExhaustedError(error)) {
            attempts.push({
              attempt: attempts.length + 1,
              maxCandidates,
              timeoutMs,
              status: "failed",
              selectedCount: 0,
              imageCount: 0,
              styleBucketCount: 0,
              reason: `搜索词“${searchTerm}”：${EVENTWANG_QUOTA_EXHAUSTED_MESSAGE}`
            });
            const fallbackResult = await buildEventwangQuotaFallbackResult(input, searchTerms, attempts, limit);
            if (fallbackResult) return ok(fallbackResult);
            return fail(EVENTWANG_QUOTA_EXHAUSTED_CODE, EVENTWANG_QUOTA_EXHAUSTED_MESSAGE, 429);
          }

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

    if (aggregateResult) {
      const poolBackfilledResult = await buildEventwangDraftImagePoolBackfillResult(
        input,
        searchTerms,
        aggregateResult,
        attempts,
        limit
      );
      if (poolBackfilledResult) return ok(poolBackfilledResult);

      const finalReason = buildEventwangPartialStatus({
        imageCount: aggregateResult.imageCount,
        targetCount: limit,
        duplicateSkipCount: countEventwangDuplicateSkips(aggregateResult.skipped),
        fallbackKeywordsUsed: resolveFallbackKeywordsUsed(aggregateResult, input.keyword)
      });

      return ok(finalizeEventwangResult(aggregateResult, attempts, input.keyword, searchTerms, limit, finalReason));
    }

    const finalResult = {
      ...(bestResult ?? emptySummary(input.keyword, Math.min(5, limit))),
      requestedKeyword: input.keyword,
      searchedTerms: searchTerms,
      attempts,
      blockingReason: lastReason
    };
    return fail("EVENTWANG_GALLERY_NOT_USABLE", getEventwangUsabilityError(finalResult, limit) || lastReason, 400);
  } catch (error) {
    if (isEventwangQuotaExhaustedError(error)) {
      if (quotaFallbackContext) {
        const fallbackResult = await buildEventwangQuotaFallbackResult(
          quotaFallbackContext.input,
          quotaFallbackContext.searchTerms,
          quotaFallbackContext.attempts,
          quotaFallbackContext.limit
        );
        if (fallbackResult) return ok(fallbackResult);
      }
      return fail(EVENTWANG_QUOTA_EXHAUSTED_CODE, EVENTWANG_QUOTA_EXHAUSTED_MESSAGE, 429);
    }

    return fail("EVENTWANG_GALLERY_COLLECT_FAILED", cleanError(error), 400);
  }
}

async function buildEventwangQuotaFallbackResult(
  input: EventwangCollectInput,
  searchTerms: string[],
  attempts: EventwangCollectAttempt[],
  limit: number
): Promise<EventwangGallerySummary | null> {
  if (!input.accountId) return null;

  const poolResult = await readEventwangImagePool({
    accountId: input.accountId,
    requestedKeyword: input.keyword,
    searchedTerms: searchTerms,
    limit,
    fallbackReason: "quota_exhausted"
  });

  return {
    ...poolResult,
    requestedKeyword: input.keyword,
    searchedTerms: searchTerms,
    keyword: input.keyword,
    attempts
  };
}

async function buildEventwangPoolOnlyResult(
  input: EventwangCollectInput,
  searchTerms: string[],
  limit: number
): Promise<EventwangGallerySummary> {
  const poolResult = await readEventwangImagePool({
    accountId: input.accountId,
    requestedKeyword: input.keyword,
    searchedTerms: searchTerms,
    limit,
    fallbackReason: "empty_live_result"
  });

  return {
    ...poolResult,
    requestedKeyword: input.keyword,
    searchedTerms: searchTerms,
    keyword: input.keyword,
    attempts: []
  };
}

async function buildEventwangDraftImagePoolBackfillResult(
  input: EventwangCollectInput,
  searchTerms: string[],
  liveResult: EventwangGallerySummary,
  attempts: EventwangCollectAttempt[],
  limit: number
): Promise<EventwangGallerySummary | null> {
  if (!input.accountId) return null;

  if (liveResult.imageCount >= limit) return null;

  const poolResult = await readEventwangImagePool({
    accountId: input.accountId,
    requestedKeyword: input.keyword,
    searchedTerms: searchTerms,
    limit: Math.max(1, limit - liveResult.imageCount),
    usedLocalPaths: liveResult.items.map((item) => item.localPath),
    fallbackReason: "empty_live_result"
  });
  const mergedResult = mergeEventwangResults(liveResult, poolResult, input.keyword, searchTerms, limit);
  const poolImageCount = mergedResult.imageCount - liveResult.imageCount;

  if (poolImageCount <= 0 && liveResult.imageCount > 0) return null;

  return finalizeEventwangResult(
    {
      ...mergedResult,
      source: liveResult.imageCount > 0 && poolImageCount > 0 ? "mixed" : "image_pool",
      liveImageCount: liveResult.imageCount,
      poolImageCount,
      quotaFallback: false
    },
    attempts,
    input.keyword,
    searchTerms,
    limit,
    buildEventwangImagePoolBackfillStatus(liveResult.imageCount, poolImageCount, mergedResult.imageCount, limit)
  );
}

function buildEventwangImagePoolBackfillStatus(
  liveImageCount: number,
  poolImageCount: number,
  imageCount: number,
  targetCount: number
) {
  return `活动汪本次有效原图 ${liveImageCount}/${targetCount}，已从本地图片池补图 ${poolImageCount} 张，本次候选图 ${imageCount}/${targetCount}。`;
}

function parseScriptSummary(stdout: string): EventwangGallerySummary {
  const marker = stdout.split(/\r?\n/).find((line) => line.startsWith("EVENTWANG_FREE_KEYWORD_DONE "));
  if (!marker) throw new Error("脚本未返回活动汪图库采集结果");
  return JSON.parse(marker.replace("EVENTWANG_FREE_KEYWORD_DONE ", "")) as EventwangGallerySummary;
}

function mergeEventwangResults(
  current: EventwangGallerySummary | null,
  next: EventwangGallerySummary,
  requestedKeyword: string,
  searchedTerms: string[],
  limit: number
): EventwangGallerySummary {
  const existingItems = current?.items ?? [];
  const seen = new Set(existingItems.map((item) => eventwangItemKey(item)));
  const mergedItems = [...existingItems];

  for (const item of next.items) {
    if (mergedItems.length >= limit) break;
    const key = eventwangItemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    mergedItems.push(item);
  }

  return {
    ...(current ?? next),
    requestedKeyword,
    searchedTerms,
    keyword: requestedKeyword,
    selectedCount: mergedItems.length,
    imageCount: mergedItems.length,
    styleBucketCount: countDistinctStyleBuckets(mergedItems),
    requiredStyleBuckets: Math.min(5, limit),
    items: mergedItems,
    skipped: [...(current?.skipped ?? []), ...next.skipped]
  };
}

function finalizeEventwangResult(
  result: EventwangGallerySummary,
  attempts: EventwangCollectAttempt[],
  requestedKeyword: string,
  searchedTerms: string[],
  limit: number,
  blockingReason: string | null
): EventwangGallerySummary {
  return {
    ...result,
    requestedKeyword,
    searchedTerms,
    attempts,
    blockingReason,
    partialSuccess: result.imageCount < limit,
    targetImageCount: limit,
    duplicateSkipCount: countEventwangDuplicateSkips(result.skipped),
    fallbackKeywordsUsed: resolveFallbackKeywordsUsed(result, requestedKeyword),
    source: result.source ?? "eventwang_live",
    quotaFallback: result.quotaFallback
  };
}

function buildAttemptReason(
  searchTerm: string,
  aggregateImageCount: number,
  limit: number,
  needsMoreImages: boolean,
  selectedCount: number,
  lastReason: string
) {
  if (needsMoreImages) return `搜索词“${searchTerm}”：累计有效原图 ${aggregateImageCount}/${limit}`;
  if (selectedCount > 0) return `搜索词“${searchTerm}”已采集，累计有效原图 ${aggregateImageCount}/${limit}`;
  return `搜索词“${searchTerm}”：${lastReason}`;
}

function cleanError(error: unknown, quickMode = false) {
  const message = getEventwangErrorText(error) || "活动汪图库素材采集失败";
  if (isEventwangQuotaExhaustedText(message)) return EVENTWANG_QUOTA_EXHAUSTED_MESSAGE;
  if (message.includes(".auth/eventwang.json")) return "缺少 .auth/eventwang.json，请先人工登录活动汪";
  if (message.includes("timed out") || message.includes("timeout")) {
    return quickMode ? "本次图库采集超时，请重试当前步骤" : "本次图库采集超时，已进入下一次重试";
  }
  return message.split(/\r?\n/)[0] || "活动汪图库素材采集失败";
}

function isEventwangQuotaExhaustedError(error: unknown) {
  return isEventwangQuotaExhaustedText(getEventwangErrorText(error));
}

function isEventwangQuotaExhaustedText(text: string) {
  return (
    text.includes("EVENTWANG_GALLERY_DAILY_QUOTA_EXHAUSTED") ||
    text.includes("今日图库会员权益已用完") ||
    text.includes("请等待明天更新") ||
    (text.includes("权益已用完") && text.includes("图库"))
  );
}

function getEventwangErrorText(error: unknown) {
  if (!error) return "";
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  if (typeof error === "object") {
    const record = error as { stderr?: unknown; stdout?: unknown };
    if (typeof record.stderr === "string") parts.push(record.stderr);
    if (typeof record.stdout === "string") parts.push(record.stdout);
  }
  if (typeof error === "string") parts.push(error);
  return parts.join("\n");
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

function resolveFallbackKeywordsUsed(result: EventwangGallerySummary, requestedKeyword: string) {
  const primary = requestedKeyword.trim();
  const used = new Set(
    result.items
      .map((item) => extractKeywordFromLocalPath(item.localPath))
      .filter((keyword) => keyword && keyword !== primary)
  );

  return Array.from(used);
}

function extractKeywordFromLocalPath(localPath: string) {
  const normalized = localPath.replaceAll("\\", "/");
  const parts = normalized.split("/");
  const keywordDirIndex = parts.findIndex((part) => part.startsWith("keyword-"));
  if (keywordDirIndex >= 0) return parts[keywordDirIndex].replace(/^keyword-/, "");
  return parts.at(-3) ?? "";
}

function eventwangItemKey(item: EventwangGallerySummary["items"][number]) {
  return item.localPath || item.detailUrl || item.sourceUrl || item.galleryId;
}

function countDistinctStyleBuckets(items: EventwangGallerySummary["items"]) {
  return new Set(items.map((item) => item.styleBucket)).size;
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values));
}
