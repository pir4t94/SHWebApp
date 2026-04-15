import fs from "node:fs/promises";
import fsSync from "node:fs";
import schedule from "node-schedule";
import { config } from "../config";
import type { CustomDevice, Device, DeviceUpdate, GenericJob, Job } from "../types";
import { SunriseSunsetService } from "./sunrise-sunset";

// ---------- constants ---------------------------------------------------------

/** Delay between consecutive DEVICE_SET calls in a batch. */
const DEVICE_SET_DELAY_MS = 750;

/**
 * Minimum gap between heartbeat polls. Entia CHECK is normally a long-poll,
 * but this guard prevents a tight loop if it ever returns immediately.
 */
const HEARTBEAT_MIN_INTERVAL_MS = 200;

/** Per-request abort timeout. */
const REQUEST_TIMEOUT_MS = 30_000;

// ---------- EntiaService ------------------------------------------------------

/**
 * EntiaService is a process-wide singleton that:
 *   - authenticates with the Entia upstream API
 *   - maintains a long-poll heartbeat for device state
 *   - schedules sunrise/sunset and generic jobs
 *   - exposes device and custom-device write operations
 *   - broadcasts updates via a pluggable callback
 */
export class EntiaService {
  private sessId = "";
  private pipeId = "";
  private chl = 0;

  devices: Device[] = [];
  jobs: Job[] = [];
  customDevices: CustomDevice[] = [];
  isConnected = false;

  readonly sunAPI = new SunriseSunsetService();

  /** Hook for broadcasting device updates to subscribers (e.g. WebSocket layer). */
  onDeviceUpdate: ((updates: DeviceUpdate[]) => void) | null = null;

  private heartbeatRunning = false;

  // ---------- lifecycle -------------------------------------------------------

  async init(): Promise<void> {
    console.info("[entia] initialising...");
    await fs.mkdir(config.paths.dataDir, { recursive: true });
    await this.loadJobs();
    await this.loadCustomDevices();

    try {
      await this.login();
      await this.loadDevices();
      this.isConnected = true;
      console.info(`[entia] connected -- ${this.devices.length} device(s) loaded`);
    } catch (err) {
      this.isConnected = false;
      this.devices = [];
      console.error("[entia] initial connection failed:", (err as Error).message);
    }

    if (this.isConnected) {
      this.startHeartbeat();
    }

    try {
      await this.sunAPI.run(this, this.jobs);
    } catch (err) {
      console.error("[entia] sunrise/sunset init failed:", err);
    }

    await this.scheduleJobs();
    console.info("[entia] init complete");
  }

  async reconnect(): Promise<boolean> {
    console.info("[entia] reconnecting...");
    try {
      await this.login();
      await this.loadDevices();
      this.isConnected = true;
      console.info(`[entia] reconnected -- ${this.devices.length} device(s)`);
    } catch (err) {
      this.isConnected = false;
      this.devices = [];
      console.warn("[entia] reconnect failed:", (err as Error).message);
    }
    if (this.isConnected) {
      this.startHeartbeat();
    }
    return this.isConnected;
  }

  // ---------- persistence -----------------------------------------------------

  private async loadJobs(): Promise<void> {
    if (!fsSync.existsSync(config.paths.jobs)) {
      console.info("[entia] jobs.json not found -- starting with no jobs");
      return;
    }
    try {
      this.jobs = JSON.parse(await fs.readFile(config.paths.jobs, "utf8")) as Job[];
      console.info(`[entia] loaded ${this.jobs.length} job(s) from ${config.paths.jobs}`);
    } catch (err) {
      console.error("[entia] failed to parse jobs.json -- running without jobs:", (err as Error).message);
      this.jobs = [];
    }
  }

  private async loadCustomDevices(): Promise<void> {
    if (!fsSync.existsSync(config.paths.customDevices)) {
      console.info("[entia] custom_devices.json not found -- starting with no custom devices");
      return;
    }
    try {
      this.customDevices = JSON.parse(
        await fs.readFile(config.paths.customDevices, "utf8")
      ) as CustomDevice[];
      console.info(`[entia] loaded ${this.customDevices.length} custom device(s)`);
    } catch (err) {
      console.error("[entia] failed to parse custom_devices.json:", (err as Error).message);
      this.customDevices = [];
    }
  }

  private async loadDevices(): Promise<void> {
    await this.fetchDevices();
    if (!fsSync.existsSync(config.paths.devices)) return;
    try {
      const saved = JSON.parse(await fs.readFile(config.paths.devices, "utf8")) as Device[];
      if (this.devices.length) {
        // Merge persisted metadata (display name, subtype, order, per-user overrides) but
        // preserve the live `value` fetched from the API -- never overwrite with stale data.
        this.devices = this.devices.map((d) => {
          const savedDevice = saved.find((s) => s.id === d.id);
          if (!savedDevice) return d;
          const { value: _savedValue, ...savedMeta } = savedDevice;
          return Object.assign(d, savedMeta);
        });
        console.info("[entia] merged saved device metadata");
      } else {
        this.devices = saved;
        console.info(`[entia] loaded ${this.devices.length} device(s) from cache`);
      }
    } catch (err) {
      console.error("[entia] failed to parse devices.json -- using live data only:", (err as Error).message);
    }
  }

  private async saveDevices(): Promise<void> {
    if (fsSync.existsSync(config.paths.devices)) return;
    try {
      await fs.writeFile(config.paths.devices, JSON.stringify(this.devices, null, 2));
      console.info(`[entia] saved ${this.devices.length} device(s) to ${config.paths.devices}`);
    } catch (err) {
      console.error("[entia] failed to save devices.json:", (err as Error).message);
    }
  }

  // ---------- upstream protocol -----------------------------------------------

  private encode(data: unknown): string {
    return JSON.stringify(data).replace(/'/g, "%22");
  }

  private decode<T = unknown>(text: string): T {
    return JSON.parse(text.substring(text.indexOf("'") + 1, text.lastIndexOf("'"))) as T;
  }

  /**
   * Make an upstream API request with optional retry on transient failures.
   *
   * Pass `retries > 0` only for idempotent operations (login, reads).
   * Never retry device writes -- toggle operations are not idempotent and a
   * retry would flip the device back to its previous state.
   */
  private async requestAPI<T = unknown>(
    data: unknown,
    { retries = 0 }: { retries?: number } = {}
  ): Promise<T> {
    let lastErr: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const delay = 1_000 * 2 ** (attempt - 1); // 1s, 2s, ...
        console.warn(`[entia] request retry ${attempt}/${retries} in ${delay}ms...`);
        await new Promise<void>((r) => setTimeout(r, delay));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        console.warn("[entia] request timed out -- aborting");
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(`${config.entia.baseUrl}?${this.encode(data)}`, {
          signal: controller.signal,
        });
        if (response.status !== 200) {
          throw new Error(`Entia API HTTP ${response.status}`);
        }
        const text = await response.text();
        return this.decode<T>(text);
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          console.warn(`[entia] request attempt ${attempt + 1} failed:`, (err as Error).message);
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastErr;
  }

  private async login(): Promise<void> {
    console.info("[entia] authenticating...");
    const time = `${Date.now()}`;

    const data = await this.requestAPI<Array<{ data: { sessid?: string; pipe?: { pubid: string } } }>>(
      [
        { cmd: "CONNECT", chl: this.chl++, params: { name: null, time } },
        { cmd: "JOIN", chl: this.chl++, params: { channels: "a", time } },
      ],
      { retries: 2 }
    );

    this.sessId = data[0]?.data?.sessid ?? "";
    // The Entia API may return a third envelope item for the JOIN ack.
    this.pipeId = data[2]?.data?.pipe?.pubid ?? "";

    if (!this.sessId) {
      throw new Error("Login failed: no sessId in CONNECT response");
    }

    await this.requestAPI(
      [
        {
          cmd: "FLAT_CONNECT",
          chl: this.chl++,
          sessid: this.sessId,
          params: {
            pipe: this.pipeId,
            time: `${Date.now()}`,
            username: config.entia.username,
            password: config.entia.password,
          },
        },
      ],
      { retries: 2 }
    );

    console.info("[entia] authentication successful");
  }

  private async fetchDevices(): Promise<Device[]> {
    type FlatGetResponse = Array<{
      data: {
        msg: {
          response: {
            device?: Array<{ id: number; type: number; attribute?: Array<{ val: number }> }>;
          };
        };
      };
    }>;

    console.info("[entia] fetching devices...");

    const data = await this.requestAPI<FlatGetResponse>(
      [
        {
          cmd: "FLAT_GET",
          chl: this.chl++,
          sessid: this.sessId,
          params: { pipe: this.pipeId, time: `${Date.now()}`, list: "all", extended: 1 },
        },
      ],
      { retries: 2 }
    );

    const raw = data?.[0]?.data?.msg?.response?.device;
    if (!Array.isArray(raw)) {
      throw new Error("FLAT_GET response missing device array");
    }

    this.devices = raw.map<Device>((d) => ({
      id: d.id,
      type: d.type,
      value: d.attribute?.[0]?.val ?? 0,
      subtype: 0,
    }));

    console.info(`[entia] fetched ${this.devices.length} device(s) from API`);
    await this.saveDevices();
    return this.devices;
  }

  // ---------- heartbeat loop --------------------------------------------------

  private startHeartbeat(): void {
    if (this.heartbeatRunning) return;
    this.heartbeatRunning = true;
    console.info("[entia] heartbeat started");

    void (async () => {
      try {
        while (this.isConnected) {
          await this.heartbeat();
        }
      } catch (err) {
        this.isConnected = false;
        this.devices = [];
        console.warn("[entia] heartbeat disconnected:", (err as Error).message);
      } finally {
        this.heartbeatRunning = false;
        console.info("[entia] heartbeat stopped");
      }
    })();
  }

  private async heartbeat(): Promise<void> {
    type CheckResponse = Array<{
      raw?: string;
      data: {
        msg: {
          response: {
            device?: Array<{ id: number; attribute: Array<{ val: number }> }>;
          };
        };
      };
    }>;

    const pollStart = Date.now();

    // No retries -- if CHECK fails the heartbeat loop handles the disconnect.
    const data = await this.requestAPI<CheckResponse>([
      {
        cmd: "CHECK",
        chl: this.chl++,
        sessid: this.sessId,
        params: { pipe: this.pipeId, time: `${Date.now()}` },
      },
    ]);

    const [first] = data;
    if (first?.raw !== "FLAT_EVENT" || !Array.isArray(first.data?.msg?.response?.device)) {
      // No events -- enforce a minimum poll gap to prevent tight-looping.
      const elapsed = Date.now() - pollStart;
      if (elapsed < HEARTBEAT_MIN_INTERVAL_MS) {
        await new Promise<void>((r) => setTimeout(r, HEARTBEAT_MIN_INTERVAL_MS - elapsed));
      }
      return;
    }

    const updates: DeviceUpdate[] = [];
    for (const device of first.data.msg.response.device) {
      const value = device.attribute[0]?.val;
      if (value === undefined) continue;

      const d = this.devices.find((x) => x.id === device.id);
      if (!d) {
        console.warn(`[entia] heartbeat: update for unknown device ${device.id} -- ignored`);
        continue;
      }

      d.value = value;
      updates.push({ id: d.id, subtype: d.subtype, value });
      console.info(`[entia] device ${device.id} = ${value}`);
      this.handleGenericAfterJob(d, value);
    }

    if (updates.length && this.onDeviceUpdate) {
      this.onDeviceUpdate(updates);
    }
  }

  private handleGenericAfterJob(device: Device, value: number): void {
    if (value) {
      device.lastStart = new Date();
      return;
    }
    for (const job of this.jobs) {
      if (job.type !== "generic" || (job as GenericJob).targetDeviceId !== device.id) continue;
      const g = job as GenericJob;
      if (g.subtype !== "after") continue;

      const tooSoon =
        device.lastStart != null &&
        Date.now() <= device.lastStart.getTime() + (g.targetRunFor ?? 0) * 1_000;
      if (tooSoon) continue;

      const startDate = new Date();
      startDate.setSeconds(startDate.getSeconds() + (g.startAfter ?? 0));
      console.info(`[entia] scheduling "after" job for device ${device.id} at ${startDate.toISOString()}`);

      schedule.scheduleJob(startDate, async () => {
        if (!(this.isConnected || (await this.reconnect()))) {
          console.warn(`[entia] "after" job skipped -- Entia offline`);
          return;
        }
        await this.setDevices(g.devicesIds, [g.startValue]);
        const endDate = new Date();
        endDate.setSeconds(endDate.getSeconds() + (g.runFor ?? 0));
        schedule.scheduleJob(endDate, async () => {
          await this.setDevices(g.devicesIds, [g.endValue]);
        });
      });
    }
  }

  // ---------- writes ----------------------------------------------------------

  async setDevices(devicesIds: number[], overrideValues: number[] = []): Promise<void> {
    for (let i = 0; i < devicesIds.length; i++) {
      if (i > 0) await new Promise<void>((r) => setTimeout(r, DEVICE_SET_DELAY_MS));

      const device = this.devices.find((d) => d.id === devicesIds[i]);
      if (!device) {
        console.error(`[entia] setDevices: device ${devicesIds[i]} not found -- skipping`);
        continue;
      }

      const override = overrideValues[i];
      let value: number;

      if (device.type === 6) {
        if (override === undefined || override < 0 || override > 100) {
          console.error(
            `[entia] setDevices: invalid value ${String(override)} for type-6 device ${devicesIds[i]} -- skipping`
          );
          continue;
        }
        value = override;
      } else {
        // Toggle. Do NOT retry -- a retry would flip the device back.
        value = device.value === 0 ? 1 : 0;
      }

      console.info(`[entia] set device ${devicesIds[i]} (type ${device.type}) = ${value}`);

      await this.requestAPI([
        {
          cmd: "DEVICE_SET",
          chl: this.chl++,
          sessid: this.sessId,
          params: {
            pipe: this.pipeId,
            time: `${Date.now()}`,
            deviceid: device.id,
            data: { attribute: [{ id: 1, val: value }] },
          },
        },
      ]);
    }
  }

  async setCustomDevice(customDeviceId: number, overrideValue?: number): Promise<void> {
    const custom = this.customDevices.find((c) => c.id === customDeviceId);
    if (!custom) {
      console.error(`[entia] setCustomDevice: custom device ${customDeviceId} not found`);
      return;
    }

    let value: number;
    if (overrideValue !== undefined) {
      value = overrideValue;
    } else {
      // Compute average state of member devices.
      // For type-6 (shade) devices this becomes the target position.
      // For toggle devices the override is ignored by setDevices anyway.
      let sum = 0;
      for (const id of custom.devicesIds) {
        const d = this.devices.find((x) => x.id === id);
        if (d) sum += d.value;
      }
      value = Math.round(sum / custom.devicesIds.length);
    }

    console.info(
      `[entia] setCustomDevice ${customDeviceId} = ${value} (devices: [${custom.devicesIds.join(", ")}])`
    );

    if (custom.type === "multiple") {
      // Fill a value for every member so type-6 devices beyond index 0
      // receive the correct target position (fixes single-element array bug).
      await this.setDevices(
        custom.devicesIds,
        Array<number>(custom.devicesIds.length).fill(value)
      );
    }
  }

  // ---------- generic scheduling ----------------------------------------------

  private async scheduleJobs(): Promise<void> {
    let scheduled = 0;
    const now = Date.now();

    for (const job of this.jobs) {
      if (job.type !== "generic") continue;
      const g = job as GenericJob;
      if (g.subtype === "after") continue;

      for (const at of g.runAt ?? []) {
        const dateAt = new Date();
        dateAt.setHours(at.hours, at.minutes ?? 0, 0, 0);
        if (dateAt.getTime() <= now) {
          dateAt.setDate(dateAt.getDate() + 1);
        }

        console.info(
          `[entia] job at ${dateAt.toLocaleTimeString()} -> devices [${g.devicesIds.join(", ")}]`
        );

        schedule.scheduleJob(dateAt, async () => {
          if (!(this.isConnected || (await this.reconnect()))) {
            console.warn("[entia] scheduled job skipped -- Entia offline");
            return;
          }
          console.info(`[entia] running job, startValue=${g.startValue}`);
          await this.setDevices(
            g.devicesIds,
            Array<number>(g.devicesIds.length).fill(g.startValue)
          );
          const dateEnd = new Date();
          dateEnd.setSeconds(dateEnd.getSeconds() + (g.runFor ?? 0));
          schedule.scheduleJob(dateEnd, async () => {
            console.info(`[entia] job done, endValue=${g.endValue}`);
            await this.setDevices(
              g.devicesIds,
              Array<number>(g.devicesIds.length).fill(g.endValue)
            );
          });
        });

        scheduled++;
      }
    }

    if (scheduled > 0) {
      console.info(`[entia] scheduled ${scheduled} generic job(s)`);
    }

    // Reschedule at the next midnight + 1 min to pick up changes to jobs.json.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0);
    schedule.scheduleJob(tomorrow, () => {
      console.info("[entia] rescheduling daily jobs...");
      void this.scheduleJobs();
    });
  }
}

// ---------- singleton accessor ------------------------------------------------
// Attached to globalThis so the service survives Next.js dev hot-reloads.

declare global {
  // eslint-disable-next-line no-var
  var __entiaService: EntiaService | undefined;
  // eslint-disable-next-line no-var
  var __entiaInit: Promise<EntiaService> | undefined;
}

export function getEntia(): EntiaService {
  if (!globalThis.__entiaService) {
    globalThis.__entiaService = new EntiaService();
  }
  return globalThis.__entiaService;
}

export function initEntia(): Promise<EntiaService> {
  if (!globalThis.__entiaInit) {
    const entia = getEntia();
    globalThis.__entiaInit = entia.init().then(() => entia);
  }
  return globalThis.__entiaInit;
}
