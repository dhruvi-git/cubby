import { motion } from "framer-motion";
import { ArrowUp, FileText, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatMessageView from "../components/ChatMessageView";
import Mascot from "../components/Mascot";
import { useToast } from "../components/ui";
import { api, Conversation } from "../lib/api";
import { relative } from "../lib/format";
import { useChat } from "../lib/useChat";

const STARTERS = ["What documents expire this year?", "Summarise my health insurance", "How much rent do I pay?", "Which bills are due soon?"];

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [text, setText] = useState("");
  const { convo, setConvo, load, send, thinking, streamingId } = useChat((m) => toast(m, "error"));
  const end = useRef<HTMLDivElement>(null);
  const busy = thinking || !!streamingId;

  const loadList = () => api.get<Conversation[]>("/chat/conversations").then(setConvos).catch(() => {});
  useEffect(() => { loadList(); }, []);
  useEffect(() => {
    if (!id) { setConvo(null); return; }
    if (convo?.id === id) return;
    load(id).catch(() => navigate("/app/chat"));
  }, [id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [convo?.messages.length, thinking, convo?.messages[convo.messages.length - 1]?.content.length]);

  async function ask(q: string, e?: FormEvent) {
    e?.preventDefault();
    if (!q.trim() || busy) return;
    setText("");
    const cid = await send(q);
    if (cid && cid !== id) navigate(`/app/chat/${cid}`, { replace: true });
    if (!cid) setText(q);
    loadList();
  }

  async function remove(cid: string) {
    await api.del(`/chat/conversations/${cid}`);
    setConvos((cs) => cs.filter((c) => c.id !== cid));
    if (cid === id) navigate("/app/chat");
  }

  const messages = convo?.messages ?? [];
  return (
    <div className="grid h-[calc(100vh-230px)] min-h-[520px] gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="hidden flex-col overflow-hidden rounded-[26px] bg-mist p-3 lg:flex">
        <button onClick={() => navigate("/app/chat")} className="flex h-11 items-center justify-center gap-2 rounded-full bg-ink font-semibold text-white cursor-pointer"><Plus className="size-4" />New chat</button>
        <div className="mt-3 flex-1 space-y-1 overflow-y-auto">
          {convos.length === 0 && <p className="px-3 py-2 text-sm text-muted">Your chats will appear here.</p>}
          {convos.map((c) => (
            <div key={c.id} className={`group flex items-center rounded-2xl ${c.id === id ? "bg-paper" : "hover:bg-paper/60"}`}>
              <button onClick={() => navigate(`/app/chat/${c.id}`)} className="min-w-0 flex-1 px-3 py-2.5 text-left cursor-pointer">
                <div className="truncate text-sm font-semibold">{c.title}</div>
                <div className="text-xs text-muted">{relative(c.updated_at)}</div>
              </button>
              <button onClick={() => remove(c.id)} aria-label="Delete chat" className="mr-2 hidden size-8 place-items-center rounded-full text-muted hover:bg-mist hover:text-rose-ink group-hover:grid cursor-pointer"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col">
        {convo?.document_title && (
          <div className="mb-3 inline-flex items-center gap-2 self-start rounded-full bg-lav px-3.5 py-1.5 text-sm font-semibold text-lav-ink">
            <FileText className="size-4" />Only asking about: {convo.document_title}
          </div>
        )}
        <div className="flex-1 space-y-5 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Mascot size={120} />
              <h2 className="mt-4 text-2xl font-bold">What would you like to know?</h2>
              <p className="mt-1 max-w-md text-muted">Cubby answers from your documents only. Tap a numbered source to open the page it came from.</p>
              <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                {STARTERS.map((s) => <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink/30 cursor-pointer">{s}</button>)}
              </div>
            </div>
          ) : messages.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <ChatMessageView m={m} streaming={m.id === streamingId} question={messages[i - 1]?.role === "user" ? messages[i - 1].content : undefined} />
            </motion.div>
          ))}
          {thinking && (
            <div className="flex items-center gap-2.5">
              <Mascot mood="thinking" size={44} track={false} />
              <span className="text-sm font-semibold text-muted">Looking through your vault…</span>
            </div>
          )}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => ask(text, e)} className="mt-4 flex items-end gap-2 rounded-[26px] bg-mist p-2 pl-5 focus-within:ring-2 focus-within:ring-blue-ink/30">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} aria-label="Ask Cubby"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }}
            placeholder="Ask about your documents…" className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none" />
          <button type="submit" disabled={!text.trim() || busy} aria-label="Send"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-white transition disabled:opacity-30 cursor-pointer"><ArrowUp className="size-5" /></button>
        </form>
      </section>
    </div>
  );
}
