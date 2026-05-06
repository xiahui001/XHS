import { z } from "zod";
import { analyzeCustomerMessage } from "@/lib/replies/assistant";
import { fail, ok, parseJson } from "@/lib/http";

const schema = z.object({
  message: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    return ok(analyzeCustomerMessage(input.message));
  } catch (error) {
    return fail("REPLY_ANALYSIS_FAILED", error instanceof Error ? error.message : "私信分析失败", 400);
  }
}
