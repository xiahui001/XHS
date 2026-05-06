import QRCode from "qrcode";
import { fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url")?.trim();
    if (!targetUrl) return fail("QR_URL_REQUIRED", "缺少二维码链接", 400);
    if (!isAllowedQrUrl(targetUrl)) {
      return fail("QR_URL_INVALID", "二维码只能生成 http/https 链接或 xhsdiscover://post", 400);
    }

    const svg = await QRCode.toString(targetUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240
    });

    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    return fail("QR_CREATE_FAILED", error instanceof Error ? error.message : "二维码生成失败", 400);
  }
}

function isAllowedQrUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^xhsdiscover:\/\/post(?:[/?#]|$)/i.test(value);
}
