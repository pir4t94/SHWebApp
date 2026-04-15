import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getEntia } from "@/lib/services/entia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/set-device/:deviceId?value=N
 * Also reachable via the legacy /set-device/:deviceId route via rewrite.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ deviceId: string }> }
) {
  if (!(await authorizeApi(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entia = getEntia();
  if (!entia.isConnected && !(await entia.reconnect())) {
    return NextResponse.json({ error: "Entia offline" }, { status: 503 });
  }

  const { deviceId } = await context.params;
  const url = new URL(request.url);
  const raw = url.searchParams.get("value");
  const value = raw !== null ? Number(raw) : undefined;

  try {
    await entia.setDevices([Number(deviceId)], value !== undefined ? [value] : []);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api] set-device error:", err);
    return NextResponse.json({ error: "Failed to set device" }, { status: 500 });
  }
}
