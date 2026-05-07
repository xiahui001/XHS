export type MobilePublishOrigin = {
  origin: string;
  phoneScanReady: boolean;
  shareReady: boolean;
  warning: string | null;
};

type ResolveOriginInput = {
  requestUrl: string;
  appPublicUrl?: string | null;
  nextPublicAppUrl?: string | null;
  vercelProjectProductionUrl?: string | null;
  vercelUrl?: string | null;
  getHeader: (name: string) => string | null;
};

export function resolveMobilePublishOrigin(input: ResolveOriginInput): MobilePublishOrigin {
  const configuredOrigin = normalizeOrigin(
    input.appPublicUrl || input.nextPublicAppUrl || input.vercelProjectProductionUrl || input.vercelUrl
  );
  const origin = configuredOrigin || resolveRequestOrigin(input.requestUrl, input.getHeader);
  const parsed = new URL(origin);
  const loopback = isLoopbackHost(parsed.hostname);
  const https = parsed.protocol === "https:";

  if (loopback) {
    return {
      origin,
      phoneScanReady: false,
      shareReady: false,
      warning: "当前发布包地址是本机地址，只能电脑打开；手机扫码需要配置 APP_PUBLIC_URL 为公网 HTTPS 地址后重新生成。"
    };
  }

  if (!https) {
    return {
      origin,
      phoneScanReady: true,
      shareReady: false,
      warning: "当前发布包地址不是 HTTPS，手机可以尝试打开，但系统分享多图通常需要 HTTPS。"
    };
  }

  return {
    origin,
    phoneScanReady: true,
    shareReady: true,
    warning: null
  };
}

function resolveRequestOrigin(requestUrl: string, getHeader: ResolveOriginInput["getHeader"]) {
  const forwardedHost = getHeader("x-forwarded-host")?.trim();
  const forwardedProto = getHeader("x-forwarded-proto")?.trim();
  const request = new URL(requestUrl);
  const host = forwardedHost || getHeader("host") || request.host;
  const protocol = forwardedProto || request.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

function normalizeOrigin(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return "";
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(normalized);
    return url.origin;
  } catch {
    return "";
  }
}

function isLoopbackHost(hostname: string) {
  const lower = hostname.toLowerCase();
  return lower === "localhost" || lower === "127.0.0.1" || lower === "::1" || lower === "[::1]";
}
