import { NextResponse } from "next/server";
import { JWT_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(JWT_COOKIE);
  return response;
}
