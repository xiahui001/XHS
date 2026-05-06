import { access } from "node:fs/promises";
import path from "node:path";
import { getEventwangLoginStatus } from "@/lib/eventwang/session";
import { getXhsLoginStatus } from "@/lib/xhs/session";

export type ScrapingCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export type ScrapingConnector = {
  key: "eventwang" | "xhs-hotspot" | "supabase";
  label: string;
  status: "ready" | "warning" | "blocked";
  message: string;
  checks: ScrapingCheck[];
};

export type ScrapingHandshake = {
  serverTime: string;
  workspaceRoot: string;
  crawlerBridge: {
    mode: "local-playwright";
    samePort: true;
    outputRoot: string;
  };
  connectors: ScrapingConnector[];
  safeguards: string[];
};

const WORKSPACE_ROOT = process.cwd();

export async function getScrapingHandshake(): Promise<ScrapingHandshake> {
  const authStatePath = path.join(WORKSPACE_ROOT, ".auth", "eventwang.json");
  const galleryScriptPath = path.join(WORKSPACE_ROOT, "scripts", "collect-eventwang-free-keyword.mjs");
  const outputRoot = path.join(WORKSPACE_ROOT, "data", "eventwang-gallery");
  const [eventwangStatus, xhsStatus] = await Promise.all([getEventwangLoginStatus(), getXhsLoginStatus()]);

  const eventwangChecks: ScrapingCheck[] = [
    await fileCheck("活动汪登录态文件", authStatePath, "已保存人工登录后的 storageState"),
    {
      label: "活动汪真实在线",
      ok: eventwangStatus.loggedIn,
      detail: eventwangStatus.detail
    },
    await fileCheck("图库采集脚本", galleryScriptPath, "可由后端按图库路径调用"),
    {
      label: "Playwright 运行时",
      ok: true,
      detail: "随 Next.js Node 进程使用本地 playwright 依赖"
    },
    {
      label: "图库原图下载规则",
      ok: true,
      detail: "进入图库搜索结果后，逐张进入详情页并点击右侧下载原图"
    }
  ];

  const supabaseChecks: ScrapingCheck[] = [
    envCheck("NEXT_PUBLIC_SUPABASE_URL", "前端 Supabase URL"),
    envCheck("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "前端 Supabase 公钥")
  ];

  const xhsChecks: ScrapingCheck[] = [
    {
      label: "小红书真实在线",
      ok: xhsStatus.loggedIn,
      detail: xhsStatus.detail
    },
    {
      label: "小红书参考入口",
      ok: xhsStatus.loggedIn,
      detail: xhsStatus.loggedIn ? "关键词参考搜索可用" : "需要先刷新小红书人工登录态"
    },
    {
      label: "账号安全边界",
      ok: true,
      detail: "不接入验证码绕过、审核规避或自动私信外链引导"
    }
  ];

  return {
    serverTime: new Date().toISOString(),
    workspaceRoot: WORKSPACE_ROOT,
    crawlerBridge: {
      mode: "local-playwright",
      samePort: true,
      outputRoot
    },
    connectors: [
      connector("eventwang", "活动汪图库采集", eventwangChecks, "图库搜索与原图下载可用"),
      connector("xhs-hotspot", "小红书热点参考", xhsChecks, "小红书真实在线与参考链路可用"),
      connector("supabase", "Supabase 持久化", supabaseChecks, "环境变量齐全后可按用户持久化")
    ],
    safeguards: [
      "活动汪登录与验证码由人工完成，后端只复用本地 storageState。",
      "活动汪只走“图库 -> 搜索关键词 -> 进入图片详情 -> 右侧下载原图”这条路径，不再调用旧搜索接口。",
      "每次采集会优先保留已布置、美陈、展示等风格，并尽量覆盖五种以上不同场景。",
      "小红书链路仅做热点参考与人工审核队列，不做平台规避自动化。"
    ]
  };
}

function connector(
  key: ScrapingConnector["key"],
  label: string,
  checks: ScrapingCheck[],
  readyMessage: string
): ScrapingConnector {
  const failed = checks.filter((check) => !check.ok);
  const status = failed.length === 0 ? "ready" : failed.length === checks.length ? "blocked" : "warning";
  return {
    key,
    label,
    status,
    message: failed.length === 0 ? readyMessage : `${failed.length} 项需要补齐`,
    checks
  };
}

async function fileCheck(label: string, filePath: string, successDetail: string): Promise<ScrapingCheck> {
  try {
    await access(filePath);
    return { label, ok: true, detail: successDetail };
  } catch {
    return { label, ok: false, detail: `缺少 ${path.relative(WORKSPACE_ROOT, filePath)}` };
  }
}

function envCheck(name: string, label: string): ScrapingCheck {
  const ok = Boolean(process.env[name]);
  return {
    label,
    ok,
    detail: ok ? `${name} 已配置` : `${name} 未配置`
  };
}
