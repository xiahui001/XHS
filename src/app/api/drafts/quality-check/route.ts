import { z } from "zod";
import { validateDraftForSelection } from "@/lib/drafts/validation";
import { fail, ok, parseJson } from "@/lib/http";

const schema = z.object({
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  imageCount: z.number().int(),
  licenseComplete: z.boolean()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const result = validateDraftForSelection(input);
    return ok({
      passed: result.ok,
      score: result.ok ? 90 : 65,
      errors: result.errors
    });
  } catch (error) {
    return fail("VALIDATION_ERROR", error instanceof Error ? error.message : "校验失败", 400);
  }
}
