"use client";

import { useEffect, useState } from "react";

interface Props {
  initialValue: number;
  onSubmit: (value: number) => void;
  onClose: () => void;
}

export function ShadeDialog({ initialValue, onSubmit, onClose }: Props) {
  const [value, setValue] = useState<number>(initialValue);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/80"
      onMouseDown={onClose}
    >
      <div
        className="neon-panel p-6 w-80 flex flex-col gap-4 shadow-neon-amber border-neon-amber/60"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="text-center text-2xl text-neon-amber tracking-widest">{value} %</p>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full accent-neon-amber"
        />
        <button type="button" className="btn-neon border-neon-amber text-neon-amber" onClick={() => onSubmit(value)}>
          POTRDI
        </button>
      </div>
    </div>
  );
}
