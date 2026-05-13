import { z } from "zod";
import { generateArkImage } from "@/lib/ark/client";
import { fail, ok, parseJson } from "@/lib/http";

export const runtime = "nodejs";

const requiredImagePrompt = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z.string().min(1, "图片 Prompt 是大模型生成的必填项")
);

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
  customPrompt: requiredImagePrompt,
  imagesPerDraft: z.number().int().min(1).max(3).optional()
});

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const imagesPerDraft = input.imagesPerDraft ?? 1;
    const customPrompt = input.customPrompt;
    const results = [];

    for (const draft of input.drafts) {
      const prompts = draft.imageStructure.slice(0, imagesPerDraft).map((item) => item.visualBrief);
      const images = [];
      for (const prompt of prompts) {
        images.push({
          prompt,
          url: await generateArkImage(`${customPrompt}\n${prompt}`)
        });
      }
      results.push({ draftId: draft.id, images });
    }

    return ok({ results, model: process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128" });
  } catch (error) {
    return fail("REMIX_IMAGE_FAILED", error instanceof Error ? error.message : "图片生成失败", 400);
  }
}
