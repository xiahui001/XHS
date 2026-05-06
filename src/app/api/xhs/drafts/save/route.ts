import { execFile } from "node:child_process";
import { access, mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";
import { extractEventwangLocalPath } from "@/lib/xhs/draft-images";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

const imageSchema = z.object({
  prompt: z.string().optional(),
  url: z.string().optional(),
  localPath: z.string().optional()
});

const draftSchema = z.object({
  id: z.string().min(1),
  accountName: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
  generatedImages: z.array(imageSchema).optional(),
  publishImages: z.array(imageSchema).optional()
});

const schema = z.object({
  draft: draftSchema
});

type XhsDraftSaveSummary = {
  jobId: string;
  status: "saved";
  detail: string;
  debugDir: string;
  uploadedCount: number;
  imageCount: number;
  title: string;
  savedAt: string;
};

type ExecFileFailure = Error & {
  stdout?: string;
  stderr?: string;
  killed?: boolean;
};

const EVENTWANG_ROOT = path.join(process.cwd(), "data", "eventwang-gallery");
const JOB_ROOT = path.join(process.cwd(), "data", "xhs-draft-jobs");

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const imagePaths = await resolveDraftImagePaths(input.draft);
    if (!imagePaths.length) {
      return fail("XHS_DRAFT_IMAGES_REQUIRED", "草稿没有可上传的活动汪本地原图", 400);
    }

    const jobId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeId(input.draft.id)}`;
    const jobDir = path.join(JOB_ROOT, jobId);
    const payloadPath = path.join(jobDir, "payload.json");
    await mkdir(jobDir, { recursive: true });
    await writeFile(
      payloadPath,
      JSON.stringify(
        {
          jobId,
          draft: {
            id: input.draft.id,
            accountName: input.draft.accountName ?? "",
            title: input.draft.title.trim(),
            body: buildDraftBody(input.draft.body, input.draft.tags ?? []),
            tags: input.draft.tags ?? []
          },
          imagePaths
        },
        null,
        2
      ),
      "utf8"
    );

    const scriptPath = path.join(process.cwd(), "scripts", "save-xhs-draft.mjs");
    const { stdout } = await execFileAsync(process.execPath, [scriptPath, `--job=${payloadPath}`], {
      cwd: process.cwd(),
      timeout: 900000,
      maxBuffer: 1024 * 1024 * 8
    });

    return ok(parseScriptSummary(stdout));
  } catch (error) {
    return fail("XHS_DRAFT_SAVE_FAILED", cleanDraftSaveError(error), 400);
  }
}

async function resolveDraftImagePaths(draft: z.infer<typeof draftSchema>): Promise<string[]> {
  const root = await realpath(EVENTWANG_ROOT);
  const sourceImages = draft.publishImages?.length ? draft.publishImages : draft.generatedImages ?? [];
  const resolvedPaths: string[] = [];
  const seen = new Set<string>();

  for (const image of sourceImages) {
    const localPath = extractEventwangLocalPath(image);
    if (!localPath) continue;

    const absolutePath = path.isAbsolute(localPath) ? localPath : path.join(process.cwd(), localPath);
    const resolvedPath = await realpath(absolutePath);
    if (!isInsideDirectory(root, resolvedPath)) {
      throw new Error("草稿图片路径不在活动汪采集目录内");
    }

    await access(resolvedPath);
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);
    resolvedPaths.push(resolvedPath);
    if (resolvedPaths.length >= 10) break;
  }

  return resolvedPaths;
}

function buildDraftBody(body: string, tags: string[]) {
  const cleanBody = body.trim();
  const tagText = tags
    .map((tag) => tag.replace(/^#+/, "").trim())
    .filter(Boolean)
    .map((tag) => `#${tag}`)
    .join(" ");
  return [cleanBody, tagText].filter(Boolean).join("\n\n").slice(0, 980);
}

function parseScriptSummary(stdout: string): XhsDraftSaveSummary {
  const marker = stdout.split(/\r?\n/).find((line) => line.startsWith("XHS_DRAFT_SAVE_DONE "));
  if (!marker) throw new Error("脚本未返回小红书草稿保存结果");
  return JSON.parse(marker.replace("XHS_DRAFT_SAVE_DONE ", "")) as XhsDraftSaveSummary;
}

function cleanDraftSaveError(error: unknown) {
  const execError = error as ExecFileFailure;
  const marker = execError.stdout?.split(/\r?\n/).find((line) => line.startsWith("XHS_DRAFT_SAVE_DONE "));
  if (marker) {
    try {
      const summary = JSON.parse(marker.replace("XHS_DRAFT_SAVE_DONE ", "")) as XhsDraftSaveSummary;
      return `${summary.detail}，诊断目录：${summary.debugDir}`;
    } catch {
      return marker;
    }
  }

  const failedMarker = execError.stderr?.split(/\r?\n/).find((line) => line.startsWith("XHS_DRAFT_SAVE_FAILED "));
  if (failedMarker) {
    try {
      const failure = JSON.parse(failedMarker.replace("XHS_DRAFT_SAVE_FAILED ", "")) as {
        message?: string;
        debugDir?: string;
      };
      return [failure.message || "小红书草稿保存失败", failure.debugDir ? `诊断目录：${failure.debugDir}` : ""]
        .filter(Boolean)
        .join("，");
    } catch {
      return failedMarker;
    }
  }

  const stderr = execError.stderr?.split(/\r?\n/).find(Boolean);
  const message = error instanceof Error ? error.message : "小红书草稿保存失败";
  if (message.includes(".auth/xhs.json")) return "缺少 .auth/xhs.json，请先完成人工登录小红书";
  if (execError.killed) return "小红书草稿保存超时，请稍后重试或减少图片数量";
  return stderr || message.split(/\r?\n/)[0] || "小红书草稿保存失败";
}

function isInsideDirectory(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safeId(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 48) || "draft";
}
