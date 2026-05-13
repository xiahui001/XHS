import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedDraft } from "@/lib/generation/draft-generator";

const STORE_PATH = path.join(process.cwd(), "data", "drafts", "drafts.json");

export type DraftStoreFilter = {
  keyword?: string | null;
  accountId?: string | null;
};

export async function readDraftStore(): Promise<GeneratedDraft[]> {
  try {
    const content = await readFile(STORE_PATH, "utf8");
    return JSON.parse(content) as GeneratedDraft[];
  } catch {
    return [];
  }
}

export async function appendDrafts(drafts: GeneratedDraft[]): Promise<GeneratedDraft[]> {
  const existing = await readDraftStore();
  const next = [...drafts, ...existing];
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function markDraftRead(draftId: string, readAt = new Date().toISOString()): Promise<GeneratedDraft[]> {
  const existing = await readDraftStore();
  const next = markDraftReadInList(existing, draftId, readAt);
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function deleteDraft(draftId: string): Promise<GeneratedDraft[]> {
  const existing = await readDraftStore();
  const next = deleteDraftInList(existing, draftId);
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function markDraftReadInList(drafts: GeneratedDraft[], draftId: string, readAt: string): GeneratedDraft[] {
  return drafts.map((draft) => (draft.id === draftId ? { ...draft, readAt } : draft));
}

export function deleteDraftInList(drafts: GeneratedDraft[], draftId: string): GeneratedDraft[] {
  return drafts.filter((draft) => draft.id !== draftId);
}

export function filterDraftStore(drafts: GeneratedDraft[], filter: DraftStoreFilter): GeneratedDraft[] {
  const keyword = filter.keyword?.trim();
  const accountId = filter.accountId?.trim();

  return drafts.filter((draft) => {
    if (keyword && !draft.topic.includes(keyword)) return false;
    if (accountId && draft.accountId !== accountId) return false;
    return true;
  });
}
