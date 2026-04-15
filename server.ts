import { createServer } from "node:http";
import next from "next";
import { initEntia } from "./src/lib/services/entia";
import { attachWebSocketServer, handleUpgrade } from "./src/lib/ws/server";
import { config } from "./src/lib/config";

/**
 * Custom Next.js server.
 *
 * Boots in one Node process:
 *   1. The Entia singleton (heartbeat, scheduler, reconnect).
 *   2. A WebSocket server on /ws for realtime device updates.
 *   3. Next.js for HTTP routing (pages + API handlers).
 *
 * Single-process design fits a Raspberry Pi cleanly -- one systemd unit
 * manages everything.
 */
async function main(): Promise<void> {
  const dev = process.env.NODE_ENV !== "production";
  const app = next({ dev });
  const nextHandler = app.getRequestHandler();

  await app.prepare();

  // Boot Entia before accepting traffic so /login and / render with real state.
  await initEntia();

  const wss = attachWebSocketServer();

  const server = createServer((req, res) => {
    nextHandler(req, res).catch((err) => {
      console.error("[http] handler error:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    if (dev && url.startsWith("/_next/webpack-hmr")) {
      // Let Next.js handle its own HMR WebSocket in development.
      return;
    }
    handleUpgrade(wss, req, socket, head);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${config.port} is already in use`);
      process.exit(1);
    }
    if (err.code === "EACCES") {
      console.error(`Port ${config.port} requires elevated privileges`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(config.port, () => {
    console.info(`EntiaBot listening on :${config.port}`);
  });

  const shutdown = (signal: string): void => {
    console.info(`${signal} received -- shutting down`);
    server.close(() => {
      console.info("Server closed cleanly");
      process.exit(0);
    });
    // unref() lets Node exit naturally if server.close() resolves before the
    // timeout fires, avoiding a spurious forced-shutdown log on clean exits.
    const forceExit = setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
    forceExit.unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Node.js is in an undefined state after an uncaught exception -- exit so
  // the process supervisor (systemd) can restart cleanly.
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
    process.exit(1);
  });
}

void main();
