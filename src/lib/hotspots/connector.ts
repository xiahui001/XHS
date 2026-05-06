export type HotspotSearchInput = {
  keyword: string;
  industry?: string;
  limit?: number;
};

export type HotspotReference = {
  keyword: string;
  industry: string;
  sourceType: "manual" | "csv" | "authorized_provider";
  sourceName: string;
  sourceUrl?: string;
  referenceTitle: string;
  referenceSummary: string;
  hotnessNote: string;
};

export type HotspotSearchResult = {
  mode: "authorized_provider" | "needs_authorized_provider";
  items: HotspotReference[];
  message: string;
};

export async function searchHotspots(input: HotspotSearchInput): Promise<HotspotSearchResult> {
  const endpoint = process.env.XHS_AUTHORIZED_HOTSPOT_ENDPOINT;

  if (!endpoint) {
    return {
      mode: "needs_authorized_provider",
      items: [],
      message: "未配置授权热点数据源，未返回参考内容。"
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`授权热点数据源请求失败：${response.status}`);
  }

  const payload = (await response.json()) as { items?: HotspotReference[] };
  return {
    mode: "authorized_provider",
    items: (payload.items ?? []).slice(0, input.limit ?? 10),
    message: "已从授权热点数据源获取参考。"
  };
}
