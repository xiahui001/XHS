import { getScrapingHandshake } from "@/lib/scraping/handshake";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok(await getScrapingHandshake());
  } catch (error) {
    return fail("SCRAPING_HANDSHAKE_FAILED", error instanceof Error ? error.message : "爬取握手失败", 500);
  }
}
