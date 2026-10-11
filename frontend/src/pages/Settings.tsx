import { KeyRound, Laptop, Lock, LogOut, ShieldCheck, Smartphone, Timer } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RecoveryCodes from "../components/RecoveryCodes";
import { Button, Input, Modal, useToast } from "../components/ui";
import { api, User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { relative, shortDate } from "../lib/format";

type Device = { id: string; device: string; ip: string; created_at: string; last_seen: string; current: boolean };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[26px] border border-line p-6">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { user, setUser, logout, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // Profile
  const [name, setName] = useState(user?.name || "");
  const [savingName, setSavingName] = useState(false);
  async function saveName(e: FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try { setUser(await api.patch<User>("/auth/me", { name })); toast("Saved"); }
    catch (err) { toast((err as Error).message, "error"); }
    finally { setSavingName(false); }
  }

  // Password
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwBusy(true); setPwError("");
    try {
      await api.post("/auth/password", { current_password: pw.current, new_password: pw.next });
      setPw({ current: "", next: "" });
      toast("Password changed. Other devices were signed out.");
      loadDevices();
    } catch (err) { setPwError((err as Error).message); }
    finally { setPwBusy(false); }
  }

  // Devices
  const [devices, setDevices] = useState<Device[]>([]);
  const loadDevices = () => api.get<Device[]>("/auth/sessions").then(setDevices).catch(() => {});
  useEffect(() => { loadDevices(); }, []);
  async function signOutDevice(id: string) {
    await api.del(`/auth/sessions/${id}`);
    setDevices((d) => d.filter((x) => x.id !== id));
    toast("Device signed out");
  }
  async function signOutOthers() {
    const r = await api.post<{ revoked: number }>("/auth/sessions/revoke-others");
    toast(r.revoked ? `Signed out ${r.revoked} other device${r.revoked > 1 ? "s" : ""}` : "No other devices were signed in");
    loadDevices();
  }

  // Password-confirmed actions: new recovery codes, move 2FA
  const [confirm, setConfirm] = useState<null | "codes" | "move">(null);
  const [confirmPw, setConfirmPw] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  async function runConfirmed(e: FormEvent) {
    e.preventDefault();
    setConfirmBusy(true); setConfirmError("");
    try {
      if (confirm === "codes") {
        const r = await api.post<{ recovery_codes: string[] }>("/auth/2fa/recovery-codes", { password: confirmPw });
        setNewCodes(r.recovery_codes);
        refresh();
      } else {
        const r = await api.post<{ user: User }>("/auth/2fa/restart", { password: confirmPw });
        setUser(r.user);
        navigate("/setup-2fa", { replace: true });
      }
      setConfirmPw("");
    } catch (err) { setConfirmError((err as Error).message); }
    finally { setConfirmBusy(false); }
  }
  function closeConfirm() { setConfirm(null); setConfirmPw(""); setConfirmError(""); setNewCodes(null); }

  const codesLeft = user?.recovery_codes_left ?? 0;

  return (
    <div className="grid max-w-6xl gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Section title="Profile">
          <form onSubmit={saveName} className="space-y-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Email" value={user?.email || ""} disabled hint={`Vault created ${user ? shortDate(user.created_at) : ""}`} />
            <Button type="submit" loading={savingName} disabled={name.trim() === user?.name}>Save changes</Button>
          </form>
        </Section>

        <Section title="Reminders">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block font-semibold">Email me about upcoming dates</span>
              <span className="text-sm text-muted">A short morning email when something in your vault expires or renews in 90, 30, 7 or 1 days.</span>
            </span>
            <input type="checkbox" role="switch" checked={user?.email_reminders ?? true}
              onChange={async (e) => { setUser(await api.patch<User>("/auth/me", { email_reminders: e.target.checked })); toast(e.target.checked ? "Reminder emails on" : "Reminder emails off"); }}
              className="peer sr-only" />
            <span aria-hidden="true" className="relative mt-1 h-7 w-12 shrink-0 rounded-full bg-line transition peer-checked:bg-mint-ink peer-focus-visible:ring-2 peer-focus-visible:ring-blue-ink after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
          </label>
        </Section>

        <Section title="Password">
          <form onSubmit={changePassword} className="space-y-4">
            <Input label="Current password" type="password" autoComplete="current-password" required
              value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <Input label="New password" type="password" autoComplete="new-password" required minLength={10}
              value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} hint="At least 10 characters. Other devices will be signed out." />
            {pwError && <p className="rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-rose-ink">{pwError}</p>}
            <Button type="submit" loading={pwBusy} disabled={!pw.current || pw.next.length < 10}><KeyRound className="size-4" />Change password</Button>
          </form>
        </Section>
      </div>

      <div className="space-y-6">
        <Section title="Two-factor sign-in">
          <div className="flex gap-4 rounded-[22px] bg-mint p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-paper text-mint-ink"><ShieldCheck className="size-5" /></span>
            <div>
              <div className="font-semibold">On</div>
              <div className="text-sm text-ink/70">A code from your authenticator app is needed every time you log in.</div>
            </div>
          </div>
          <div className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5 ${codesLeft < 3 ? "bg-rose" : "bg-mist"}`}>
            <div>
              <div className="font-semibold">{codesLeft} recovery code{codesLeft === 1 ? "" : "s"} left</div>
              <div className={`text-sm ${codesLeft < 3 ? "text-rose-ink" : "text-muted"}`}>
                {codesLeft < 3 ? "Create new ones soon, or you could get locked out." : "Each one lets you in once if you lose your phone."}
              </div>
            </div>
            <Button variant="light" onClick={() => setConfirm("codes")}>New codes</Button>
          </div>
          <button onClick={() => setConfirm("move")} className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink underline underline-offset-4 cursor-pointer">
            <Smartphone className="size-4" />Got a new phone? Move two-factor sign-in
          </button>
        </Section>

        <Section title="Where you're signed in">
          <ul className="divide-y divide-line">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-mist"><Laptop className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{d.device} {d.current && <span className="ml-1 rounded-full bg-mint px-2 py-0.5 text-xs font-bold text-mint-ink">This device</span>}</div>
                  <div className="truncate text-sm text-muted">Active {relative(d.last_seen)} · signed in {shortDate(d.created_at)}</div>
                </div>
                {!d.current && <Button variant="ghost" className="!h-9 !px-3 text-sm" onClick={() => signOutDevice(d.id)}>Sign out</Button>}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {devices.length > 1 && <Button variant="light" onClick={signOutOthers}><LogOut className="size-4" />Sign out all other devices</Button>}
            <Button variant="dark" onClick={async () => { await logout(); navigate("/login?locked=1"); }}><Lock className="size-4" />Lock vault now</Button>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Timer className="size-4" />Your vault also locks itself after 15 minutes without activity.</p>
        </Section>
      </div>

      <Modal open={confirm !== null} onClose={closeConfirm}
        title={newCodes ? "Your new recovery codes" : confirm === "codes" ? "Create new recovery codes" : "Move two-factor sign-in"}>
        {newCodes ? (
          <RecoveryCodes codes={newCodes} onDone={() => { closeConfirm(); toast("New recovery codes saved"); }} doneLabel="Done" />
        ) : (
          <form onSubmit={runConfirmed} className="space-y-4">
            <p className="text-muted">
              {confirm === "codes"
                ? "Your old codes will stop working straight away."
                : "This turns off two-factor sign-in on your old phone and signs out every device. You'll set it up again on your new phone right after."}
            </p>
            <Input label="Confirm with your password" type="password" autoComplete="current-password" required autoFocus
              value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} error={confirmError} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeConfirm}>Cancel</Button>
              <Button type="submit" loading={confirmBusy}>{confirm === "codes" ? "Create new codes" : "Continue"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
