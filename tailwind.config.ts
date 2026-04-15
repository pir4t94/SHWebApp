import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: "#00f0ff",
          magenta: "#ff00e5",
          green: "#00ff87",
          amber: "#ffb400",
          violet: "#b040ff",
          bg: "#0a0a0f",
          panel: "#111118",
          border: "#1f1f2e",
          dim: "#6b7280",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        neon: "0 0 8px rgba(0, 240, 255, 0.6), 0 0 24px rgba(0, 240, 255, 0.25)",
        "neon-magenta": "0 0 8px rgba(255, 0, 229, 0.6), 0 0 24px rgba(255, 0, 229, 0.25)",
        "neon-amber": "0 0 8px rgba(255, 180, 0, 0.6), 0 0 24px rgba(255, 180, 0, 0.25)",
        "neon-violet": "0 0 8px rgba(176, 64, 255, 0.6), 0 0 24px rgba(176, 64, 255, 0.25)",
      },
      animation: {
        "pulse-neon": "pulseNeon 2s ease-in-out infinite",
      },
      keyframes: {
        pulseNeon: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
