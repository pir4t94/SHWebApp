import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/api-auth";
import { getEntia } from "@/lib/services/entia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/set-custom-device/:customDeviceId?value=N
 * Also reachable via legacy /set-custom-device/:id via rewrite.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ customDeviceId: string }> }
) {
  if (!(await authorizeApi(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entia = getEntia();
  if (!entia.isConnected && !(await entia.reconnect())) {
    return NextResponse.json({ error: "Entia offline" }, { status: 503 });
  }

  const { customDeviceId } = await context.params;
  const url = new URL(request.url);
  const raw = url.searchParams.get("value");
  const value = raw !== null ? Number(raw) : undefined;

  try {
    await entia.setCustomDevice(Number(customDeviceId), value);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api] set-custom-device error:", err);
    return NextResponse.json({ error: "Failed to set custom device" }, { status: 500 });
  }
}
