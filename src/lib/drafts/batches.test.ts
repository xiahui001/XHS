import { describe, expect, it } from "vitest";
import { attachDraftBatchMetadata, createDraftBatchMetadata, findLatestDraftBatchId } from "./batches";

describe("draft batches", () => {
  it("attaches the same batch marker to every draft in a generation run", () => {
    const batch = createDraftBatchMetadata({
      keyword: "graduation party",
      createdAt: "2026-05-08T00:00:00.000Z",
      randomId: "batch-a"
    });

    const drafts = attachDraftBatchMetadata(
      [
        { id: "draft-1", title: "one" },
        { id: "draft-2", title: "two" }
      ],
      batch
    );

    expect(drafts.map((draft) => draft.batchId)).toEqual(["batch-a", "batch-a"]);
    expect(drafts.map((draft) => draft.batchKeyword)).toEqual(["graduation party", "graduation party"]);
    expect(drafts.every((draft) => draft.batchCreatedAt === "2026-05-08T00:00:00.000Z")).toBe(true);
  });

  it("finds the newest persisted batch so old drafts can be visually separated", () => {
    expect(
      findLatestDraftBatchId([
        { id: "old", batchId: "old-batch", batchCreatedAt: "2026-05-07T10:00:00.000Z" },
        { id: "new", batchId: "new-batch", batchCreatedAt: "2026-05-08T10:00:00.000Z" },
        { id: "legacy" }
      ])
    ).toBe("new-batch");
  });
});
