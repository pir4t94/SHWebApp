import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm neon-panel p-8 shadow-neon">
        <h1 className="text-2xl font-bold tracking-[0.4em] text-neon-cyan">ACCESS</h1>
        <p className="text-xs text-neon-dim mt-1 tracking-widest">// authenticate to continue</p>
        <LoginForm />
      </div>
    </main>
  );
}
