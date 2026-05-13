import { z } from "zod";
import { callArkJson } from "@/lib/ark/client";
import { validateDraftForSelection } from "@/lib/drafts/validation";
import { DEFAULT_ACCOUNTS } from "@/lib/generation/planner";
import type { GeneratedDraft } from "@/lib/generation/draft-generator";
import { fail, ok, parseJson } from "@/lib/http";
import { WORKFLOW_IMAGES_PER_DRAFT } from "@/lib/workflow/run-config";

export const runtime = "nodejs";

const referenceSchema = z.object({
  title: z.string(),
  content: z.string(),
  sourceUrl: z.string().optional(),
  imageUrls: z.array(z.string()).optional()
});

const requiredTextPrompt = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z.string().min(1, "文案 Prompt 是大模型生成的必填项")
);

const schema = z.object({
  keyword: z.string().min(1),
  references: z.array(referenceSchema).min(1),
  accountId: z.string().optional(),
  customPrompt: requiredTextPrompt,
  keywordCategory: z.string().optional(),
  keywordCategories: z.array(z.string()).optional(),
  count: z.number().int().min(1).max(10).optional()
});

type ArkDraftPayload = {
  drafts: Array<{
    accountId: string;
    title: string;
    body: string;
    tags: string[];
    coverTitleOptions: string[];
    imagePrompts: string[];
    sourceUrls: string[];
  }>;
};

type RemixDraftInput = z.infer<typeof schema>;

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const payload = await requestDraftsFromArk(input);
    if (!Array.isArray(payload.drafts) || payload.drafts.length === 0) {
      throw new Error("Ark 未返回 drafts 数组");
    }

    const drafts = payload.drafts.slice(0, input.count ?? 5).map((draft, index) => normalizeDraft(draft, input.keyword, index));
    return ok({ drafts, model: process.env.ARK_TEXT_MODEL || "doubao-seed-character-251128" });
  } catch (error) {
    return fail("REMIX_DRAFT_FAILED", error instanceof Error ? error.message : "二创文案失败", 400);
  }
}

async function requestDraftsFromArk(input: RemixDraftInput): Promise<ArkDraftPayload> {
  const accounts = getTargetAccounts(input.accountId).map((account) => ({
    id: account.id,
    name: account.name,
    positioning: account.positioning,
    tags: account.defaultTags
  }));
  const count = input.count ?? 5;
  const schemaHint = `你是小红书活动策划矩阵号二创编辑。基于真实采集参考进行重写，不照搬原文，不承诺平台规避。
本次生成 ${count} 篇草稿；如果传入两个类别，请按类别顺序尽量均衡分配。
强制执行用户 Prompt：输入 payload.userFineTunePrompt 是本次生成的最高优先级业务约束，必须体现在选题、角度、标题、正文、标签和配图需求中。
只能输出一个 JSON 对象，不能输出 Markdown。JSON 结构必须严格为：
{"drafts":[{"accountId":"A1","title":"20字内","body":"150字内","tags":["8到12个"],"coverTitleOptions":["3个20字内"],"imagePrompts":["${WORKFLOW_IMAGES_PER_DRAFT}个中文配图需求，作为手机端候选图给用户自行筛选"],"sourceUrls":["参考链接"]}]}`;
  const basePayload = {
    keyword: input.keyword,
    keywordCategory: input.keywordCategory ?? null,
    keywordCategories: input.keywordCategories ?? [],
    accounts,
    references: buildCompactReferences(input.references, 6),
    count,
    targetAccountId: input.accountId ?? null,
    userFineTunePrompt: input.customPrompt
  };

  try {
    return await callArkJson<ArkDraftPayload>(
      [{ role: "user", content: JSON.stringify(basePayload) }],
      schemaHint
    );
  } catch (error) {
    const retryPayload = {
      ...basePayload,
      references: buildCompactReferences(input.references, 3),
      count: Math.min(count, 3),
      instruction: "上一次输出不是合法 JSON。本次只生成更短内容，确保 drafts 数组闭合。"
    };
    return callArkJson<ArkDraftPayload>(
      [{ role: "user", content: JSON.stringify(retryPayload) }],
      schemaHint
    ).catch((retryError) => {
      const original = error instanceof Error ? error.message : "首次二创失败";
      const retry = retryError instanceof Error ? retryError.message : "压缩重试失败";
      throw new Error(`Ark JSON 二创失败：${original}；压缩重试失败：${retry}`);
    });
  }
}

function getTargetAccounts(accountId?: string) {
  if (!accountId) return DEFAULT_ACCOUNTS;
  const account = DEFAULT_ACCOUNTS.find((item) => item.id === accountId);
  if (!account) throw new Error(`未知账号：${accountId}`);
  return [account];
}

function normalizeDraft(draft: ArkDraftPayload["drafts"][number], keyword: string, index: number): GeneratedDraft {
  const account = DEFAULT_ACCOUNTS.find((item) => item.id === draft.accountId) ?? DEFAULT_ACCOUNTS[index % DEFAULT_ACCOUNTS.length];
  const safeTags = Array.isArray(draft.tags) ? draft.tags : [];
  const safeCovers = Array.isArray(draft.coverTitleOptions) ? draft.coverTitleOptions : [];
  const imagePrompts = Array.isArray(draft.imagePrompts) ? draft.imagePrompts.slice(0, WORKFLOW_IMAGES_PER_DRAFT) : [];
  const validation = validateDraftForSelection({
    title: draft.title,
    body: draft.body,
    tags: safeTags,
    imageCount: imagePrompts.length,
    licenseComplete: true
  });

  return {
    id: crypto.randomUUID(),
    accountId: account.id,
    accountName: account.name,
    industry: account.positioning,
    topic: keyword,
    title: truncateText(draft.title, 20),
    body: truncateText(draft.body, 150),
    tags: safeTags.slice(0, 12),
    coverTitleOptions: safeCovers.slice(0, 3),
    imageStructure: imagePrompts.map((prompt, promptIndex) => ({
      order: promptIndex + 1,
      role: promptIndex === 0 ? "cover" : "scene",
      visualBrief: prompt,
      captionNote: "由 Ark 图片模型生成"
    })),
    qualityScore: validation.ok ? 86 : 60,
    qualityNotes: validation.ok ? ["Ark 二创完成", "已进入人工审核前状态"] : validation.errors,
    status: validation.ok ? "pending_review" : "needs_edit"
  };
}

function buildCompactReferences(references: z.infer<typeof referenceSchema>[], limit: number) {
  return references.slice(0, limit).map((reference, index) => ({
    index: index + 1,
    title: truncateText(reference.title, 36),
    content: truncateText(reference.content, 120),
    sourceUrl: reference.sourceUrl ?? "",
    imageCount: reference.imageUrls?.length ?? 0
  }));
}

function truncateText(value: string, maxLength: number) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}
