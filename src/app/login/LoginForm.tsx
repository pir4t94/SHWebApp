"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input
        className="input-neon"
        type="text"
        name="user"
        placeholder="Username"
        autoComplete="username"
        required
      />
      <input
        className="input-neon"
        type="password"
        name="password"
        placeholder="Password"
        autoComplete="current-password"
        required
      />
      {state?.error && <p className="text-xs text-red-400 tracking-wide">{state.error}</p>}
      <button type="submit" className="btn-neon" disabled={pending}>
        {pending ? "..." : "CONNECT →"}
      </button>
    </form>
  );
}
