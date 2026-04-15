/**
 * Shared domain types for EntiaBot.
 */

export type DeviceSubtype = 0 | 1 | 2; // 0 = light, 1 = fan, 2 = shade

export interface UserMeta {
  name: string;
  order: number;
}

export interface Device {
  id: number;
  type: number;
  subtype: DeviceSubtype;
  value: number;
  display?: boolean;
  /** Per-user display overrides keyed by username. */
  [user: string]: unknown;
  lastStart?: Date;
}

export interface CustomDevice {
  id: number;
  devicesIds: number[];
  type: "multiple";
  [user: string]: unknown;
}

export type JobType = "sunrise" | "sunset" | "generic";

export interface SunsetDeviceSpec {
  value: number;
  makeTurn: boolean;
}

export interface SunriseSunsetJob {
  type: "sunrise" | "sunset";
  devices: Record<string, SunsetDeviceSpec | number>;
}

export interface GenericJob {
  type: "generic";
  subtype?: "after";
  targetDeviceId?: number;
  devicesIds: number[];
  runAt?: { hours: number; minutes?: number }[];
  startAfter?: number;
  runFor?: number;
  targetRunFor?: number;
  startValue: number;
  endValue: number;
}

export type Job = SunriseSunsetJob | GenericJob;

/** Device update broadcast payload (from heartbeat). */
export interface DeviceUpdate {
  id: number;
  subtype: DeviceSubtype;
  value: number;
}

/** WebSocket client → server messages. */
export type ClientMessage =
  | { type: "refresh" }
  | { type: "setDevice"; deviceId: number; value?: number }
  | { type: "setCustomDevice"; customDeviceId: number; value?: number };

/** WebSocket server → client messages. */
export type ServerMessage =
  | { type: "authSuccess"; user: string }
  | { type: "devices"; data: Device[]; customDevices: CustomDevice[] }
  | { type: "setDeviceSuccess"; deviceId: number }
  | { type: "setCustomDeviceSuccess"; customDeviceId: number }
  | { type: "error"; message: string }
  | DeviceUpdate[];

/** JWT payload shape. */
export interface JwtClaims {
  user: string;
}
