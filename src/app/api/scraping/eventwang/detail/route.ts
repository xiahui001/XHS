import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { fail, ok, parseJson } from "@/lib/http";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

const schema = z.object({
  designResourceId: z.string().regex(/^\d{3,12}$/),
  title: z.string().min(1).max(80).optional(),
  autoDownloadFile: z.boolean().optional()
});

type ScriptSummary = {
  outputDir: string;
  imageCount: number;
  detectedTotalPages: number | null;
  detectedRemainingPages: number | null;
  fileDownload: {
    status: "downloaded" | "blocked";
    totalCoins: number | null;
    localPath?: string;
    suggestedFilename?: string;
    message: string;
  } | null;
};

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const scriptPath = path.join(process.cwd(), "scripts", "download-eventwang-design-detail.mjs");
    const args = [scriptPath, `--id=${input.designResourceId}`];

    if (input.title) {
      args.push(`--title=${input.title}`);
    }
    if (input.autoDownloadFile ?? true) {
      args.push("--autoDownloadFile=true");
    }

    const { stdout } = await execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      timeout: 180000,
      maxBuffer: 1024 * 1024
    });
    const summary = parseScriptSummary(stdout);

    return ok({
      designResourceId: input.designResourceId,
      title: input.title ?? null,
      ...summary,
      note:
        summary.fileDownload?.status === "downloaded"
          ? "确认订单总计为 0 汪币，已执行官方文件下载。"
          : summary.fileDownload?.message ?? "当前账号可见图片已下载完成。"
    });
  } catch (error) {
    return fail("EVENTWANG_DETAIL_COLLECT_FAILED", error instanceof Error ? error.message : "活动汪详情采集失败", 400);
  }
}

function parseScriptSummary(stdout: string): ScriptSummary {
  const marker = stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("EVENTWANG_DESIGN_DETAIL_DONE "));

  if (!marker) {
    throw new Error("脚本未返回详情采集结果");
  }

  return JSON.parse(marker.replace("EVENTWANG_DESIGN_DETAIL_DONE ", "")) as ScriptSummary;
}
