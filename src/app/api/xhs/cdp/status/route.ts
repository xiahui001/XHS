import { fail, ok } from "@/lib/http";
import { getXhsCdpStatus } from "@/lib/xhs/cdp-browser";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok(await getXhsCdpStatus());
  } catch (error) {
    return fail("XHS_CDP_STATUS_FAILED", error instanceof Error ? error.message : "真实浏览器状态检测失败", 500);
  }
}
