import { describe, expect, it, vi } from "vitest";
import { buildXhsCdpLaunchArgs, getXhsCdpStatus, startXhsCdpBrowser } from "./cdp-browser";

describe("xhs cdp browser helpers", () => {
  it("reports the real browser status and Xiaohongshu tabs from CDP", async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      if (url.endsWith("/json/version")) {
        return response({
          Browser: "Edg/147.0.3912.86",
          "User-Agent": "Mozilla/5.0 Edg/147.0.0.0"
        });
      }
      return response([
        {
          id: "tab-1",
          type: "page",
          title: "年会舞台 - 小红书搜索",
          url: "https://www.xiaohongshu.com/search_result?keyword=test"
        }
      ]);
    });

    const status = await getXhsCdpStatus({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cdpUrl: "http://127.0.0.1:9222"
    });

    expect(status.available).toBe(true);
    expect(status.browser).toBe("Edg/147.0.3912.86");
    expect(status.pageCount).toBe(1);
    expect(status.xhsPageCount).toBe(1);
    expect(status.message).toContain("真实浏览器 CDP 已连接");
  });

  it("does not report a logged-in CDP session when Xiaohongshu cookies are missing", async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      if (url.endsWith("/json/version")) {
        return response({
          Browser: "Edg/147.0.3912.86",
          "User-Agent": "Mozilla/5.0 Edg/147.0.0.0"
        });
      }
      return response([
        {
          id: "tab-1",
          type: "page",
          title: "小红书",
          url: "https://www.xiaohongshu.com/"
        }
      ]);
    });

    const status = await getXhsCdpStatus({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cdpUrl: "http://127.0.0.1:9222",
      liveProbe: async () => ({ loggedIn: false, reason: "缺少 web_session" })
    });

    expect(status.available).toBe(true);
    expect(status.loggedIn).toBe(false);
    expect(status.loginState).toBe("logged_out");
    expect(status.message).toContain("未检测到登录态");
  });

  it("reports logged-in CDP when the live probe sees a valid session", async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = input.toString();
      if (url.endsWith("/json/version")) {
        return response({
          Browser: "Edg/147.0.3912.86",
          "User-Agent": "Mozilla/5.0 Edg/147.0.0.0"
        });
      }
      return response([
        {
          id: "tab-1",
          type: "page",
          title: "小红书",
          url: "https://www.xiaohongshu.com/explore"
        }
      ]);
    });

    const status = await getXhsCdpStatus({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cdpUrl: "http://127.0.0.1:9222",
      liveProbe: async () => ({ loggedIn: true, reason: "web_session 有效" })
    });

    expect(status.loggedIn).toBe(true);
    expect(status.loginState).toBe("logged_in");
    expect(status.message).toContain("账号已登录");
  });

  it("returns an unavailable status when the CDP port is closed", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    const status = await getXhsCdpStatus({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cdpUrl: "http://127.0.0.1:9222"
    });

    expect(status.available).toBe(false);
    expect(status.message).toContain("未连接");
  });

  it("passes an abort signal to CDP status fetches so closed ports cannot hang global checks", async () => {
    const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new Error("AbortError");
    });

    const status = await getXhsCdpStatus({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cdpUrl: "http://127.0.0.1:9222",
      timeoutMs: 250
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(status.available).toBe(false);
    expect(status.message).toContain("未连接");
  });

  it("builds launch args for an isolated Edge profile", () => {
    const args = buildXhsCdpLaunchArgs({
      cdpPort: 9222,
      profileDir: "C:/workspace/data/xhs-cdp-profile"
    });

    expect(args).toContain("--remote-debugging-port=9222");
    expect(args).toContain("--user-data-dir=C:/workspace/data/xhs-cdp-profile");
    expect(args).toContain("https://www.xiaohongshu.com/");
  });

  it("starts Edge through the injected launcher", () => {
    const launched: { command: string; args: string[] }[] = [];

    const result = startXhsCdpBrowser({
      cwd: "C:/workspace",
      platform: "win32",
      fileExists: () => false,
      launch: (command, args) => {
        launched.push({ command, args });
      }
    });

    expect(result.started).toBe(true);
    expect(result.cdpUrl).toBe("http://127.0.0.1:9222");
    expect(launched[0].command).toBe("msedge");
    expect(launched[0].args).toContain("https://www.xiaohongshu.com/");
  });

  it("uses the installed Edge executable path on Windows when available", () => {
    const launched: { command: string; args: string[] }[] = [];
    const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

    const result = startXhsCdpBrowser({
      cwd: "C:/workspace",
      platform: "win32",
      fileExists: (candidate) => candidate === edgePath,
      launch: (command, args) => {
        launched.push({ command, args });
      }
    });

    expect(result.started).toBe(true);
    expect(launched[0].command).toBe(edgePath);
    expect(launched[0].args).toContain("--remote-debugging-port=9222");
  });
});

function response(payload: unknown) {
  return {
    ok: true,
    json: async () => payload
  } as Response;
}
