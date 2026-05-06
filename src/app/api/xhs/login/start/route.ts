import { spawn } from "node:child_process";
import path from "node:path";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST() {
  try {
    const scriptPath = path.join(process.cwd(), "scripts", "login-xhs.mjs");
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    child.unref();

    return ok({
      started: true,
      message: "已打开小红书人工登录窗口，请在浏览器内完成登录和验证码"
    });
  } catch (error) {
    return fail("XHS_LOGIN_START_FAILED", error instanceof Error ? error.message : "小红书登录窗口启动失败", 400);
  }
}
