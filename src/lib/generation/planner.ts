export type MatrixAccount = {
  id: string;
  name: string;
  positioning: string;
  contentAngles: string[];
  defaultTags: string[];
  candidateTarget: number;
  publishTarget: number;
};

export type GenerationPlanInput = {
  keyword: string;
  accounts?: MatrixAccount[];
  candidatesPerAccount?: number;
};

export type GenerationPlan = {
  keyword: string;
  totalTargetCount: number;
  accounts: MatrixAccount[];
};

export const DEFAULT_ACCOUNTS: MatrixAccount[] = [
  {
    id: "A1",
    name: "美业大健康微商活动号",
    positioning: "美业大健康微商活动",
    contentAngles: ["招商会", "品宣会", "私域会销", "沙龙", "培训会"],
    defaultTags: ["美业活动", "大健康活动", "微商大会", "招商会", "活动策划"],
    candidateTarget: 6,
    publishTarget: 3
  },
  {
    id: "A2",
    name: "校园活动号",
    positioning: "校园活动",
    contentAngles: ["开学季", "社团活动", "毕业典礼", "校园市集", "校企活动"],
    defaultTags: ["校园活动", "毕业典礼", "社团活动", "校园市集", "活动执行"],
    candidateTarget: 6,
    publishTarget: 3
  },
  {
    id: "A3",
    name: "建筑行业活动号",
    positioning: "建筑行业活动",
    contentAngles: ["地产开放日", "工地开放日", "工程发布会", "建筑展会"],
    defaultTags: ["建筑活动", "地产活动", "开放日", "展会搭建", "活动布置"],
    candidateTarget: 6,
    publishTarget: 3
  },
  {
    id: "A4",
    name: "商超美陈号",
    positioning: "商超美陈",
    contentAngles: ["节日美陈", "快闪店", "DP 点", "商业空间布置"],
    defaultTags: ["商场美陈", "快闪店", "商业空间", "节日装置", "美陈布置"],
    candidateTarget: 6,
    publishTarget: 3
  },
  {
    id: "A5",
    name: "企业年会团建号",
    positioning: "企业年会团建",
    contentAngles: ["年会", "团建", "晚宴", "答谢会", "会议布置"],
    defaultTags: ["企业年会", "团建活动", "舞台搭建", "会议布置", "活动执行"],
    candidateTarget: 6,
    publishTarget: 3
  }
];

export function createGenerationPlan(input: GenerationPlanInput): GenerationPlan {
  const candidatesPerAccount = input.candidatesPerAccount ?? 6;
  const accounts = (input.accounts ?? DEFAULT_ACCOUNTS).map((account) => ({
    ...account,
    candidateTarget: candidatesPerAccount
  }));

  return {
    keyword: input.keyword.trim(),
    totalTargetCount: accounts.reduce((sum, account) => sum + account.candidateTarget, 0),
    accounts
  };
}
