import { AnimatePresence, motion } from "framer-motion";
import { Copy, Eye, EyeOff, Globe, HeartPulse, KeyRound, Lock, Pencil, Plus, RefreshCw, Search, ShieldAlert, StickyNote, Trash2, Wifi } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Mascot from "../components/Mascot";
import { Button, Input, Modal, useToast } from "../components/ui";
import { api } from "../lib/api";
import { relative } from "../lib/format";
import { breachCount, createVault, generatePassword, open as openBlob, seal, strength, unlockVault } from "../lib/vaultCrypto";

type Kind = "login" | "wifi" | "note";
type Item = { kind: Kind; name: string; url?: string; username?: string; password?: string; notes?: string; updated: string };
type Row = { id: string; item: Item };
type Status = { set_up: false } | { set_up: true; salt: string; iterations: number; check: string; items: number };

const LEVELS = [
  { label: "Very weak", cls: "bg-rose-ink" }, { label: "Weak", cls: "bg-rose-ink" }, { label: "Okay", cls: "bg-cream-ink" },
  { label: "Good", cls: "bg-mint-ink" }, { label: "Strong", cls: "bg-mint-ink" },
];
const KIND: Record<Kind, { label: string; icon: typeof Globe; cls: string }> = {
  login: { label: "Logins", icon: Globe, cls: "bg-blue text-blue-ink" },
  wifi: { label: "Wi-Fi", icon: Wifi, cls: "bg-mint text-mint-ink" },
  note: { label: "Secure notes", icon: StickyNote, cls: "bg-cream text-cream-ink" },
};
const IDLE_LOCK_MS = 5 * 60 * 1000;

function Meter({ value }: { value: string }) {
  const s = strength(value);
  if (!value) return null;
  return (
    <div className="mt-2 flex items-center gap-3">
      <div className="flex flex-1 gap-1.5">{[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= s ? LEVELS[s].cls : "bg-line"}`} />)}</div>
      <span className="text-xs font-semibold text-muted">{LEVELS[s].label}</span>
    </div>
  );
}

export default function Passwords() {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const toast = useToast();

  const loadStatus = () => api.get<Status>("/vault").then(setStatus);
  useEffect(() => { loadStatus(); }, []);

  const lock = useCallback(() => { setKey(null); setRows([]); }, []);

  // Lock after 5 minutes without activity. Leaving this page locks it too, since the key only lives here.
  useEffect(() => {
    if (!key) return;
    let t = window.setTimeout(lock, IDLE_LOCK_MS);
    const reset = () => { window.clearTimeout(t); t = window.setTimeout(lock, IDLE_LOCK_MS); };
    const events = ["pointerdown", "keydown", "scroll"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { window.clearTimeout(t); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [key, lock]);

  async function loadItems(k: CryptoKey) {
    const raw = await api.get<{ id: string; blob: string }[]>("/vault/items");
    const out: Row[] = [];
    for (const r of raw) {
      try { out.push({ id: r.id, item: await openBlob<Item>(k, r.blob) }); } catch { /* skip unreadable */ }
    }
    setRows(out);
  }

  if (!status) return <div className="grid h-64 place-items-center"><Mascot mood="thinking" size={90} /></div>;
  if (!status.set_up) return <SetupVault onDone={async (k) => { await loadStatus(); setKey(k); setRows([]); toast("Your password vault is ready"); }} />;
  if (!key) return <UnlockVault status={status} onUnlock={async (k) => { setKey(k); await loadItems(k); }} onReset={async () => { await loadStatus(); toast("Password vault reset"); }} />;
  return <VaultList vaultKey={key} rows={rows} setRows={setRows} onLock={lock} />;
}

function SetupVault({ onDone }: { onDone: (k: CryptoKey) => void }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (p1.length < 12 || strength(p1) < 3) { setError("Use at least 12 characters with a mix of words, numbers or symbols."); return; }
    if (p1 !== p2) { setError("The two passphrases don't match."); return; }
    setBusy(true); setError("");
    try {
      const { key, setup } = await createVault(p1);
      await api.post("/vault/setup", setup);
      onDone(key);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto grid max-w-4xl items-center gap-8 md:grid-cols-[1fr_1.1fr]">
      <div className="rounded-[32px] bg-ink p-8 text-white">
        <Mascot size={120} mood="happy" />
        <h2 className="mt-4 text-[28px] font-extrabold leading-tight">A password vault only you can open</h2>
        <ul className="mt-4 space-y-2 text-white/80">
          <li>• Your passwords are locked on this device before they're saved.</li>
          <li>• Cubby's servers only ever see scrambled data.</li>
          <li>• Cubby's AI can never read them.</li>
        </ul>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-2xl font-bold">Choose a vault passphrase</h2>
        <p className="text-muted">Different from your Cubby password. A short sentence works well, like <i>purple-mango-rides-a-bus</i>.</p>
        <div>
          <Input label="Vault passphrase" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} required />
          <Meter value={p1} />
        </div>
        <Input label="Type it again" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} required />
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-rose/60 p-4 text-sm text-rose-ink">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-ink" />
          <span><b>Nobody can recover this passphrase</b>, not even Cubby. If you forget it, the saved passwords are gone for good.</span>
        </label>
        {error && <p className="rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-rose-ink">{error}</p>}
        <Button type="submit" loading={busy} disabled={!ack} className="w-full !h-12"><Lock className="size-4" />Create password vault</Button>
      </form>
    </div>
  );
}

function UnlockVault({ status, onUnlock, onReset }: { status: Extract<Status, { set_up: true }>; onUnlock: (k: CryptoKey) => void; onReset: () => void }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [acct, setAcct] = useState("");
  const [resetErr, setResetErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { onUnlock(await unlockVault(pass, status.salt, status.iterations, status.check)); }
    catch (err) { setError((err as Error).message); setPass(""); }
    finally { setBusy(false); }
  }
  async function reset(e: FormEvent) {
    e.preventDefault();
    try { await api.post("/vault/reset", { password: acct }); setResetOpen(false); onReset(); }
    catch (err) { setResetErr((err as Error).message); }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-6 text-center">
      <Mascot mood={error ? "worried" : "sleeping"} size={140} />
      <h2 className="mt-4 text-2xl font-bold">Your password vault is locked</h2>
      <p className="mt-1 text-muted">{status.items} item{status.items === 1 ? "" : "s"} inside. Enter your vault passphrase to open it.</p>
      <form onSubmit={submit} className="mt-6 w-full space-y-3 text-left">
        <Input label="Vault passphrase" type="password" autoComplete="current-password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} error={error} />
        <Button type="submit" loading={busy} className="w-full !h-12"><KeyRound className="size-4" />Unlock</Button>
      </form>
      <button onClick={() => setResetOpen(true)} className="mt-5 text-sm font-semibold text-muted underline underline-offset-4 cursor-pointer">Forgot your vault passphrase?</button>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Start a new password vault?">
        <form onSubmit={reset} className="space-y-4 text-left">
          <p className="text-muted">Without the passphrase, the saved passwords can't be unlocked by anyone. Resetting <b className="text-ink">deletes all {status.items} items</b> so you can start again. Your documents aren't affected.</p>
          <Input label="Confirm with your Cubby account password" type="password" autoComplete="current-password" required value={acct} onChange={(e) => setAcct(e.target.value)} error={resetErr} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger">Delete and start over</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function VaultList({ vaultKey, rows, setRows, onLock }: { vaultKey: CryptoKey; rows: Row[]; setRows: (r: Row[] | ((r: Row[]) => Row[])) => void; onLock: () => void }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind | "all">("all");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [health, setHealth] = useState<{ weak: string[]; reused: string[]; breached: string[]; failed: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const clearTimer = useRef<number>();
  const toast = useToast();

  const list = useMemo(() => rows
    .filter((r) => (kind === "all" || r.item.kind === kind) && `${r.item.name} ${r.item.username ?? ""} ${r.item.url ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.item.name.localeCompare(b.item.name)), [rows, q, kind]);

  async function copy(text: string, what: string) {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied. It clears from the clipboard in 30 seconds.`);
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => { navigator.clipboard.writeText("").catch(() => {}); }, 30000);
  }

  async function save(item: Item, id?: string) {
    const blob = await seal(vaultKey, item);
    if (id) {
      await api.put(`/vault/items/${id}`, { blob });
      setRows((rs) => rs.map((r) => r.id === id ? { id, item } : r));
    } else {
      const r = await api.post<{ id: string }>("/vault/items", { blob });
      setRows((rs) => [...rs, { id: r.id, item }]);
    }
    setHealth(null);
  }

  async function remove(id: string) {
    await api.del(`/vault/items/${id}`);
    setRows((rs) => rs.filter((r) => r.id !== id));
    toast("Deleted");
  }

  async function checkHealth() {
    setChecking(true);
    const withPw = rows.filter((r) => r.item.password);
    const weak = withPw.filter((r) => strength(r.item.password!) < 3).map((r) => r.id);
    const byPw = new Map<string, string[]>();
    withPw.forEach((r) => byPw.set(r.item.password!, [...(byPw.get(r.item.password!) || []), r.id]));
    const reused = [...byPw.values()].filter((ids) => ids.length > 1).flat();
    const breached: string[] = [];
    let failed = false;
    for (const r of withPw) {
      try { if (await breachCount(r.item.password!) > 0) breached.push(r.id); } catch { failed = true; break; }
    }
    setHealth({ weak, reused, breached, failed });
    setChecking(false);
  }

  const flag = (id: string) => health && [health.breached.includes(id) && "Found in a data breach", health.reused.includes(id) && "Used more than once", health.weak.includes(id) && "Weak"].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-full bg-mist px-4 focus-within:ring-2 focus-within:ring-blue-ink/30">
          <Search className="size-4 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your vault" aria-label="Search passwords" className="h-full flex-1 bg-transparent text-sm outline-none" />
        </label>
        <Button variant="light" loading={checking} onClick={checkHealth}><HeartPulse className="size-4" />Check health</Button>
        <Button onClick={() => setEditing("new")}><Plus className="size-4" />Add</Button>
        <Button variant="dark" onClick={onLock}><Lock className="size-4" />Lock</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "login", "wifi", "note"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`h-9 rounded-full px-4 text-sm font-semibold cursor-pointer ${kind === k ? "bg-ink text-white" : "bg-mist hover:bg-line"}`}>
            {k === "all" ? "All" : KIND[k].label} <span className="opacity-60">{k === "all" ? rows.length : rows.filter((r) => r.item.kind === k).length}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {health && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[22px] p-5 ${health.breached.length || health.reused.length || health.weak.length ? "bg-cream text-cream-ink" : "bg-mint text-mint-ink"}`}>
            <ShieldAlert className="size-6" />
            {health.breached.length + health.reused.length + health.weak.length === 0
              ? <span className="font-semibold">All good. No weak, reused or breached passwords.</span>
              : <>
                  <span className="font-semibold">{health.breached.length} found in breaches</span>
                  <span className="font-semibold">{new Set(health.reused).size} reused</span>
                  <span className="font-semibold">{health.weak.length} weak</span>
                </>}
            {health.failed && <span className="text-sm">The breach check couldn't be reached, so only weak and reused passwords were checked.</span>}
            <span className="w-full text-xs opacity-80">The breach check sends only the first 5 characters of each password's fingerprint (hash) to Have I Been Pwned, never the password.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Mascot mood="happy" size={110} />
          <h3 className="mt-3 text-xl font-bold">Your password vault is empty</h3>
          <p className="mt-1 max-w-sm text-muted">Add the logins, Wi-Fi passwords and PINs you keep forgetting.</p>
          <Button className="mt-5" onClick={() => setEditing("new")}><Plus className="size-4" />Add the first one</Button>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-[24px] border border-line">
          {list.map((r) => {
            const k = KIND[r.item.kind];
            const Icon = k.icon;
            const flags = flag(r.id) || [];
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
                <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${k.cls}`}><Icon className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{r.item.name}</span>
                    {flags.map((f) => <span key={f} className="rounded-full bg-rose px-2 py-0.5 text-[11px] font-bold text-rose-ink">{f}</span>)}
                  </div>
                  <div className="truncate text-sm text-muted">
                    {r.item.kind === "note" ? (r.item.notes || "").slice(0, 60) : r.item.username || r.item.url || "No username"}
                  </div>
                  {shown === r.id && r.item.password && <div className="mt-1 font-mono text-sm font-semibold break-all">{r.item.password}</div>}
                </div>
                <div className="flex items-center gap-0.5">
                  {r.item.username && <button onClick={() => copy(r.item.username!, "Username")} className="h-9 rounded-full px-3 text-xs font-semibold hover:bg-mist cursor-pointer">Copy user</button>}
                  {r.item.password && <>
                    <button onClick={() => copy(r.item.password!, "Password")} aria-label="Copy password" className="grid size-9 place-items-center rounded-full hover:bg-mist cursor-pointer"><Copy className="size-4" /></button>
                    <button onClick={() => setShown(shown === r.id ? null : r.id)} aria-label={shown === r.id ? "Hide password" : "Show password"} className="grid size-9 place-items-center rounded-full hover:bg-mist cursor-pointer">
                      {shown === r.id ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                  </>}
                  <button onClick={() => setEditing(r)} aria-label="Edit" className="grid size-9 place-items-center rounded-full hover:bg-mist cursor-pointer"><Pencil className="size-4" /></button>
                  <button onClick={() => remove(r.id)} aria-label="Delete" className="grid size-9 place-items-center rounded-full text-muted hover:bg-mist hover:text-rose-ink cursor-pointer"><Trash2 className="size-4" /></button>
                </div>
              </li>
            );
          })}
          {list.length === 0 && <li className="p-6 text-center text-muted">Nothing matches “{q}”.</li>}
        </ul>
      )}
      <p className="text-center text-xs text-muted">Locked on this device before saving · locks after 5 minutes idle or when you leave this page · Cubby's AI can't read it</p>

      <ItemEditor row={editing} onClose={() => setEditing(null)}
        onSave={async (item, id) => { await save(item, id); setEditing(null); toast(id ? "Saved" : "Added"); }} />
    </div>
  );
}

function ItemEditor({ row, onClose, onSave }: { row: Row | "new" | null; onClose: () => void; onSave: (item: Item, id?: string) => Promise<void> }) {
  const blank: Item = { kind: "login", name: "", url: "", username: "", password: "", notes: "", updated: "" };
  const [item, setItem] = useState<Item>(blank);
  const [len, setLen] = useState(20);
  const [symbols, setSymbols] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setItem(row && row !== "new" ? { ...blank, ...row.item } : blank); setShow(false); }, [row]);
  const set = (k: keyof Item, v: string) => setItem((i) => ({ ...i, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await onSave({ ...item, name: item.name.trim(), updated: new Date().toISOString() }, row && row !== "new" ? row.id : undefined); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={row !== null} onClose={onClose} title={row === "new" ? "Add to your vault" : "Edit item"}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2">
          {(Object.keys(KIND) as Kind[]).map((k) => {
            const Icon = KIND[k].icon;
            return (
              <button type="button" key={k} onClick={() => set("kind", k)}
                className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-semibold cursor-pointer ${item.kind === k ? "bg-ink text-white" : "bg-mist"}`}>
                <Icon className="size-4" />{k === "login" ? "Login" : k === "wifi" ? "Wi-Fi" : "Note"}
              </button>
            );
          })}
        </div>
        <Input label={item.kind === "wifi" ? "Network name" : "Name"} required value={item.name} onChange={(e) => set("name", e.target.value)}
          placeholder={item.kind === "login" ? "e.g. SBI net banking" : item.kind === "wifi" ? "e.g. Home_5G" : "e.g. Locker PIN"} />
        {item.kind === "login" && <>
          <Input label="Website (optional)" value={item.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
          <Input label="Username or email" value={item.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
        </>}
        {item.kind !== "note" && (
          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input label="Password" type={show ? "text" : "password"} value={item.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
              </div>
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide" : "Show"} className="grid size-12 place-items-center rounded-2xl bg-mist cursor-pointer">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
            </div>
            <Meter value={item.password || ""} />
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-mist p-3 text-sm">
              <button type="button" onClick={() => { set("password", generatePassword(len, { digits: true, symbols })); setShow(true); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 font-semibold text-white cursor-pointer"><RefreshCw className="size-4" />Generate</button>
              <label className="flex items-center gap-2">Length {len}
                <input type="range" min={12} max={40} value={len} onChange={(e) => setLen(Number(e.target.value))} className="accent-ink" /></label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={symbols} onChange={(e) => setSymbols(e.target.checked)} className="accent-ink" />Symbols</label>
            </div>
          </div>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">{item.kind === "note" ? "Note" : "Notes (optional)"}</span>
          <textarea value={item.notes} onChange={(e) => set("notes", e.target.value)} rows={item.kind === "note" ? 6 : 2}
            className="w-full rounded-2xl bg-mist px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-blue-ink/30" />
        </label>
        {row && row !== "new" && row.item.updated && <p className="text-xs text-muted">Last changed {relative(row.item.updated)}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{row === "new" ? "Add to vault" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}
