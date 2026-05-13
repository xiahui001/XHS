const SCENARIO_TERMS: Array<{
  match: RegExp;
  terms: string[];
}> = [
  { match: /校园|开学|毕业|社团|宣讲|高校|大学/, terms: ["校园活动布置", "校园活动", "校园美陈"] },
  { match: /宣讲|招聘|双选|就业/, terms: ["校园宣讲会", "会议布置", "校园活动"] },
  { match: /毕业|晚会|典礼/, terms: ["毕业晚会", "校园晚会", "舞台布置"] },
  { match: /年会|团建|答谢|周年/, terms: ["企业年会", "年会舞台", "活动布置"] },
  { match: /商场|商超|快闪|市集|节日/, terms: ["商场美陈", "快闪活动", "节日美陈"] },
  { match: /发布会|开放日|展会|论坛|峰会/, terms: ["发布会布置", "展会展陈", "会议活动"] },
  { match: /美陈|装置|展陈|打卡/, terms: ["美陈装置", "展陈布置", "打卡装置"] }
];

const WEAK_MODIFIERS = [
  "一站式",
  "高端",
  "完整",
  "全案",
  "落地",
  "定制",
  "方案",
  "案例",
  "策划",
  "执行",
  "服务",
  "公司",
  "报价",
  "流程"
];

const DEFAULT_TERMS = ["活动布置", "活动现场", "美陈展示"];

export function buildCoreSearchTerms(keyword: string, maxTerms = 3): string[] {
  const compact = keyword.replace(/\s+/g, "").trim();
  if (!compact) return [];

  const terms = [compact, ...scenarioTerms(compact), simplifyKeyword(compact), ...DEFAULT_TERMS]
    .map((term) => term.trim())
    .filter(Boolean);

  return unique(terms).slice(0, maxTerms);
}

export function buildEventwangFallbackSearchTerms(
  keyword: string,
  sameDomainKeywords: string[],
  maxTerms = 8
): string[] {
  const coreTerms = buildCoreSearchTerms(keyword, Math.min(3, maxTerms));
  return unique([...coreTerms, ...sameDomainKeywords.map((term) => term.trim()).filter(Boolean)]).slice(0, maxTerms);
}

function scenarioTerms(keyword: string) {
  return SCENARIO_TERMS.filter((item) => item.match.test(keyword)).flatMap((item) => item.terms);
}

function simplifyKeyword(keyword: string) {
  let next = keyword;
  for (const modifier of WEAK_MODIFIERS) {
    next = next.replaceAll(modifier, "");
  }

  if (next.length < 3 || next === keyword) return "";
  return next;
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
