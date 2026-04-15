import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { JWT_COOKIE, verifyToken } from "../auth";
import { getEntia } from "../services/entia";
import type { ClientMessage, DeviceUpdate, ServerMessage } from "../types";

// ---------- constants ---------------------------------------------------------

/**
 * Server-initiated ping interval.
 * Detects zombie connections (no pong = dead) and keeps sockets alive
 * through proxies that close idle WebSocket connections.
 */
const PING_INTERVAL_MS = 30_000;

// ---------- types -------------------------------------------------------------

interface Connection {
  id: string;
  socket: WebSocket;
  user: string;
  /** Reset to true on each pong; set to false before sending a ping. */
  isAlive: boolean;
}

// ---------- server ------------------------------------------------------------

/**
 * Attaches a WebSocket server to the HTTP upgrade pipeline.
 * Clients connect to /ws, authenticate with their JWT, then receive
 * realtime device updates pushed from the Entia heartbeat.
 */
export function attachWebSocketServer(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const connections = new Map<string, Connection>();
  const entia = getEntia();

  // Entia -> WS broadcast
  entia.onDeviceUpdate = (updates: DeviceUpdate[]) => {
    const payload = JSON.stringify(updates);
    let broadcast = 0;
    for (const conn of connections.values()) {
      if (conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(payload);
        broadcast++;
      }
    }
    if (broadcast > 0) {
      console.info(`[ws] broadcast ${updates.length} update(s) to ${broadcast} client(s)`);
    }
  };

  // Ping / pong keepalive
  const pingInterval = setInterval(() => {
    for (const [id, conn] of connections.entries()) {
      if (conn.socket.readyState !== conn.socket.OPEN) continue;

      if (!conn.isAlive) {
        console.warn(`[ws] terminating stale connection ${id} (no pong)`);
        conn.socket.terminate();
        connections.delete(id);
        continue;
      }

      conn.isAlive = false;
      conn.socket.ping();
    }
  }, PING_INTERVAL_MS);

  wss.on("close", () => clearInterval(pingInterval));

  // Connection handler — user is already verified at upgrade time.
  wss.on("connection", (socket: WebSocket, user: string) => {
    const id = randomUUID();
    const conn: Connection = { id, socket, user, isAlive: true };
    connections.set(id, conn);
    console.info(`[ws] open ${id} as "${user}" (${connections.size} active)`);

    socket.on("pong", () => {
      conn.isAlive = true;
    });

    // Send initial state immediately — no auth handshake needed.
    send(conn, { type: "authSuccess", user });
    send(conn, { type: "devices", data: entia.devices, customDevices: entia.customDevices });

    socket.on("message", async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return send(conn, { type: "error", message: "Invalid message format" });
      }
      await handleMessage(conn, msg);
    });

    socket.on("close", (code, reason) => {
      connections.delete(id);
      const reasonStr = reason.length ? ` (${reason.toString()})` : "";
      console.info(`[ws] close ${id} -- code ${code}${reasonStr} (${connections.size} remaining)`);
    });

    socket.on("error", (err) => {
      console.error(`[ws] error on ${id}:`, err.message);
    });
  });

  // Message handler
  async function handleMessage(conn: Connection, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case "refresh":
        console.info(`[ws] refresh requested by ${conn.user}`);
        return send(conn, {
          type: "devices",
          data: entia.devices,
          customDevices: entia.customDevices,
        });

      case "setDevice": {
        if (msg.deviceId === undefined) {
          return send(conn, { type: "error", message: "deviceId required" });
        }
        if (!entia.isConnected && !(await entia.reconnect())) {
          return send(conn, { type: "error", message: "Entia offline" });
        }
        try {
          const values = msg.value !== undefined ? [Number(msg.value)] : [];
          await entia.setDevices([Number(msg.deviceId)], values);
          return send(conn, { type: "setDeviceSuccess", deviceId: msg.deviceId });
        } catch (err) {
          console.error(`[ws] setDevice error (user=${conn.user}, device=${msg.deviceId}):`, err);
          return send(conn, { type: "error", message: "Failed to set device" });
        }
      }

      case "setCustomDevice": {
        if (msg.customDeviceId === undefined) {
          return send(conn, { type: "error", message: "customDeviceId required" });
        }
        if (!entia.isConnected && !(await entia.reconnect())) {
          return send(conn, { type: "error", message: "Entia offline" });
        }
        try {
          await entia.setCustomDevice(
            Number(msg.customDeviceId),
            msg.value !== undefined ? Number(msg.value) : undefined
          );
          return send(conn, {
            type: "setCustomDeviceSuccess",
            customDeviceId: msg.customDeviceId,
          });
        } catch (err) {
          console.error(
            `[ws] setCustomDevice error (user=${conn.user}, device=${msg.customDeviceId}):`, err
          );
          return send(conn, { type: "error", message: "Failed to set custom device" });
        }
      }

      default:
        console.warn(`[ws] unknown message type from ${conn.user}:`, (msg as { type: string }).type);
        return send(conn, { type: "error", message: "Unknown message type" });
    }
  }

  function send(conn: Connection, data: ServerMessage): void {
    if (conn.socket.readyState === conn.socket.OPEN) {
      conn.socket.send(JSON.stringify(data));
    } else {
      console.warn(
        `[ws] dropped message to ${conn.id} -- socket not open (state=${conn.socket.readyState})`
      );
    }
  }

  return wss;
}

/**
 * Route HTTP upgrade requests for /ws to the WebSocket server.
 * Authenticates via the JWT cookie on the upgrade request — the browser sends
 * cookies automatically so the client never needs to read document.cookie.
 * Unauthorized upgrades are rejected with HTTP 401 before a WS is opened.
 */
export function handleUpgrade(
  wss: WebSocketServer,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
): void {
  const url = request.url ?? "";
  if (!url.startsWith("/ws")) {
    console.warn(`[ws] rejecting upgrade for unexpected path: ${url}`);
    socket.destroy();
    return;
  }

  const rawCookie = request.headers.cookie ?? "";
  let jwtValue: string | undefined;
  try {
    jwtValue = rawCookie.split(";").reduce<string | undefined>((found, pair) => {
      if (found) return found;
      const [name, ...rest] = pair.trim().split("=");
      return name === JWT_COOKIE ? decodeURIComponent(rest.join("=")) : undefined;
    }, undefined);
  } catch {
    // malformed cookie encoding — treat as missing
  }
  const claims = verifyToken(jwtValue);
  if (!claims) {
    console.warn("[ws] upgrade rejected -- invalid or missing JWT cookie");
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, claims.user);
  });
}
