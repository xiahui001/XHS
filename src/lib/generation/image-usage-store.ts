import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DraftImageAssignment, DraftImagePlacement } from "./draft-images";

export type ImageUsageStoreOptions = {
  storePath?: string;
};

type ImageUsageRecord = {
  key: string;
  draftId: string;
  role: DraftImagePlacement["role"];
  prompt: string;
  url: string;
  localPath?: string;
  usedAt: string;
};

type ImageUsageSnapshot = {
  version: 1;
  records: ImageUsageRecord[];
};

const DEFAULT_STORE_PATH = path.join(process.cwd(), "data", "draft-image-usage.json");

export async function readUsedImageKeys(options: ImageUsageStoreOptions = {}) {
  const snapshot = await readImageUsageSnapshot(resolveStorePath(options));
  return new Set(snapshot.records.map((record) => record.key));
}

export async function recordAssignedDraftImages(
  assignments: DraftImageAssignment[],
  options: ImageUsageStoreOptions = {}
) {
  const storePath = resolveStorePath(options);
  const snapshot = await readImageUsageSnapshot(storePath);
  const recordsByKey = new Map(snapshot.records.map((record) => [record.key, record]));
  const usedAt = new Date().toISOString();

  for (const assignment of assignments) {
    for (const image of assignment.images) {
      if (!image.usageKey || recordsByKey.has(image.usageKey)) continue;
      recordsByKey.set(image.usageKey, {
        key: image.usageKey,
        draftId: assignment.draftId,
        role: image.role,
        prompt: image.prompt,
        url: image.url,
        localPath: image.localPath,
        usedAt
      });
    }
  }

  await writeImageUsageSnapshot(storePath, {
    version: 1,
    records: [...recordsByKey.values()]
  });
}

async function readImageUsageSnapshot(storePath: string): Promise<ImageUsageSnapshot> {
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ImageUsageSnapshot> | ImageUsageRecord[];
    if (Array.isArray(parsed)) return { version: 1, records: parsed.filter(isUsageRecord) };
    return {
      version: 1,
      records: Array.isArray(parsed.records) ? parsed.records.filter(isUsageRecord) : []
    };
  } catch (error) {
    if (isMissingFileError(error)) return { version: 1, records: [] };
    throw error;
  }
}

async function writeImageUsageSnapshot(storePath: string, snapshot: ImageUsageSnapshot) {
  await mkdir(path.dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(tempPath, storePath);
}

function resolveStorePath(options: ImageUsageStoreOptions) {
  return options.storePath ?? DEFAULT_STORE_PATH;
}

function isUsageRecord(value: unknown): value is ImageUsageRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      "key" in value &&
      typeof value.key === "string" &&
      "draftId" in value &&
      typeof value.draftId === "string" &&
      "role" in value &&
      (value.role === "cover" || value.role === "body") &&
      "prompt" in value &&
      typeof value.prompt === "string" &&
      "url" in value &&
      typeof value.url === "string"
  );
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
