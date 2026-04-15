import { NextResponse } from "next/server";
import { getEntia } from "@/lib/services/entia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/devices
 * Public-read endpoint used by Homebridge to discover devices. (Matches legacy behaviour.)
 */
export async function GET() {
  const entia = getEntia();
  if (!entia.isConnected && !(await entia.reconnect())) {
    return NextResponse.json({ error: "Entia offline" }, { status: 503 });
  }
  return NextResponse.json({
    devices: entia.devices,
    customDevices: entia.customDevices,
    connected: entia.isConnected,
  });
}
