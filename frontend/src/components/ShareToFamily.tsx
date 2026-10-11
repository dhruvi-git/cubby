import { Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, FamilySummary } from "../lib/api";
import Mascot from "./Mascot";
import { Modal, useToast } from "./ui";

const BG: Record<string, string> = { cream: "bg-cream", lav: "bg-lav", mint: "bg-mint", blue: "bg-blue", rose: "bg-rose", peach: "bg-peach" };

/** Send one of your documents into a family chat as a document card. */
export default function ShareToFamily({ docId, title, open, onClose }: { docId: string; title: string; open: boolean; onClose: () => void }) {
  const [families, setFamilies] = useState<FamilySummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setDone(new Set()); setNote("");
    api.get<FamilySummary[]>("/family").then(setFamilies).catch(() => setFamilies([]));
  }, [open]);

  async function share(f: FamilySummary) {
    setBusy(f.id);
    try {
      await api.post(`/family/${f.id}/share`, { document_id: docId, note: note || null });
      setDone((d) => new Set(d).add(f.id));
      toast(`Shared with ${f.name}`);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(null); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share with family">
      <p className="-mt-2 mb-4 text-sm text-muted">“{title}” appears in the chat as a document card. The family gets its own encrypted copy, and full ID numbers stay hidden.</p>
      {families === null ? <div className="grid h-28 place-items-center"><Mascot mood="thinking" size={56} track={false} /></div>
        : families.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-muted">You're not in a family yet.</p>
            <Link to="/app/family" onClick={onClose} className="mt-3 inline-flex items-center gap-1 font-semibold underline underline-offset-4"><Plus className="size-4" />Start a family</Link>
          </div>
        ) : (
          <>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Add a note (optional)"
              aria-label="Note" className="mb-3 w-full resize-none rounded-2xl bg-mist px-4 py-3 text-[15px] outline-none focus:bg-paper focus:ring-2 focus:ring-blue-ink/30" />
            <div className="space-y-1.5">
              {families.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-mist">
                  <span className={`grid size-11 shrink-0 place-items-center rounded-2xl text-2xl ${BG[f.color] || "bg-cream"}`}>{f.emoji}</span>
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold">{f.name}</div><div className="text-xs text-muted">{f.members} members</div></div>
                  {done.has(f.id) ? (
                    <button onClick={() => { onClose(); navigate(`/app/family/${f.id}`); }} className="inline-flex h-9 items-center gap-1 rounded-full bg-mint px-3 text-sm font-semibold text-mint-ink cursor-pointer"><Check className="size-4" />Open chat</button>
                  ) : (
                    <button onClick={() => share(f)} disabled={!!busy} className="h-9 rounded-full bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer">{busy === f.id ? "Sharing…" : "Share"}</button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
    </Modal>
  );
}
