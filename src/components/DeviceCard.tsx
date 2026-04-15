"use client";

import type { Device, UserMeta } from "@/lib/types";

interface DeviceCardProps {
  device: Device;
  meta: UserMeta | undefined;
  pending: boolean;
  onClick: () => void;
}

function assetFor(device: Device): string {
  switch (device.subtype) {
    case 0:
      return device.value ? "/images/light_on.png" : "/images/light_off.png";
    case 1:
      return device.value ? "/images/fan_on.png" : "/images/fan_off.png";
    case 2:
      return device.value === 100 ? "/images/shade_down.png" : "/images/shade_up.png";
    default:
      return "";
  }
}

function accentClass(device: Device): string {
  const active = device.subtype === 2 ? device.value > 0 : device.value !== 0;
  if (!active) return "";
  switch (device.subtype) {
    case 0:
      return "shadow-neon border-neon-cyan/80 bg-neon-cyan/5";
    case 1:
      return "shadow-neon-magenta border-neon-magenta/80 bg-neon-magenta/5";
    case 2:
      return "shadow-neon-violet border-neon-violet/80 bg-neon-violet/5";
    default:
      return "";
  }
}

function labelColor(device: Device): string {
  const active = device.subtype === 2 ? device.value > 0 : device.value !== 0;
  if (!active) return "text-neon-dim";
  switch (device.subtype) {
    case 0: return "text-neon-cyan";
    case 1: return "text-neon-magenta";
    case 2: return "text-neon-violet";
    default: return "text-neon-dim";
  }
}

export function DeviceCard({ device, meta, pending, onClick }: DeviceCardProps) {
  const src = assetFor(device);
  const name = meta?.name ?? `Device ${device.id}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={name}
      className={`neon-panel flex flex-col items-center justify-center p-2 w-24 h-24 transition-all ${accentClass(device)} ${
        pending ? "opacity-50 pointer-events-none" : "hover:-translate-y-0.5"
      }`}
    >
      {src && (
        // Decorative icon -- the button aria-label carries the accessible name.
        <img
          src={src}
          alt=""
          width={56}
          height={56}
          className={`h-12 w-12 object-contain rounded-xl transition-all ${
            (device.subtype === 2 ? device.value === 0 : device.value === 0)
              ? "brightness-[0.25] saturate-0"
              : ""
          }`}
          draggable={false}
        />
      )}
      <p className={`mt-1 text-[8px] tracking-widest text-center truncate max-w-full font-mono uppercase ${labelColor(device)}`}>
        {name}
      </p>
    </button>
  );
}
