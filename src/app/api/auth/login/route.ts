import { NextResponse } from "next/server";
import { z } from "zod";
import { JWT_COOKIE, COOKIE_MAX_AGE, checkCredentials, signToken } from "@/lib/auth";

export const runtime = "nodejs";

const loginSchema = z.object({
  user: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { user, password } = parsed.data;

  if (!checkCredentials(user, password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = signToken({ user });
  const response = NextResponse.json({ ok: true });

  response.cookies.set(JWT_COOKIE, token, {
    path: "/",
    sameSite: "lax",
    // httpOnly deliberately OFF — the WebSocket client reads the token from
    // document.cookie to authenticate the socket. Using a separate header or
    // message-envelope token would let us flip this back on later.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
  });

  return response;
}
