import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import CodeInput from "../components/CodeInput";
import { Button, Input } from "../components/ui";
import { api, User } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Login() {
  const [params] = useSearchParams();
  const locked = params.get("locked") === "1";
  const [form, setForm] = useState({ email: "", password: "" });
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [recovery, setRecovery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from || "/app";

  function finish(user: User) {
    setUser(user);
    navigate(user.scope === "full" ? (user.onboarded ? from : "/onboarding") : "/setup-2fa", { replace: true });
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await api.post<{ requires_2fa: boolean; pending_token?: string; user?: User }>("/auth/login", form);
      if (res.requires_2fa) setPending(res.pending_token!);
      else finish(res.user!);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function submitCode(c: string) {
    setBusy(true); setError("");
    try {
      const res = await api.post<{ user: User; used_recovery_code: boolean }>("/auth/login/2fa", { pending_token: pending, code: c });
      if (res.used_recovery_code) sessionStorage.setItem("cubby:used-recovery", String(res.user.recovery_codes_left));
      finish(res.user);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg); setCode("");
      if (msg.includes("expired")) { setPending(null); setRecovery(""); setUseRecovery(false); }
    }
    finally { setBusy(false); }
  }

  const mood = error ? "worried" : locked && !form.email ? "sleeping" : peeking ? "sleeping" : "idle";
  const bubble = error ? "That didn't work. Try again?" : pending ? "Last step: your code." : locked && !form.email
    ? "I locked the vault while you were away." : peeking ? "Not looking, promise." : "Welcome back!";

  return (
    <AuthShell mood={mood} bubble={bubble}>
      {!pending ? (
        <>
          <h1 className="text-[34px] font-extrabold">Open your vault</h1>
          <p className="mt-2 text-muted">{locked ? "Your vault locked itself after 15 minutes idle. Log in to continue." : "Log in with your email and password."}</p>
          <form onSubmit={submitPassword} className="mt-8 space-y-4">
            <Input label="Email" name="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Password" name="password" type="password" autoComplete="current-password" required value={form.password}
              onFocus={() => setPeeking(true)} onBlur={() => setPeeking(false)} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            {error && <p className="rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-rose-ink">{error}</p>}
            <Button type="submit" loading={busy} className="w-full !h-12">Continue</Button>
          </form>
          <p className="mt-4 text-sm"><Link to="/forgot-password" className="font-semibold text-muted underline underline-offset-4 hover:text-ink">Forgot your password?</Link></p>
          <p className="mt-6 text-sm text-muted">New here? <Link to="/signup" className="font-semibold text-ink underline underline-offset-4">Create a vault</Link></p>
        </>
      ) : (
        <>
          <h1 className="text-[34px] font-extrabold">{useRecovery ? "Use a recovery code" : "Enter your code"}</h1>
          {useRecovery ? (
            <form onSubmit={(e) => { e.preventDefault(); submitCode(recovery); }} className="mt-8 space-y-4">
              <Input label="Recovery code" value={recovery} onChange={(e) => setRecovery(e.target.value.toUpperCase())}
                placeholder="XXXXX-XXXXX" autoComplete="off" autoFocus hint="Each code works once. You'll find them in the file you saved." />
              <Button type="submit" loading={busy} disabled={recovery.replace(/[^A-Z0-9]/gi, "").length !== 10} className="w-full !h-12">Log in</Button>
            </form>
          ) : (
            <>
              <p className="mt-2 text-muted">Open your authenticator app and type the 6-digit code for Cubby Vault.</p>
              <div className="mt-8"><CodeInput value={code} onChange={setCode} onComplete={submitCode} disabled={busy} /></div>
            </>
          )}
          {error && <p className="mt-4 rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-rose-ink">{error}</p>}
          <button onClick={() => { setUseRecovery(!useRecovery); setError(""); }} className="mt-6 mr-5 text-sm font-semibold text-ink underline underline-offset-4 cursor-pointer">
            {useRecovery ? "Use my authenticator app instead" : "Lost your phone? Use a recovery code"}
          </button>
          <button onClick={() => { setPending(null); setCode(""); setError(""); }} className="mt-6 text-sm font-semibold text-muted underline underline-offset-4 cursor-pointer">Use a different account</button>
        </>
      )}
    </AuthShell>
  );
}
