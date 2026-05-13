export function galleryCandidateKey(candidate) {
  return String(candidate?.galleryId || candidate?.href || candidate?.imageUrl || "").trim();
}

export function dedupeGalleryCandidates(candidates, limit = Number.POSITIVE_INFINITY) {
  const seen = new Set();
  const unique = [];

  for (const candidate of candidates) {
    const key = galleryCandidateKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
    if (unique.length >= limit) break;
  }

  return unique;
}

export function normalizeGalleryDetailHref(href, galleryId, tagId = 0) {
  const rawHref = String(href || "").trim();
  const id = String(galleryId || rawHref.match(/detail-(\d+)/)?.[1] || "").trim();
  const tag = String(tagId || rawHref.match(/detail-\d+_(\d+)/)?.[1] || "0").trim() || "0";

  if (rawHref.includes("/Gallery/detail-")) return rawHref;
  if (id) return `/Gallery/detail-${id}_${tag}`;
  return rawHref;
}

export function isNearPageBottom(diagnostics, thresholdPx = 360) {
  const scrollY = Number(diagnostics?.scrollY ?? 0);
  const viewportHeight = Number(diagnostics?.viewportHeight ?? 0);
  const scrollHeight = Number(diagnostics?.scrollHeight ?? 0);
  if (!scrollHeight || !viewportHeight) return false;
  return scrollY + viewportHeight >= scrollHeight - thresholdPx;
}

export function getGalleryScrollStopReason({
  attempt,
  maxScrollAttempts,
  freshCount,
  minimumFreshCount,
  uniqueCandidateCount,
  previousUniqueCandidateCount,
  diagnostics
}) {
  if (freshCount >= minimumFreshCount) return "fresh-count-met";
  if (attempt >= maxScrollAttempts) return "max-scroll-attempts";
  if (
    attempt > 0 &&
    uniqueCandidateCount === previousUniqueCandidateCount &&
    isNearPageBottom(diagnostics)
  ) {
    return "no-new-cards-at-page-bottom";
  }
  return "";
}
