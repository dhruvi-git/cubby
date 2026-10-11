import { AnimatePresence, motion } from "framer-motion";
import { CheckSquare, FileImage, FileText, Search, Square, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import IdCards from "../components/IdCards";
import UploadZone from "../components/UploadZone";
import { Button, Empty, Modal, StatusPill, useToast } from "../components/ui";
import { api, Doc } from "../lib/api";
import { bytes, relative, SHELF_STYLE, SHELVES } from "../lib/format";

type Sort = "newest" | "oldest" | "name" | "size";

export default function Documents() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [shelf, setShelf] = useState<string>("All");
  const [sort, setSort] = useState<Sort>("newest");
  const [filter, setFilter] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const navigate = useNavigate();
  const toast = useToast();

  const load = () => api.get<Doc[]>("/documents").then(setDocs).catch(() => setDocs([]));
  useEffect(() => { load(); }, []);

  // While Cubby is still reading files, check back every few seconds.
  const reading = docs?.some((d) => d.status === "processing");
  useEffect(() => {
    if (!reading) return;
    const t = window.setInterval(load, 3000);
    return () => window.clearInterval(t);
  }, [reading]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    docs?.forEach((d) => { c[d.shelf] = (c[d.shelf] || 0) + 1; });
    return c;
  }, [docs]);
  const starredCount = docs?.filter((d) => d.starred).length ?? 0;

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = (docs ?? []).filter((d) =>
      (shelf === "All" || (shelf === "Starred" ? d.starred : d.shelf === shelf)) &&
      (!q || `${d.title} ${d.filename} ${d.doc_type ?? ""}`.toLowerCase().includes(q)));
    const by: Record<Sort, (a: Doc, b: Doc) => number> = {
      newest: (a, b) => b.created_at.localeCompare(a.created_at),
      oldest: (a, b) => a.created_at.localeCompare(b.created_at),
      name: (a, b) => a.title.localeCompare(b.title),
      size: (a, b) => b.size_bytes - a.size_bytes,
    };
    return [...list].sort(by[sort]);
  }, [docs, shelf, filter, sort]);

  async function toggleStar(d: Doc) {
    setDocs((all) => all && all.map((x) => x.id === d.id ? { ...x, starred: !x.starred } : x));
    await api.patch(`/documents/${d.id}`, { starred: !d.starred }).catch(() => load());
  }

  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function exitSelect() { setSelecting(false); setSelected(new Set()); }

  async function bulk(action: "delete" | "move" | "star" | "unstar", shelfName?: string) {
    const ids = [...selected];
    try {
      const r = await api.post<{ count: number }>("/documents/bulk", { ids, action, shelf: shelfName });
      toast(action === "delete" ? `Deleted ${r.count} document${r.count > 1 ? "s" : ""}`
        : action === "move" ? `Moved ${r.count} to ${shelfName}` : action === "star" ? "Starred" : "Unstarred");
      exitSelect(); setConfirmDelete(false); setMoveTo("");
      load();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  const tabs = ["All", ...(starredCount ? ["Starred"] : []), ...SHELVES.filter((s) => counts[s])];

  return (
    <div className="space-y-7">
      <UploadZone compact onUploaded={(d) => setDocs((prev) => [d, ...(prev || [])])} />

      {docs && <IdCards docs={docs} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap gap-2" role="tablist" aria-label="Shelves">
          {tabs.map((s) => {
            const active = shelf === s;
            const st = SHELF_STYLE[s];
            const n = s === "All" ? docs?.length ?? 0 : s === "Starred" ? starredCount : counts[s];
            return (
              <button key={s} role="tab" aria-selected={active} onClick={() => setShelf(s)}
                className={`h-10 rounded-full px-4 text-sm font-semibold transition cursor-pointer ${active ? "bg-ink text-white" : st ? `${st.bg} ${st.ink} hover:brightness-95` : "bg-mist hover:bg-line"}`}>
                {s === "Starred" && <Star className="mr-1 inline size-3.5 -translate-y-px fill-current" />}{s} <span className="ml-1 opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-full bg-mist px-4 focus-within:ring-2 focus-within:ring-blue-ink/30">
          <Search className="size-4 text-muted" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name or type" aria-label="Filter documents"
            className="h-full flex-1 bg-transparent text-sm outline-none" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort"
          className="h-11 rounded-full border border-line bg-paper px-4 text-sm font-semibold outline-none">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option><option value="size">Largest first</option>
        </select>
        <Button variant={selecting ? "dark" : "light"} onClick={() => selecting ? exitSelect() : setSelecting(true)}>
          <CheckSquare className="size-4" />{selecting ? "Done" : "Select"}
        </Button>
      </div>

      {docs === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-[26px] bg-mist" />)}</div>
      ) : shown.length === 0 ? (
        docs.length === 0
          ? <Empty title="Your shelves are empty">Drop a few documents above. Passports, policies and bills are a great start.</Empty>
          : <Empty mood="worried" title="Nothing matches">Try another shelf or clear the filter.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((d, i) => {
            const st = SHELF_STYLE[d.shelf] || SHELF_STYLE.Other;
            const Icon = d.mime_type.startsWith("image/") ? FileImage : FileText;
            const isSel = selected.has(d.id);
            return (
              <motion.div key={d.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}
                onClick={() => selecting ? toggleSelect(d.id) : navigate(`/app/documents/${d.id}`)}
                className={`group relative flex flex-col rounded-[26px] border bg-paper p-5 text-left transition hover:-translate-y-1 hover:shadow-[0_14px_30px_-18px_rgba(35,35,38,0.35)] cursor-pointer ${isSel ? "border-ink ring-2 ring-ink" : "border-line"} ${d.superseded_by ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid size-12 place-items-center rounded-2xl ${st.bg} ${st.ink}`}>
                    {selecting ? (isSel ? <CheckSquare className="size-6" /> : <Square className="size-6" />) : <Icon className="size-6" />}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <StatusPill status={d.status} />
                    {!selecting && (
                      <button onClick={(e) => { e.stopPropagation(); toggleStar(d); }} aria-label={d.starred ? "Unstar" : "Star"}
                        className="grid size-8 place-items-center rounded-full hover:bg-mist cursor-pointer">
                        <Star className={`size-[18px] ${d.starred ? "fill-cream-ink text-cream-ink" : "text-line group-hover:text-muted"}`} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 line-clamp-2 font-display text-lg font-bold leading-snug">{d.title}</div>
                <div className="mt-1 text-sm text-muted">{d.doc_type || d.filename}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {d.needs_review && <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-cream-ink">Check type</span>}
                  {d.superseded_by && <span className="rounded-full bg-mist px-2 py-0.5 text-[11px] font-bold text-muted">Old version</span>}
                </div>
                <div className="mt-auto flex items-center justify-between pt-3 text-xs font-semibold text-muted">
                  <span className={st.ink}>{d.shelf}</span>
                  <span>{bytes(d.size_bytes)} · {relative(d.created_at)}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {selecting && selected.size > 0 && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-3 bottom-24 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-[24px] bg-ink p-2 pl-5 text-white shadow-2xl md:bottom-8">
            <span className="mr-auto font-semibold">{selected.size} selected</span>
            <button onClick={() => bulk("star")} className="flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-white/10 cursor-pointer"><Star className="size-4" />Star</button>
            <select value={moveTo} onChange={(e) => { setMoveTo(e.target.value); if (e.target.value) bulk("move", e.target.value); }}
              aria-label="Move to shelf" className="h-10 rounded-full bg-white/10 px-3 text-sm font-semibold outline-none">
              <option value="">Move to…</option>{SHELVES.map((s) => <option key={s} value={s} className="text-ink">{s}</option>)}
            </select>
            <button onClick={() => setConfirmDelete(true)} className="flex h-10 items-center gap-1.5 rounded-full bg-rose px-4 text-sm font-semibold text-rose-ink cursor-pointer"><Trash2 className="size-4" />Delete</button>
            <button onClick={exitSelect} aria-label="Cancel" className="grid size-10 place-items-center rounded-full hover:bg-white/10 cursor-pointer"><X className="size-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${selected.size} document${selected.size > 1 ? "s" : ""}?`}>
        <p className="text-muted">They'll be permanently deleted, with their summaries, dates and search passages. This can't be undone.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep them</Button>
          <Button variant="danger" onClick={() => bulk("delete")}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
