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

const LEGACY_TEXT_REMIX_PROMPT =
  "你是小红书活动策划账号的文案二创编辑。基于用户采集素材重写，不照搬原文，保留可执行细节，输出适合对应账号定位的笔记草稿。";

const LEGACY_IMAGE_REMIX_PROMPT =
  "你是小红书活动视觉图片二创导演。基于授权素材生成封面和配图提示词，强调真实活动现场、清晰构图、无文字水印。";

export const DEFAULT_TEXT_REMIX_PROMPT = `你是小红书活动策划矩阵号的文案二创总编。大模型生成必须强制执行本 Prompt，并优先读取已选领域号、账号定位、关键词类别、热门参考和来源链接。
强制目标：
1. 领域准确性：标题、正文、标签必须贴合已选领域号，不能跨领域泛写。
2. 热点捕捉性：从小红书热门文案里提炼高频场景、季节节点、用户痛点和趋势表达，保留可验证参考，不照搬原句。
3. 文案创造性：每篇草稿使用不同开头、角度、现场细节和行动建议，避免模板句、空泛情绪和重复标题。
4. 发布可用性：标题 20 字内，正文 150 字内，标签 8-12 个；配图需求必须能指导图片抓取准确匹配活动场景。`;

export const DEFAULT_IMAGE_REMIX_PROMPT = `你是小红书活动视觉图片二创和图库抓取导演。大模型图片工作必须强制执行本 Prompt，并围绕已选领域号、草稿标题、正文卖点和图片需求。
强制目标：
1. 图片抓取准确性：优先匹配真实活动现场、舞台/装置/陈列/人群互动/物料细节，拒绝泛素材、纯氛围图和不贴领域的图片。
2. 热点场景性：结合当前关键词里的节日、毕业季、开学季、年会、快闪、市集、发布会等场景，选出更容易被小红书用户理解和收藏的画面。
3. 视觉一致性：封面要有强主体和清晰构图，正文图补足流程、细节、打卡点、空间关系，避免文字水印和低清截图。
4. 二创可执行性：输出或拼接图片提示时保留已选领域号语境，让图片服务于文案卖点，而不是单纯好看。`;

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

export function normalizeWorkspacePrompts(input: Partial<WorkspacePrompts> | null | undefined): WorkspacePrompts {
  const textRemix = normalizePromptValue(input?.textRemix, LEGACY_TEXT_REMIX_PROMPT, DEFAULT_TEXT_REMIX_PROMPT);
  const imageRemix = normalizePromptValue(input?.imageRemix, LEGACY_IMAGE_REMIX_PROMPT, DEFAULT_IMAGE_REMIX_PROMPT);
  return { textRemix, imageRemix };
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

function normalizePromptValue(value: string | undefined, legacyDefault: string, nextDefault: string) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === legacyDefault) return nextDefault;
  return trimmed;
}
