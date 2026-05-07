import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";
import {
  buildMobilePublishPackage,
  type MobilePublishPackage
} from "@/lib/publish/mobile-package";
import { resolveMobilePublishOrigin } from "@/lib/publish/public-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractEventwangLocalPath } from "@/lib/xhs/draft-images";

export const runtime = "nodejs";

const BUCKET = "xhs-mobile-publish-packages";
const EVENTWANG_ROOT = path.join(process.cwd(), "data", "eventwang-gallery");

const imageSchema = z.object({
  prompt: z.string().optional(),
  url: z.string().optional(),
  localPath: z.string().optional()
});

const draftSchema = z.object({
  id: z.string().min(1),
  accountName: z.string().optional(),
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

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const supabase = createSupabaseServerClient();
    if (!supabase) {
      return fail("SUPABASE_CONFIG_REQUIRED", "缺少 Supabase 服务端配置，无法生成手机发布包", 500);
    }

    await ensurePublicBucket(supabase);

    const packageId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeSegment(input.draft.id)}`;
    const basePackage = buildMobilePublishPackage(input.draft, packageId);
    const uploadedImages = await uploadPackageImages(basePackage.imageFiles, packageId, supabase);
    if (!uploadedImages.length) {
      return fail("MOBILE_PACKAGE_IMAGES_REQUIRED", "草稿没有可上传到手机发布包的活动汪原图", 400);
    }

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

    const packageDataUrl = supabase.storage.from(BUCKET).getPublicUrl(packageDataPath).data.publicUrl;
    const origin = resolveMobilePublishOrigin({
      requestUrl: request.url,
      appPublicUrl: process.env.APP_PUBLIC_URL,
      nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
      vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      vercelUrl: process.env.VERCEL_URL,
      getHeader: (name) => request.headers.get(name)
    });
    const packageUrl = buildAppPackageUrl(origin.origin, packageId, packageDataUrl);

    return ok({
      packageId,
      packageUrl,
      packageDataUrl,
      deeplinkUrl: publishPackage.deeplinkUrl,
      shareText: publishPackage.shareText,
      imageCount: publishPackage.imageUrls.length,
      imageUrls: publishPackage.imageUrls,
      skippedImageCount: Math.max(0, basePackage.imageFiles.length - uploadedImages.length),
      bucket: BUCKET,
      storagePath: packageDataPath,
      phoneScanReady: origin.phoneScanReady,
      shareReady: origin.shareReady,
      publicAccessWarning: origin.warning,
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

function buildAppPackageUrl(origin: string, packageId: string, packageDataUrl: string) {
  const url = new URL(origin);
  url.pathname = `/mobile-publish/${encodeURIComponent(packageId)}`;
  url.search = "";
  url.searchParams.set("data", packageDataUrl);
  return url.toString();
}

async function ensurePublicBucket(supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>) {
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
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>
) {
  const uploaded: UploadableImage[] = [];
  const root = await realpath(EVENTWANG_ROOT);

  for (const image of images) {
    const candidatePaths = extractEventwangPathCandidates(image);
    if (!candidatePaths.length) {
      if (isPublicHttpUrl(image.url)) uploaded.push(image);
      continue;
    }

    const resolved = await resolveFirstExistingEventwangPath(root, candidatePaths);
    const resolvedPath = resolved?.resolvedPath;
    if (!resolvedPath) continue;

    const file = await readFile(resolvedPath);
    const filename = safeFilename(image.filename || path.basename(resolvedPath));
    const storagePath = `packages/${packageId}/images/${filename}`;
    const uploadedFile = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: contentTypeForPath(resolvedPath),
      cacheControl: "3600",
      upsert: true
    });
    if (uploadedFile.error) throw uploadedFile.error;

    uploaded.push({
      ...image,
      url: supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl,
      localPath: resolved.localPath
    });
  }

  return uploaded;
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

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "-").slice(0, 80) || "image.jpg";
}
