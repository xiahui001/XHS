import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fail } from "@/lib/http";

export const runtime = "nodejs";

const EVENTWANG_ROOT = path.join(process.cwd(), "data", "eventwang-gallery");

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requestedPath = url.searchParams.get("path");
    if (!requestedPath) return fail("EVENTWANG_FILE_PATH_REQUIRED", "缺少活动汪原图路径", 400);

    const root = await realpath(EVENTWANG_ROOT);
    const absolutePath = path.isAbsolute(requestedPath)
      ? requestedPath
      : path.join(process.cwd(), requestedPath);
    const resolvedPath = await realpath(absolutePath);

    if (!isInsideDirectory(root, resolvedPath)) {
      return fail("EVENTWANG_FILE_FORBIDDEN", "只能读取活动汪图库采集目录下的原图", 403);
    }

    const file = await readFile(resolvedPath);
    return new Response(file, {
      headers: {
        "content-type": contentTypeForPath(resolvedPath),
        "cache-control": "private, max-age=3600"
      }
    });
  } catch (error) {
    return fail("EVENTWANG_FILE_NOT_FOUND", error instanceof Error ? error.message : "活动汪原图读取失败", 404);
  }
}

function isInsideDirectory(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function contentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}
