import { z } from "zod";
import { searchHotspots } from "@/lib/hotspots/connector";
import { fail, ok, parseJson } from "@/lib/http";

const schema = z.object({
  keyword: z.string().min(1),
  industry: z.string().optional(),
  limit: z.number().int().min(1).max(10).optional()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const result = await searchHotspots(input);
    return ok(result);
  } catch (error) {
    return fail("HOTSPOT_SEARCH_FAILED", error instanceof Error ? error.message : "热点搜索失败", 400);
  }
}
