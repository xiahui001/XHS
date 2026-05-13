import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";
import { runXhsScrape } from "@/lib/xhs/scrape-runner";

export const runtime = "nodejs";

const schema = z.object({
  keyword: z.string().min(1),
  keywordAlternates: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(20).optional()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    return ok(await runXhsScrape(input));
  } catch (error) {
    return fail("XHS_SCRAPE_FAILED", cleanScrapeError(error), 400);
  }
}

function cleanScrapeError(error: unknown) {
  const message = error instanceof Error ? error.message : "小红书采集失败";
  if (message.includes(".auth/xhs.json")) {
    return "缺少 .auth/xhs.json，请先由人工登录小红书并保存登录态";
  }
  return message.split(/\r?\n/)[0] || "小红书采集失败";
}
