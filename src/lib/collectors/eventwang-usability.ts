export type EventwangUsabilityInput = {
  selectedCount: number;
  imageCount: number;
  styleBucketCount: number;
  requiredStyleBuckets: number;
  blockingReason?: string | null;
  attempts?: Array<{
    reason: string;
  }>;
};

export function getEventwangUsabilityError(result: EventwangUsabilityInput, minimumImages = 1) {
  if (result.selectedCount <= 0 || result.imageCount <= 0) {
    return result.blockingReason || getLastAttemptReason(result) || "活动汪图库没有采集到可用原图";
  }

  return null;
}

function getLastAttemptReason(result: EventwangUsabilityInput) {
  return result.attempts?.at(-1)?.reason;
}
