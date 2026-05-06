import { getScrapingHandshake } from "@/lib/scraping/handshake";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    return ok(await getScrapingHandshake({ fresh }));
  } catch (error) {
    return fail("SCRAPING_HANDSHAKE_FAILED", error instanceof Error ? error.message : "爬取握手失败", 500);
  }
}
