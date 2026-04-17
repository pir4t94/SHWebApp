import schedule from "node-schedule";
import { config } from "../config";
import type { EntiaService } from "./entia";
import type { Job, SunriseSunsetJob } from "../types";

/**
 * Fetches sunrise/sunset times and schedules the corresponding jobs.
 * Reschedules itself for the next day after a job runs.
 */
export class SunriseSunsetService {
  sunriseDate: Date | null = null;
  sunsetDate: Date | null = null;

  /** Cap how many times we retry a failing API call before giving up. */
  private static readonly MAX_FETCH_RETRIES = 5;

  private readonly baseUrl: string;

  constructor() {
    const url = new URL("https://api.sunrise-sunset.org/json");
    url.searchParams.set("lat", String(config.sun.lat));
    url.searchParams.set("lng", String(config.sun.lng));
    url.searchParams.set("formatted", "0");
    this.baseUrl = url.toString();
  }

  async run(entia: EntiaService, jobs: Job[], _retryCount = 0): Promise<void> {
    const sunriseJob = jobs.find((j): j is SunriseSunsetJob => j.type === "sunrise");
    const sunsetJob = jobs.find((j): j is SunriseSunsetJob => j.type === "sunset");

    const today = new Date();
    today.setHours(3, 0, 0, 0);

    const updateSunInfo = async (date: Date): Promise<void> => {
      const response = await fetch(`${this.baseUrl}&date=${date.toISOString().slice(0, 10)}`);
      if (!response.ok) {
        console.error(`[sun] fetch failed: HTTP ${response.status}`);
        if (_retryCount >= SunriseSunsetService.MAX_FETCH_RETRIES) {
          console.error("[sun] max retries reached, sunrise/sunset scheduling disabled for today");
          return;
        }
        // Exponential backoff: 5 s, 10 s, 20 s …
        const delay = 5_000 * 2 ** _retryCount;
        console.info(`[sun] retrying in ${delay}ms (attempt ${_retryCount + 1})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.run(entia, jobs, _retryCount + 1);
      }
      const sunData = (await response.json()).results as { sunrise: string; sunset: string };
      this.sunriseDate = new Date(sunData.sunrise);
      this.sunsetDate = new Date(sunData.sunset);

      if (config.sun.delaySunrise) {
        this.sunriseDate.setTime(this.sunriseDate.getTime() + config.sun.delaySunrise)
      }

      if (config.sun.delaySunset) {
        this.sunsetDate.setTime(this.sunsetDate.getTime() - config.sun.delaySunset)
      }
    };

    await updateSunInfo(today);

    const runJob = async (job: SunriseSunsetJob | undefined, jobDate: Date): Promise<void> => {
      if (!job) return;

      const jobProcedure = async (): Promise<void> => {
        const devicesIds: number[] = [];
        const values: number[] = [];

        for (const [deviceId, deviceData] of Object.entries(job.devices)) {
          devicesIds.push(Number(deviceId));
          const value = job.type === "sunset"
            ? (deviceData as { value: number }).value
            : (deviceData as number);
          values.push(value);
        }

        await entia.setDevices(devicesIds, values);

        // Sunset "makeTurn" pass — flip select shades to ~96% after 60s
        if (job.type === "sunset") {
          const turnIds: number[] = [];
          const turnValues: number[] = [];
          for (const [deviceId, deviceData] of Object.entries(job.devices)) {
            if (typeof deviceData === "object" && deviceData.makeTurn) {
              turnIds.push(Number(deviceId));
              turnValues.push(96);
            }
          }
          if (turnIds.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 61_000));
            await entia.setDevices(turnIds, turnValues);
          }
        }
      };

      console.log(`[jobs] scheduling job ${job.type} at ${jobDate.toString()}`);

      schedule.scheduleJob(jobDate, async () => {
        console.log(`[jobs] running scheduled job ${job.type} at ${jobDate.toString()}`);
        if (entia.isConnected || (await entia.reconnect())) {
          await jobProcedure();
        }
        // Reset retry count when scheduling the next day's job.
        await this.run(entia, jobs, 0);
      });
    };

    const now = Date.now();

    if (this.sunriseDate && this.sunriseDate.getTime() > now) {
      return runJob(sunriseJob, this.sunriseDate);
    }
    if (this.sunsetDate && this.sunsetDate.getTime() > now) {
      return runJob(sunsetJob, this.sunsetDate);
    }

    // Both past — jump to tomorrow's sunrise
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    await updateSunInfo(tomorrow);
    if (this.sunriseDate) {
      await runJob(sunriseJob, this.sunriseDate);
    }
  }
}
