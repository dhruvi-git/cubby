import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { Button, Input } from "../components/ui";
import { api } from "../lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 10) { setError("Use at least 10 characters."); return; }
    if (pw !== pw2) { setError("The two passwords don't match."); return; }
    setBusy(true); setError("");
    try { await api.post("/auth/reset", { token, password: pw }); setDone(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell mood={done ? "happy" : error ? "worried" : "idle"} bubble={done ? "All set!" : "Pick something new."}>
      {!token ? (
        <>
          <h1 className="text-[34px] font-extrabold">This link isn't complete</h1>
          <p className="mt-2 text-muted">Open the link from your email again, or request a new one.</p>
          <Link to="/forgot-password" className="mt-8 inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">Request a new link</Link>
        </>
      ) : done ? (
        <>
          <h1 className="text-[34px] font-extrabold">Password updated</h1>
          <p className="mt-2 text-muted">For your safety, every device was signed out. Log in with your new password and your authenticator code.</p>
          <Link to="/login" className="mt-8 inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">Log in</Link>
        </>
      ) : (
        <>
          <h1 className="text-[34px] font-extrabold">Choose a new password</h1>
          <p className="mt-2 text-muted">Your documents stay exactly as they are.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Input label="New password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 10 characters." />
            <Input label="Type it again" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
            {error && (
              <p className="rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-rose-ink">
                {error} {error.includes("expired") && <Link to="/forgot-password" className="underline">Request a new link</Link>}
              </p>
            )}
            <Button type="submit" loading={busy} className="w-full !h-12">Save new password</Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
