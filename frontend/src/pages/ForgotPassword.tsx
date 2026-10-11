import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { Button, Input } from "../components/ui";
import { api } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await api.post("/auth/forgot", { email }); setSent(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell mood={sent ? "happy" : error ? "worried" : "idle"} bubble={sent ? "Check your inbox!" : "No worries, it happens."}>
      {sent ? (
        <>
          <h1 className="text-[34px] font-extrabold">Check your email</h1>
          <p className="mt-3 text-muted">If <b className="text-ink">{email}</b> has a Cubby vault, a reset link is on its way. It works once and expires in 30 minutes.</p>
          <p className="mt-3 text-muted">Nothing after a few minutes? Check your spam folder.</p>
          <Link to="/login" className="mt-8 inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">Back to log in</Link>
        </>
      ) : (
        <>
          <h1 className="text-[34px] font-extrabold">Reset your password</h1>
          <p className="mt-2 text-muted">Enter the email you use for Cubby and we'll send you a link to choose a new password.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <p className="rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-rose-ink">{error}</p>}
            <Button type="submit" loading={busy} className="w-full !h-12">Send reset link</Button>
          </form>
          <p className="mt-6 text-sm text-muted">Remembered it? <Link to="/login" className="font-semibold text-ink underline underline-offset-4">Log in</Link></p>
        </>
      )}
    </AuthShell>
  );
}
