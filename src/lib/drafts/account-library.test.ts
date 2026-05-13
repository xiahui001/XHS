import { describe, expect, it } from "vitest";
import {
  DRAFT_LIBRARY_ACCOUNT_OPTIONS,
  DRAFT_LIBRARY_STRICT_ACCOUNT_FILTER,
  buildDraftLibrarySummary,
  buildDraftLibraryStatus,
  draftLibraryModeText
} from "./account-library";

describe("draft account library", () => {
  it("exposes the stable A1-A5 draft account options", () => {
    expect(DRAFT_LIBRARY_ACCOUNT_OPTIONS.map((option) => option.id)).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    expect(DRAFT_LIBRARY_ACCOUNT_OPTIONS.every((option) => option.optionLabel.startsWith(`${option.id} · `))).toBe(true);
  });

  it("keeps draft history filtering strict to the selected account", () => {
    expect(DRAFT_LIBRARY_STRICT_ACCOUNT_FILTER).toBe(true);
  });

  it("builds account-scoped status text without all-history fallback copy", () => {
    expect(buildDraftLibraryStatus({ accountId: "A2", draftCount: 19, mode: "supabase_storage" })).toBe(
      "已加载 校园 领域草稿 19 篇（Supabase）"
    );

    const emptyStatus = buildDraftLibraryStatus({ accountId: "A1", draftCount: 0, mode: "local_store" });

    expect(emptyStatus).toBe("美业大健康微商 领域暂无草稿");
    expect(emptyStatus).not.toContain("全部历史");
  });

  it("builds account-scoped summary text for the draft library toolbar", () => {
    expect(buildDraftLibrarySummary({ accountId: "A3", draftCount: 1 })).toBe(
      "当前显示 建筑行业 名下草稿：1 篇。切换 A1-A5 只切换草稿库历史，不改变本次生成目标。"
    );
  });

  it("keeps storage mode labels stable for status regressions", () => {
    expect(draftLibraryModeText("supabase_storage")).toBe("Supabase");
    expect(draftLibraryModeText("supabase_seeded_from_local")).toBe("已同步到 Supabase");
    expect(draftLibraryModeText("local_store_fallback")).toBe("本地备份");
    expect(draftLibraryModeText("local_store")).toBe("本地");
  });
});
