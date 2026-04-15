import { cookies } from "next/headers";
import { JWT_COOKIE } from "./auth-constants";
import { verifyToken } from "./auth";
import type { JwtClaims } from "./types";

/**
 * Read + verify the JWT cookie in a Next.js server (App Router) context.
 *
 * Lives in its own module so that `next/headers` — which relies on Next's
 * request-scoped AsyncLocalStorage — is only loaded inside Next request
 * handlers. The custom `server.ts` imports `auth.ts` transitively via the
 * WebSocket server, and importing `next/headers` there crashes at boot.
 */
export async function getSession(): Promise<JwtClaims | null> {
  const store = await cookies();
  return verifyToken(store.get(JWT_COOKIE)?.value);
}
