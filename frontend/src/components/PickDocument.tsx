import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Doc } from "../lib/api";
import { lookFor } from "../lib/idLook";
import Mascot from "./Mascot";
import { Modal } from "./ui";

function IdIcon({ type }: { type?: string | null }) {
  const look = lookFor(type);
  const Icon = look.icon;
  return <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${look.bg}`}><Icon className="size-5" /></span>;
}

export default function PickDocument({ open, label, onClose, onPick, busyId, hint }: {
  open: boolean; label: string; onClose: () => void; onPick: (d: Doc) => void; busyId?: string | null; hint?: string;
}) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    setQ("");
    api.get<Doc[]>("/documents").then((d) => setDocs(d.filter((x) => x.status === "ready" && !x.superseded_by))).catch(() => setDocs([]));
  }, [open]);
  const words = label.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const score = (d: Doc) => words.filter((w) => `${d.title} ${d.doc_type || ""}`.toLowerCase().includes(w)).length;
  const list = (docs || [])
    .filter((d) => !q || `${d.title} ${d.doc_type || ""} ${d.shelf}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => score(b) - score(a));

  return (
    <Modal open={open} onClose={onClose} title={label ? `Choose your ${label}` : "Choose a document"}>
      {hint && <p className="-mt-2 mb-3 text-sm text-muted">{hint}</p>}
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your documents" aria-label="Search your documents"
          className="h-11 w-full rounded-2xl bg-mist pl-10 pr-4 text-[15px] outline-none focus:bg-paper focus:ring-2 focus:ring-blue-ink/30" />
      </label>
      <div className="mt-3 max-h-[46vh] space-y-1.5 overflow-y-auto">
        {docs === null ? <div className="grid h-32 place-items-center"><Mascot mood="thinking" size={60} track={false} /></div>
          : list.length === 0 ? (
            <div className="py-8 text-center text-muted">
              No matching documents yet.
              <div className="mt-3"><Link to="/app/documents" onClick={onClose} className="font-semibold text-ink underline underline-offset-4">Upload one</Link></div>
            </div>
          ) : list.map((d) => (
            <button key={d.id} onClick={() => onPick(d)} disabled={!!busyId}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-mist disabled:opacity-50 cursor-pointer">
              <IdIcon type={d.id_card?.id_type} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{d.title}</div>
                <div className="truncate text-xs text-muted">{d.doc_type || d.filename} · {d.shelf}</div>
              </div>
              {busyId === d.id && <Mascot mood="thinking" size={28} track={false} />}
            </button>
          ))}
      </div>
    </Modal>
  );
}
