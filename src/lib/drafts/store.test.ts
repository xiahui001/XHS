import { describe, expect, it } from "vitest";
import { filterDraftStore } from "./store";
import type { GeneratedDraft } from "@/lib/generation/draft-generator";

describe("draft store filters", () => {
  it("filters persisted drafts by selected account", () => {
    const drafts = [
      makeDraft({ id: "draft-a2", accountId: "A2", topic: "校园宣讲会" }),
      makeDraft({ id: "draft-a4", accountId: "A4", topic: "商场美陈" })
    ];

    expect(filterDraftStore(drafts, { accountId: "A2" }).map((draft) => draft.id)).toEqual(["draft-a2"]);
  });

  it("can combine account and keyword filters", () => {
    const drafts = [
      makeDraft({ id: "draft-a2-1", accountId: "A2", topic: "校园宣讲会" }),
      makeDraft({ id: "draft-a2-2", accountId: "A2", topic: "毕业晚会" }),
      makeDraft({ id: "draft-a4", accountId: "A4", topic: "校园快闪" })
    ];

    expect(filterDraftStore(drafts, { accountId: "A2", keyword: "校园" }).map((draft) => draft.id)).toEqual([
      "draft-a2-1"
    ]);
  });
});

function makeDraft(input: Pick<GeneratedDraft, "id" | "accountId" | "topic">): GeneratedDraft {
  return {
    ...input,
    accountName: input.accountId,
    industry: "test",
    title: input.topic,
    body: "body",
    tags: [],
    coverTitleOptions: [],
    imageStructure: [],
    qualityScore: 90,
    qualityNotes: [],
    status: "pending_review"
  };
}
