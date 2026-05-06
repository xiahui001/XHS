import { z } from "zod";
import { callArkJson } from "@/lib/ark/client";
import { fail, ok, parseJson } from "@/lib/http";
import { createSupabaseServerClient, readBearerToken } from "@/lib/supabase/server";
import { createKeywordPreset } from "@/lib/workspace/state";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().min(1),
  accountCode: z.string().min(1),
  rawText: z.string().min(1)
});

type CategoryPayload = {
  categories: string[];
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawUserId = url.searchParams.get("userId");
  const accountCode = url.searchParams.get("accountCode");
  if (!rawUserId) return fail("USER_ID_REQUIRED", "缺少用户 ID", 400);

  const accessToken = readBearerToken(request.headers.get("authorization"));
  const supabase = createSupabaseServerClient(accessToken);
  if (!supabase) return ok({ presets: [], mode: "demo" });
  const userId = await resolveSupabaseUserId(supabase, rawUserId);

  let query = supabase.from("keyword_presets").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (accountCode) query = query.eq("account_code", accountCode);

  const { data, error } = await query;
  if (error) return fail("KEYWORD_PRESETS_LOAD_FAILED", error.message, 400);

  return ok({
    presets: (data ?? []).map((row) => ({
      id: row.id,
      accountId: row.account_code,
      rawText: row.raw_text,
      keywords: row.keywords,
      categories: row.categories
    })),
    mode: "supabase"
  });
}

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, schema);
    const categories = await classifyKeywordCategories(input.rawText);
    const accessToken = readBearerToken(request.headers.get("authorization"));
    const supabase = createSupabaseServerClient(accessToken);
    const preset = createKeywordPreset({
      accountId: input.accountCode,
      rawText: input.rawText,
      categories
    });
    if (!supabase) return ok({ preset, mode: "demo" });
    const userId = await resolveSupabaseUserId(supabase, input.userId);

    const { data, error } = await supabase
      .from("keyword_presets")
      .insert({
        user_id: userId,
        account_code: preset.accountId,
        raw_text: preset.rawText,
        keywords: preset.keywords,
        categories: preset.categories
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return ok({
      preset: {
        id: data.id,
        accountId: data.account_code,
        rawText: data.raw_text,
        keywords: data.keywords,
        categories: data.categories
      },
      mode: "supabase"
    });
  } catch (error) {
    return fail("KEYWORD_PRESET_SAVE_FAILED", error instanceof Error ? error.message : "关键词预设保存失败", 400);
  }
}

async function resolveSupabaseUserId(supabase: ReturnType<typeof createSupabaseServerClient>, userIdOrEmail: string) {
  if (!supabase) throw new Error("Supabase 未配置");
  if (isUuid(userIdOrEmail)) return userIdOrEmail;

  const email = userIdOrEmail.includes("@") ? userIdOrEmail : "";
  if (!email) throw new Error("用户登录态已过期，请退出后重新登录");

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error("未找到该邮箱对应的 Supabase 用户，请重新登录");
  return user.id;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function classifyKeywordCategories(rawText: string): Promise<string[]> {
  try {
    const payload = await callArkJson<CategoryPayload>(
      [{ role: "user", content: JSON.stringify({ keywords: rawText }) }],
      '判断关键词所属活动类别，只输出 {"categories":["类别1","类别2"]}，必须正好两个类别。'
    );
    const categories = Array.isArray(payload.categories) ? payload.categories.filter(Boolean).slice(0, 2) : [];
    if (categories.length === 2) return categories;
  } catch {
    // Local fallback keeps preset creation usable when the model is not configured.
  }

  if (/校园|毕业|开学|社团/.test(rawText)) return ["校园活动", "舞台搭建"];
  if (/商场|美陈|快闪|门店/.test(rawText)) return ["商业美陈", "空间布置"];
  if (/建筑|地产|开放日|工地/.test(rawText)) return ["建筑地产", "发布会"];
  if (/美业|招商|沙龙|微商/.test(rawText)) return ["美业招商", "私域会销"];
  return ["企业年会", "团建活动"];
}
