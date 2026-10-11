import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, AtSign, BadgeCheck, Bell, Check, CheckCheck, Crown, Download, FileText, Hand, Info, LogOut, Mail, Paperclip,
  Plus, Reply, SendHorizonal, Trash2, UserMinus, UserPlus, Users, X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Mascot from "../components/Mascot";
import { Button, Empty, Input, Modal, ShelfPill, useToast } from "../components/ui";
import {
  api, FamilyCitation, FamilyDetail, FamilyDocCard, FamilyInvite, FamilyMessage, FamilySummary,
} from "../lib/api";
import { daysLabel, relative, shortDate } from "../lib/format";
import { lookFor } from "../lib/idLook";
import { useViewer } from "../lib/viewer";
import PickDocument from "../components/PickDocument";

const EMOJIS = ["🏠", "👪", "👨‍👩‍👧", "👨‍👩‍👦", "🏡", "💛", "🌻", "🐣", "🌈", "⭐", "🧸", "🍀"];
const COLORS = ["cream", "lav", "mint", "blue", "rose", "peach"] as const;
const BG: Record<string, string> = { cream: "bg-cream", lav: "bg-lav", mint: "bg-mint", blue: "bg-blue", rose: "bg-rose", peach: "bg-peach" };
const NAME_INK = ["text-lav-ink", "text-mint-ink", "text-blue-ink", "text-peach-ink", "text-rose-ink", "text-cream-ink"];
const AVATAR = ["bg-lav text-lav-ink", "bg-mint text-mint-ink", "bg-blue text-blue-ink", "bg-peach text-peach-ink", "bg-rose text-rose-ink", "bg-cream text-cream-ink"];

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const first = (n?: string | null) => (n || "Someone").split(" ")[0];

/** Family vaults: a private group chat for a household's documents. */
export default function Family() {
  const { id } = useParams();
  const [families, setFamilies] = useState<FamilySummary[] | null>(null);
  const [invites, setInvites] = useState<FamilyInvite[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get<FamilySummary[]>("/family").then(setFamilies).catch(() => setFamilies([]));
    api.get<FamilyInvite[]>("/family/invites/mine").then(setInvites).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 8000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <div className="grid h-[calc(100dvh-204px)] min-h-[420px] grid-rows-[minmax(0,1fr)] gap-5 md:h-[calc(100vh-230px)] lg:min-h-[560px] lg:grid-cols-[340px_1fr]">
      <aside className={`${id ? "hidden lg:flex" : "flex"} min-h-0 flex-col`}>
        <FamilyList families={families} invites={invites} activeId={id} onNew={() => setCreating(true)} onChange={load} />
      </aside>
      <section className={`${id ? "flex" : "hidden lg:flex"} min-h-0 flex-col`}>
        {id ? <FamilyRoom key={id} id={id} onChange={load} />
          : <Welcome hasFamilies={!!families?.length} onNew={() => setCreating(true)} />}
      </section>
      <CreateFamily open={creating} onClose={() => setCreating(false)} onCreated={load} />
    </div>
  );
}

// ---------------- list ----------------

function FamilyList({ families, invites, activeId, onNew, onChange }: {
  families: FamilySummary[] | null; invites: FamilyInvite[]; activeId?: string; onNew: () => void; onChange: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  async function answer(inv: FamilyInvite, accept: boolean) {
    try {
      if (accept) {
        const r = await api.post<{ family_id: string }>(`/family/invites/${inv.id}/accept`);
        toast(`Welcome to ${inv.family_name}!`);
        navigate(`/app/family/${r.family_id}`);
      } else {
        await api.post(`/family/invites/${inv.id}/decline`);
      }
      onChange();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-[28px] bg-mist/70 p-3">
      <div className="flex items-center justify-between px-2 pb-3 pt-1">
        <h2 className="text-xl font-bold">Families</h2>
        <Button variant="dark" onClick={onNew} className="h-10 px-4 text-sm"><Plus className="size-4" />New</Button>
      </div>

      <AnimatePresence>
        {invites.map((inv) => (
          <motion.div key={inv.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
            className="mb-2 rounded-[22px] bg-paper p-4 shadow-sm ring-2 ring-blue-ink/20">
            <div className="flex items-center gap-3">
              <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ${BG[inv.color] || "bg-cream"}`}>{inv.emoji}</span>
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-ink">Invite</div>
                <div className="truncate font-semibold">{inv.family_name}</div>
                <div className="truncate text-xs text-muted">From {inv.invited_by} · {inv.members} member{inv.members === 1 ? "" : "s"}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button className="h-9 flex-1 text-sm" onClick={() => answer(inv, true)}>Join</Button>
              <Button variant="ghost" className="h-9 text-sm" onClick={() => answer(inv, false)}>Decline</Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
        {families === null ? <div className="grid h-40 place-items-center"><Mascot mood="thinking" size={60} track={false} /></div>
          : families.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">No families yet. Start one and invite the people you share paperwork with.</p>
          ) : families.map((f, i) => (
            <motion.div key={f.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              <Link to={`/app/family/${f.id}`}
                className={`flex items-center gap-3 rounded-[20px] px-3 py-3 transition ${activeId === f.id ? "bg-paper shadow-sm" : "hover:bg-paper/60"}`}>
                <span className={`grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ${BG[f.color] || "bg-cream"}`}>{f.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold">{f.name}</span>
                    <span className="shrink-0 text-[11px] text-muted">{relative(f.last_activity)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${f.unread ? "font-semibold text-ink" : "text-muted"}`}>{f.preview || `${f.members} members`}</span>
                    {f.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-mint-ink px-1.5 text-[11px] font-bold text-white">{f.unread > 99 ? "99+" : f.unread}</span>}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
      </div>
    </div>
  );
}

function Welcome({ hasFamilies, onNew }: { hasFamilies: boolean; onNew: () => void }) {
  return (
    <div className="grid flex-1 place-items-center rounded-[28px] bg-sky/60 p-8 text-center">
      <div className="max-w-md">
        <div className="relative mx-auto w-fit">
          <Mascot mood="happy" size={130} />
          {["📄", "🙋", "💬"].map((e, i) => (
            <motion.span key={e} className="absolute text-3xl" style={{ left: [-40, 120, 40][i], top: [10, 0, -36][i] }}
              animate={{ y: [0, -8, 0] }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5 }}>{e}</motion.span>
          ))}
        </div>
        <h2 className="mt-5 font-display text-[28px] font-extrabold leading-tight">{hasFamilies ? "Pick a family to open the chat" : "Your family's paperwork, in one chat"}</h2>
        <p className="mt-3 text-[15px] text-ink/70">
          Share documents as cards, ask for the one you need with a tap, get reminders for everyone,
          and ask <b>@Cubby</b> things like “when does Papa's passport expire?”
        </p>
        {!hasFamilies && <Button className="mt-6" onClick={onNew}><Plus className="size-4" />Start a family</Button>}
        <p className="mt-6 text-xs text-muted">Shared documents get their own encrypted copy with a family key. Only members can open them.</p>
      </div>
    </div>
  );
}

function CreateFamily({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👪");
  const [color, setColor] = useState<string>("mint");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>("/family", { name, emoji, color });
      onClose(); setName(""); onCreated();
      navigate(`/app/family/${r.id}`);
    } catch (err) { toast((err as Error).message, "error"); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Start a family">
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-4">
          <motion.span key={emoji + color} initial={{ scale: 0.7, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
            className={`grid size-16 shrink-0 place-items-center rounded-[22px] text-4xl ${BG[color]}`}>{emoji}</motion.span>
          <div className="flex-1"><Input label="Family name" placeholder="The Jains" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        </div>
        <div>
          <span className="mb-2 block text-sm font-semibold">Icon</span>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button type="button" key={e} onClick={() => setEmoji(e)} aria-label={`Icon ${e}`} aria-pressed={emoji === e}
                className={`grid size-10 place-items-center rounded-xl text-xl transition cursor-pointer ${emoji === e ? "bg-ink/10 ring-2 ring-ink" : "bg-mist hover:bg-line"}`}>{e}</button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-sm font-semibold">Colour</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c}
                className={`size-9 rounded-full transition cursor-pointer ${BG[c]} ${color === c ? "ring-2 ring-ink ring-offset-2" : ""}`} />
            ))}
          </div>
        </div>
        <div className="flex justify-end"><Button type="submit" loading={busy}>Create family</Button></div>
      </form>
    </Modal>
  );
}

// ---------------- room ----------------

function FamilyRoom({ id, onChange }: { id: string; onChange: () => void }) {
  const [fam, setFam] = useState<FamilyDetail | null>(null);
  const [messages, setMessages] = useState<FamilyMessage[]>([]);
  const [reads, setReads] = useState<{ user_id: string; last_read_at: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [info, setInfo] = useState(false);
  const [reply, setReply] = useState<FamilyMessage | null>(null);
  const [thinking, setThinking] = useState(false);
  const [picker, setPicker] = useState<{ mode: "share" } | { mode: "fulfil"; msg: FamilyMessage } | null>(null);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const navigate = useNavigate();
  const toast = useToast();

  const loadDetail = useCallback(() => api.get<FamilyDetail>(`/family/${id}`).then(setFam).catch(() => navigate("/app/family")), [id, navigate]);
  const loadMessages = useCallback(async () => {
    try {
      const r = await api.get<{ messages: FamilyMessage[]; reads: typeof reads }>(`/family/${id}/messages`);
      setMessages((cur) => {
        const pending = cur.filter((m) => m.id.startsWith("tmp-"));
        return [...r.messages, ...pending];
      });
      setReads(r.reads);
      setLoaded(true);
    } catch { /* keep what we have */ }
  }, [id]);

  useEffect(() => {
    loadDetail(); loadMessages();
    const t = window.setInterval(() => { if (!document.hidden) loadMessages(); }, 3000);
    const d = window.setInterval(() => { if (!document.hidden) loadDetail(); }, 20000);
    return () => { window.clearInterval(t); window.clearInterval(d); };
  }, [loadDetail, loadMessages]);

  // Mark as read whenever new messages arrive while the chat is open.
  const lastId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (!lastId || lastId.startsWith("tmp-") || document.hidden) return;
    api.post(`/family/${id}/read`).then(onChange).catch(() => {});
  }, [lastId, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stick to the bottom like a chat app, unless the person scrolled up to read.
  const firstScroll = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (!el || !loaded || !atBottom.current) return;
    if (firstScroll.current) {
      // Jump straight to the newest message on open (twice: after layout and after the bubbles animate in).
      firstScroll.current = false;
      const jump = () => el.scrollTo({ top: el.scrollHeight });
      requestAnimationFrame(jump);
      window.setTimeout(jump, 350);
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, thinking, loaded]);

  function addFromServer(list: FamilyMessage[], tmpId?: string) {
    setMessages((cur) => {
      const ids = new Set(list.map((m) => m.id));
      const kept = cur.filter((m) => m.id !== tmpId && !ids.has(m.id));
      return [...kept, ...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
    atBottom.current = true;
    onChange();
  }

  async function send(text: string) {
    const tmp: FamilyMessage = {
      id: `tmp-${Date.now()}`, kind: "text", created_at: new Date().toISOString(), mine: true,
      sender: { id: fam?.me || null, name: "You" }, text, citations: [], doc: null, doc_removed: false, request: null,
      reply: reply ? { id: reply.id, sender_name: reply.sender?.name || "", preview: previewOf(reply) } : null,
    };
    const replyTo = reply?.id;
    setMessages((m) => [...m, tmp]);
    setReply(null);
    atBottom.current = true;
    const mentions = /@cubby\b/i.test(text);
    if (mentions) setThinking(true);
    try {
      const r = await api.post<{ messages: FamilyMessage[] }>(`/family/${id}/messages`, { text, reply_to: replyTo });
      addFromServer(r.messages, tmp.id);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== tmp.id));
      toast((e as Error).message, "error");
    } finally { setThinking(false); }
  }

  async function pick(docId: string) {
    if (!picker) return;
    setBusyDoc(docId);
    try {
      const r = picker.mode === "share"
        ? await api.post<{ messages: FamilyMessage[] }>(`/family/${id}/share`, { document_id: docId })
        : await api.post<{ messages: FamilyMessage[] }>(`/family/${id}/requests/${picker.msg.id}/fulfil`, { document_id: docId });
      addFromServer(r.messages);
      setPicker(null);
      toast("Shared with the family");
      loadDetail();
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusyDoc(null); }
  }

  async function act(path: string, ok?: string, method: "post" | "del" = "post") {
    try {
      if (method === "del") await api.del(path); else await api.post(path);
      if (ok) toast(ok);
      loadMessages(); loadDetail();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  if (!fam) return <div className="grid flex-1 place-items-center rounded-[28px] bg-mist/60"><Mascot mood="thinking" size={80} /></div>;

  const others = fam.members.filter((m) => m.user_id !== fam.me);
  const names = new Map(fam.members.map((m) => [m.user_id, m.name]));
  const myLast = [...messages].reverse().find((m) => m.mine && !m.id.startsWith("tmp-"));

  return (
    <div className="flex min-h-0 flex-1 gap-5">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-line bg-paper">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Link to="/app/family" className="grid size-9 place-items-center rounded-full hover:bg-mist lg:hidden" aria-label="Back to families"><ArrowLeft className="size-5" /></Link>
          <span className={`grid size-11 shrink-0 place-items-center rounded-2xl text-2xl ${BG[fam.color] || "bg-cream"}`}>{fam.emoji}</span>
          <button onClick={() => setInfo((v) => !v)} className="min-w-0 flex-1 text-left cursor-pointer">
            <div className="truncate font-display text-lg font-bold leading-tight">{fam.name}</div>
            <div className="truncate text-xs text-muted">{fam.members.map((m) => (m.user_id === fam.me ? "You" : first(m.name))).join(", ")}</div>
          </button>
          <div className="hidden -space-x-2 sm:flex">
            {fam.members.slice(0, 4).map((m) => <Avatar key={m.user_id} name={m.name} size="size-8" ring />)}
          </div>
          <button onClick={() => setInfo((v) => !v)} aria-label="Family info" aria-pressed={info}
            className={`grid size-10 place-items-center rounded-full transition cursor-pointer ${info ? "bg-ink text-white" : "bg-mist hover:bg-line"}`}><Info className="size-5" /></button>
        </header>

        {/* Messages */}
        <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
          className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,#e6eaf0_1px,transparent_0)] bg-[length:22px_22px] px-3 py-4 sm:px-5">
          {!loaded ? <div className="grid h-full place-items-center"><Mascot mood="thinking" size={70} track={false} /></div> : (
            <>
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                const grouped = !newDay && prev && prev.kind === m.kind && m.kind === "text" && prev.sender?.id === m.sender?.id
                  && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
                return (
                  <div key={m.id}>
                    {newDay && <DaySeparator iso={m.created_at} />}
                    <MessageRow m={m} grouped={!!grouped} fam={fam} names={names}
                      onReply={() => setReply(m)} onAct={act}
                      onFulfil={() => setPicker({ mode: "fulfil", msg: m })} />
                    {myLast && m.id === myLast.id && others.length > 0 && <Receipt m={m} reads={reads} me={fam.me} names={names} />}
                  </div>
                );
              })}
              <AnimatePresence>{thinking && <CubbyTyping />}</AnimatePresence>
              {messages.length <= 1 && !thinking && <FirstSteps onShare={() => setPicker({ mode: "share" })} onAsk={() => setAsking(true)} />}
            </>
          )}
        </div>

        <Composer reply={reply} onCancelReply={() => setReply(null)} onSend={send}
          onShare={() => setPicker({ mode: "share" })} onRequest={() => setAsking(true)} disabled={thinking} />
      </div>

      {/* Info panel: a drawer over the chat, or a third column on very wide screens */}
      {info && (
        <>
          <motion.button aria-label="Close family info" onClick={() => setInfo(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-ink/30 2xl:hidden" />
          <motion.aside initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-paper shadow-2xl sm:w-[380px] sm:rounded-l-[32px] 2xl:static 2xl:z-auto 2xl:w-[340px] 2xl:shrink-0 2xl:rounded-[28px] 2xl:bg-mist/70 2xl:shadow-none">
            <InfoPanel fam={fam} onClose={() => setInfo(false)} onChanged={() => { loadDetail(); loadMessages(); onChange(); }} />
          </motion.aside>
        </>
      )}

      <PickDocument open={!!picker} onClose={() => setPicker(null)} onPick={(d) => pick(d.id)} busyId={busyDoc}
        label={picker?.mode === "fulfil" ? picker.msg.request?.label || "" : ""}
        hint={picker?.mode === "fulfil"
          ? `${first(picker.msg.sender?.name)} asked for this. The family gets its own encrypted copy; your original stays yours.`
          : "The family gets its own encrypted copy. Full ID numbers stay hidden in the family."} />
      <RequestDialog open={asking} onClose={() => setAsking(false)} fam={fam} onSent={(list) => { addFromServer(list); setAsking(false); }} />
    </div>
  );
}

function previewOf(m: FamilyMessage) {
  if (m.kind === "doc") return m.doc ? `📄 ${m.doc.title}` : "📄 A document";
  if (m.kind === "request") return `🙋 Asked for ${m.request?.label}`;
  return m.text.slice(0, 90);
}

function dayKey(iso: string) { return new Date(iso).toDateString(); }

function DaySeparator({ iso }: { iso: string }) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const label = d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : shortDate(iso);
  return <div className="my-4 flex justify-center"><span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-muted shadow-sm ring-1 ring-line">{label}</span></div>;
}

function Avatar({ name, size = "size-8", ring = false }: { name: string; size?: string; ring?: boolean }) {
  return <span className={`grid ${size} shrink-0 place-items-center rounded-full text-xs font-bold ${AVATAR[hash(name) % AVATAR.length]} ${ring ? "ring-2 ring-paper" : ""}`} title={name}>{name[0]?.toUpperCase()}</span>;
}

function time(iso: string) { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }

function MessageRow({ m, grouped, fam, names, onReply, onAct, onFulfil }: {
  m: FamilyMessage; grouped: boolean; fam: FamilyDetail; names: Map<string, string>;
  onReply: () => void; onAct: (path: string, ok?: string, method?: "post" | "del") => void; onFulfil: () => void;
}) {
  if (m.kind === "system") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="my-3 flex justify-center px-6">
        <span className="max-w-md rounded-2xl bg-cream/80 px-4 py-2 text-center text-xs font-semibold text-cream-ink">{m.text}</span>
      </motion.div>
    );
  }
  const mine = m.mine;
  const isCubby = m.kind === "cubby";
  const pending = m.id.startsWith("tmp-");
  const senderName = m.sender?.name || "";

  return (
    <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: pending ? 0.6 : 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={`group flex items-end gap-2 ${mine ? "justify-end" : ""} ${grouped ? "mt-0.5" : "mt-3"}`}>
      {!mine && (
        <div className="w-8 shrink-0">
          {!grouped && (isCubby ? <span className="grid size-8 place-items-center rounded-full bg-cream"><Mascot size={26} track={false} /></span> : <Avatar name={senderName} />)}
        </div>
      )}
      <div className={`flex min-w-0 max-w-[82%] flex-col sm:max-w-[70%] ${mine ? "items-end" : "items-start"}`}>
        {!mine && !grouped && (
          <span className={`mb-1 px-1 text-xs font-bold ${isCubby ? "text-lav-ink" : NAME_INK[hash(senderName) % NAME_INK.length]}`}>
            {isCubby ? "Cubby" : senderName}
          </span>
        )}
        {m.kind === "doc" ? <DocBubble m={m} fam={fam} onAct={onAct} />
          : m.kind === "request" ? <RequestBubble m={m} fam={fam} names={names} onAct={onAct} onFulfil={onFulfil} />
          : <TextBubble m={m} />}
        <div className={`mt-0.5 flex items-center gap-2 px-1 text-[11px] text-muted opacity-0 transition group-hover:opacity-100 ${mine ? "flex-row-reverse" : ""}`}>
          <span>{time(m.created_at)}</span>
          {!pending && <button onClick={onReply} className="inline-flex items-center gap-0.5 font-semibold hover:text-ink cursor-pointer"><Reply className="size-3" />Reply</button>}
          {mine && m.kind === "text" && !pending && (
            <button onClick={() => onAct(`/family/${fam.id}/messages/${m.id}`, "Message deleted", "del")} className="inline-flex items-center gap-0.5 font-semibold hover:text-rose-ink cursor-pointer"><Trash2 className="size-3" />Delete</button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ReplyQuote({ reply, dark }: { reply: NonNullable<FamilyMessage["reply"]>; dark?: boolean }) {
  return (
    <div className={`mb-1.5 rounded-xl border-l-[3px] px-2.5 py-1.5 text-xs ${dark ? "border-white/50 bg-white/10 text-white/80" : "border-lav-ink/60 bg-ink/5 text-ink/70"}`}>
      <div className="font-bold">{reply.sender_name}</div>
      <div className="line-clamp-2">{reply.preview}</div>
    </div>
  );
}

function withMentions(text: string) {
  return text.split(/(@cubby\b)/i).map((part, i) =>
    /^@cubby$/i.test(part) ? <span key={i} className="rounded-md bg-lav px-1 font-bold text-lav-ink">@Cubby</span> : <span key={i}>{part}</span>);
}

function TextBubble({ m }: { m: FamilyMessage }) {
  const openViewer = useViewer();
  const isCubby = m.kind === "cubby";
  const fid = location.pathname.split("/")[3];
  const open = (c: FamilyCitation) => openViewer({ documentId: c.family_doc_id, title: c.title, page: c.page, snippet: c.snippet,
    src: `/api/family/${fid}/docs/${c.family_doc_id}/file`, detailsLink: null });

  const body = isCubby
    ? m.text.split(/(\[\d+\])/g).map((part, i) => {
        const n = part.match(/^\[(\d+)\]$/);
        const c = n && m.citations.find((x) => x.n === Number(n[1]));
        return c ? <button key={i} onClick={() => open(c)} aria-label={`Source ${c.n}: ${c.title}`}
          className="mx-0.5 inline-grid size-5 -translate-y-0.5 place-items-center rounded-full bg-lav text-[11px] font-bold text-lav-ink cursor-pointer">{c.n}</button>
          : <span key={i}>{part}</span>;
      })
    : withMentions(m.text);

  return (
    <div className={`whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm ${
      m.mine ? "rounded-br-md bg-ink text-white" : isCubby ? "rounded-bl-md bg-lav/60" : "rounded-bl-md bg-paper ring-1 ring-line"}`}>
      {m.reply && <ReplyQuote reply={m.reply} dark={m.mine} />}
      {body}
      {isCubby && m.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.citations.map((c) => (
            <button key={c.n} onClick={() => open(c)} className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-semibold ring-1 ring-line hover:ring-lav-ink cursor-pointer">
              <span className="font-bold">{c.n}</span><FileText className="size-3 shrink-0" /><span className="truncate">{c.title}, p. {c.page}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DocBubble({ m, fam, onAct }: { m: FamilyMessage; fam: FamilyDetail; onAct: (path: string, ok?: string, method?: "post" | "del") => void }) {
  const openViewer = useViewer();
  const navigate = useNavigate();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  if (m.doc_removed || !m.doc) {
    return <div className="rounded-[20px] border border-dashed border-line bg-paper px-4 py-3 text-sm italic text-muted">📄 This document was removed from the family.</div>;
  }
  const d = m.doc;
  const idType = d.id_card?.id_type;
  const look = lookFor(idType);
  const Icon = look.icon;
  const canRemove = d.shared_by.id === fam.me || fam.role === "admin";
  const open = () => openViewer({ documentId: d.id, title: d.title, src: `/api/family/${fam.id}/docs/${d.id}/file`, detailsLink: null });

  async function save() {
    setSaving(true);
    try {
      const r = await api.post<{ document_id: string }>(`/family/${fam.id}/docs/${d.id}/save`);
      toast("Saved to your vault. Cubby is reading it now.");
      navigate(`/app/documents/${r.document_id}`);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <div className={`w-[300px] max-w-full overflow-hidden rounded-[22px] shadow-sm ring-1 ring-line ${m.mine ? "rounded-br-md" : "rounded-bl-md"} bg-paper`}>
      {m.reply && <div className="px-3 pt-3"><ReplyQuote reply={m.reply} /></div>}
      <button onClick={open} className={`flex w-full items-center gap-3 p-3.5 text-left cursor-pointer ${look.bg}`}>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-paper"><Icon className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-display font-bold leading-tight">{d.title}</div>
          <div className="mt-0.5 truncate text-xs font-semibold text-ink/60">{d.id_card?.label || d.doc_type || d.filename}</div>
        </div>
      </button>
      <div className="space-y-2 px-3.5 py-3">
        {d.id_card?.number && (
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm tracking-widest">{d.id_card.number}</span>
            {d.id_card.verified && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-mint-ink"><BadgeCheck className="size-3.5" />Verified</span>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <ShelfPill shelf={d.shelf} />
          {d.expiry_status === "expired" && <span className="rounded-full bg-rose px-2 py-0.5 font-semibold text-rose-ink">Expired</span>}
          {d.expiry_status === "expiring" && <span className="rounded-full bg-cream px-2 py-0.5 font-semibold text-cream-ink">Expires {daysLabel(d.days_left || 0).toLowerCase()}</span>}
        </div>
        {m.text && <p className="whitespace-pre-wrap text-[14px]">{m.text}</p>}
        <div className="flex gap-1.5 pt-1">
          <button onClick={open} className="h-8 flex-1 rounded-full bg-ink text-xs font-semibold text-white hover:bg-ink-soft cursor-pointer">Open</button>
          {!m.mine && <button onClick={save} disabled={saving} className="inline-flex h-8 items-center gap-1 rounded-full bg-mist px-3 text-xs font-semibold hover:bg-line disabled:opacity-50 cursor-pointer"><Download className="size-3.5" />{saving ? "Saving…" : "Save to my vault"}</button>}
          {canRemove && (
            <button onClick={() => onAct(`/family/${fam.id}/docs/${d.id}`, "Removed from the family", "del")} aria-label="Remove from family"
              className="grid size-8 place-items-center rounded-full bg-mist hover:bg-rose hover:text-rose-ink cursor-pointer"><Trash2 className="size-3.5" /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestBubble({ m, fam, names, onAct, onFulfil }: {
  m: FamilyMessage; fam: FamilyDetail; names: Map<string, string>;
  onAct: (path: string, ok?: string, method?: "post" | "del") => void; onFulfil: () => void;
}) {
  const r = m.request!;
  const forMe = !m.mine && (!r.target || r.target.id === fam.me);
  const who = r.target ? (r.target.id === fam.me ? "you" : first(r.target.name || names.get(r.target.id))) : "anyone";
  const tone = {
    open: { cls: "bg-blue", chip: "bg-paper text-blue-ink", text: "Waiting" },
    fulfilled: { cls: "bg-mint", chip: "bg-paper text-mint-ink", text: "Shared ✓" },
    declined: { cls: "bg-mist", chip: "bg-paper text-muted", text: "Not available" },
    cancelled: { cls: "bg-mist", chip: "bg-paper text-muted", text: "Cancelled" },
  }[r.status];
  return (
    <motion.div layout className={`w-[300px] max-w-full rounded-[22px] p-4 shadow-sm ${tone.cls} ${m.mine ? "rounded-br-md" : "rounded-bl-md"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink/60"><Hand className="size-3.5" />Document request</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone.chip}`}>{tone.text}</span>
      </div>
      <div className="mt-2 font-display text-lg font-bold leading-tight">{r.label}</div>
      <div className="text-sm text-ink/70">{m.mine ? "You" : first(m.sender?.name)} asked {who}</div>
      {m.text && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-paper/60 px-3 py-2 text-sm">{m.text}</p>}
      {r.status === "open" && (
        <div className="mt-3 flex gap-1.5">
          {forMe && <button onClick={onFulfil} className="h-9 flex-1 rounded-full bg-ink text-sm font-semibold text-white hover:bg-ink-soft cursor-pointer">Share it</button>}
          {forMe && <button onClick={() => onAct(`/family/${fam.id}/requests/${m.id}/close`, "Let them know")} className="h-9 rounded-full bg-paper px-3 text-sm font-semibold hover:bg-paper/70 cursor-pointer">I don't have it</button>}
          {m.mine && <button onClick={() => onAct(`/family/${fam.id}/requests/${m.id}/close`, "Request cancelled")} className="h-9 rounded-full bg-paper px-4 text-sm font-semibold cursor-pointer">Cancel</button>}
        </div>
      )}
    </motion.div>
  );
}

function Receipt({ m, reads, me, names }: { m: FamilyMessage; reads: { user_id: string; last_read_at: string }[]; me: string; names: Map<string, string> }) {
  const seen = reads.filter((r) => r.user_id !== me && r.last_read_at >= m.created_at).map((r) => first(names.get(r.user_id)));
  const total = reads.filter((r) => r.user_id !== me).length;
  return (
    <div className="mt-0.5 flex justify-end pr-1 text-[11px] font-semibold text-muted">
      {seen.length === 0 ? <span className="inline-flex items-center gap-1"><Check className="size-3.5" />Sent</span>
        : <span className="inline-flex items-center gap-1 text-blue-ink"><CheckCheck className="size-3.5" />{seen.length === total ? (total === 1 ? `Seen by ${seen[0]}` : "Seen by everyone") : `Seen by ${seen.join(", ")}`}</span>}
    </div>
  );
}

function CubbyTyping() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 flex items-end gap-2">
      <span className="grid size-8 place-items-center rounded-full bg-cream"><Mascot size={26} track={false} mood="thinking" /></span>
      <div className="flex items-center gap-1 rounded-[20px] rounded-bl-md bg-lav/60 px-4 py-3.5">
        {[0, 1, 2].map((i) => <motion.span key={i} className="size-2 rounded-full bg-lav-ink" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />)}
        <span className="ml-2 text-xs font-semibold text-lav-ink">Cubby is checking the family's documents…</span>
      </div>
    </motion.div>
  );
}

function FirstSteps({ onShare, onAsk }: { onShare: () => void; onAsk: () => void }) {
  const tips = [
    { icon: Paperclip, title: "Share a document", text: "Policies, IDs, bills. Everyone gets the same card.", onClick: onShare, cls: "bg-mint" },
    { icon: Hand, title: "Ask for one", text: "“Papa, can you share your PAN?” as a tap-to-share card.", onClick: onAsk, cls: "bg-blue" },
  ];
  return (
    <div className="mx-auto mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
      {tips.map((t, i) => (
        <motion.button key={t.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.08 }}
          onClick={t.onClick} className={`rounded-[22px] p-4 text-left transition hover:-translate-y-0.5 cursor-pointer ${t.cls}`}>
          <t.icon className="size-5" /><div className="mt-2 font-bold">{t.title}</div><div className="text-sm text-ink/70">{t.text}</div>
        </motion.button>
      ))}
      <div className="rounded-[22px] bg-lav/70 p-4 sm:col-span-2">
        <div className="flex items-center gap-2 font-bold"><AtSign className="size-4" />Ask @Cubby in the chat</div>
        <div className="text-sm text-ink/70">Type <b>@Cubby</b> and a question. Cubby answers only from documents shared in this family, with sources.</div>
      </div>
    </div>
  );
}

function Composer({ reply, onCancelReply, onSend, onShare, onRequest, disabled }: {
  reply: FamilyMessage | null; onCancelReply: () => void; onSend: (t: string) => void; onShare: () => void; onRequest: () => void; disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const showMention = /(^|\s)@\w{0,5}$/.test(text) && !/@cubby\b/i.test(text);

  useEffect(() => { if (reply) area.current?.focus(); }, [reply]);
  useEffect(() => {
    const el = area.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; }
  }, [text]);

  function submit() {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === "Tab" && showMention) { e.preventDefault(); mention(); }
  }
  function mention() {
    setText((t) => t.replace(/@\w{0,5}$/, "@Cubby "));
    area.current?.focus();
  }

  return (
    <div className="border-t border-line bg-paper p-3">
      <AnimatePresence>
        {reply && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mb-2 flex items-center gap-2 overflow-hidden rounded-2xl bg-mist px-3 py-2">
            <Reply className="size-4 shrink-0 text-lav-ink" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="text-xs font-bold text-lav-ink">Replying to {reply.mine ? "yourself" : reply.kind === "cubby" ? "Cubby" : reply.sender?.name}</div>
              <div className="truncate text-muted">{previewOf(reply)}</div>
            </div>
            <button onClick={onCancelReply} aria-label="Cancel reply" className="grid size-7 place-items-center rounded-full hover:bg-line cursor-pointer"><X className="size-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showMention && (
          <motion.button initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={mention}
            className="mb-2 flex items-center gap-2 rounded-2xl bg-lav px-3 py-2 text-left text-sm cursor-pointer">
            <Mascot size={24} track={false} /><span><b>@Cubby</b> · ask about this family's documents</span><span className="ml-auto text-xs text-lav-ink">Tab</span>
          </motion.button>
        )}
      </AnimatePresence>
      <div className="flex items-end gap-2">
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} aria-label="Share or request a document" aria-expanded={menu}
            className={`grid size-11 place-items-center rounded-full transition cursor-pointer ${menu ? "rotate-45 bg-ink text-white" : "bg-mist hover:bg-line"}`}><Plus className="size-5" /></button>
          <AnimatePresence>
            {menu && (
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-14 left-0 z-20 w-60 rounded-2xl border border-line bg-paper p-1.5 shadow-xl">
                {[{ icon: Paperclip, label: "Share a document", sub: "From your vault", cls: "bg-mint", go: onShare },
                  { icon: Hand, label: "Request a document", sub: "Ask someone to share", cls: "bg-blue", go: onRequest },
                  { icon: AtSign, label: "Ask @Cubby", sub: "About shared documents", cls: "bg-lav", go: () => { setText((t) => (t ? `${t} @Cubby ` : "@Cubby ")); area.current?.focus(); } }].map((o) => (
                  <button key={o.label} onClick={() => { setMenu(false); o.go(); }} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-mist cursor-pointer">
                    <span className={`grid size-9 place-items-center rounded-xl ${o.cls}`}><o.icon className="size-4" /></span>
                    <span><span className="block text-sm font-semibold">{o.label}</span><span className="block text-xs text-muted">{o.sub}</span></span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <textarea ref={area} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={2000}
          placeholder="Message… or ask @Cubby" aria-label="Message"
          className="max-h-[140px] min-h-11 flex-1 resize-none rounded-[22px] bg-mist px-4 py-2.5 text-[15px] leading-6 outline-none placeholder:text-muted/80 focus:bg-paper focus:ring-2 focus:ring-blue-ink/25" />
        <motion.button whileTap={{ scale: 0.9 }} onClick={submit} disabled={!text.trim() || disabled} aria-label="Send"
          className="grid size-11 place-items-center rounded-full bg-ink text-white transition disabled:opacity-30 cursor-pointer"><SendHorizonal className="size-5" /></motion.button>
      </div>
    </div>
  );
}

function RequestDialog({ open, onClose, fam, onSent }: { open: boolean; onClose: () => void; fam: FamilyDetail; onSent: (m: FamilyMessage[]) => void }) {
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const others = fam.members.filter((m) => m.user_id !== fam.me);
  const quick = ["Aadhaar card", "PAN card", "Passport", "Birth certificate", "Health insurance policy", "Class 10 marksheet"];
  useEffect(() => { if (open) { setLabel(""); setNote(""); setTarget(others.length === 1 ? others[0].user_id : ""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<{ messages: FamilyMessage[] }>(`/family/${fam.id}/requests`, { label, target_user_id: target || null, note: note || null });
      onSent(r.messages);
      toast(target ? `Asked ${first(others.find((o) => o.user_id === target)?.name)}` : "Asked the family");
    } catch (err) { toast((err as Error).message, "error"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Request a document">
      {others.length === 0 ? (
        <p className="text-muted">Invite someone to the family first, then you can ask them to share documents.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Input label="What do you need?" placeholder="e.g. Papa's PAN card" required minLength={2} maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quick.map((q) => <button type="button" key={q} onClick={() => setLabel(q)} className="rounded-full bg-mist px-3 py-1 text-xs font-semibold hover:bg-line cursor-pointer">{q}</button>)}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-semibold">Who should share it?</span>
            <div className="flex flex-wrap gap-2">
              {others.length > 1 && (
                <button type="button" onClick={() => setTarget("")} aria-pressed={!target}
                  className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold cursor-pointer ${!target ? "bg-ink text-white" : "bg-mist"}`}><Users className="size-4" />Anyone</button>
              )}
              {others.map((o) => (
                <button type="button" key={o.user_id} onClick={() => setTarget(o.user_id)} aria-pressed={target === o.user_id}
                  className={`inline-flex h-10 items-center gap-2 rounded-full pl-1 pr-3 text-sm font-semibold cursor-pointer ${target === o.user_id ? "bg-ink text-white" : "bg-mist"}`}>
                  <Avatar name={o.name} />{first(o.name)}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold">Note <span className="font-normal text-muted">(optional)</span></span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Needed for the bank KYC by Friday"
              className="w-full resize-none rounded-2xl bg-mist px-4 py-3 text-[15px] outline-none focus:bg-paper focus:ring-2 focus:ring-blue-ink/30" />
          </label>
          <p className="flex items-center gap-1.5 text-xs text-muted"><Bell className="size-3.5" />They'll get a notification with a one-tap Share button.</p>
          <div className="flex justify-end"><Button type="submit" loading={busy}>Send request</Button></div>
        </form>
      )}
    </Modal>
  );
}

// ---------------- info panel ----------------

function InfoPanel({ fam, onClose, onChanged }: { fam: FamilyDetail; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<"docs" | "people" | "dates">("docs");
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<null | "leave" | "delete">(null);
  const openViewer = useViewer();
  const navigate = useNavigate();
  const toast = useToast();
  const isAdmin = fam.role === "admin";

  async function invite(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      await api.post(`/family/${fam.id}/invites`, { email });
      toast(`Invite sent to ${email}`);
      setEmail(""); onChanged();
    } catch (err) { toast((err as Error).message, "error"); }
    finally { setInviting(false); }
  }
  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast(ok); onChanged(); } catch (err) { toast((err as Error).message, "error"); }
  }
  async function leaveOrDelete() {
    try {
      if (confirm === "delete") await api.del(`/family/${fam.id}`);
      else await api.del(`/family/${fam.id}/members/${fam.me}`);
      toast(confirm === "delete" ? "Family deleted" : `You left ${fam.name}`);
      navigate("/app/family");
    } catch (err) { toast((err as Error).message, "error"); }
  }

  const docsByKind = useMemo(() => {
    const ids = fam.documents.filter((d) => d.id_card);
    const rest = fam.documents.filter((d) => !d.id_card);
    return { ids, rest };
  }, [fam.documents]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 p-4 pb-2">
        <span className={`grid size-12 place-items-center rounded-2xl text-2xl ${BG[fam.color] || "bg-cream"}`}>{fam.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-bold">{fam.name}</div>
          <div className="text-xs text-muted">{fam.members.length} members · {fam.documents.length} shared</div>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-line cursor-pointer"><X className="size-5" /></button>
      </div>
      <div className="mx-4 mt-2 grid grid-cols-3 gap-1 rounded-full bg-paper p-1" role="tablist">
        {([["docs", "Documents"], ["people", "People"], ["dates", "Reminders"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`relative h-9 rounded-full text-sm font-semibold cursor-pointer ${tab === k ? "text-white" : "text-muted"}`}>
            {tab === k && <motion.span layoutId="fam-tab" className="absolute inset-0 rounded-full bg-ink" />}
            <span className="relative">{l}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "docs" && (fam.documents.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Nothing shared yet. Use the + button in the chat to share a document.</p>
        ) : (
          <div className="space-y-5">
            {docsByKind.ids.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">IDs</div>
                <div className="grid grid-cols-2 gap-2">
                  {docsByKind.ids.map((d) => <MiniCard key={d.id} d={d} onOpen={() => openViewer({ documentId: d.id, title: d.title, src: `/api/family/${fam.id}/docs/${d.id}/file`, detailsLink: null })} />)}
                </div>
              </div>
            )}
            {docsByKind.rest.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Everything else</div>
                <div className="space-y-1.5">
                  {docsByKind.rest.map((d) => (
                    <button key={d.id} onClick={() => openViewer({ documentId: d.id, title: d.title, src: `/api/family/${fam.id}/docs/${d.id}/file`, detailsLink: null })}
                      className="flex w-full items-center gap-3 rounded-2xl bg-paper px-3 py-2.5 text-left hover:shadow-sm cursor-pointer">
                      <FileText className="size-5 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{d.title}</div>
                        <div className="truncate text-xs text-muted">From {first(d.shared_by.name)} · {relative(d.created_at)}</div></div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {tab === "people" && (
          <div className="space-y-4">
            <form onSubmit={invite} className="rounded-[20px] bg-paper p-3">
              <label htmlFor="invite-email" className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><UserPlus className="size-4" />Invite by email</label>
              <div className="flex gap-2">
                <input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="papa@example.com"
                  className="h-10 min-w-0 flex-1 rounded-full bg-mist px-4 text-sm outline-none focus:ring-2 focus:ring-blue-ink/30" />
                <Button type="submit" loading={inviting} className="h-10 px-4 text-sm">Invite</Button>
              </div>
              <p className="mt-2 text-xs text-muted">They sign in to Cubby with this email and accept from Family.</p>
            </form>
            <ul className="space-y-1">
              {fam.members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                  <Avatar name={m.name} size="size-10" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-semibold">{m.user_id === fam.me ? `${m.name} (you)` : m.name}
                      {m.role === "admin" && <span className="inline-flex items-center gap-0.5 rounded-full bg-cream px-1.5 py-0.5 text-[10px] font-bold text-cream-ink"><Crown className="size-3" />Admin</span>}</div>
                    <div className="truncate text-xs text-muted">{m.email}</div>
                  </div>
                  {isAdmin && m.user_id !== fam.me && (
                    <div className="flex gap-1">
                      <button onClick={() => run(() => api.put(`/family/${fam.id}/members/${m.user_id}/role`, { role: m.role === "admin" ? "member" : "admin" }), m.role === "admin" ? "No longer an admin" : "Made admin")}
                        aria-label={m.role === "admin" ? `Remove admin from ${m.name}` : `Make ${m.name} an admin`} title={m.role === "admin" ? "Remove admin" : "Make admin"}
                        className="grid size-8 place-items-center rounded-full hover:bg-paper cursor-pointer"><Crown className="size-4" /></button>
                      <button onClick={() => run(() => api.del(`/family/${fam.id}/members/${m.user_id}`), `${first(m.name)} removed`)}
                        aria-label={`Remove ${m.name}`} title="Remove from family"
                        className="grid size-8 place-items-center rounded-full hover:bg-rose hover:text-rose-ink cursor-pointer"><UserMinus className="size-4" /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {fam.invites.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Waiting to join</div>
                {fam.invites.map((i) => (
                  <div key={i.id} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                    <span className="grid size-10 place-items-center rounded-full border-2 border-dashed border-line"><Mail className="size-4 text-muted" /></span>
                    <span className="min-w-0 flex-1 truncate text-sm">{i.email}</span>
                    <button onClick={() => run(() => api.del(`/family/${fam.id}/invites/${i.id}`), "Invite cancelled")} className="text-xs font-semibold text-muted hover:text-rose-ink cursor-pointer">Cancel</button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2 border-t border-line pt-4">
              <Button variant="light" className="w-full" onClick={() => setConfirm("leave")}><LogOut className="size-4" />Leave family</Button>
              {isAdmin && <Button variant="danger" className="w-full" onClick={() => setConfirm("delete")}><Trash2 className="size-4" />Delete family</Button>}
            </div>
          </div>
        )}

        {tab === "dates" && (fam.dates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No upcoming dates in shared documents. Expiries and renewals show up here, and everyone gets reminded.</p>
        ) : (
          <ul className="space-y-2">
            {fam.dates.map((d) => (
              <li key={d.id} className="rounded-2xl bg-paper px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{d.label}</span>
                  <span className={`text-xs font-bold ${d.days_left <= 30 ? "text-cream-ink" : "text-mint-ink"}`}>{daysLabel(d.days_left)}</span>
                </div>
                <div className="text-xs text-muted">{shortDate(d.date)} · {d.document_title}</div>
              </li>
            ))}
            <li className="flex items-center gap-1.5 px-1 pt-1 text-xs text-muted"><Bell className="size-3.5" />Everyone in the family is reminded 90, 30, 7 and 1 day before.</li>
          </ul>
        ))}
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm === "delete" ? "Delete this family?" : "Leave this family?"}>
        <p className="text-muted">
          {confirm === "delete"
            ? `The chat and every document shared in ${fam.name} will be permanently deleted for everyone. Everyone's own originals stay in their vaults.`
            : "You'll lose access to the chat and the family's shared documents. Documents you shared stay in the family; your originals stay in your vault."}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={leaveOrDelete}>{confirm === "delete" ? "Delete family" : "Leave"}</Button>
        </div>
      </Modal>
    </div>
  );
}

function MiniCard({ d, onOpen }: { d: FamilyDocCard; onOpen: () => void }) {
  const look = lookFor(d.id_card?.id_type);
  const Icon = look.icon;
  return (
    <motion.button whileHover={{ y: -3 }} onClick={onOpen} className={`flex h-[104px] flex-col rounded-[18px] p-3 text-left cursor-pointer ${look.bg}`}>
      <Icon className="size-5" />
      <div className="mt-auto truncate text-sm font-bold">{d.id_card?.label}</div>
      <div className="truncate text-[11px] text-ink/60">{d.id_card?.holder_name || first(d.shared_by.name)}</div>
    </motion.button>
  );
}
