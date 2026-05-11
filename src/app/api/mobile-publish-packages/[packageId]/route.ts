import { readFile } from "node:fs/promises";
import path from "node:path";
import { fail } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = "xhs-mobile-publish-packages";
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
    const packageData = await readPackageData(safePackageId);
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

async function readPackageData(packageId: string) {
  const supabasePackage = await readSupabasePackageData(packageId);
  if (supabasePackage) return supabasePackage;

  return readFile(path.join(LOCAL_PACKAGE_ROOT, packageId, "package.json"), "utf8");
}

async function readSupabasePackageData(packageId: string) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return null;

  const downloaded = await supabase.storage.from(BUCKET).download(`packages/${packageId}/package.json`);
  if (downloaded.error || !downloaded.data) return null;

  return downloaded.data.text();
}

function safeLocalPackageId(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 120) || "package";
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
