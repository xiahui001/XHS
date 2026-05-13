import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendDrafts,
  createSupabaseServerClient,
  deleteDraft,
  deleteDraftInList,
  download,
  filterDraftStore,
  listBuckets,
  markDraftRead,
  markDraftReadInList,
  readDraftStore,
  upload
} = vi.hoisted(() => {
  const filterDraftStore = vi.fn((drafts: Array<{ accountId?: string; topic?: string }>, filter: { accountId?: string | null; keyword?: string | null }) =>
    drafts.filter((draft) => {
      if (filter.accountId && draft.accountId !== filter.accountId) return false;
      if (filter.keyword && !String(draft.topic ?? "").includes(filter.keyword)) return false;
      return true;
    })
  );
  const markDraftReadInList = vi.fn((drafts: Array<{ id: string }>, draftId: string, readAt: string) =>
    drafts.map((draft) => (draft.id === draftId ? { ...draft, readAt } : draft))
  );
  const deleteDraftInList = vi.fn((drafts: Array<{ id: string }>, draftId: string) =>
    drafts.filter((draft) => draft.id !== draftId)
  );

  return {
    appendDrafts: vi.fn(),
    createSupabaseServerClient: vi.fn(),
    deleteDraft: vi.fn(),
    deleteDraftInList,
    download: vi.fn(),
    filterDraftStore,
    listBuckets: vi.fn(),
    markDraftRead: vi.fn(),
    markDraftReadInList,
    readDraftStore: vi.fn(),
    upload: vi.fn()
  };
});

vi.mock("@/lib/drafts/store", () => ({
  appendDrafts,
  deleteDraft,
  deleteDraftInList,
  filterDraftStore,
  markDraftRead,
  markDraftReadInList,
  readDraftStore
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient
}));

import { DELETE, GET, POST } from "./route";

describe("/api/drafts", () => {
  beforeEach(() => {
    appendDrafts.mockReset();
    createSupabaseServerClient.mockReset();
    deleteDraft.mockReset();
    deleteDraftInList.mockClear();
    download.mockReset();
    filterDraftStore.mockClear();
    listBuckets.mockReset();
    markDraftRead.mockReset();
    markDraftReadInList.mockClear();
    readDraftStore.mockReset();
    upload.mockReset();
  });

  it("seeds Supabase from local drafts when persisted user storage is empty", async () => {
    readDraftStore.mockResolvedValue([
      makeDraft({ id: "local-a2", accountId: "A2", topic: "campus event" }),
      makeDraft({ id: "local-a4", accountId: "A4", topic: "mall event" })
    ]);
    listBuckets.mockResolvedValue({ data: [{ name: "xhs-user-drafts" }], error: null });
    download.mockResolvedValue({
      data: new Blob([JSON.stringify({ drafts: [] })], { type: "application/json" }),
      error: null
    });
    upload.mockResolvedValue({ data: null, error: null });
    createSupabaseServerClient.mockReturnValue({
      storage: {
        listBuckets,
        from: () => ({ download, upload })
      }
    });

    const response = await GET(new Request("http://localhost/api/drafts?accountId=A2&userId=user-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.mode).toBe("supabase_seeded_from_local");
    expect(payload.data.drafts.map((draft: { id: string }) => draft.id)).toEqual(["local-a2"]);
    expect(upload).toHaveBeenCalled();
  });

  it("syncs local draft history into Supabase when saving a new draft", async () => {
    const incomingDraft = makeDraft({ id: "incoming-a2", accountId: "A2", topic: "new campaign" });
    const localHistoryDraft = makeDraft({ id: "local-history-a2", accountId: "A2", topic: "old campaign" });
    const persistedDraft = makeDraft({ id: "persisted-a2", accountId: "A2", topic: "persisted campaign" });
    appendDrafts.mockResolvedValue([incomingDraft, localHistoryDraft]);
    listBuckets.mockResolvedValue({ data: [{ name: "xhs-user-drafts" }], error: null });
    download.mockResolvedValue({
      data: new Blob([JSON.stringify({ drafts: [persistedDraft] })], { type: "application/json" }),
      error: null
    });
    upload.mockResolvedValue({ data: null, error: null });
    createSupabaseServerClient.mockReturnValue({
      storage: {
        listBuckets,
        from: () => ({ download, upload })
      }
    });

    const response = await POST(
      jsonRequest({
        drafts: [incomingDraft],
        userId: "user-1",
        accountId: "A2"
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.drafts.map((draft: { id: string }) => draft.id)).toEqual([
      "incoming-a2",
      "local-history-a2",
      "persisted-a2"
    ]);
    expect(upload).toHaveBeenCalledWith(
      "users/user-1/accounts/A2/drafts.json",
      expect.any(Buffer),
      expect.objectContaining({ upsert: true })
    );
  });

  it("deletes one draft from local and Supabase account history", async () => {
    const keptDraft = makeDraft({ id: "kept-a2", accountId: "A2", topic: "kept campaign" });
    const deletedDraft = makeDraft({ id: "deleted-a2", accountId: "A2", topic: "deleted campaign" });
    deleteDraft.mockResolvedValue([keptDraft]);
    listBuckets.mockResolvedValue({ data: [{ name: "xhs-user-drafts" }], error: null });
    download.mockResolvedValue({
      data: new Blob([JSON.stringify({ drafts: [deletedDraft, keptDraft] })], { type: "application/json" }),
      error: null
    });
    upload.mockResolvedValue({ data: null, error: null });
    createSupabaseServerClient.mockReturnValue({
      storage: {
        listBuckets,
        from: () => ({ download, upload })
      }
    });

    const response = await DELETE(
      jsonRequest({
        draftId: "deleted-a2",
        userId: "user-1",
        accountId: "A2"
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(deleteDraft).toHaveBeenCalledWith("deleted-a2");
    expect(deleteDraftInList).toHaveBeenCalledWith([deletedDraft, keptDraft], "deleted-a2");
    expect(payload.data.drafts.map((draft: { id: string }) => draft.id)).toEqual(["kept-a2"]);
    expect(upload).toHaveBeenCalledWith(
      "users/user-1/accounts/A2/drafts.json",
      expect.any(Buffer),
      expect.objectContaining({ upsert: true })
    );
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/drafts", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    }
  });
}

function makeDraft(input: { id: string; accountId: string; topic: string }) {
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
