import { describe, expect, it } from "vitest";
import { resolveMobilePublishOrigin } from "./public-origin";

describe("mobile publish public origin", () => {
  it("warns when the generated package URL is local-only", () => {
    const result = resolveMobilePublishOrigin({
      requestUrl: "http://127.0.0.1:3000/api/mobile-publish-packages",
      getHeader: () => null
    });

    expect(result.origin).toBe("http://127.0.0.1:3000");
    expect(result.phoneScanReady).toBe(false);
    expect(result.shareReady).toBe(false);
    expect(result.warning).toContain("APP_PUBLIC_URL");
  });

  it("prefers configured HTTPS public app URL for phone scanning", () => {
    const result = resolveMobilePublishOrigin({
      requestUrl: "http://127.0.0.1:3000/api/mobile-publish-packages",
      appPublicUrl: "https://xhs.example.com/app",
      getHeader: () => null
    });

    expect(result.origin).toBe("https://xhs.example.com");
    expect(result.phoneScanReady).toBe(true);
    expect(result.shareReady).toBe(true);
    expect(result.warning).toBeNull();
  });

  it("uses forwarded HTTPS host behind a tunnel or proxy", () => {
    const headers = new Map([
      ["x-forwarded-host", "public.example.com"],
      ["x-forwarded-proto", "https"]
    ]);
    const result = resolveMobilePublishOrigin({
      requestUrl: "http://localhost:3000/api/mobile-publish-packages",
      getHeader: (name) => headers.get(name) ?? null
    });

    expect(result.origin).toBe("https://public.example.com");
    expect(result.phoneScanReady).toBe(true);
    expect(result.shareReady).toBe(true);
  });

  it("uses Vercel production URL when a local request generates a phone package", () => {
    const result = resolveMobilePublishOrigin({
      requestUrl: "http://127.0.0.1:2000/api/mobile-publish-packages",
      vercelProjectProductionUrl: "xhs-sandy.vercel.app",
      getHeader: () => null
    });

    expect(result.origin).toBe("https://xhs-sandy.vercel.app");
    expect(result.phoneScanReady).toBe(true);
    expect(result.shareReady).toBe(true);
    expect(result.warning).toBeNull();
  });
});
