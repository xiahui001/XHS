import { describe, expect, it } from "vitest";
import { getEventwangUsabilityError } from "./eventwang-usability";

describe("eventwang usability", () => {
  it("rejects empty gallery collection immediately", () => {
    expect(
      getEventwangUsabilityError({
        selectedCount: 0,
        imageCount: 0,
        styleBucketCount: 0,
        requiredStyleBuckets: 5,
        blockingReason: "未能触发下载原图"
      })
    ).toBe("未能触发下载原图");
  });

  it("accepts partial results when at least one original image is available", () => {
    expect(
      getEventwangUsabilityError({
        selectedCount: 4,
        imageCount: 4,
        styleBucketCount: 5,
        requiredStyleBuckets: 5
      })
    ).toBeNull();
  });

  it("accepts limited style buckets when image collection is partial", () => {
    expect(
      getEventwangUsabilityError({
        selectedCount: 6,
        imageCount: 6,
        styleBucketCount: 3,
        requiredStyleBuckets: 5
      })
    ).toBeNull();
  });

  it("accepts enough images with enough style buckets", () => {
    expect(
      getEventwangUsabilityError({
        selectedCount: 6,
        imageCount: 6,
        styleBucketCount: 5,
        requiredStyleBuckets: 5
      })
    ).toBeNull();
  });
});
