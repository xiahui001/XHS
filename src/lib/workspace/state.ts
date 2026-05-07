export type TrafficLight = "green" | "red";

export type GlobalCheckKey =
  | "auth"
  | "binding"
  | "text_scrape"
  | "image_scrape"
  | "text_generation"
  | "image_generation";

export type GlobalCheck = {
  key: GlobalCheckKey;
  label: string;
  light: TrafficLight;
  detail: string;
};

export type WorkspacePrompts = {
  textRemix: string;
  imageRemix: string;
};

export type BindingState = {
  state: "unbound" | "binding" | "bound" | "failed";
  accountId: string | null;
  detail: string;
};

export type WorkspaceState = {
  userId: string;
  prompts: WorkspacePrompts;
  binding: BindingState;
};

export type KeywordPreset = {
  id: string;
  accountId: string;
  rawText: string;
  keywords: string[];
  categories: string[];
};

export type KeywordDraftBatch = {
  accountId: string;
  category: string;
  keywords: string[];
  draftCount: 3;
};

export const DEFAULT_KEYWORD_OPTION = "__default__";

type GlobalCheckFacts = {
  textScrapeReady: boolean;
  imageScrapeReady: boolean;
  textGenerationReady: boolean;
  imageGenerationReady: boolean;
  authReady: boolean;
  bindingReady: boolean;
};

const DEFAULT_TEXT_REMIX_PROMPT =
  "你是小红书活动策划账号的文案二创编辑。基于用户采集素材重写，不照搬原文，保留可执行细节，输出适合对应账号定位的笔记草稿。";

const DEFAULT_IMAGE_REMIX_PROMPT =
  "你是小红书活动视觉图片二创导演。基于授权素材生成封面和配图提示词，强调真实活动现场、清晰构图、无文字水印。";

export function createDefaultWorkspaceState(userId: string): WorkspaceState {
  return {
    userId,
    prompts: {
      textRemix: DEFAULT_TEXT_REMIX_PROMPT,
      imageRemix: DEFAULT_IMAGE_REMIX_PROMPT
    },
    binding: {
      state: "unbound",
      accountId: null,
      detail: "等待手机发布账号人工确认"
    }
  };
}

export function buildGlobalChecks(facts: GlobalCheckFacts): GlobalCheck[] {
  return [
    makeCheck("auth", "用户登录", facts.authReady, "Supabase 注册登录状态"),
    makeCheck("binding", "手机发布账号", facts.bindingReady, "手机端人工发布账号状态"),
    makeCheck("text_scrape", "文案爬取", facts.textScrapeReady, "小红书参考内容采集"),
    makeCheck("image_scrape", "图片爬取", facts.imageScrapeReady, "活动汪授权图片采集"),
    makeCheck("text_generation", "文案生成", facts.textGenerationReady, "文案二创模型"),
    makeCheck("image_generation", "图片应用", facts.imageGenerationReady, "活动汪原图配图")
  ];
}

export function createKeywordPreset(input: {
  id?: string;
  accountId: string;
  rawText: string;
  categories: string[];
}): KeywordPreset {
  return {
    id: input.id ?? crypto.randomUUID(),
    accountId: input.accountId,
    rawText: input.rawText,
    keywords: splitKeywords(input.rawText),
    categories: input.categories.slice(0, 2)
  };
}

export function planKeywordDraftBatches(presets: KeywordPreset[], accountId: string): KeywordDraftBatch[] {
  return presets
    .filter((preset) => preset.accountId === accountId)
    .flatMap((preset) =>
      preset.categories.slice(0, 2).map((category) => ({
        accountId: preset.accountId,
        category,
        keywords: preset.keywords,
        draftCount: 3 as const
      }))
    );
}

export function buildKeywordOptions(presets: KeywordPreset[], accountId: string): string[] {
  const seen = new Set<string>();

  return presets
    .filter((preset) => preset.accountId === accountId)
    .flatMap((preset) => preset.keywords)
    .filter((keyword) => {
      if (seen.has(keyword)) return false;
      seen.add(keyword);
      return true;
    });
}

export function pickRandomKeyword(keywords: string[], randomValue = Math.random()): string | null {
  if (!keywords.length) return null;
  const index = Math.min(keywords.length - 1, Math.floor(randomValue * keywords.length));
  return keywords[index] ?? null;
}

export function splitKeywords(rawText: string): string[] {
  return rawText
    .split(/[\n,，、;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeCheck(key: GlobalCheckKey, label: string, ready: boolean, detail: string): GlobalCheck {
  return {
    key,
    label,
    light: ready ? "green" : "red",
    detail: ready ? `${detail}可用` : `${detail}待处理`
  };
}
