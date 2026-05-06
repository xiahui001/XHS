import { fail } from "@/lib/http";

export async function POST(request: Request) {
  await request.text();
  return fail("GENERATION_ROUTE_REPLACED", "请使用 /api/xhs/scrape -> /api/remix/drafts -> /api/remix/images -> /api/drafts 的真实流程", 410);
}
