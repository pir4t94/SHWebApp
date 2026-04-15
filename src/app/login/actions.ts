"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { JWT_COOKIE, COOKIE_MAX_AGE, checkCredentials, signToken } from "@/lib/auth";

export async function loginAction(
  _prev: { error: string } | undefined,
  formData: FormData,
): Promise<{ error: string } | undefined> {
  const user = String(formData.get("user") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!checkCredentials(user, password)) {
    return { error: "Invalid credentials" };
  }

  const token = signToken({ user });
  const store = await cookies();
  store.set(JWT_COOKIE, token, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
  });

  redirect("/");
}
