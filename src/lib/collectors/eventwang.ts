import * as cheerio from "cheerio";

export type CollectedImage = {
  url: string;
  alt: string;
  sourceUrl: string;
};

const ALLOWED_HOSTS = new Set(["eventwang.cn", "www.eventwang.cn"]);

export function isAllowedEventwangUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function extractEventwangImagesFromHtml(
  html: string,
  sourceUrl: string,
  limit = 20
): CollectedImage[] {
  if (!isAllowedEventwangUrl(sourceUrl)) {
    throw new Error("仅支持 eventwang.cn 授权页面");
  }

  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const images: CollectedImage[] = [];

  $("img").each((_, element) => {
    const rawSrc =
      $(element).attr("src") ||
      $(element).attr("data-src") ||
      $(element).attr("data-original") ||
      $(element).attr("data-lazy-src");

    if (!rawSrc || rawSrc.startsWith("data:")) {
      return;
    }

    const absoluteUrl = normalizeImageUrl(rawSrc, sourceUrl);
    if (!absoluteUrl || seen.has(absoluteUrl)) {
      return;
    }

    seen.add(absoluteUrl);
    images.push({
      url: absoluteUrl,
      alt: ($(element).attr("alt") || "").trim(),
      sourceUrl
    });
  });

  return images.slice(0, limit);
}

export async function fetchEventwangImages(sourceUrl: string, limit = 20): Promise<CollectedImage[]> {
  if (!isAllowedEventwangUrl(sourceUrl)) {
    throw new Error("仅支持 eventwang.cn 授权页面");
  }

  const response = await fetch(sourceUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`活动汪页面获取失败：${response.status}`);
  }

  const html = await response.text();
  return extractEventwangImagesFromHtml(html, sourceUrl, limit);
}

function normalizeImageUrl(rawSrc: string, sourceUrl: string): string | null {
  try {
    return new URL(rawSrc.trim(), sourceUrl).toString();
  } catch {
    return null;
  }
}
