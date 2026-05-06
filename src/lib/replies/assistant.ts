export type ReplyAnalysis = {
  primaryIntent: string;
  secondaryIntents: string[];
  confidence: number;
  missingFields: string[];
  needsHuman: boolean;
  handoffReason: string | null;
  suggestedReply: string;
};

const HANDOFF_KEYWORDS = ["报价", "多少钱", "价格", "档期", "合同", "发票", "投诉", "不满意", "付款"];

export function analyzeCustomerMessage(message: string): ReplyAnalysis {
  const needsHuman = HANDOFF_KEYWORDS.some((keyword) => message.includes(keyword));
  const primaryIntent = detectIntent(message);
  const missingFields = collectMissingFields(message);

  return {
    primaryIntent,
    secondaryIntents: needsHuman ? ["需人工确认"] : [],
    confidence: 0.86,
    missingFields,
    needsHuman,
    handoffReason: needsHuman ? "涉及报价、档期、合同、发票或负面反馈，需要人工确认" : null,
    suggestedReply: createSuggestedReply(primaryIntent, missingFields, needsHuman)
  };
}

function detectIntent(message: string): string {
  if (message.includes("报价") || message.includes("多少钱") || message.includes("价格")) {
    return "报价";
  }
  if (message.includes("档期") || message.includes("下周") || message.includes("明天")) {
    return "档期";
  }
  if (message.includes("发票") || message.includes("合同")) {
    return "发票合同";
  }
  if (message.includes("年会")) {
    return "年会";
  }
  if (message.includes("展会")) {
    return "展会";
  }
  if (message.includes("美陈") || message.includes("商场")) {
    return "商超美陈";
  }
  return "活动咨询";
}

function collectMissingFields(message: string): string[] {
  const missing = ["城市", "活动时间", "活动类型", "人数", "预算范围"];
  return missing.filter((field) => !message.includes(field));
}

function createSuggestedReply(intent: string, missingFields: string[], needsHuman: boolean): string {
  const fieldText = missingFields.slice(0, 4).join("、");
  const handoffText = needsHuman ? "这类信息需要同事结合档期和配置确认。" : "我先帮你把需求梳理清楚。";

  return `可以的，${intent}需求我们可以先看方向。${handoffText}你可以通过页面里的官方留资入口发下${fieldText || "基础信息"}，我们会尽快安排对接。`;
}
