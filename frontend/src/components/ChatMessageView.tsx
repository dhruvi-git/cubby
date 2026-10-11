import { AnimatePresence, motion } from "framer-motion";
import { BookmarkPlus, Check, FileText } from "lucide-react";
import { Fragment, ReactNode, useState } from "react";
import { api, ChatMessage, Citation } from "../lib/api";
import { useViewer } from "../lib/viewer";
import Mascot from "./Mascot";
import { useToast } from "./ui";

function withCitations(text: string, cites: Citation[], onCite: (c: Citation) => void, onHover: (n: number | null) => void): ReactNode {
  return text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    const c = m && cites.find((x) => x.n === Number(m[1]));
    if (c) {
      return <button key={i} onClick={() => onCite(c)} onMouseEnter={() => onHover(c.n)} onMouseLeave={() => onHover(null)}
        aria-label={`Source ${c.n}: ${c.title}, page ${c.page}`}
        className="mx-0.5 inline-grid size-5 -translate-y-0.5 place-items-center rounded-full bg-lav text-[11px] font-bold text-lav-ink hover:brightness-95 cursor-pointer">{c.n}</button>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** One chat bubble. Citations open the source page in the viewer, highlighted. */
export default function ChatMessageView({ m, question, streaming = false, compact = false }: {
  m: ChatMessage; question?: string; streaming?: boolean; compact?: boolean;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const openViewer = useViewer();
  const toast = useToast();
  const open = (c: Citation) => openViewer({ documentId: c.document_id, title: c.title, page: c.page, snippet: c.snippet });

  if (m.role === "user") {
    return <div className={`ml-auto max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-ink px-4 py-3 text-white ${compact ? "text-sm" : "text-[15px]"}`}>{m.content}</div>;
  }

  async function saveNote() {
    try {
      await api.post("/studio/notes", { title: (question || "Answer from Cubby").slice(0, 120), body: m.content, citations: m.citations });
      setSaved(true);
      toast("Saved to Studio");
    } catch (e) { toast((e as Error).message, "error"); }
  }

  const hovered = m.citations.find((c) => c.n === focus);
  return (
    <div className="flex max-w-[94%] items-start gap-2.5">
      {!compact && <div className="shrink-0 pt-1"><Mascot size={40} track={false} mood={streaming ? "thinking" : "idle"} /></div>}
      <div className="min-w-0">
        <div className={`whitespace-pre-wrap rounded-[22px] rounded-tl-md bg-mist px-4 py-3 leading-relaxed ${compact ? "text-sm" : "text-[15px]"}`}>
          {withCitations(m.content, m.citations, open, setFocus)}
          {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-ink/60 align-middle" />}
        </div>
        {!streaming && m.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.citations.map((c) => (
              <button key={c.n} onClick={() => open(c)} onMouseEnter={() => setFocus(c.n)} onMouseLeave={() => setFocus(null)}
                className={`inline-flex max-w-[240px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${focus === c.n ? "bg-lav text-lav-ink" : "bg-paper text-ink ring-1 ring-line"}`}>
                <span className="font-bold">{c.n}</span><FileText className="size-3.5 shrink-0" />
                <span className="truncate">{c.title}, p. {c.page}</span>
              </button>
            ))}
          </div>
        )}
        <AnimatePresence>
          {hovered && (
            <motion.blockquote initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="mt-2 overflow-hidden rounded-2xl bg-lav/50 px-4 py-3 text-sm text-ink/80">“{hovered.snippet}…”</motion.blockquote>
          )}
        </AnimatePresence>
        {!streaming && !compact && m.id !== "tmp" && (
          <button onClick={saveNote} disabled={saved} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink disabled:opacity-60 cursor-pointer">
            {saved ? <Check className="size-3.5" /> : <BookmarkPlus className="size-3.5" />}{saved ? "Saved to Studio" : "Save as note"}
          </button>
        )}
      </div>
    </div>
  );
}
