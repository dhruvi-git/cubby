import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, FileText, Maximize2, RotateCcw, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChat } from "../lib/useChat";
import ChatMessageView from "./ChatMessageView";
import Mascot from "./Mascot";
import { useToast } from "./ui";

/** Floating Cubby in the corner of every page. On a document page it only asks about that document. */
export default function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const docId = pathname.match(/^\/app\/documents\/([a-f0-9]{32})/)?.[1] ?? null;
  const { convo, setConvo, send, thinking, streamingId } = useChat((m) => toast(m, "error"));
  const end = useRef<HTMLDivElement>(null);
  const busy = thinking || !!streamingId;

  // A new page scope (vault vs one document) starts a fresh mini chat.
  useEffect(() => { setConvo(null); }, [docId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [convo?.messages.length, thinking, convo?.messages[convo.messages.length - 1]?.content.length]);

  // The family chat has its own composer (and @Cubby), so the bubble would only get in the way.
  if (pathname.startsWith("/app/chat") || pathname.startsWith("/app/family")) return null;

  async function ask(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    const q = text;
    setText("");
    const ok = await send(q, { documentId: docId });
    if (!ok) setText(q);
  }

  const messages = convo?.messages ?? [];
  return (
    <div className="fixed bottom-24 right-4 z-40 md:bottom-8 md:right-8">
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, scale: 0.6, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.7, y: 20 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }} style={{ originX: 1, originY: 1 }}
            className="absolute bottom-20 right-0 flex h-[min(560px,calc(100vh-160px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-[28px] bg-paper shadow-[0_30px_60px_-20px_rgba(35,35,38,0.45)] ring-1 ring-line">
            <div className="flex items-center gap-2 bg-ink px-4 py-3 text-white">
              <span className="grid size-9 place-items-center rounded-xl bg-cream"><Mascot size={28} track={false} mood={busy ? "thinking" : "happy"} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-display font-bold leading-tight">Ask Cubby</div>
                <div className="truncate text-xs text-white/60">{docId ? "About this document" : "About your whole vault"}</div>
              </div>
              {convo && <button onClick={() => setConvo(null)} aria-label="New chat" className="grid size-8 place-items-center rounded-full hover:bg-white/10 cursor-pointer"><RotateCcw className="size-4" /></button>}
              <button onClick={() => { setOpen(false); navigate(convo ? `/app/chat/${convo.id}` : "/app/chat"); }} aria-label="Open full chat"
                className="grid size-8 place-items-center rounded-full hover:bg-white/10 cursor-pointer"><Maximize2 className="size-4" /></button>
              <button onClick={() => setOpen(false)} aria-label="Close" className="grid size-8 place-items-center rounded-full hover:bg-white/10 cursor-pointer"><X className="size-4" /></button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Mascot size={90} />
                  <p className="mt-3 font-semibold">{docId ? "Ask anything about this document." : "Ask anything about your papers."}</p>
                  {docId && <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted"><FileText className="size-3.5" />Answers only use this document</p>}
                </div>
              )}
              {messages.map((m, i) => (
                <ChatMessageView key={m.id} m={m} compact streaming={m.id === streamingId}
                  question={messages[i - 1]?.role === "user" ? messages[i - 1].content : undefined} />
              ))}
              {thinking && <div className="flex items-center gap-2 text-sm font-semibold text-muted"><Mascot mood="thinking" size={34} track={false} />Looking…</div>}
              <div ref={end} />
            </div>
            <form onSubmit={ask} className="m-3 mt-0 flex items-center gap-2 rounded-full bg-mist p-1.5 pl-4 focus-within:ring-2 focus-within:ring-blue-ink/30">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a question…" aria-label="Ask Cubby" autoFocus
                className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
              <button type="submit" disabled={!text.trim() || busy} aria-label="Send" className="grid size-9 place-items-center rounded-full bg-ink text-white disabled:opacity-30 cursor-pointer"><ArrowUp className="size-4" /></button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button onClick={() => setOpen(!open)} aria-label={open ? "Close Ask Cubby" : "Open Ask Cubby"} aria-expanded={open}
        whileHover={{ scale: 1.06, rotate: -4 }} whileTap={{ scale: 0.92 }}
        className="relative grid size-16 place-items-center rounded-[22px] bg-cream shadow-[0_14px_30px_-10px_rgba(35,35,38,0.45)] ring-4 ring-paper cursor-pointer">
        <Mascot size={50} track={!open} mood={busy ? "thinking" : open ? "happy" : "idle"} />
      </motion.button>
    </div>
  );
}
