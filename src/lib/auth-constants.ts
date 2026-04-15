/**
 * Edge-runtime-safe auth constants.
 * Kept separate from `auth.ts` so the middleware can import without pulling
 * in Node-only dependencies (`node:path`, `jsonwebtoken`, etc.).
 */
export const JWT_COOKIE = "jwt";

/** Cookie Max-Age: 10 years. The JWT itself has no expiry; this just keeps the cookie alive in the browser. */
export const COOKIE_MAX_AGE = 10 * 365 * 24 * 60 * 60; // 315 360 000 s
