import { describe, expect, it } from "vitest";
import { readBearerToken } from "./server";

describe("readBearerToken", () => {
  it("extracts a bearer token from an authorization header", () => {
    expect(readBearerToken("Bearer token-123")).toBe("token-123");
  });

  it("returns null for a missing or malformed authorization header", () => {
    expect(readBearerToken(null)).toBeNull();
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readBearerToken("Bearer")).toBeNull();
  });
});
