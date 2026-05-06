export type XhsDraftImageRef = {
  url?: string;
  localPath?: string;
};

const EVENTWANG_FILE_ROUTE = "/api/materials/eventwang-file";

export function extractEventwangLocalPath(image: XhsDraftImageRef): string {
  const directPath = image.localPath?.trim();
  if (directPath) return directPath;

  const url = image.url?.trim();
  if (!url) return "";

  try {
    const parsed = new URL(url, "http://127.0.0.1");
    if (parsed.pathname !== EVENTWANG_FILE_ROUTE) return "";
    return parsed.searchParams.get("path")?.trim() ?? "";
  } catch {
    return "";
  }
}

