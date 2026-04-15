import { cookies } from "next/headers";
import { config } from "./config";
import { JWT_COOKIE, verifyToken } from "./auth";

/**
 * Authorize an API request. Accepts either:
 *   - an X-API-Key header matching the configured API key (for Homebridge), or
 *   - a valid JWT in the `jwt` cookie (browser).
 */
export async function authorizeApi(request: Request): Promise<boolean> {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && apiKey === config.apiKey) return true;

  const store = await cookies();
  const token = store.get(JWT_COOKIE)?.value;
  return Boolean(verifyToken(token));
}
