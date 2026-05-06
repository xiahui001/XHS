type ArkChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ArkChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type ArkImageResponse = {
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
  };
};

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const ARK_CHAT_TIMEOUT_MS = 120000;
const ARK_IMAGE_TIMEOUT_MS = 180000;

export function getArkConfig() {
  return {
    apiKey: process.env.ARK_API_KEY || "",
    baseUrl: process.env.ARK_BASE_URL || DEFAULT_BASE_URL,
    textModel: process.env.ARK_TEXT_MODEL || "doubao-seed-character-251128",
    imageModel: process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128"
  };
}

export async function callArkJson<T>(messages: ArkChatMessage[], schemaHint: string): Promise<T> {
  const content = await callArkChat(messages, schemaHint);
  return parseArkJson<T>(content, schemaHint);
}

async function callArkChat(messages: ArkChatMessage[], schemaHint: string): Promise<string> {
  const config = getArkConfig();
  if (!config.apiKey) {
    throw new Error("ARK_API_KEY 未配置");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    signal: buildTimeoutSignal(ARK_CHAT_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.textModel,
      messages: [
        {
          role: "system",
          content: `${schemaHint}\n只输出合法 JSON，不要 Markdown，不要解释，不要省略数组或对象闭合符。`
        },
        ...messages
      ],
      temperature: 0.2
    })
  });

  const payload = (await response.json()) as ArkChatResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Ark 文本模型请求失败：${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Ark 文本模型未返回内容");
  }

  return content;
}

async function parseArkJson<T>(content: string, schemaHint: string): Promise<T> {
  const normalized = stripJsonFence(content);
  try {
    return JSON.parse(extractJsonObject(normalized)) as T;
  } catch (error) {
    const repaired = await callArkChat(
      [
        {
          role: "user",
          content: `下面内容不是合法 JSON，请按原语义修复为合法 JSON。只输出完整 JSON 对象。\n解析错误：${error instanceof Error ? error.message : "JSON parse failed"}\n内容：\n${normalized.slice(0, 12000)}`
        }
      ],
      schemaHint
    );
    try {
      return JSON.parse(extractJsonObject(stripJsonFence(repaired))) as T;
    } catch (repairError) {
      throw new Error(
        `Ark JSON 解析失败：${repairError instanceof Error ? repairError.message : "JSON parse failed"}；返回片段：${repaired.slice(0, 600)}`
      );
    }
  }
}

export async function generateArkImage(prompt: string): Promise<string> {
  const config = getArkConfig();
  if (!config.apiKey) {
    throw new Error("ARK_API_KEY 未配置");
  }

  const response = await fetch(`${config.baseUrl}/images/generations`, {
    method: "POST",
    signal: buildTimeoutSignal(ARK_IMAGE_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.imageModel,
      prompt,
      response_format: "url",
      size: "2K",
      stream: false,
      watermark: false
    })
  });

  const payload = (await response.json()) as ArkImageResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Ark 图片模型请求失败：${response.status}`);
  }

  const url = payload.data?.[0]?.url;
  const b64 = payload.data?.[0]?.b64_json;
  if (url) return url;
  if (b64) return `data:image/png;base64,${b64}`;
  throw new Error("Ark 图片模型未返回图片");
}

function stripJsonFence(input: string) {
  return input
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
}

function extractJsonObject(input: string) {
  const trimmed = input.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return trimmed;
  return trimmed.slice(start, end + 1);
}

function buildTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`ARK 请求超时（${Math.round(timeoutMs / 1000)} 秒）`)), timeoutMs);
  controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return controller.signal;
}
