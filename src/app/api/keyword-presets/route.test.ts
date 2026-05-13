import { beforeEach, describe, expect, it, vi } from "vitest";

const { callArkJson, createSupabaseServerClient } = vi.hoisted(() => ({
  callArkJson: vi.fn(),
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
  hasSupabaseAuthConfig: () => true,
  readBearerToken: (headerValue: string | null | undefined) => {
    const match = headerValue?.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
  }
}));

vi.mock("@/lib/ark/client", () => ({
  callArkJson
}));

import { GET, POST } from "./route";

describe("/api/keyword-presets", () => {
  beforeEach(() => {
    callArkJson.mockReset();
    createSupabaseServerClient.mockReset();
    createSupabaseServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: null })
          })
        })
      })
    });
  });

  it("requires a bearer token when Supabase auth is configured", async () => {
    const response = await GET(
      new Request("http://localhost/api/keyword-presets?userId=11111111-1111-4111-8111-111111111111&accountCode=A2")
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("AUTH_TOKEN_REQUIRED");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires a bearer token before classifying new keyword presets", async () => {
    const response = await POST(
      new Request("http://localhost/api/keyword-presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: "11111111-1111-4111-8111-111111111111",
          accountCode: "A2",
          rawText: "campus event"
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("AUTH_TOKEN_REQUIRED");
    expect(callArkJson).not.toHaveBeenCalled();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
