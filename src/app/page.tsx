import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getEntia } from "@/lib/services/entia";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const entia = getEntia();

  if (!entia.isConnected && !(await entia.reconnect())) {
    return (
      <main className="relative z-10 flex min-h-screen items-center justify-center">
        <p className="text-red-400 tracking-widest text-sm">
          // CONNECTION FAILED — Entia offline 💀
        </p>
      </main>
    );
  }

  // Use local-time getters (not toISOString, which is always UTC) so the
  // displayed times match the server's timezone (Europe/Ljubljana).
  const formatTime = (d: Date): string => {
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  };
  const sunrise = entia.sunAPI.sunriseDate ? formatTime(entia.sunAPI.sunriseDate) : "--:--";
  const sunset = entia.sunAPI.sunsetDate ? formatTime(entia.sunAPI.sunsetDate) : "--:--";

  return (
    <Dashboard
      user={session.user}
      initialDevices={entia.devices}
      initialCustomDevices={entia.customDevices}
      sunrise={sunrise}
      sunset={sunset}
    />
  );
}
