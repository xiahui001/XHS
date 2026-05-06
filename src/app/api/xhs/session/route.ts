import { ok } from "@/lib/http";
import { getXhsLoginStatus } from "@/lib/xhs/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  return ok(await getXhsLoginStatus({ fresh }));
}
