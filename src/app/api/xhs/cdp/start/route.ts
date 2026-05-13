import { fail, ok } from "@/lib/http";
import { isHostedRuntime } from "@/lib/runtime/deployment";
import { startXhsCdpBrowser } from "@/lib/xhs/cdp-browser";

export const runtime = "nodejs";

export async function POST() {
  try {
    if (isHostedRuntime()) {
      return fail(
        "XHS_CDP_START_UNSUPPORTED",
        "Vercel 公网版不能拉起本机真实浏览器，请在 localhost 本机版打开",
        501
      );
    }

    return ok(startXhsCdpBrowser());
  } catch (error) {
    return fail("XHS_CDP_START_FAILED", error instanceof Error ? error.message : "真实浏览器启动失败", 400);
  }
}
