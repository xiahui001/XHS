import { readFile } from "node:fs/promises";
import path from "node:path";
import { fail } from "@/lib/http";

export const runtime = "nodejs";

const LOCAL_PACKAGE_ROOT = path.join(process.cwd(), "data", "mobile-publish-packages");

type RouteContext = {
  params: { packageId: string } | Promise<{ packageId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const packageId = params.packageId?.trim() ?? "";
  const safePackageId = safeLocalPackageId(packageId);
  if (!packageId || packageId !== safePackageId) {
    return fail("INVALID_PACKAGE_ID", "Invalid package id", 400);
  }

  try {
    const packageData = await readFile(path.join(LOCAL_PACKAGE_ROOT, safePackageId, "package.json"), "utf8");
    return new Response(packageData, {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8"
      }
    });
  } catch (error) {
    if (isMissingFileError(error)) {
      return fail("PACKAGE_NOT_FOUND", "Package not found", 404);
    }
    throw error;
  }
}

function safeLocalPackageId(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 120) || "package";
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
