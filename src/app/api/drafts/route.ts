import { z } from "zod";
import { appendDrafts, filterDraftStore, readDraftStore } from "@/lib/drafts/store";
import type { GeneratedDraft } from "@/lib/generation/draft-generator";
import { fail, ok, parseJson } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const USER_DRAFT_BUCKET = "xhs-user-drafts";

const schema = z.object({
  drafts: z.array(z.unknown()).min(1),
  userId: z.string().optional(),
  accountId: z.string().optional()
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword");
  const accountId = url.searchParams.get("accountId") || url.searchParams.get("accountCode");
  const userId = url.searchParams.get("userId");
  const drafts = await readDraftStore();
  const filteredDrafts = filterDraftStore(drafts, { keyword, accountId });
  const supabase = createSupabaseServerClient();

  if (supabase && userId && accountId) {
    try {
      const persistedDrafts = await readSupabaseDrafts(supabase, userId, accountId);
      if (persistedDrafts) {
        return ok({
          drafts: filterDraftStore(persistedDrafts, { keyword, accountId }),
          mode: "supabase_storage"
        });
      }

      if (filteredDrafts.length) {
        await writeSupabaseDrafts(supabase, userId, accountId, filteredDrafts);
        return ok({
          drafts: filteredDrafts,
          mode: "supabase_seeded_from_local"
        });
      }
    } catch {
      return ok({
        drafts: filteredDrafts,
        mode: "local_store_fallback"
      });
    }
  }

  return ok({
    drafts: filteredDrafts,
    mode: "local_store"
  });
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const incomingDrafts = input.drafts as GeneratedDraft[];
    const drafts = await appendDrafts(incomingDrafts);
    const filteredDrafts = filterDraftStore(drafts, { accountId: input.accountId });
    const supabase = createSupabaseServerClient();

    if (supabase && input.userId && input.accountId) {
      try {
        const existingDrafts = (await readSupabaseDrafts(supabase, input.userId, input.accountId)) ?? [];
        const mergedDrafts = mergeDrafts(incomingDrafts, existingDrafts);
        await writeSupabaseDrafts(supabase, input.userId, input.accountId, mergedDrafts);
        return ok({
          drafts: filterDraftStore(mergedDrafts, { accountId: input.accountId }),
          insertedCount: incomingDrafts.length,
          mode: "supabase_storage"
        });
      } catch {
        return ok({
          drafts: filteredDrafts,
          insertedCount: incomingDrafts.length,
          mode: "local_store_fallback"
        });
      }
    }

    return ok({ drafts: filteredDrafts, insertedCount: incomingDrafts.length, mode: "local_store" });
  } catch (error) {
    return fail("DRAFT_SAVE_FAILED", error instanceof Error ? error.message : "草稿保存失败", 400);
  }
}

async function readSupabaseDrafts(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  accountId: string
): Promise<GeneratedDraft[] | null> {
  await ensureDraftBucket(supabase);
  const { data, error } = await supabase.storage.from(USER_DRAFT_BUCKET).download(userDraftStoragePath(userId, accountId));
  if (error) {
    if (/not found|does not exist|404/i.test(error.message)) return null;
    throw error;
  }

  const content = await data.text();
  const payload = JSON.parse(content) as { drafts?: GeneratedDraft[] };
  return Array.isArray(payload.drafts) ? payload.drafts : [];
}

async function writeSupabaseDrafts(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  accountId: string,
  drafts: GeneratedDraft[]
) {
  await ensureDraftBucket(supabase);
  const payload = Buffer.from(JSON.stringify({ userId, accountId, drafts, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  const { error } = await supabase.storage.from(USER_DRAFT_BUCKET).upload(userDraftStoragePath(userId, accountId), payload, {
    contentType: "application/json",
    cacheControl: "30",
    upsert: true
  });
  if (error) throw error;
}

async function ensureDraftBucket(supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>) {
  const buckets = await supabase.storage.listBuckets();
  if (buckets.error) throw buckets.error;

  if (buckets.data.some((bucket) => bucket.name === USER_DRAFT_BUCKET)) return;

  const created = await supabase.storage.createBucket(USER_DRAFT_BUCKET, {
    public: false,
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["application/json"]
  });
  if (created.error) throw created.error;
}

function userDraftStoragePath(userId: string, accountId: string) {
  return `users/${safeSegment(userId)}/accounts/${safeSegment(accountId)}/drafts.json`;
}

function mergeDrafts(incoming: GeneratedDraft[], existing: GeneratedDraft[]) {
  const seen = new Set<string>();
  const result: GeneratedDraft[] = [];

  for (const draft of [...incoming, ...existing]) {
    if (seen.has(draft.id)) continue;
    seen.add(draft.id);
    result.push(draft);
  }

  return result;
}

function safeSegment(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || "unknown";
}
