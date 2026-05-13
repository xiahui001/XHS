import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

type EventwangImagePoolItem = {
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
};

type EventwangImagePoolSkipped = {
  galleryId: string;
  detailUrl: string;
  tagName: string;
  styleTag: string;
  styleBucket: string;
  reason: string;
};

type EventwangImagePoolManifest = {
  keyword?: unknown;
  galleryUrl?: unknown;
  outputDir?: unknown;
  items?: unknown;
};

export type EventwangImagePoolResult = {
  requestedKeyword?: string;
  searchedTerms?: string[];
  keyword: string;
  galleryUrl: string;
  outputDir: string;
  selectedCount: number;
  imageCount: number;
  styleBucketCount: number;
  requiredStyleBuckets: number;
  blockingReason: string;
  partialSuccess: boolean;
  targetImageCount: number;
  duplicateSkipCount: number;
  fallbackKeywordsUsed: string[];
  source: "image_pool";
  quotaFallback: boolean;
  items: EventwangImagePoolItem[];
  skipped: EventwangImagePoolSkipped[];
};

type ReadEventwangImagePoolOptions = {
  rootDir?: string;
  workspaceRoot?: string;
  accountId?: string;
  requestedKeyword?: string;
  searchedTerms?: string[];
  limit?: number;
  usedLocalPaths?: string[];
  fallbackReason?: "quota_exhausted" | "empty_live_result";
};

const EVENTWANG_IMAGE_POOL_SOURCE = "image_pool" as const;
const QUOTA_FALLBACK_REASON_PREFIX = "活动汪下载权益已用完，图片来自本地图片池。";
const EMPTY_RESULT_FALLBACK_REASON_PREFIX = "活动汪本次没抓到足够可用原图，已从本地图片池补图。";
const DEFAULT_EVENTWANG_POOL_ROOT = path.join(process.cwd(), "data", "eventwang-gallery");

const ACCOUNT_KEYWORD_HINTS: Record<string, string[]> = {
  A1: ["美业", "大健康", "微商", "私域", "招商", "沙龙", "会销", "医美"],
  A2: ["校园", "学校", "毕业", "开学", "校庆", "中小学", "高校", "宣讲", "晚会", "运动会", "艺术节", "迎新"],
  A3: ["工地", "建筑", "开放日", "工程", "楼盘", "地产", "交付", "发布会", "展会"],
  A4: ["商场", "商超", "商业", "美陈", "快闪", "市集", "节日", "DP", "dp"],
  A5: ["年会", "团建", "答谢", "周年", "企业"]
};

export async function readEventwangImagePool(options: ReadEventwangImagePoolOptions = {}): Promise<EventwangImagePoolResult> {
  const limit = Math.max(1, options.limit ?? 12);
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.env.EVENTWANG_IMAGE_POOL_WORKSPACE_ROOT ?? process.cwd());
  const rootDir = path.resolve(options.rootDir ?? process.env.EVENTWANG_IMAGE_POOL_ROOT ?? DEFAULT_EVENTWANG_POOL_ROOT);
  const requestedKeyword = options.requestedKeyword?.trim() || "";
  const quotaFallback = options.fallbackReason !== "empty_live_result";
  const searchedTerms = options.searchedTerms?.filter(Boolean) ?? (requestedKeyword ? [requestedKeyword] : []);
  const allowedAccountId = normalizeAccountId(options.accountId);
  const manifests = await findManifestFiles(rootDir);
  const manifestEntries = [];
  const selected: EventwangImagePoolItem[] = [];
  const skipped: EventwangImagePoolSkipped[] = [];
  const seenKeys = new Set(options.usedLocalPaths?.map((localPath) => normalizePathKey(localPath)) ?? []);
  const usedKeywords = new Set<string>();

  for (const manifestPath of manifests) {
    const manifest = await readManifest(manifestPath);
    if (!manifest) continue;

    const keyword = resolveManifestKeyword(manifest, manifestPath);
    if (allowedAccountId && !inferEventwangImagePoolAccountIds(keyword).includes(allowedAccountId)) continue;
    manifestEntries.push({
      manifest,
      manifestPath,
      keyword,
      relevanceScore: scoreManifestKeyword(keyword, requestedKeyword, searchedTerms)
    });
  }

  manifestEntries.sort((left, right) => {
    if (right.relevanceScore !== left.relevanceScore) return right.relevanceScore - left.relevanceScore;
    return right.manifestPath.localeCompare(left.manifestPath);
  });

  for (const { manifest, manifestPath, keyword } of manifestEntries) {
    if (selected.length >= limit) break;

    const items = Array.isArray(manifest.items) ? manifest.items : [];
    for (const rawItem of items) {
      if (selected.length >= limit) break;
      const item = normalizeManifestItem(rawItem, keyword, selected.length);
      if (!item.localPath) continue;

      const existingLocalPath = await resolveExistingLocalPath(item.localPath, workspaceRoot, manifestPath);
      if (!existingLocalPath) {
        skipped.push(toSkippedItem(item, "本地图片池文件缺失"));
        continue;
      }

      const normalizedLocalPath = normalizeResponseLocalPath(item.localPath, existingLocalPath, workspaceRoot);
      const duplicateKey = eventwangPoolItemKey({ ...item, localPath: normalizedLocalPath });
      if (seenKeys.has(duplicateKey)) {
        skipped.push(toSkippedItem(item, "本地图片池重复图"));
        continue;
      }

      seenKeys.add(duplicateKey);
      usedKeywords.add(keyword);
      selected.push({
        ...item,
        localPath: normalizedLocalPath,
        downloadFilename: item.downloadFilename || path.basename(existingLocalPath)
      });
    }
  }

  const outputDir = toPortablePath(path.relative(workspaceRoot, rootDir)) || "data/eventwang-gallery";
  const fallbackKeywordsUsed = Array.from(usedKeywords).filter((keyword) => keyword && keyword !== requestedKeyword);

  return {
    requestedKeyword: requestedKeyword || undefined,
    searchedTerms,
    keyword: requestedKeyword || allowedAccountId || "本地图片池",
    galleryUrl: "local://eventwang-image-pool",
    outputDir,
    selectedCount: selected.length,
    imageCount: selected.length,
    styleBucketCount: countDistinctStyleBuckets(selected),
    requiredStyleBuckets: Math.min(5, limit),
    blockingReason: buildEventwangImagePoolBlockingReason(selected.length, limit, skipped.length, quotaFallback),
    partialSuccess: selected.length < limit,
    targetImageCount: limit,
    duplicateSkipCount: skipped.filter((item) => item.reason.includes("重复")).length,
    fallbackKeywordsUsed,
    source: EVENTWANG_IMAGE_POOL_SOURCE,
    quotaFallback,
    items: selected,
    skipped
  };
}

export function inferEventwangImagePoolAccountIds(keyword: string): string[] {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) return [];

  return Object.entries(ACCOUNT_KEYWORD_HINTS)
    .filter(([, hints]) => hints.some((hint) => normalizedKeyword.includes(normalizeKeyword(hint))))
    .map(([accountId]) => accountId);
}

function buildEventwangImagePoolBlockingReason(
  imageCount: number,
  targetCount: number,
  skippedCount: number,
  quotaFallback: boolean
) {
  const prefix = quotaFallback ? QUOTA_FALLBACK_REASON_PREFIX : EMPTY_RESULT_FALLBACK_REASON_PREFIX;
  return `${prefix}本次有效原图 ${imageCount}/${targetCount}，已跳过本地重复或缺失图 ${skippedCount} 张。`;
}

async function findManifestFiles(rootDir: string) {
  const rootStat = await stat(rootDir).catch(() => null);
  if (!rootStat?.isDirectory()) return [];

  const files: string[] = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === "manifest.json") {
        files.push(fullPath);
      }
    }
  }

  return files.sort((left, right) => right.localeCompare(left));
}

async function readManifest(manifestPath: string): Promise<EventwangImagePoolManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function resolveManifestKeyword(manifest: EventwangImagePoolManifest, manifestPath: string) {
  const keyword = typeof manifest.keyword === "string" ? manifest.keyword.trim() : "";
  if (keyword) return keyword;

  const keywordDir = manifestPath
    .split(path.sep)
    .find((part) => part.startsWith("keyword-"));
  return keywordDir?.replace(/^keyword-/, "") ?? "";
}

function scoreManifestKeyword(keyword: string, requestedKeyword: string, searchedTerms: string[]) {
  const normalizedKeyword = normalizeKeyword(keyword);
  const normalizedRequestedKeyword = normalizeKeyword(requestedKeyword);
  const normalizedTerms = [normalizedRequestedKeyword, ...searchedTerms.map(normalizeKeyword)].filter(Boolean);
  let score = 0;

  normalizedTerms.forEach((term, index) => {
    if (!term) return;
    const weight = Math.max(1, 100 - index);
    if (normalizedKeyword === term) {
      score = Math.max(score, 1000 + weight);
    } else if (normalizedKeyword.includes(term) || term.includes(normalizedKeyword)) {
      score = Math.max(score, 700 + weight);
    }
  });

  return score;
}

function normalizeManifestItem(rawItem: unknown, keyword: string, fallbackIndex: number): EventwangImagePoolItem {
  const record = isRecord(rawItem) ? rawItem : {};
  const localPath = asString(record.localPath);
  const galleryId = asString(record.galleryId) || localPath || `${keyword}-${fallbackIndex}`;
  const detailUrl = asString(record.detailUrl);
  const styleTag = asString(record.styleTag) || asString(record.tagName) || keyword || "本地图片池";

  return {
    galleryId,
    ownerId: asString(record.ownerId),
    resultIndex: asNumber(record.resultIndex, fallbackIndex),
    tagName: asString(record.tagName) || styleTag,
    styleTag,
    styleBucket: asString(record.styleBucket) || styleTag,
    detailUrl,
    sourceUrl: asString(record.sourceUrl) || detailUrl,
    previewUrl: asNullableString(record.previewUrl),
    localPath,
    downloadFilename: asString(record.downloadFilename)
  };
}

async function resolveExistingLocalPath(localPath: string, workspaceRoot: string, manifestPath: string) {
  const candidates = [
    path.isAbsolute(localPath) ? localPath : path.resolve(workspaceRoot, localPath),
    path.resolve(path.dirname(manifestPath), localPath)
  ];

  for (const candidate of candidates) {
    const fileStat = await stat(candidate).catch(() => null);
    if (fileStat?.isFile()) return candidate;
  }

  return null;
}

function normalizeResponseLocalPath(originalLocalPath: string, absoluteLocalPath: string, workspaceRoot: string) {
  if (!path.isAbsolute(originalLocalPath)) return toPortablePath(originalLocalPath);

  const relativePath = path.relative(workspaceRoot, absoluteLocalPath);
  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) return toPortablePath(relativePath);
  return toPortablePath(originalLocalPath);
}

function eventwangPoolItemKey(item: Pick<EventwangImagePoolItem, "localPath" | "detailUrl" | "sourceUrl" | "galleryId">) {
  return (
    normalizePathKey(item.localPath) ||
    normalizePathKey(item.detailUrl) ||
    normalizePathKey(item.sourceUrl) ||
    normalizePathKey(item.galleryId)
  );
}

function toSkippedItem(item: EventwangImagePoolItem, reason: string): EventwangImagePoolSkipped {
  return {
    galleryId: item.galleryId,
    detailUrl: item.detailUrl,
    tagName: item.tagName,
    styleTag: item.styleTag,
    styleBucket: item.styleBucket,
    reason
  };
}

function normalizeAccountId(accountId: string | undefined) {
  const normalized = accountId?.trim().toUpperCase();
  return normalized && ACCOUNT_KEYWORD_HINTS[normalized] ? normalized : null;
}

function countDistinctStyleBuckets(items: EventwangImagePoolItem[]) {
  return new Set(items.map((item) => item.styleBucket)).size;
}

function normalizeKeyword(keyword: string) {
  return keyword.replace(/\s+/g, "").toLowerCase();
}

function normalizePathKey(value: string | undefined) {
  return toPortablePath(String(value ?? "").trim()).toLowerCase();
}

function toPortablePath(value: string) {
  return value.replace(/\\/g, "/");
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown) {
  const text = asString(value);
  return text || null;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
