"use client";

import type { CustomDevice, UserMeta } from "@/lib/types";

interface Props {
  device: CustomDevice;
  meta: UserMeta | undefined;
  pending: boolean;
  onClick: () => void;
}

export function CustomDeviceCard({ device, meta, pending, onClick }: Props) {
  const name = meta?.name ?? `Custom ${device.id}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`neon-panel flex flex-col items-center justify-center p-2 w-24 h-24 transition-all border-neon-green/60 ${
        pending ? "opacity-50 pointer-events-none" : "hover:-translate-y-0.5"
      }`}
    >
      <div
        className="h-12 w-12 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/images/fan_off.png)" }}
        aria-hidden
      />
      <p className="mt-1 text-[8px] tracking-widest text-center truncate max-w-full font-mono uppercase text-neon-green">
        {name}
      </p>
    </button>
  );
}
