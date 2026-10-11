import { motion } from "framer-motion";
import { CalendarRange, Download, FileText, IdCard, NotebookPen, Pencil, Pin, PinOff, Plus, Printer, ShieldPlus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Markdown from "../components/Markdown";
import Mascot from "../components/Mascot";
import { Button, Empty, Modal, useToast } from "../components/ui";
import { api, Doc, Note, NoteSummary } from "../lib/api";
import { daysLabel, relative, shortDate } from "../lib/format";

type Template = { id: string; title: string; description: string; needs: "document" | "prompt" | null };
type Info = {
  name: string; generated_at: string;
  totals: { documents: number; pages: number; ids: number; upcoming: number; starred: number };
  shelves: { name: string; count: number }[]; added_by_month: { month: string; count: number }[];
  timeline: { date: string; label: string; document: string; kind: string; days_left: number }[];
  id_status: { valid: number; expiring: number; expired: number };
};

const TPL_LOOK: Record<string, { icon: typeof FileText; cls: string }> = {
  summary: { icon: FileText, cls: "bg-lav" }, insurance: { icon: ShieldPlus, cls: "bg-rose" },
  identity: { icon: IdCard, cls: "bg-cream" }, dates: { icon: CalendarRange, cls: "bg-mint" }, custom: { icon: Wand2, cls: "bg-blue" },
};
const SHELF_HEX: Record<string, string> = { Finance: "#8fd0a8", Health: "#f0aaa3", Identity: "#b9a6e6", Home: "#ecd17d",
  Work: "#8fbeed", Legal: "#f2b98a", Education: "#a9c9ea", Other: "#c9cfd8" };

export default function Studio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<"notes" | "infographic">("notes");
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [making, setMaking] = useState<Template | null>(null);

  const loadList = () => api.get<NoteSummary[]>("/studio/notes").then(setNotes).catch(() => setNotes([]));
  useEffect(() => { loadList(); api.get<Template[]>("/studio/templates").then(setTemplates).catch(() => {}); }, []);
  useEffect(() => {
    if (!id) { setNote(null); return; }
    api.get<Note>(`/studio/notes/${id}`).then(setNote).catch(() => navigate("/app/studio"));
  }, [id]);

  async function newNote() {
    const n = await api.post<Note>("/studio/notes", { title: "Untitled note", body: "" });
    await loadList();
    navigate(`/app/studio/${n.id}?edit=1`);
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center gap-2">
        {(["notes", "infographic"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`h-10 rounded-full px-4 text-sm font-semibold cursor-pointer ${tab === t ? "bg-ink text-white" : "bg-mist hover:bg-line"}`}>
            {t === "notes" ? "Notes & reports" : "Vault infographic"}
          </button>
        ))}
      </div>

      {tab === "infographic" ? <Infographic /> : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="no-print space-y-3">
            <div className="flex gap-2">
              <Button className="flex-1" onClick={newNote}><Plus className="size-4" />New note</Button>
              <Button variant="light" className="flex-1" onClick={() => navigate("/app/studio")}><Sparkles className="size-4" />New report</Button>
            </div>
            <div className="max-h-[calc(100vh-320px)] space-y-1.5 overflow-y-auto rounded-[24px] bg-mist p-2">
              {notes === null ? <div className="h-24 animate-pulse rounded-2xl bg-paper" /> :
                notes.length === 0 ? <p className="p-3 text-sm text-muted">Your notes and reports appear here. Save chat answers with “Save as note”.</p> :
                notes.map((n) => (
                  <button key={n.id} onClick={() => navigate(`/app/studio/${n.id}`)}
                    className={`block w-full rounded-2xl p-3 text-left cursor-pointer ${n.id === id ? "bg-paper shadow-sm" : "hover:bg-paper/60"}`}>
                    <div className="flex items-center gap-1.5">
                      {n.kind === "report" ? <Sparkles className="size-3.5 shrink-0 text-lav-ink" /> : <NotebookPen className="size-3.5 shrink-0 text-muted" />}
                      <span className="truncate text-sm font-semibold">{n.title}</span>
                      {n.pinned && <Pin className="ml-auto size-3.5 shrink-0 fill-current text-cream-ink" />}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted">{n.preview || "Empty note"}</div>
                    <div className="mt-1 text-[11px] text-muted">{relative(n.updated_at)}</div>
                  </button>
                ))}
            </div>
          </aside>

          <section className="min-w-0">
            {note ? (
              <NoteView key={note.id} note={note} onSaved={(n) => { setNote(n); loadList(); }}
                onDeleted={() => { navigate("/app/studio"); loadList(); toast("Deleted"); }} />
            ) : (
              <div>
                <h2 className="text-2xl font-bold">Make something from your documents</h2>
                <p className="mt-1 max-w-2xl text-muted">Reports with dates and ID details are built straight from your data, so the numbers are exact. Reading-based reports are written by Cubby and cite their pages.</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {templates.map((t, i) => {
                    const look = TPL_LOOK[t.id] || TPL_LOOK.custom;
                    const Icon = look.icon;
                    return (
                      <motion.button key={t.id} onClick={() => setMaking(t)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }} whileHover={{ y: -4 }}
                        className={`flex min-h-[170px] flex-col rounded-[26px] p-5 text-left cursor-pointer ${look.cls}`}>
                        <span className="grid size-11 place-items-center rounded-2xl bg-paper"><Icon className="size-5" /></span>
                        <div className="mt-4 font-display text-lg font-bold">{t.title}</div>
                        <div className="mt-1 text-sm text-ink/70">{t.description}</div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <ReportMaker template={making} onClose={() => setMaking(null)}
        onMade={(n) => { setMaking(null); loadList(); navigate(`/app/studio/${n.id}`); }} />
    </div>
  );
}

function ReportMaker({ template, onClose, onMade }: { template: Template | null; onClose: () => void; onMade: (n: Note) => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docId, setDocId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError(""); setPrompt(""); setDocId("");
    if (template?.needs === "document") api.get<Doc[]>("/documents").then((d) => setDocs(d.filter((x) => x.status === "ready"))).catch(() => {});
  }, [template]);

  async function make() {
    setBusy(true); setError("");
    try { onMade(await api.post<Note>("/studio/reports", { template: template!.id, document_id: docId || null, prompt: prompt || null })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const ready = template && (template.needs !== "document" || docId) && (template.needs !== "prompt" || prompt.trim().length >= 5);
  return (
    <Modal open={!!template} onClose={() => !busy && onClose()} title={template?.title || ""}>
      {busy ? (
        <div className="flex flex-col items-center py-6 text-center">
          <Mascot mood="thinking" size={110} track={false} />
          <p className="mt-3 font-semibold">Writing your report…</p>
          <p className="text-sm text-muted">This usually takes 10 to 30 seconds.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-muted">{template?.description}</p>
          {template?.needs === "document" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Which document?</span>
              <select value={docId} onChange={(e) => setDocId(e.target.value)} className="h-12 w-full rounded-2xl bg-mist px-4 text-[15px] outline-none">
                <option value="">Choose a document…</option>
                {docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
          )}
          {template?.needs === "prompt" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">What should the report cover?</span>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} maxLength={600}
                placeholder="e.g. Everything I pay every month, with amounts and due dates"
                className="w-full rounded-2xl bg-mist px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-blue-ink/30" />
            </label>
          )}
          {error && <p className="rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-rose-ink">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={make} disabled={!ready}><Sparkles className="size-4" />Create report</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NoteView({ note, onSaved, onDeleted }: { note: Note; onSaved: (n: Note) => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(() => new URLSearchParams(location.search).has("edit"));
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState<"saved" | "saving" | "idle">("idle");
  const timer = useRef<number>();
  const toast = useToast();

  // Autosave notes a moment after typing stops.
  function queueSave(next: { title?: string; body?: string }) {
    setSaved("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        onSaved(await api.patch<Note>(`/studio/notes/${note.id}`, { title: (next.title ?? title).trim() || "Untitled note", body: next.body ?? body }));
        setSaved("saved");
      } catch (e) { toast((e as Error).message, "error"); setSaved("idle"); }
    }, 700);
  }
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`# ${title}\n\n${body}\n`], { type: "text/markdown" }));
    a.download = `${title.replace(/[^\w -]+/g, "").slice(0, 60) || "note"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <article className="print-area rounded-[28px] border border-line p-6 md:p-8">
      <div className="no-print mb-4 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${note.kind === "report" ? "bg-lav text-lav-ink" : "bg-mist text-muted"}`}>
          {note.kind === "report" ? "Report" : "Note"}
        </span>
        <span className="text-xs text-muted">{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : `Updated ${relative(note.updated_at)}`}</span>
        <div className="ml-auto flex flex-wrap gap-1">
          {note.kind === "note" && (
            <Button variant={editing ? "dark" : "ghost"} className="!h-9 !px-3 text-sm" onClick={() => setEditing(!editing)}><Pencil className="size-4" />{editing ? "Preview" : "Edit"}</Button>
          )}
          <Button variant="ghost" className="!h-9 !px-3 text-sm" onClick={async () => onSaved(await api.patch<Note>(`/studio/notes/${note.id}`, { pinned: !note.pinned }))}>
            {note.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}{note.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="ghost" className="!h-9 !px-3 text-sm" onClick={() => window.print()}><Printer className="size-4" />Print or PDF</Button>
          <Button variant="ghost" className="!h-9 !px-3 text-sm" onClick={download}><Download className="size-4" />.md</Button>
          <Button variant="ghost" className="!h-9 !px-3 text-sm text-rose-ink" onClick={() => setConfirm(true)}><Trash2 className="size-4" /></Button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <input value={title} onChange={(e) => { setTitle(e.target.value); queueSave({ title: e.target.value }); }} aria-label="Title"
            className="w-full bg-transparent font-display text-[28px] font-extrabold outline-none" placeholder="Title" />
          <textarea value={body} onChange={(e) => { setBody(e.target.value); queueSave({ body: e.target.value }); }} aria-label="Note"
            autoFocus rows={18} placeholder={"Write anything. Markdown works: ## Heading, - bullet, **bold**"}
            className="w-full resize-y rounded-2xl bg-mist p-4 font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-blue-ink/30" />
        </div>
      ) : (
        <>
          <h1 className="font-display text-[28px] font-extrabold leading-tight">{title}</h1>
          <p className="mb-5 mt-1 text-sm text-muted">Made in Cubby · {shortDate(note.created_at)}</p>
          {body.trim() ? <Markdown text={body} citations={note.citations} /> : <p className="text-muted">This note is empty. Press Edit to write.</p>}
          {note.citations.length > 0 && (
            <div className="mt-8 border-t border-line pt-4">
              <div className="mb-2 text-sm font-semibold text-muted">Sources</div>
              <ol className="space-y-1 text-sm">
                {note.citations.map((c) => <li key={c.n}><span className="font-bold">[{c.n}]</span> {c.title}, page {c.page}</li>)}
              </ol>
            </div>
          )}
        </>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete this?">
        <p className="text-muted">“{title}” will be deleted. Your documents aren't affected.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>Keep it</Button>
          <Button variant="danger" onClick={async () => { await api.del(`/studio/notes/${note.id}`); onDeleted(); }}>Delete</Button>
        </div>
      </Modal>
    </article>
  );
}

function Infographic() {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => { api.get<Info>("/studio/infographic").then(setInfo).catch(() => {}); }, []);
  if (!info) return <div className="h-96 animate-pulse rounded-[28px] bg-mist" />;
  if (!info.totals.documents) return <Empty title="Nothing to draw yet">Add a few documents and Cubby will turn them into a one-page picture of your vault.</Empty>;

  const tiles = [
    ["Documents", info.totals.documents, "bg-blue"], ["Pages read", info.totals.pages, "bg-lav"],
    ["IDs on file", info.totals.ids, "bg-cream"], ["Dates ahead", info.totals.upcoming, "bg-mint"],
  ] as const;
  const idTotal = info.id_status.valid + info.id_status.expiring + info.id_status.expired;

  return (
    <div>
      <div className="no-print mb-4 flex justify-end"><Button variant="light" onClick={() => window.print()}><Printer className="size-4" />Print or save as PDF</Button></div>
      <div className="print-area overflow-hidden rounded-[32px] bg-ink p-6 text-white md:p-10">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-16 place-items-center rounded-[20px] bg-cream"><Mascot size={50} track={false} mood="happy" /></span>
          <div>
            <h2 className="text-[32px] font-extrabold leading-none">{info.name}'s vault at a glance</h2>
            <p className="mt-1 text-white/60">As of {shortDate(info.generated_at)}. Every number here is counted from your vault, not guessed.</p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map(([label, value, cls]) => (
            <div key={label} className={`rounded-[22px] p-5 text-ink ${cls}`}>
              <div className="font-display text-[40px] font-extrabold leading-none">{value}</div>
              <div className="mt-2 text-sm font-semibold text-ink/70">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] bg-paper p-5 text-ink">
            <h3 className="font-display text-lg font-bold">What's on each shelf</h3>
            <div className="mt-3" style={{ height: Math.max(160, info.shelves.length * 38) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={info.shelves} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={78} axisLine={false} tickLine={false} tick={{ fontSize: 13, fontWeight: 600, fill: "#232326" }} />
                  <Tooltip cursor={{ fill: "#f2f5f9" }} contentStyle={{ borderRadius: 12, border: "none", background: "#232326", color: "#fff" }} itemStyle={{ color: "#fff" }} />
                  <Bar dataKey="count" name="Documents" radius={[10, 10, 10, 10]} barSize={22} isAnimationActive={false}
                    label={{ position: "right", fontSize: 12, fontWeight: 700, fill: "#232326" }}>
                    {info.shelves.map((s) => <Cell key={s.name} fill={SHELF_HEX[s.name] || SHELF_HEX.Other} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-[24px] bg-paper p-5 text-ink">
            <h3 className="font-display text-lg font-bold">Documents added, last 12 months</h3>
            <div className="mt-3 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={info.added_by_month} margin={{ left: -24, right: 4 }}>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7b8291" }} interval={1} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#7b8291" }} />
                  <Tooltip cursor={{ fill: "#f2f5f9" }} contentStyle={{ borderRadius: 12, border: "none", background: "#232326", color: "#fff" }} itemStyle={{ color: "#fff" }} />
                  <Bar dataKey="count" name="Added" fill="#8fbeed" radius={[8, 8, 8, 8]} barSize={18} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[24px] bg-paper p-5 text-ink">
            <h3 className="font-display text-lg font-bold">Coming up</h3>
            {info.timeline.length === 0 ? <p className="mt-2 text-muted">Nothing in the next 12 months.</p> : (
              <ol className="relative mt-4 space-y-4 border-l-2 border-line pl-5">
                {info.timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-paper ${t.days_left <= 30 ? "bg-cream-ink" : "bg-mint-ink"}`} />
                    <div className="text-sm font-bold">{shortDate(t.date)} <span className="font-semibold text-muted">· {daysLabel(t.days_left)}</span></div>
                    <div className="text-sm">{t.label} <span className="text-muted">({t.document})</span></div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="rounded-[24px] bg-paper p-5 text-ink">
            <h3 className="font-display text-lg font-bold">ID health</h3>
            {idTotal === 0 ? <p className="mt-2 text-muted">No IDs with expiry dates yet.</p> : (
              <>
                <div className="mt-4 flex h-5 overflow-hidden rounded-full">
                  {([["valid", "#2d7a52"], ["expiring", "#e0b23c"], ["expired", "#a23b33"]] as const).map(([k, color]) =>
                    info.id_status[k] ? <div key={k} style={{ width: `${(info.id_status[k] / idTotal) * 100}%`, background: color }} /> : null)}
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex justify-between"><span className="flex items-center gap-2"><span className="size-3 rounded-full bg-mint-ink" />Valid</span><b>{info.id_status.valid}</b></li>
                  <li className="flex justify-between"><span className="flex items-center gap-2"><span className="size-3 rounded-full bg-[#e0b23c]" />Expiring within 6 months</span><b>{info.id_status.expiring}</b></li>
                  <li className="flex justify-between"><span className="flex items-center gap-2"><span className="size-3 rounded-full bg-rose-ink" />Expired</span><b>{info.id_status.expired}</b></li>
                </ul>
              </>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-white/50">Made with Cubby · your private document vault</p>
      </div>
    </div>
  );
}

