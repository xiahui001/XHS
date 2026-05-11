import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const { createSupabaseServerClient, downloadFile } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  downloadFile: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient
}));

import { GET } from "./route";

const LOCAL_PACKAGE_DIR = path.join(process.cwd(), "data", "mobile-publish-packages");
const TEST_PACKAGE_ID = "local-route-test-package";
const TEST_PACKAGE_DIR = path.join(LOCAL_PACKAGE_DIR, TEST_PACKAGE_ID);
const SUPABASE_PACKAGE_ID = "supabase-route-test-package";
const SUPABASE_PACKAGE_DIR = path.join(LOCAL_PACKAGE_DIR, SUPABASE_PACKAGE_ID);

describe("/api/mobile-publish-packages/[packageId]", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    downloadFile.mockReset();
    createSupabaseServerClient.mockReturnValue(null);
  });

  afterEach(async () => {
    await rm(TEST_PACKAGE_DIR, { recursive: true, force: true });
    await rm(SUPABASE_PACKAGE_DIR, { recursive: true, force: true });
  });

  it("serves local package data as raw mobile package JSON", async () => {
    const packageData = {
      packageId: TEST_PACKAGE_ID,
      draftId: "draft-local",
      accountName: "建筑行业",
      title: "售房部开业活动，快来参加！",
      body: "售房部开业啦！现场布置到位，可留下印记。",
      tags: ["售房部"],
      shareText: "售房部开业活动，快来参加！",
      deeplinkUrl: "xhsdiscover://post",
      imageUrls: [],
      imageFiles: []
    };
    await mkdir(TEST_PACKAGE_DIR, { recursive: true });
    await writeFile(path.join(TEST_PACKAGE_DIR, "package.json"), JSON.stringify(packageData), "utf8");

    const response = await GET(new Request(`http://localhost/api/mobile-publish-packages/${TEST_PACKAGE_ID}`), {
      params: { packageId: TEST_PACKAGE_ID }
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(packageData);
  });

  it("serves Supabase package data by package id when no local package exists", async () => {
    const packageData = {
      packageId: SUPABASE_PACKAGE_ID,
      draftId: "draft-supabase",
      accountName: "校园活动",
      title: "毕业典礼舞台搭建",
      body: "毕业典礼现场布置完成。",
      tags: ["毕业典礼"],
      shareText: "毕业典礼舞台搭建",
      deeplinkUrl: "xhsdiscover://post",
      imageUrls: ["https://storage.local/packages/supabase-route-test-package/images/1.jpg"],
      imageFiles: []
    };
    downloadFile.mockResolvedValue({
      data: new Blob([JSON.stringify(packageData)], { type: "application/json" }),
      error: null
    });
    createSupabaseServerClient.mockReturnValue({
      storage: {
        from: () => ({
          download: downloadFile
        })
      }
    });

    const response = await GET(new Request(`http://localhost/api/mobile-publish-packages/${SUPABASE_PACKAGE_ID}`), {
      params: { packageId: SUPABASE_PACKAGE_ID }
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(packageData);
    expect(downloadFile).toHaveBeenCalledWith(`packages/${SUPABASE_PACKAGE_ID}/package.json`);
  });
});
