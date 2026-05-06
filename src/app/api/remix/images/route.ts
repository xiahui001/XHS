import { z } from "zod";
import { generateArkImage } from "@/lib/ark/client";
import { fail, ok, parseJson } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  drafts: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        imageStructure: z.array(
          z.object({
            visualBrief: z.string()
          })
        )
      })
    )
    .min(1)
    .max(10),
  customPrompt: z.string().optional(),
  imagesPerDraft: z.number().int().min(1).max(3).optional()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const imagesPerDraft = input.imagesPerDraft ?? 1;
    const customPrompt = input.customPrompt?.trim();
    const results = [];

    for (const draft of input.drafts) {
      const prompts = draft.imageStructure.slice(0, imagesPerDraft).map((item) => item.visualBrief);
      const images = [];
      for (const prompt of prompts) {
        images.push({
          prompt,
          url: await generateArkImage(
            customPrompt
              ? `${customPrompt}\n${prompt}`
              : `${prompt}，小红书图文封面质感，真实活动策划视觉，高清，无文字水印`
          )
        });
      }
      results.push({ draftId: draft.id, images });
    }

    return ok({ results, model: process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128" });
  } catch (error) {
    return fail("REMIX_IMAGE_FAILED", error instanceof Error ? error.message : "图片生成失败", 400);
  }
}
