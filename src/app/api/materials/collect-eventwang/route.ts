import { z } from "zod";
import { fetchEventwangImages } from "@/lib/collectors/eventwang";
import { fail, ok, parseJson } from "@/lib/http";

const schema = z.object({
  sourceUrl: z.string().url(),
  limit: z.number().int().min(1).max(30).optional()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const images = await fetchEventwangImages(input.sourceUrl, input.limit ?? 20);

    return ok({
      sourceUrl: input.sourceUrl,
      images,
      licenseReminder: "请确认该页面素材在你的活动汪会员授权范围内，且允许二创和小红书发布。"
    });
  } catch (error) {
    return fail("EVENTWANG_COLLECT_FAILED", error instanceof Error ? error.message : "活动汪图片获取失败", 400);
  }
}
