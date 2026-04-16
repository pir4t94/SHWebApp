import path from "node:path";

/**
 * Centralized runtime configuration.
 * All secrets come from environment variables -- never hardcode.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "data");

export const config = {
  port: Number(process.env.PORT ?? 3000),

  jwtSecret: required("JWT_SECRET", process.env.NODE_ENV !== "production" ? "dev-secret-change-me" : undefined),

  password: required("APP_PASSWORD", process.env.NODE_ENV !== "production" ? "dev-password" : undefined),

  // No fallback -- an empty APP_USERS means nobody can log in, which is a safe
  // failure mode. Hardcoding names here would be a security risk.
  users: (process.env.APP_USERS ?? "").split(",").map((u) => u.trim()).filter(Boolean),

  apiKey: required("ENTIA_API_KEY", process.env.NODE_ENV !== "production" ? "dev-api-key" : undefined),

  entia: {
    baseUrl: process.env.ENTIA_BASE_URL ?? "https://ape.entia.si/2/",
    username: required("ENTIA_USERNAME"),
    password: required("ENTIA_PASSWORD"),
  },

  sun: {
    lat: Number(process.env.SUN_LAT ?? 46.55626109037798),
    lng: Number(process.env.SUN_LNG ?? 15.609831489998498),
    delaySunset: 600000,
    delaySunrise: 600000
  },

  paths: {
    dataDir: DATA_DIR,
    devices: path.join(DATA_DIR, "devices.json"),
    jobs: path.join(DATA_DIR, "jobs.json"),
    customDevices: path.join(DATA_DIR, "custom_devices.json"),
  },
} as const;



export type AppConfig = typeof config;
