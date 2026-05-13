export type EventwangSkippedItem = {
  reason?: string | null;
};

export function countEventwangDuplicateSkips(skipped: EventwangSkippedItem[]) {
  return skipped.filter((item) => /重复|duplicate/i.test(item.reason ?? "")).length;
}

export function buildEventwangPartialStatus({
  imageCount,
  targetCount,
  duplicateSkipCount,
  fallbackKeywordsUsed
}: {
  imageCount: number;
  targetCount: number;
  duplicateSkipCount: number;
  fallbackKeywordsUsed: string[];
}) {
  const prefix = `本次有效原图 ${imageCount}/${targetCount}，已跳过重复图 ${duplicateSkipCount} 张`;

  if (imageCount <= 0) {
    return `${prefix}；草稿会先以文案入库，后续补图后再生成发布包。`;
  }

  const fallbackText = fallbackKeywordsUsed.length
    ? `；已补抓关键词：${fallbackKeywordsUsed.join(" / ")}`
    : "";

  return `${prefix}${fallbackText}。可继续生成手机发布包。`;
}
