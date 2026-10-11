import { motion } from "framer-motion";
import { Copy, Download, KeyRound, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, Modal, useToast } from "../components/ui";
import { api, Share } from "../lib/api";
import { useAuth } from "../lib/auth";
import { relative, shortDate } from "../lib/format";

type Summary = { encrypted: boolean; key_held_separately: boolean; backed_up: boolean; two_factor: boolean; recovery_codes_left: number };
type Event = { id: string; action: string; detail: string; ip: string; user_agent: string; created_at: string };

const ACTIONS: Record<string, string> = {
  signup: "Created the vault", login: "Logged in", login_failed: "Failed login attempt", logout: "Locked the vault",
  "2fa_enabled": "Turned on two-factor sign-in", upload: "Uploaded", view_file: "Opened", delete: "Deleted",
  search: "Searched", chat: "Asked Cubby", export: "Exported the vault", password_changed: "Changed password",
  password_reset_requested: "Asked for a password reset", password_reset: "Reset password",
  recovery_codes_regenerated: "Created new recovery codes", "2fa_reset": "Reset two-factor sign-in",
  session_revoked: "Signed out a device", sessions_revoked: "Signed out other devices",
  id_revealed: "Showed a full ID number", share_created: "Created a share link", share_revoked: "Turned off a share link",
  share_opened: "Someone opened a share link", report_created: "Created a report", vault_created: "Set up the password vault",
  vault_reset: "Reset the password vault",
};

function device(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" on ");
}

export default function Trust() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const loadShares = () => api.get<Share[]>("/shares").then(setShares).catch(() => {});
  const [events, setEvents] = useState<Event[]>([]);
  const [exporting, setExporting] = useState(false);
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { setUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get<Summary>("/trust/summary").then(setSummary).catch(() => {});
    loadShares();
    api.get<Event[]>("/trust/audit").then(setEvents).catch(() => {});
  }, []);

  const promises = [
    { title: "Locked files", body: "Every file, passage, summary and chat is encrypted with AES-256 using a key only your vault uses.",
      on: !!summary?.encrypted, icon: Lock, cls: "bg-lav" },
    { title: "Key kept apart", body: "The key that unlocks your files is held by a different company from the one storing them.",
      on: !!summary?.key_held_separately, icon: KeyRound, cls: "bg-cream" },
    { title: "Backup copy", body: "A second locked copy is kept in another place, so one outage can't lose your papers.",
      on: !!summary?.backed_up, icon: Copy, cls: "bg-mint" },
    { title: "Two-factor sign-in", body: summary ? `A code from your phone is needed to log in. ${summary.recovery_codes_left} recovery codes left.` : "",
      on: !!summary?.two_factor, icon: ShieldCheck, cls: "bg-blue" },
  ];

  async function exportVault() {
    setExporting(true);
    try {
      const blob = await api.get<Blob>("/trust/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "cubby-vault-export.zip";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Export downloaded");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setExporting(false); }
  }

  async function deleteVault(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api.post("/trust/delete-vault", { password: pw }); setUser(null); navigate("/", { replace: true }); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-2xl font-bold">How your vault is protected</h2>
        <p className="mt-1 max-w-2xl text-muted">The short version: your files are locked before they're stored, and only you can open them.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {promises.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div key={p.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className={`rounded-[26px] p-6 ${p.on ? p.cls : "bg-mist"}`}>
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-paper"><Icon className="size-6" /></span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.on ? "bg-paper/80 text-ink" : "bg-paper text-muted"}`}>{p.on ? "On" : "Off"}</span>
                </div>
                <h3 className="mt-4 font-display text-lg font-bold">{p.title}</h3>
                <p className="mt-1 text-sm text-ink/70">{p.body}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="rounded-[26px] border border-line p-6">
        <h3 className="font-display text-lg font-bold">What happens when you upload a file</h3>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {["Your browser sends it over an encrypted connection, and Cubby immediately locks it with your own personal key.",
            "That personal key is itself locked by a master key kept with a different company from your files, so neither one alone can open them.",
            "Cubby reads the text to make it searchable. Those passages, summaries and your chats are stored locked too."].map((t, i) => (
            <li key={i} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">{i + 1}</span><span className="pt-0.5 text-[15px]">{t}</span></li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-1 text-2xl font-bold">Shared links</h2>
        <p className="mb-4 text-muted">Links you've made to let someone else view a document.</p>
        {shares.length === 0 ? <p className="rounded-[22px] bg-mist p-5 text-muted">You haven't shared anything. Use Share on a document to make a time-limited link.</p> : (
          <ul className="space-y-2">
            {shares.slice(0, 15).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 rounded-[20px] border border-line px-5 py-3 text-sm">
                <Link to={`/app/documents/${l.document_id}`} className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.document_title}{l.label && <span className="font-normal text-muted"> · for {l.label}</span>}</div>
                  <div className="text-xs text-muted">{l.views} view{l.views === 1 ? "" : "s"}{l.last_viewed_at ? `, last ${relative(l.last_viewed_at)}` : ""} · {l.state === "active" ? "until" : "ended"} {shortDate(l.expires_at)}</div>
                </Link>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${l.state === "active" ? "bg-mint text-mint-ink" : "bg-mist text-muted"}`}>{l.state}</span>
                {l.state === "active" && <Button variant="ghost" className="!h-9 !px-3 text-sm" onClick={async () => { await api.del(`/shares/${l.id}`); loadShares(); toast("Link turned off"); }}>Turn off</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Recent activity</h2>
        <div className="overflow-x-auto rounded-[24px] border border-line">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead><tr className="text-muted"><th className="px-5 py-3 font-medium">What</th><th className="px-5 py-3 font-medium">Device</th><th className="px-5 py-3 font-medium">IP</th><th className="px-5 py-3 font-medium">When</th></tr></thead>
            <tbody className="divide-y divide-line">
              {events.slice(0, 25).map((e) => (
                <tr key={e.id}>
                  <td className={`px-5 py-3 font-semibold ${e.action === "login_failed" ? "text-rose-ink" : ""}`}>{ACTIONS[e.action] || e.action}{e.detail && <span className="font-normal text-muted"> · {e.detail}</span>}</td>
                  <td className="px-5 py-3 text-muted">{device(e.user_agent)}</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted">{e.ip}</td>
                  <td className="px-5 py-3 text-muted">{relative(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[26px] bg-mist p-6">
          <h3 className="font-display text-lg font-bold">Take everything with you</h3>
          <p className="mt-1 text-sm text-muted">Download all your files, decrypted, plus summaries and dates in one zip.</p>
          <Button variant="light" className="mt-4" loading={exporting} onClick={exportVault}><Download className="size-4" />Export vault</Button>
        </div>
        <div className="rounded-[26px] bg-rose/60 p-6">
          <h3 className="font-display text-lg font-bold text-rose-ink">Delete your vault</h3>
          <p className="mt-1 text-sm text-rose-ink/80">Permanently deletes every file and closes your account. This can't be undone.</p>
          <Button variant="danger" className="mt-4 !bg-paper" onClick={() => setDel(true)}><Trash2 className="size-4" />Delete vault</Button>
        </div>
      </section>

      <Modal open={del} onClose={() => setDel(false)} title="Delete your whole vault?">
        <form onSubmit={deleteVault} className="space-y-4">
          <p className="text-muted">Type your password to confirm. Consider exporting first.</p>
          <Input label="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} error={err} required autoComplete="current-password" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDel(false)}>Keep my vault</Button>
            <Button type="submit" variant="danger" loading={busy}>Delete forever</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
