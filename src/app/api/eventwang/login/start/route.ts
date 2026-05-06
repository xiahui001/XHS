import { spawn } from "node:child_process";
import path from "node:path";
import { fail, ok } from "@/lib/http";
import { isHostedRuntime } from "@/lib/runtime/deployment";

export const runtime = "nodejs";

export async function POST() {
  try {
    if (isHostedRuntime()) {
      return fail(
        "EVENTWANG_LOGIN_START_UNSUPPORTED",
        "Vercel 公网版不能拉起本机活动汪登录窗口，请在 localhost 本机版打开",
        501
      );
    }

    const scriptPath = path.join(process.cwd(), "scripts", "login-eventwang.mjs");
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    child.unref();

    return ok({
      started: true,
      message: "已打开活动汪人工登录窗口，请在浏览器内完成登录和验证码"
    });
  } catch (error) {
    return fail(
      "EVENTWANG_LOGIN_START_FAILED",
      error instanceof Error ? error.message : "活动汪登录窗口启动失败",
      400
    );
  }
}
