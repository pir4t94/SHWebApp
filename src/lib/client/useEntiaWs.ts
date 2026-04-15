"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, CustomDevice, Device, ServerMessage } from "@/lib/types";

export interface UseEntiaWsOptions {
  initialDevices: Device[];
  initialCustomDevices: CustomDevice[];
}

export interface UseEntiaWsReturn {
  devices: Device[];
  customDevices: CustomDevice[];
  pendingDevices: Set<number>;
  pendingCustom: Set<number>;
  /** True once the socket has authenticated. Drops to false on disconnect. */
  connected: boolean;
  send: (msg: ClientMessage) => void;
  setDevice: (deviceId: number, value?: number) => void;
  setCustomDevice: (customDeviceId: number, value?: number) => void;
}

/** Exponential backoff: 1s -> 2s -> 4s ... capped at 30s. */
function backoffMs(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 30_000);
}

export function useEntiaWs({
  initialDevices,
  initialCustomDevices,
}: UseEntiaWsOptions): UseEntiaWsReturn {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [customDevices, setCustomDevices] = useState<CustomDevice[]>(initialCustomDevices);
  const [pendingDevices, setPendingDevices] = useState<Set<number>>(() => new Set());
  const [pendingCustom, setPendingCustom] = useState<Set<number>>(() => new Set());
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  /**
   * Clear all in-flight pending sets. Called when the socket drops so the UI
   * does not stay stuck showing a spinner for a command that will never complete.
   */
  const clearPending = useCallback(() => {
    setPendingDevices(new Set());
    setPendingCustom(new Set());
  }, []);

  useEffect(() => {
    let cancelled = false;

    const connect = (): void => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`, "echo-protocol");
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        // Auth is handled at upgrade time via the JWT cookie — nothing to send here.
      };

      ws.onmessage = (event) => {
        let data: ServerMessage;
        try {
          data = JSON.parse(event.data as string);
        } catch {
          console.error("[ws] received non-JSON message");
          return;
        }

        if (Array.isArray(data)) {
          applyUpdates(data);
          return;
        }

        switch (data.type) {
          case "authSuccess":
            connectedRef.current = true;
            setConnected(true);
            return;
          case "devices":
            setDevices(data.data);
            setCustomDevices(data.customDevices);
            return;
          case "setDeviceSuccess":
            setPendingDevices((s) => {
              const next = new Set(s);
              next.delete(data.deviceId);
              return next;
            });
            return;
          case "setCustomDeviceSuccess":
            setPendingCustom((s) => {
              const next = new Set(s);
              next.delete(data.customDeviceId);
              return next;
            });
            return;
          case "error":
            console.error("[ws] server error:", data.message);
            clearPending();
            return;
        }
      };

      ws.onclose = (event) => {
        if (cancelled) return;
        connectedRef.current = false;
        setConnected(false);
        // Any in-flight command will never get a response -- unblock the UI.
        clearPending();

        // 1006 = abnormal closure (e.g. the upgrade was rejected with HTTP 401).
        // The cookie is likely invalid — redirect to login rather than retrying.
        if (event.code === 1006 && reconnectAttemptsRef.current === 0) {
          console.error("[ws] connection rejected -- redirecting to login");
          window.location.href = "/login";
          return;
        }

        const delay = backoffMs(reconnectAttemptsRef.current);
        reconnectAttemptsRef.current += 1;
        console.info(
          `[ws] closed (code ${event.code}) -- reconnecting in ${delay}ms ` +
            `(attempt ${reconnectAttemptsRef.current})`
        );
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose fires immediately after onerror and handles reconnect.
        console.error("[ws] socket error");
      };
    };

    const applyUpdates = (updates: { id: number; subtype: number; value: number }[]): void => {
      setDevices((prev) =>
        prev.map((d) => {
          const u = updates.find((x) => x.id === d.id);
          return u ? { ...d, value: u.value } : d;
        })
      );
    };

    connect();

    // Regain focus: reconnect if dead, or request a fresh snapshot if still alive.
    const onFocus = (): void => {
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        connect();
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "refresh" } satisfies ClientMessage));
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [clearPending]);

  const setDevice = useCallback(
    (deviceId: number, value?: number) => {
      if (!connectedRef.current) return;
      setPendingDevices((s) => new Set(s).add(deviceId));
      if (value !== undefined) {
        setDevices((prev) =>
          prev.map((d) => (d.id === deviceId ? { ...d, value } : d))
        );
      }
      send({ type: "setDevice", deviceId, value });
    },
    [send]
  );

  const setCustomDevice = useCallback(
    (customDeviceId: number, value?: number) => {
      if (!connectedRef.current) return;
      setPendingCustom((s) => new Set(s).add(customDeviceId));
      send({ type: "setCustomDevice", customDeviceId, value });
    },
    [send]
  );

  return {
    devices,
    customDevices,
    pendingDevices,
    pendingCustom,
    connected,
    send,
    setDevice,
    setCustomDevice,
  };
}
