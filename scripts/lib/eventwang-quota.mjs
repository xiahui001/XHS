export const EVENTWANG_QUOTA_EXHAUSTED_CODE = "EVENTWANG_GALLERY_DAILY_QUOTA_EXHAUSTED";
export const EVENTWANG_QUOTA_EXHAUSTED_MESSAGE = "活动汪下载原图权益当前不可用，接口返回超出权益次数；请检查账号原图下载权益或稍后再试。";

export function isEventwangQuotaExhaustedText(text) {
  const value = String(text || "");
  return (
    value.includes("今日图库会员权益已用完") ||
    value.includes("请等待明天更新") ||
    (value.includes("权益已用完") && value.includes("图库"))
  );
}

export function getEventwangGalleryOriginalQuotaState(userInfo) {
  const limit = toNumber(userInfo?.vip_down_count);
  const remaining = toNumber(userInfo?.vip_last_down_count);
  if (limit == null || remaining == null) return null;

  return {
    limit,
    used: Math.max(0, limit - remaining),
    remaining: Math.max(0, remaining)
  };
}

export function shouldTreatEventwangQuotaTextAsExhausted(text, userInfo) {
  if (!isEventwangQuotaExhaustedText(text)) return false;

  const quota = getEventwangGalleryOriginalQuotaState(userInfo);
  if (quota && quota.remaining > 0) return false;

  return true;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
