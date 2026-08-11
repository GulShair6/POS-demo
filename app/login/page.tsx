"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form))
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Sign in failed");
      setBusy(false);
      return;
    }
    window.location.assign("/");
  }
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark">A</span>
          <span>
            Atlas<span>POS</span>
          </span>
        </div>
        <p>Secure retail operations</p>
        <h1>Welcome back</h1>
        <form onSubmit={submit}>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required autoFocus />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && <div className="login-error">{error}</div>}
          <button className="complete-payment" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <small>Use the administrator account configured during deployment.</small>
      </section>
    </main>
  );
}
