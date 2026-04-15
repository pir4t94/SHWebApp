import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App runs behind custom server on the Pi
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  typedRoutes: false,
  // Preserve legacy REST URLs used by Homebridge integrations.
  async rewrites() {
    return [
      { source: "/set-device/:deviceId", destination: "/api/set-device/:deviceId" },
      { source: "/set-custom-device/:customDeviceId", destination: "/api/set-custom-device/:customDeviceId" },
    ];
  },
};

export default nextConfig;
