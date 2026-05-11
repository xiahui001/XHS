import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { GET } from "./route";

const LOCAL_PACKAGE_DIR = path.join(process.cwd(), "data", "mobile-publish-packages");
const TEST_PACKAGE_ID = "local-route-test-package";
const TEST_PACKAGE_DIR = path.join(LOCAL_PACKAGE_DIR, TEST_PACKAGE_ID);

describe("/api/mobile-publish-packages/[packageId]", () => {
  afterEach(async () => {
    await rm(TEST_PACKAGE_DIR, { recursive: true, force: true });
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
});
