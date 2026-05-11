import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readEventwangImagePool, type EventwangImagePoolResult } from "@/lib/collectors/eventwang-image-pool";
import { assignEventwangImagesToDrafts, type DraftImageSource } from "@/lib/generation/draft-images";
import { fail, ok, parseJson } from "@/lib/http";
import {
  buildMobilePublishPackage,
  REQUIRED_MOBILE_PUBLISH_IMAGE_COUNT,
  type MobilePublishDraft,
  type MobilePublishPackage
} from "@/lib/publish/mobile-package";
import { resolveMobilePublishOrigin, type MobilePublishOrigin } from "@/lib/publish/public-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractEventwangLocalPath } from "@/lib/xhs/draft-images";

export const runtime = "nodejs";

const BUCKET = "xhs-mobile-publish-packages";
const EVENTWANG_ROOT = path.join(process.cwd(), "data", "eventwang-gallery");
const LOCAL_PACKAGE_ROOT = path.join(process.cwd(), "data", "mobile-publish-packages");

const imageSchema = z.object({
  prompt: z.string().optional(),
  url: z.string().optional(),
  localPath: z.string().optional()
});

const draftSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().optional(),
  accountName: z.string().optional(),
  topic: z.string().optional(),
  batchKeyword: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
  generatedImages: z.array(imageSchema).optional(),
  publishImages: z.array(imageSchema).optional()
});

const schema = z.object({
  draft: draftSchema
});

type UploadableImage = MobilePublishPackage["imageFiles"][number];
type SupabaseServerClient = NonNullable<ReturnType<typeof createSupabaseServerClient>>;
type StoredPackage = {
  publishPackage: MobilePublishPackage;
  packageDataUrl: string;
  storageProvider: "supabase" | "local" | "inline";
  bucket: string | null;
  storagePath: string;
  skippedImageCount: number;
  storageError?: string;
};
type MobilePublishPackageResponse = {
  packageId: string;
  packageUrl: string;
  packageDataUrl: string;
  deeplinkUrl: string;
  shareText: string;
  imageCount: number;
  imageUrls: string[];
  skippedImageCount: number;
  storageProvider: "supabase" | "local" | "inline";
  bucket: string | null;
  storagePath: string;
  storageError?: string;
  phoneScanReady: boolean;
  shareReady: boolean;
  publicAccessWarning: string | null;
  createdAt: string;
};
type StorePackageResult =
  | { kind: "stored"; storedPackage: StoredPackage }
  | { kind: "remote"; data: MobilePublishPackageResponse };
type StorePackageFallbackOptions = {
  input: z.infer<typeof schema>;
  publicOrigin: MobilePublishOrigin;
  localOrigin: MobilePublishOrigin;
  allowPublicFallback: boolean;
};

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const packageId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeSegment(input.draft.id)}`;
    const draftForPackage = await backfillDraftImagesFromPool(input.draft);
    const basePackage = buildMobilePublishPackage(draftForPackage, packageId);
    const publicOrigin = resolveMobilePublishOrigin({
      requestUrl: request.url,
      appPublicUrl: process.env.APP_PUBLIC_URL,
      nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
      vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      vercelUrl: process.env.VERCEL_URL,
      getHeader: (name) => request.headers.get(name)
    });
    const localOrigin = resolveMobilePublishOrigin({
      requestUrl: request.url,
      appPublicUrl: null,
      nextPublicAppUrl: null,
      vercelProjectProductionUrl: null,
      vercelUrl: null,
      getHeader: (name) => request.headers.get(name)
    });
    const storeResult = await storePackageWithFallback(basePackage, packageId, localOrigin.origin, {
      input,
      publicOrigin,
      localOrigin,
      allowPublicFallback: request.headers.get("x-mobile-publish-forwarded") !== "1"
    });
    if (storeResult.kind === "remote") return ok(storeResult.data);

    const storedPackage = storeResult.storedPackage;
    const responseOrigin = storedPackage.storageProvider === "local" ? localOrigin : publicOrigin;
    const packageUrl = buildAppPackageUrl(responseOrigin.origin, packageId, storedPackage.packageDataUrl);

    return ok({
      packageId,
      packageUrl,
      packageDataUrl: storedPackage.packageDataUrl,
      deeplinkUrl: storedPackage.publishPackage.deeplinkUrl,
      shareText: storedPackage.publishPackage.shareText,
      imageCount: storedPackage.publishPackage.imageUrls.length,
      imageUrls: storedPackage.publishPackage.imageUrls,
      skippedImageCount: storedPackage.skippedImageCount,
      storageProvider: storedPackage.storageProvider,
      bucket: storedPackage.bucket,
      storagePath: storedPackage.storagePath,
      storageError: storedPackage.storageError,
      phoneScanReady: responseOrigin.phoneScanReady,
      shareReady: responseOrigin.shareReady,
      publicAccessWarning: buildPublicAccessWarning(responseOrigin.warning, storedPackage),
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    return fail(
      "MOBILE_PACKAGE_CREATE_FAILED",
      error instanceof Error ? error.message : "手机发布包生成失败",
      400
    );
  }
}

async function storePackageWithFallback(
  basePackage: MobilePublishPackage,
  packageId: string,
  origin: string,
  fallbackOptions: StorePackageFallbackOptions
): Promise<StorePackageResult> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return storeFallbackPackage(
      basePackage,
      packageId,
      origin,
      new Error("Supabase server client is not configured"),
      fallbackOptions
    );
  }

  try {
    return {
      kind: "stored",
      storedPackage: await storeSupabasePackage(basePackage, packageId, supabase)
    };
  } catch (error) {
    return storeFallbackPackage(basePackage, packageId, origin, error, fallbackOptions);
  }
}

async function storeFallbackPackage(
  basePackage: MobilePublishPackage,
  packageId: string,
  origin: string,
  storageError: unknown,
  fallbackOptions: StorePackageFallbackOptions
): Promise<StorePackageResult> {
  const remotePackage = await createPackageOnPublicOrigin(fallbackOptions);
  if (remotePackage) {
    return { kind: "remote", data: remotePackage };
  }

  const inlinePackage = createInlinePublicPackage(basePackage, packageId, storageError, fallbackOptions);
  if (inlinePackage) {
    return { kind: "remote", data: inlinePackage };
  }

  return {
    kind: "stored",
    storedPackage: await storeLocalPackage(basePackage, packageId, origin, storageError)
  };
}

async function createPackageOnPublicOrigin({
  input,
  publicOrigin,
  localOrigin,
  allowPublicFallback
}: StorePackageFallbackOptions): Promise<MobilePublishPackageResponse | null> {
  if (!allowPublicFallback || !publicOrigin.phoneScanReady || publicOrigin.origin === localOrigin.origin) {
    return null;
  }

  try {
    const response = await fetch(`${publicOrigin.origin}/api/mobile-publish-packages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mobile-publish-forwarded": "1"
      },
      body: JSON.stringify(input),
      cache: "no-store"
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { ok?: boolean; data?: MobilePublishPackageResponse };
    return payload.ok && payload.data?.packageUrl ? payload.data : null;
  } catch {
    return null;
  }
}

function createInlinePublicPackage(
  basePackage: MobilePublishPackage,
  packageId: string,
  storageError: unknown,
  { publicOrigin, localOrigin }: StorePackageFallbackOptions
): MobilePublishPackageResponse | null {
  if (!publicOrigin.phoneScanReady || publicOrigin.origin === localOrigin.origin) return null;

  const portableImages = basePackage.imageFiles.filter((image) => isPublicHttpUrl(image.url));
  const publishPackage: MobilePublishPackage = {
    ...basePackage,
    imageFiles: portableImages,
    imageUrls: portableImages.map((image) => image.url)
  };
  const packageDataUrl = buildInlinePackageDataUrl(publishPackage);

  return {
    packageId,
    packageUrl: buildAppPackageUrl(publicOrigin.origin, packageId, packageDataUrl),
    packageDataUrl,
    deeplinkUrl: publishPackage.deeplinkUrl,
    shareText: publishPackage.shareText,
    imageCount: publishPackage.imageUrls.length,
    imageUrls: publishPackage.imageUrls,
    skippedImageCount: Math.max(0, basePackage.imageFiles.length - portableImages.length),
    storageProvider: "inline",
    bucket: null,
    storagePath: "inline:package-data",
    storageError: errorMessage(storageError),
    phoneScanReady: publicOrigin.phoneScanReady,
    shareReady: publicOrigin.shareReady,
    publicAccessWarning: publicOrigin.warning,
    createdAt: new Date().toISOString()
  };
}

async function storeSupabasePackage(
  basePackage: MobilePublishPackage,
  packageId: string,
  supabase: SupabaseServerClient
): Promise<StoredPackage> {
  await ensurePublicBucket(supabase);
  const uploadedImages = await uploadPackageImages(basePackage.imageFiles, packageId, supabase);
  const publishPackage: MobilePublishPackage = {
    ...basePackage,
    imageFiles: uploadedImages,
    imageUrls: uploadedImages.map((image) => image.url)
  };
  const packageDataPath = `packages/${packageId}/package.json`;
  const packageDataUpload = await supabase.storage
    .from(BUCKET)
    .upload(packageDataPath, Buffer.from(JSON.stringify(publishPackage, null, 2), "utf8"), {
      contentType: "application/json",
      cacheControl: "60",
      upsert: true
    });
  if (packageDataUpload.error) throw packageDataUpload.error;

  return {
    publishPackage,
    packageDataUrl: supabase.storage.from(BUCKET).getPublicUrl(packageDataPath).data.publicUrl,
    storageProvider: "supabase",
    bucket: BUCKET,
    storagePath: packageDataPath,
    skippedImageCount: Math.max(0, basePackage.imageFiles.length - uploadedImages.length)
  };
}

async function storeLocalPackage(
  basePackage: MobilePublishPackage,
  packageId: string,
  origin: string,
  storageError: unknown
): Promise<StoredPackage> {
  const publishPackage: MobilePublishPackage = {
    ...basePackage,
    imageUrls: basePackage.imageFiles.map((image) => image.url)
  };
  const packageDataPath = await writeLocalPackageData(packageId, publishPackage);

  return {
    publishPackage,
    packageDataUrl: buildLocalPackageDataUrl(origin, packageId),
    storageProvider: "local",
    bucket: null,
    storagePath: path.relative(process.cwd(), packageDataPath),
    skippedImageCount: 0,
    storageError: errorMessage(storageError)
  };
}

async function writeLocalPackageData(packageId: string, publishPackage: MobilePublishPackage) {
  const packageDir = path.join(LOCAL_PACKAGE_ROOT, safeLocalPackageId(packageId));
  await mkdir(packageDir, { recursive: true });
  const packageDataPath = path.join(packageDir, "package.json");
  await writeFile(packageDataPath, JSON.stringify(publishPackage, null, 2), "utf8");
  return packageDataPath;
}

async function backfillDraftImagesFromPool(draft: z.infer<typeof draftSchema>): Promise<MobilePublishDraft> {
  const usesPublishImages = Boolean(draft.publishImages?.length);
  const existingImages = usesPublishImages ? draft.publishImages ?? [] : draft.generatedImages ?? [];
  const missingImageCount = Math.max(0, REQUIRED_MOBILE_PUBLISH_IMAGE_COUNT - existingImages.length);
  const accountId = draft.accountId?.trim();
  if (!accountId || missingImageCount <= 0) return draft;

  const keyword = draft.batchKeyword?.trim() || draft.topic?.trim() || draft.title.trim();
  const poolResult = await readEventwangImagePool({
    accountId,
    requestedKeyword: keyword,
    searchedTerms: keyword ? [keyword] : [],
    limit: missingImageCount,
    usedLocalPaths: existingImages.map((image) => extractEventwangLocalPath(image)).filter(Boolean),
    fallbackReason: "empty_live_result"
  });
  const poolImages = buildPoolDraftImageSources(poolResult);
  if (!poolImages.length) return draft;

  const assignment = assignEventwangImagesToDrafts([{ id: draft.id }], poolImages, {
    imagesPerDraft: missingImageCount,
    allowPartial: true
  })[0];
  const addedImages = assignment?.images ?? [];
  if (!addedImages.length) return draft;

  const mergedImages = [...existingImages, ...addedImages].slice(0, REQUIRED_MOBILE_PUBLISH_IMAGE_COUNT);
  return usesPublishImages
    ? { ...draft, publishImages: mergedImages }
    : { ...draft, generatedImages: mergedImages };
}

function buildPoolDraftImageSources(result: EventwangImagePoolResult): DraftImageSource[] {
  return result.items.map((item) => ({
    url: "",
    alt: item.tagName || item.styleTag,
    sourceUrl: item.detailUrl,
    localPath: item.localPath,
    styleTag: item.styleTag,
    styleBucket: item.styleBucket
  }));
}

function buildAppPackageUrl(origin: string, packageId: string, packageDataUrl: string) {
  const url = new URL(origin);
  url.pathname = `/mobile-publish/${encodeURIComponent(packageId)}`;
  url.search = "";
  url.searchParams.set("data", packageDataUrl);
  return url.toString();
}

function buildLocalPackageDataUrl(origin: string, packageId: string) {
  const url = new URL(origin);
  url.pathname = `/api/mobile-publish-packages/${encodeURIComponent(packageId)}`;
  url.search = "";
  return url.toString();
}

function buildInlinePackageDataUrl(publishPackage: MobilePublishPackage) {
  const payload = JSON.stringify(publishPackage);
  return `data:application/json;base64,${Buffer.from(payload, "utf8").toString("base64")}`;
}

function buildPublicAccessWarning(existingWarning: string | null, storedPackage: StoredPackage) {
  const localStorageWarning =
    storedPackage.storageProvider === "local"
      ? "Supabase Storage 上传失败，已改用本地发布包；手机扫码必须能访问当前这台电脑上的服务。"
      : null;
  return [existingWarning, localStorageWarning].filter(Boolean).join(" ") || null;
}

async function ensurePublicBucket(supabase: SupabaseServerClient) {
  const bucketOptions = {
    public: true,
    fileSizeLimit: "20MB",
    allowedMimeTypes: ["application/json", "image/jpeg", "image/png", "image/webp", "image/gif"]
  };
  const buckets = await supabase.storage.listBuckets();
  if (buckets.error) throw buckets.error;

  const existingBucket = buckets.data.find((bucket) => bucket.name === BUCKET);
  if (!existingBucket) {
    const created = await supabase.storage.createBucket(BUCKET, bucketOptions);
    if (created.error) throw created.error;
    return;
  }

  const updated = await supabase.storage.updateBucket(BUCKET, bucketOptions);
  if (updated.error) throw updated.error;
}

async function uploadPackageImages(
  images: UploadableImage[],
  packageId: string,
  supabase: SupabaseServerClient
) {
  if (!images.length) return [];

  const root = await realpath(EVENTWANG_ROOT);
  const uploaded = await Promise.all(images.map((image) => uploadPackageImage(image, packageId, root, supabase)));

  return uploaded.filter((image): image is UploadableImage => Boolean(image));
}

async function uploadPackageImage(
  image: UploadableImage,
  packageId: string,
  root: string,
  supabase: SupabaseServerClient
): Promise<UploadableImage | null> {
  const candidatePaths = extractEventwangPathCandidates(image);
  if (!candidatePaths.length) {
    return isPublicHttpUrl(image.url) ? image : null;
  }

  const resolved = await resolveFirstExistingEventwangPath(root, candidatePaths);
  const resolvedPath = resolved?.resolvedPath;
  if (!resolvedPath) return null;

  const file = await readFile(resolvedPath);
  const filename = safeFilename(image.filename || path.basename(resolvedPath));
  const storagePath = `packages/${packageId}/images/${filename}`;
  const uploadedFile = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: contentTypeForPath(resolvedPath),
    cacheControl: "3600",
    upsert: true
  });
  if (uploadedFile.error) throw uploadedFile.error;

  return {
    ...image,
    url: supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl,
    localPath: resolved.localPath
  };
}

async function resolveFirstExistingEventwangPath(root: string, localPaths: string[]) {
  for (const localPath of localPaths) {
    const resolvedPath = await resolveEventwangPath(root, localPath);
    if (resolvedPath) return { localPath, resolvedPath };
  }

  return null;
}

async function resolveEventwangPath(root: string, localPath: string): Promise<string | null> {
  const absolutePath = path.isAbsolute(localPath) ? localPath : path.join(process.cwd(), localPath);

  try {
    const resolvedPath = await realpath(absolutePath);
    if (!isInsideDirectory(root, resolvedPath)) {
      throw new Error("草稿图片路径不在活动汪采集目录内");
    }
    return resolvedPath;
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

function extractEventwangPathCandidates(image: UploadableImage) {
  const candidates: string[] = [];
  const directPath = image.localPath?.trim();
  const routePath = extractEventwangLocalPath({ url: image.url });

  for (const value of [directPath, routePath]) {
    if (value && !candidates.includes(value)) candidates.push(value);
  }

  return candidates;
}

function isInsideDirectory(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isPublicHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function contentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function safeSegment(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 48) || "draft";
}

function safeLocalPackageId(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 120) || "package";
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "-").slice(0, 80) || "image.jpg";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "storage failed");
}
