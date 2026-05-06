import { NextResponse } from "next/server";
import { z } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message }
    },
    { status }
  );
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body = (await request.json()) as unknown;
  return schema.parse(body);
}
