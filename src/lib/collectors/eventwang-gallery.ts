export type EventwangGallerySearchItem = {
  galleryId: string;
  imgDataSourceId: string;
  title: string;
  imageUrl: string;
  tagName: string;
};

export type EventwangGalleryPick = EventwangGallerySearchItem & {
  styleTag: string;
  styleBucket: string;
  score: number;
};

const PREFERRED_STYLE_RULES = [
  { tag: "花艺美陈", bucket: "floral", score: 13 },
  { tag: "已布置", bucket: "installed", score: 14 },
  { tag: "美陈", bucket: "decor", score: 13 },
  { tag: "展示", bucket: "display", score: 12 },
  { tag: "展陈", bucket: "display", score: 12 },
  { tag: "场景", bucket: "scene", score: 11 },
  { tag: "艺术展", bucket: "art", score: 11 },
  { tag: "陈列", bucket: "display", score: 10 },
  { tag: "装置", bucket: "installation", score: 10 },
  { tag: "快闪", bucket: "popup", score: 9 },
  { tag: "商业地产活动", bucket: "commercial", score: 8 },
  { tag: "策划案例图片", bucket: "reference", score: 7 }
] as const;

const EVENTWANG_MEDIA_ROUTE = "/api/materials/eventwang-file";

export function chooseDiverseGalleryItems(
  items: EventwangGallerySearchItem[],
  desiredCount: number,
  minimumStyleBuckets = 5
): EventwangGalleryPick[] {
  const normalized = items.map(toPick).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.galleryId.localeCompare(right.galleryId);
  });

  const picked: EventwangGalleryPick[] = [];
  const seenGalleryIds = new Set<string>();
  const seenBuckets = new Set<string>();

  for (const item of normalized) {
    if (picked.length >= desiredCount) break;
    if (seenGalleryIds.has(item.galleryId)) continue;
    if (seenBuckets.size < minimumStyleBuckets && seenBuckets.has(item.styleBucket)) continue;

    picked.push(item);
    seenGalleryIds.add(item.galleryId);
    seenBuckets.add(item.styleBucket);
  }

  for (const item of normalized) {
    if (picked.length >= desiredCount) break;
    if (seenGalleryIds.has(item.galleryId)) continue;
    picked.push(item);
    seenGalleryIds.add(item.galleryId);
  }

  return picked;
}

export function countDistinctStyleBuckets(items: Array<Pick<EventwangGalleryPick, "styleBucket">>): number {
  return new Set(items.map((item) => item.styleBucket)).size;
}

export function buildEventwangMediaUrl(localPath: string | null | undefined): string {
  const normalized = String(localPath ?? "").trim();
  if (!normalized) return "";
  return `${EVENTWANG_MEDIA_ROUTE}?path=${encodeURIComponent(normalized)}`;
}

function toPick(item: EventwangGallerySearchItem): EventwangGalleryPick {
  const normalizedTag = item.tagName.replace(/\s+/g, "");
  const normalizedTitle = item.title.replace(/\s+/g, "");
  const matchedRule =
    PREFERRED_STYLE_RULES.find((rule) => normalizedTag.includes(rule.tag)) ??
    PREFERRED_STYLE_RULES.find((rule) => normalizedTitle.includes(rule.tag));

  return {
    ...item,
    styleTag: matchedRule?.tag ?? item.tagName ?? "未分类",
    styleBucket: matchedRule?.bucket ?? item.tagName ?? item.galleryId,
    score: matchedRule?.score ?? 1
  };
}
