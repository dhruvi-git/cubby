import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api, Share } from "../lib/api";
import { relative, shortDate } from "../lib/format";
import { Button, Input, Modal, useToast } from "./ui";

const DURATIONS = [[1, "1 hour"], [24, "1 day"], [72, "3 days"], [168, "1 week"], [720, "30 days"]] as const;
const STATE_CLS: Record<string, string> = { active: "bg-mint text-mint-ink", expired: "bg-mist text-muted", revoked: "bg-mist text-muted", "used up": "bg-cream text-cream-ink" };

/** Create and manage share links for one document. */
export default function ShareDialog({ docId, title, open, onClose, onChange }: {
  docId: string; title: string; open: boolean; onClose: () => void; onChange?: () => void;
}) {
  const [hours, setHours] = useState(24);
  const [allowDownload, setAllowDownload] = useState(true);
  const [limit, setLimit] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Share | null>(null);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<Share[]>([]);
  const toast = useToast();

  const load = () => api.get<Share[]>(`/documents/${docId}/shares`).then(setLinks).catch(() => {});
  useEffect(() => { if (open) { load(); setCreated(null); setCopied(false); } }, [open]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await api.post<Share>(`/documents/${docId}/shares`, {
        hours, allow_download: allowDownload, max_views: limit ? Number(limit) : null, label });
      setCreated(s); setLabel(""); setLimit("");
      load(); onChange?.();
    } catch (err) { toast((err as Error).message, "error"); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    await api.del(`/shares/${id}`);
    toast("Link turned off");
    load(); onChange?.();
  }

  async function copy() {
    if (!created?.url) return;
    await navigator.clipboard.writeText(created.url);
    setCopied(true);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Share “${title}”`}>
      {created?.url ? (
        <div>
          <p className="text-muted">Anyone with this link can view the document until {shortDate(created.expires_at)}. Copy it now: for safety, Cubby won't show it again.</p>
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-mist p-2 pl-4">
            <Link2 className="size-4 shrink-0 text-muted" />
            <code className="min-w-0 flex-1 truncate text-sm">{created.url}</code>
            <Button onClick={copy} className="!h-9 !px-4">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy"}</Button>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreated(null)}>Make another</Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={create} className="space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-semibold">Link works for</span>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map(([h, l]) => (
                <button type="button" key={h} onClick={() => setHours(h)}
                  className={`h-9 rounded-full px-3.5 text-sm font-semibold cursor-pointer ${hours === h ? "bg-ink text-white" : "bg-mist hover:bg-line"}`}>{l}</button>
              ))}
            </div>
          </div>
          <Input label="Who is it for? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My accountant" maxLength={120} />
          <Input label="Stop after this many views (optional)" type="number" min={1} max={1000} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="No limit" />
          <label className="flex cursor-pointer items-center gap-3 text-[15px]">
            <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} className="size-4 accent-ink" />
            Show a download button
          </label>
          <Button type="submit" loading={busy} className="w-full !h-12"><Link2 className="size-4" />Create link</Button>
        </form>
      )}

      {links.length > 0 && !created && (
        <div className="mt-6 border-t border-line pt-4">
          <div className="mb-2 text-sm font-semibold">Links for this document</div>
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-3 rounded-2xl bg-mist px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{l.label || "Share link"}</div>
                  <div className="text-xs text-muted">
                    {l.views} view{l.views === 1 ? "" : "s"}{l.max_views ? ` of ${l.max_views}` : ""} · {l.state === "active" ? `until ${shortDate(l.expires_at)}` : `made ${relative(l.created_at)}`}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_CLS[l.state]}`}>{l.state}</span>
                {l.state === "active" && <button onClick={() => revoke(l.id)} aria-label="Turn off link" className="grid size-8 place-items-center rounded-full text-muted hover:bg-paper hover:text-rose-ink cursor-pointer"><Trash2 className="size-4" /></button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
