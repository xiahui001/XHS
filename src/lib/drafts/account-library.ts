import { CONTENT_DOMAINS, getContentDomain } from "@/lib/workspace/content-domains";

export const DEFAULT_DRAFT_LIBRARY_ACCOUNT_ID = "A2";
export const DRAFT_LIBRARY_STRICT_ACCOUNT_FILTER = true;

export const DRAFT_LIBRARY_ACCOUNT_OPTIONS = CONTENT_DOMAINS.map((domain) => ({
  id: domain.id,
  label: domain.label,
  scenario: domain.scenario,
  optionLabel: `${domain.id} · ${domain.label} · ${domain.scenario}`
}));

export function buildDraftLibraryStatus({
  accountId,
  draftCount,
  mode
}: {
  accountId: string;
  draftCount: number;
  mode: string;
}) {
  const account = getContentDomain(accountId);

  if (!draftCount) return `${account.label} 领域暂无草稿`;

  return `已加载 ${account.label} 领域草稿 ${draftCount} 篇（${draftLibraryModeText(mode)}）`;
}

export function buildDraftLibrarySummary({
  accountId,
  draftCount
}: {
  accountId: string;
  draftCount: number;
}) {
  const account = getContentDomain(accountId);

  return `当前显示 ${account.label} 名下草稿：${draftCount} 篇。切换 A1-A5 只切换草稿库历史，不改变本次生成目标。`;
}

export function draftLibraryModeText(mode: string) {
  if (mode === "supabase_storage") return "Supabase";
  if (mode === "supabase_seeded_from_local") return "已同步到 Supabase";
  if (mode === "local_store_fallback") return "本地备份";
  return "本地";
}
