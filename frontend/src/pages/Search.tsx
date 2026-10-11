import { motion } from "framer-motion";
import { Eye, Search as SearchIcon } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Empty, ShelfPill } from "../components/ui";
import { api } from "../lib/api";
import { useViewer } from "../lib/viewer";

type Hit = { document_id: string; title: string; shelf: string; page: number; snippet: string; score: number };

const IDEAS = ["passport expiry date", "health insurance coverage", "rent amount", "electricity bill due"];

function highlight(text: string, q: string): ReactNode {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  const re = new RegExp(`(${words.join("|")})`, "gi");
  return text.split(re).map((part, i) => i % 2 === 1
    ? <mark key={i} className="rounded bg-cream px-0.5 text-ink">{part}</mark> : part);
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState("");
  const openViewer = useViewer();

  async function run(query: string) {
    if (query.trim().length < 2) return;
    setBusy(true); setError(""); setAsked(query);
    setParams({ q: query });
    try { setHits(await api.get<Hit[]>(`/search?q=${encodeURIComponent(query)}`)); }
    catch (err) { setError((err as Error).message); setHits(null); }
    finally { setBusy(false); }
  }

  function submit(e: FormEvent) { e.preventDefault(); run(q); }

  return (
    <div className="mx-auto max-w-3xl">
      <form onSubmit={submit} className="flex items-center gap-2 rounded-full bg-mist p-2 pl-5 focus-within:ring-2 focus-within:ring-blue-ink/30">
        <SearchIcon className="size-5 shrink-0 text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your documents"
          placeholder="Describe what you're looking for…" className="h-11 flex-1 bg-transparent text-[16px] outline-none" />
        <button type="submit" disabled={busy} className="h-11 rounded-full bg-ink px-6 font-semibold text-white disabled:opacity-50 cursor-pointer">{busy ? "Searching…" : "Search"}</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {IDEAS.map((i) => <button key={i} onClick={() => { setQ(i); run(i); }} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold text-muted hover:border-ink/30 hover:text-ink cursor-pointer">{i}</button>)}
      </div>

      <div className="mt-8">
        {error && <p className="rounded-2xl bg-rose px-4 py-3 font-semibold text-rose-ink">{error}</p>}
        {hits === null && !error && <Empty title="Search by meaning">Type what you remember about a document, not its file name. “Car insurance renewal” works.</Empty>}
        {hits && hits.length === 0 && <Empty mood="worried" title="Nothing matched">Try different words, or upload the document if it isn't in your vault yet.</Empty>}
        {hits && hits.length > 0 && (
          <>
            <p className="mb-4 text-sm font-semibold text-muted">{hits.length} passages for “{asked}”</p>
            <ul className="space-y-3">
              {hits.map((h, i) => (
                <motion.li key={`${h.document_id}-${h.page}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className="rounded-[24px] border border-line p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/app/documents/${h.document_id}`} className="font-display text-lg font-bold hover:underline">{h.title}</Link>
                    <ShelfPill shelf={h.shelf} />
                    <span className="text-xs font-semibold text-muted">Page {h.page}</span>
                  </div>
                  <p className="mt-2 line-clamp-4 text-[15px] leading-relaxed text-ink/80">{highlight(h.snippet, asked)}</p>
                  <button onClick={() => openViewer({ documentId: h.document_id, title: h.title, page: h.page, snippet: h.snippet })}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-ink hover:underline cursor-pointer">Open page {h.page}<Eye className="size-3.5" /></button>
                </motion.li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
