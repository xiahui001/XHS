import { describe, expect, it } from "vitest";
import {
  EVENTWANG_IMAGE_LIMIT_PER_RUN,
  EVENTWANG_IMAGE_POOL_MIN_IMAGES_PER_DRAFT,
  EVENTWANG_MAX_CANDIDATES_PER_RUN,
  WORKFLOW_DRAFTS_PER_RUN,
  WORKFLOW_IMAGES_PER_DRAFT
} from "./run-config";

describe("workflow run config", () => {
  it("runs one draft with twelve ActivityWang candidate images", () => {
    expect(WORKFLOW_DRAFTS_PER_RUN).toBe(1);
    expect(WORKFLOW_IMAGES_PER_DRAFT).toBe(12);
    expect(EVENTWANG_IMAGE_LIMIT_PER_RUN).toBe(12);
    expect(EVENTWANG_IMAGE_POOL_MIN_IMAGES_PER_DRAFT).toBe(10);
    expect(EVENTWANG_MAX_CANDIDATES_PER_RUN).toBe(120);
  });
});
