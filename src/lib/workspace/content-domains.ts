export type ContentDomain = {
  id: string;
  label: string;
  scenario: string;
};

export const CONTENT_DOMAINS: ContentDomain[] = [
  { id: "A1", label: "美业大健康微商", scenario: "招商会 / 沙龙 / 私域会销" },
  { id: "A2", label: "校园", scenario: "开学季 / 毕业典礼 / 校园市集" },
  { id: "A3", label: "建筑行业", scenario: "开放日 / 工程发布会 / 建筑展会" },
  { id: "A4", label: "商超", scenario: "节日美陈 / 快闪店 / DP 点" },
  { id: "A5", label: "企业年会团建", scenario: "年会 / 团建 / 答谢会" }
];

export const XHS_COLLECTOR_PROFILE_LABEL = "小红书白号采集号";

export function getContentDomain(domainId: string) {
  return CONTENT_DOMAINS.find((domain) => domain.id === domainId) ?? CONTENT_DOMAINS[1];
}
