import { z } from "zod";
import { DraftImageAssignmentError } from "@/lib/generation/draft-images";
import { assignDraftImagesWithUsageStore } from "@/lib/generation/draft-image-assignment-service";
import { fail, ok, parseJson } from "@/lib/http";
import { WORKFLOW_IMAGES_PER_DRAFT } from "@/lib/workflow/run-config";

export const runtime = "nodejs";

const imageSchema = z.object({
  url: z.string(),
  alt: z.string(),
  sourceUrl: z.string(),
  localPath: z.string().optional(),
  styleTag: z.string().optional(),
  styleBucket: z.string().optional()
});

const schema = z.object({
  drafts: z.array(z.object({ id: z.string().min(1) })).min(1),
  images: z.array(imageSchema).min(1),
  imagesPerDraft: z.number().int().min(1).max(WORKFLOW_IMAGES_PER_DRAFT).optional(),
  allowPartial: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    return ok(await assignDraftImagesWithUsageStore(input));
  } catch (error) {
    if (error instanceof DraftImageAssignmentError) {
      return fail("DRAFT_IMAGES_INSUFFICIENT", error.message, 400);
    }

    return fail(
      "DRAFT_IMAGES_ASSIGN_FAILED",
      error instanceof Error ? error.message : "Draft image assignment failed.",
      400
    );
  }
}
