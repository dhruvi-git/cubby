import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { Button, Input } from "../components/ui";
import { api, User } from "../lib/api";
import { useAuth } from "../lib/auth";

function strength(p: string) {
  let s = 0;
  if (p.length >= 10) s++;
  if (p.length >= 14) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}
const LEVELS = [
  { label: "Too short", cls: "bg-rose-ink" }, { label: "Weak", cls: "bg-rose-ink" },
  { label: "Okay", cls: "bg-cream-ink" }, { label: "Good", cls: "bg-mint-ink" }, { label: "Strong", cls: "bg-mint-ink" },
];

export default function Signup() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const s = strength(form.password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 10) { setError("Use at least 10 characters for your password."); return; }
    setBusy(true); setError("");
    try {
      const user = await api.post<User>("/auth/signup", form);
      setUser(user);
      navigate("/setup-2fa");
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <AuthShell mood={error ? "worried" : peeking ? "sleeping" : "idle"}
      bubble={error ? "Hmm, let's fix that." : peeking ? "Eyes closed. I won't peek!" : "Hi! Let's build your vault."}>
      <h1 className="text-[34px] font-extrabold">Create your vault</h1>
      <p className="mt-2 text-muted">Takes a minute. Two-factor sign-in comes next.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Input label="Your name" name="name" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Email" name="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <div>
          <Input label="Password" name="password" type="password" autoComplete="new-password" required
            onFocus={() => setPeeking(true)} onBlur={() => setPeeking(false)}
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="At least 10 characters." />
          {form.password && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex flex-1 gap-1.5">
                {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full transition ${i <= s ? LEVELS[s].cls : "bg-line"}`} />)}
              </div>
              <span className="text-xs font-semibold text-muted">{LEVELS[s].label}</span>
            </div>
          )}
        </div>
        {error && <p className="rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-rose-ink">{error}</p>}
        <Button type="submit" loading={busy} className="w-full !h-12">Create vault</Button>
        <p className="text-xs text-muted">By creating a vault you agree to the <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy policy</Link>.</p>
      </form>
      <p className="mt-6 text-sm text-muted">Already have a vault? <Link to="/login" className="font-semibold text-ink underline underline-offset-4">Log in</Link></p>
    </AuthShell>
  );
}
