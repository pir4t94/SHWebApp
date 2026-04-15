import jwt from "jsonwebtoken";
import type { JwtClaims } from "./types";
import { config } from "./config";

export { JWT_COOKIE, COOKIE_MAX_AGE } from "./auth-constants";

/**
 * Read the JWT secret at call time so it is always resolved after Next.js has
 * loaded .env files (which happens during app.prepare(), after module imports).
 * Reading from the pre-cached `config` object would use the fallback value when
 * the custom server.ts imports config before app.prepare() runs.
 */
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("Missing JWT_SECRET");
    return "dev-secret-change-me";
  }
  return secret;
}

/**
 * Sign a non-expiring JWT. The token is valid forever.
 * To revoke access, rotate JWT_SECRET (invalidates all existing tokens).
 */
export function signToken(claims: JwtClaims): string {
  return jwt.sign(claims, jwtSecret());
}

/**
 * Verify a token string. Returns the decoded claims on success, null on failure.
 */
export function verifyToken(token: string | undefined | null): JwtClaims | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret());
    if (typeof decoded === "object" && decoded !== null && "user" in decoded) {
      return { user: String((decoded as JwtClaims).user) };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate login credentials against configured users + shared password.
 */
export function checkCredentials(user: string, password: string): boolean {
  return config.users.includes(user) && password === config.password;
}
