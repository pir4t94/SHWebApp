"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEntiaWs } from "@/lib/client/useEntiaWs";
import type { CustomDevice, Device, DeviceSubtype, UserMeta } from "@/lib/types";
import { DeviceCard } from "./DeviceCard";
import { CustomDeviceCard } from "./CustomDeviceCard";
import { ShadeDialog } from "./ShadeDialog";

interface DashboardProps {
  user: string;
  initialDevices: Device[];
  initialCustomDevices: CustomDevice[];
  sunrise: string;
  sunset: string;
}

function getMeta(entry: Device | CustomDevice, user: string): UserMeta | undefined {
  const v = (entry as Record<string, unknown>)[user];
  if (v && typeof v === "object" && "name" in v) return v as UserMeta;
  return undefined;
}

export function Dashboard({
  user,
  initialDevices,
  initialCustomDevices,
  sunrise,
  sunset,
}: DashboardProps) {
  const {
    devices,
    customDevices,
    pendingDevices,
    pendingCustom,
    connected,
    setDevice,
    setCustomDevice,
  } = useEntiaWs({ initialDevices, initialCustomDevices });

  const [shadeTarget, setShadeTarget] = useState<Device | null>(null);
  const [loggingOut, startLogout] = useTransition();
  const router = useRouter();

  const sorted = useMemo(() => {
    return [...devices].sort((a, b) => {
      const oa = getMeta(a, user)?.order ?? 99;
      const ob = getMeta(b, user)?.order ?? 99;
      return oa - ob;
    });
  }, [devices, user]);

  const bySubtype = useMemo(() => {
    const buckets: Record<DeviceSubtype, Device[]> = { 0: [], 1: [], 2: [] };
    for (const d of sorted) {
      if (!d.display) continue;
      if (d.subtype in buckets) buckets[d.subtype].push(d);
    }
    return buckets;
  }, [sorted]);

  const handleCardClick = (device: Device): void => {
    if (pendingDevices.has(device.id)) return;
    if (device.subtype === 2) {
      setShadeTarget(device);
      return;
    }
    setDevice(device.id);
  };

  const handleShadeSubmit = (value: number): void => {
    if (!shadeTarget) return;
    if (!pendingDevices.has(shadeTarget.id)) {
      setDevice(shadeTarget.id, value);
    }
    setShadeTarget(null);
  };

  const handleLogout = useCallback(() => {
    startLogout(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    });
  }, [router]);

  return (
    <main className="relative z-10 mx-auto max-w-md px-4 pb-24 pt-6">
      <header className="mb-8 text-center relative">
        <div className="flex items-center justify-center gap-3">
          <span className="text-3xl drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]">⚡</span>
          <h1 className="text-3xl font-bold text-neon-cyan tracking-[0.4em] drop-shadow-[0_0_6px_rgba(0,240,255,0.6)]">
            ENTIA
          </h1>
        </div>
        <hr className="mt-3 border-neon-cyan/30" />
        <div className="mt-2 text-[10px] text-neon-dim tracking-[0.5em] uppercase">
          Smart &nbsp;Home &nbsp;Control
        </div>

        {/* Logout button -- top-right corner */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="absolute right-0 top-0 text-xs text-neon-dim hover:text-neon-cyan tracking-widest transition-colors disabled:opacity-50"
          aria-label="Log out"
        >
          {loggingOut ? "..." : `[${user}] x`}
        </button>
      </header>

      {/* Only render a section when it has at least one visible device */}
      {bySubtype[0].length > 0 && (
        <Section label="// Luci" accent="text-neon-cyan">
          {bySubtype[0].map((d) => (
            <DeviceCard
              key={d.id}
              device={d}
              meta={getMeta(d, user)}
              pending={pendingDevices.has(d.id)}
              onClick={() => handleCardClick(d)}
            />
          ))}
        </Section>
      )}

      {bySubtype[1].length > 0 && (
        <Section label="// Ventilatorji" accent="text-neon-magenta">
          {bySubtype[1].map((d) => (
            <DeviceCard
              key={d.id}
              device={d}
              meta={getMeta(d, user)}
              pending={pendingDevices.has(d.id)}
              onClick={() => handleCardClick(d)}
            />
          ))}
        </Section>
      )}

      {bySubtype[2].length > 0 && (
        <Section label="// Zaluzije" accent="text-neon-violet">
          {bySubtype[2].map((d) => (
            <DeviceCard
              key={d.id}
              device={d}
              meta={getMeta(d, user)}
              pending={pendingDevices.has(d.id)}
              onClick={() => handleCardClick(d)}
            />
          ))}
        </Section>
      )}

      {customDevices.length > 0 && (
        <Section label="// Custom" accent="text-neon-green">
          {customDevices.map((c) => (
            <CustomDeviceCard
              key={c.id}
              device={c}
              meta={getMeta(c, user)}
              pending={pendingCustom.has(c.id)}
              onClick={() => !pendingCustom.has(c.id) && setCustomDevice(c.id)}
            />
          ))}
        </Section>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-neon-bg/90 border-t border-neon-border text-xs text-neon-dim tracking-widest py-2 px-4 z-20 flex items-center justify-between">
        <span>SYS // sunrise {sunrise} &nbsp;|&nbsp; sunset {sunset}</span>
        {/* Real-time WebSocket connection indicator */}
        <span className={connected ? "text-neon-green" : "text-red-400 animate-pulse"}>
          {connected ? "LIVE" : "RECONNECTING"}
        </span>
      </footer>

      {shadeTarget && (
        <ShadeDialog
          initialValue={shadeTarget.value}
          onSubmit={handleShadeSubmit}
          onClose={() => setShadeTarget(null)}
        />
      )}
    </main>
  );
}

function Section({
  label,
  accent,
  children,
}: {
  label: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className={`section-label ${accent}`}>{label}</div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">{children}</div>
    </section>
  );
}
