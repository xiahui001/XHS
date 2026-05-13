import { DEFAULT_ACCOUNTS, createGenerationPlan, type MatrixAccount } from "./planner";
import { validateDraftForSelection } from "@/lib/drafts/validation";

export type ImageStructureItem = {
  order: number;
  role: "cover" | "scene" | "detail" | "process" | "cta";
  visualBrief: string;
  captionNote: string;
};

export type GeneratedDraft = {
  id: string;
  accountId: string;
  accountName: string;
  industry: string;
  topic: string;
  title: string;
  body: string;
  tags: string[];
  coverTitleOptions: string[];
  imageStructure: ImageStructureItem[];
  generatedImages?: Array<{
    prompt: string;
    url: string;
    localPath?: string;
  }>;
  publishImages?: Array<{
    prompt: string;
    url: string;
    localPath?: string;
  }>;
  readAt?: string | null;
  qualityScore: number;
  qualityNotes: string[];
  status: "pending_review" | "selected" | "needs_edit" | "published" | "discarded";
};

const TOPIC_SUFFIXES = [
  "预算拆解",
  "现场氛围",
  "执行清单",
  "避坑提醒",
  "流程说明",
  "设备配置"
];

export function generateDraftCandidates(keyword: string, accounts: MatrixAccount[] = DEFAULT_ACCOUNTS): GeneratedDraft[] {
  const plan = createGenerationPlan({ keyword, accounts });

  return plan.accounts.flatMap((account) =>
    Array.from({ length: account.candidateTarget }, (_, index) =>
      createDraftForAccount(plan.keyword, account, index)
    )
  );
}

function createDraftForAccount(keyword: string, account: MatrixAccount, index: number): GeneratedDraft {
  const suffix = TOPIC_SUFFIXES[index % TOPIC_SUFFIXES.length];
  const angle = account.contentAngles[index % account.contentAngles.length];
  const topic = `${angle}${suffix}`;
  const title = compactTitle(`${angle}${suffix}`);
  const body = createBody(account.positioning, keyword, suffix);
  const tags = createTags(account, keyword);
  const imageStructure = createImageStructure(account.positioning, angle);
  const validation = validateDraftForSelection({
    title,
    body,
    tags,
    imageCount: imageStructure.length,
    licenseComplete: true
  });

  return {
    id: `${account.id}-${index + 1}`,
    accountId: account.id,
    accountName: account.name,
    industry: account.positioning,
    topic,
    title,
    body,
    tags,
    coverTitleOptions: [
      compactTitle(`${angle}这样做`),
      compactTitle(`${suffix}看这篇`),
      compactTitle(`${keyword}先看清单`)
    ],
    imageStructure,
    qualityScore: validation.ok ? 88 : 66,
    qualityNotes: validation.ok ? ["结构完整", "适合进入人工审核"] : validation.errors,
    status: validation.ok ? "pending_review" : "needs_edit"
  };
}

function compactTitle(value: string): string {
  return Array.from(value).slice(0, 20).join("");
}

function createBody(industry: string, keyword: string, suffix: string): string {
  return `${industry}做${keyword}，先看场地、人数、流程和预算。${suffix}越清楚，舞美、设备和执行排期越稳，后续沟通也更省时间。`;
}

function createTags(account: MatrixAccount, keyword: string): string[] {
  const tags = [
    ...account.defaultTags,
    keyword,
    "活动策划",
    "舞美搭建",
    "活动执行",
    "舞台设备"
  ];

  return Array.from(new Set(tags)).slice(0, 10);
}

function createImageStructure(industry: string, angle: string): ImageStructureItem[] {
  return [
    {
      order: 1,
      role: "cover",
      visualBrief: `${industry}${angle}成片全景`,
      captionNote: "封面突出场景和主题"
    },
    {
      order: 2,
      role: "scene",
      visualBrief: "客户视角看到的主视觉",
      captionNote: "展示现场氛围"
    },
    {
      order: 3,
      role: "detail",
      visualBrief: "舞台、灯光、屏幕或装置细节",
      captionNote: "说明配置影响效果"
    },
    {
      order: 4,
      role: "process",
      visualBrief: "物料进场或搭建过程",
      captionNote: "展示执行能力"
    },
    {
      order: 5,
      role: "detail",
      visualBrief: "签到、背景板或互动区",
      captionNote: "补充配套区域"
    },
    {
      order: 6,
      role: "cta",
      visualBrief: "完整落地效果或局部氛围",
      captionNote: "引导官方留资咨询"
    }
  ];
}
