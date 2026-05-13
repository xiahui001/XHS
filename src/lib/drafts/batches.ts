export type DraftBatchMetadata = {
  batchId: string;
  batchKeyword: string;
  batchCreatedAt: string;
};

export type DraftWithBatchMetadata = Partial<DraftBatchMetadata> & {
  id: string;
};

export function createDraftBatchMetadata(input: {
  keyword: string;
  createdAt?: string;
  randomId?: string;
}): DraftBatchMetadata {
  return {
    batchId: input.randomId ?? crypto.randomUUID(),
    batchKeyword: input.keyword.trim(),
    batchCreatedAt: input.createdAt ?? new Date().toISOString()
  };
}

export function attachDraftBatchMetadata<T extends object>(
  drafts: T[],
  batch: DraftBatchMetadata
): Array<T & DraftBatchMetadata> {
  return drafts.map((draft) => ({
    ...draft,
    ...batch
  }));
}

export function findLatestDraftBatchId(drafts: DraftWithBatchMetadata[]) {
  return drafts
    .filter((draft) => draft.batchId && draft.batchCreatedAt)
    .sort((left, right) => String(right.batchCreatedAt).localeCompare(String(left.batchCreatedAt)))[0]?.batchId ?? null;
}
