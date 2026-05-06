import { ok } from "@/lib/http";
import { getXhsLoginStatus } from "@/lib/xhs/session";

export const runtime = "nodejs";

export async function GET() {
  return ok(await getXhsLoginStatus());
}
