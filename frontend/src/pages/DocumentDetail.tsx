import { ArrowLeft, BadgeCheck, CalendarClock, Copy, Eye, EyeOff, HeartHandshake, Link2, MessageCircleHeart, RefreshCw, Star, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DocumentViewer from "../components/LazyViewer";
import Mascot from "../components/Mascot";
import ShareDialog from "../components/ShareDialog";
import ShareToFamily from "../components/ShareToFamily";
import { Button, Input, Modal, ShelfPill, StatusPill, useToast } from "../components/ui";
import { api, Conversation, DocDetail } from "../lib/api";
import { bytes, daysLabel, shortDate, SHELVES } from "../lib/format";

export default function DocumentDetail() {
  const { id } = useParams();
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [familyShare, setFamilyShare] = useState(false);
  const [revealAsk, setRevealAsk] = useState(false);
  const [revealPw, setRevealPw] = useState("");
  const [revealErr, setRevealErr] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const load = () => api.get<DocDetail>(`/documents/${id}`).then(setDoc).catch(() => navigate("/app/documents"));
  useEffect(() => { setRevealed(null); load(); }, [id]);
  useEffect(() => {
    if (doc?.status !== "processing") return;
    const t = window.setInterval(load, 3000);
    return () => window.clearInterval(t);
  }, [doc?.status]);
  // Hide a revealed ID number again after 30 seconds.
  useEffect(() => {
    if (!revealed) return;
    const t = window.setTimeout(() => setRevealed(null), 30000);
    return () => window.clearTimeout(t);
  }, [revealed]);

  if (!doc) return <div className="grid h-64 place-items-center"><Mascot mood="thinking" size={90} /></div>;

  async function patch(body: Record<string, unknown>, msg?: string) {
    const d = await api.patch<DocDetail>(`/documents/${id}`, body);
    // The update response doesn't include decrypted ID fields, so keep the ones we have.
    setDoc((cur) => cur && { ...cur, ...d, id_card: cur.id_card, needs_review: body.shelf ? false : d.needs_review });
    if (msg) toast(msg);
  }
  async function confirmType() {
    await api.post(`/documents/${id}/confirm`);
    setDoc((d) => d && { ...d, needs_review: false });
    toast("Thanks! Noted.");
  }
  async function reprocess() {
    await api.post(`/documents/${id}/reprocess`);
    setDoc((d) => d && { ...d, status: "processing", error: null });
  }
  async function remove() {
    setBusy(true);
    try { await api.del(`/documents/${id}`); toast("Document deleted"); navigate("/app/documents"); }
    finally { setBusy(false); }
  }
  async function ask() {
    const c = await api.post<Conversation>("/chat/conversations", { document_id: id });
    navigate(`/app/chat/${c.id}`);
  }
  async function reveal(e: FormEvent) {
    e.preventDefault();
    setRevealErr("");
    try {
      const r = await api.post<{ number: string }>(`/documents/${id}/reveal`, { password: revealPw });
      setRevealed(r.number); setRevealAsk(false); setRevealPw("");
    } catch (err) { setRevealErr((err as Error).message); }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const card = doc.id_card;

  return (
    <div className="max-w-6xl">
      <Link to="/app/documents" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft className="size-4" />All documents</Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[30px] font-extrabold leading-tight">
            {doc.title}
            <button onClick={() => patch({ starred: !doc.starred }, doc.starred ? "Unstarred" : "Starred")} aria-label={doc.starred ? "Unstar" : "Star"} className="cursor-pointer">
              <Star className={`size-6 ${doc.starred ? "fill-cream-ink text-cream-ink" : "text-line hover:text-muted"}`} />
            </button>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <ShelfPill shelf={doc.shelf} /><StatusPill status={doc.status} />
            <span>{doc.doc_type || doc.filename}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="light" onClick={() => setSharing(true)}><Link2 className="size-4" />Share{doc.active_shares ? ` · ${doc.active_shares}` : ""}</Button>
          {doc.status === "ready" && <Button variant="light" onClick={() => setFamilyShare(true)}><HeartHandshake className="size-4" />Family</Button>}
          {doc.status === "ready" && <Button onClick={ask}><MessageCircleHeart className="size-4" />Ask about this</Button>}
        </div>
      </div>

      {doc.status === "failed" && (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-[24px] bg-rose p-5 text-rose-ink">
          <Mascot mood="worried" size={64} track={false} />
          <p className="flex-1 font-semibold">{doc.error}</p>
          <Button variant="light" onClick={reprocess}><RefreshCw className="size-4" />Reprocess</Button>
        </div>
      )}
      {doc.status === "processing" && (
        <div className="mt-6 flex items-center gap-4 rounded-[24px] bg-blue/60 p-5 text-blue-ink">
          <Mascot mood="thinking" size={64} track={false} />
          <p className="font-semibold">Cubby is reading this document, sorting it and looking for important dates…</p>
        </div>
      )}
      {doc.needs_review && doc.status === "ready" && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[24px] bg-cream p-5 text-cream-ink">
          <Mascot mood="thinking" size={56} track={false} />
          <p className="flex-1 font-semibold">Cubby wasn't sure about this one. Is it a {doc.doc_type || "document"} that belongs on the {doc.shelf} shelf?</p>
          <Button variant="light" onClick={confirmType}>Yes, that's right</Button>
          <select defaultValue="" onChange={(e) => e.target.value && patch({ shelf: e.target.value }, `Moved to ${e.target.value}`)}
            className="h-11 rounded-full bg-paper px-4 text-sm font-semibold text-ink outline-none" aria-label="Move to another shelf">
            <option value="" disabled>No, move it to…</option>{SHELVES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      )}
      {doc.superseded_by && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-[24px] bg-mist p-5">
          <p className="flex-1 font-semibold">This is an older copy. Cubby keeps it for your records but uses the newer one for reminders.</p>
          <Link to={`/app/documents/${doc.superseded_by}`} className="font-semibold underline underline-offset-4">Open {doc.superseded_by_title || "the newer copy"}</Link>
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          {card && (
            <section className="rounded-[26px] bg-lav p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-bold">{card.label}</h3>
                {card.verified && <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-bold"><BadgeCheck className="size-4 text-mint-ink" />Checked: {card.verified_by}</span>}
              </div>
              <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-ink/60">Number</dt>
                  <dd className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-lg font-semibold tracking-wider">{revealed || card.number || "Not found"}</span>
                    {card.number && (revealed ? (
                      <>
                        <button onClick={() => { navigator.clipboard.writeText(revealed); toast("Copied"); }} aria-label="Copy number" className="grid size-8 place-items-center rounded-full bg-paper cursor-pointer"><Copy className="size-4" /></button>
                        <button onClick={() => setRevealed(null)} aria-label="Hide number" className="grid size-8 place-items-center rounded-full bg-paper cursor-pointer"><EyeOff className="size-4" /></button>
                      </>
                    ) : (
                      <button onClick={() => setRevealAsk(true)} className="inline-flex h-8 items-center gap-1 rounded-full bg-paper px-3 text-xs font-bold cursor-pointer"><Eye className="size-3.5" />Show</button>
                    ))}
                  </dd>
                </div>
                {[["Name", card.holder_name], ["Date of birth", card.date_of_birth && shortDate(card.date_of_birth)],
                  ["Issued", card.issue_date && shortDate(card.issue_date)], ["Expires", card.expiry_date && shortDate(card.expiry_date)],
                  ["Nationality", card.nationality]].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string}><dt className="text-ink/60">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>
                ))}
              </dl>
            </section>
          )}

          <section className="rounded-[26px] border border-line p-6">
            <h3 className="font-display text-lg font-bold">Summary</h3>
            <p className="mt-2 text-[15px] leading-relaxed">{doc.summary || (doc.status === "ready" ? "No summary for this one." : "The summary appears once Cubby has read the file.")}</p>
          </section>

          <DocumentViewer src={`/api/documents/${doc.id}/file`} downloadName={doc.filename} height="640px" />
        </div>

        <aside className="space-y-6">
          <section className="rounded-[26px] border border-line p-6">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold"><CalendarClock className="size-5" />Important dates</h3>
            {doc.dates.length === 0 ? <p className="mt-2 text-muted">No expiry, renewal or due dates found.</p> : (
              <ul className="mt-3 divide-y divide-line">
                {doc.dates.map((d) => {
                  const days = Math.round((new Date(d.date).getTime() - today.getTime()) / 86400000);
                  return (
                    <li key={d.label + d.date} className="flex items-center justify-between gap-3 py-3">
                      <span className="font-semibold">{d.label}</span>
                      <span className="text-right text-sm"><span className="font-semibold">{shortDate(d.date)}</span>
                        <span className={`ml-2 ${days < 0 ? "text-rose-ink" : days <= 30 ? "text-cream-ink" : "text-mint-ink"}`}>{daysLabel(days)}</span></span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="rounded-[26px] bg-mist p-6">
            <h3 className="font-display text-lg font-bold">Details</h3>
            <dl className="mt-3 space-y-2.5 text-sm">
              {[["File", doc.filename], ["Size", bytes(doc.size_bytes)], ["Pages", String(doc.page_count || "–")],
                ["Searchable passages", String(doc.passages)], ["Read from a scan", doc.read_from_scan ? "Yes" : "No"],
                ["Added", shortDate(doc.created_at)], ["Encrypted", "Yes"], ["Backup copy", doc.backed_up ? "Yes" : "No"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="break-all text-right font-semibold">{v}</dd></div>
              ))}
            </dl>
            <label className="mt-5 block text-sm">
              <span className="text-muted">Shelf</span>
              <select value={doc.shelf} onChange={(e) => patch({ shelf: e.target.value }, `Moved to ${e.target.value}`)}
                className="mt-1 h-11 w-full rounded-2xl border-2 border-transparent bg-paper px-3 font-semibold outline-none focus:border-blue-ink/40">
                {SHELVES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </section>
          <div className="flex gap-2">
            {doc.status !== "processing" && <Button variant="light" onClick={reprocess} className="flex-1"><RefreshCw className="size-4" />Reprocess</Button>}
            <Button variant="danger" onClick={() => setConfirm(true)} className="flex-1"><Trash2 className="size-4" />Delete</Button>
          </div>
        </aside>
      </div>

      <ShareDialog docId={doc.id} title={doc.title} open={sharing} onClose={() => setSharing(false)} onChange={load} />
      <ShareToFamily docId={doc.id} title={doc.title} open={familyShare} onClose={() => setFamilyShare(false)} />

      <Modal open={revealAsk} onClose={() => { setRevealAsk(false); setRevealPw(""); setRevealErr(""); }} title="Show the full number">
        <form onSubmit={reveal} className="space-y-4">
          <p className="text-muted">For your safety, confirm your password. The number hides itself again after 30 seconds.</p>
          <Input label="Password" type="password" autoComplete="current-password" autoFocus required value={revealPw} onChange={(e) => setRevealPw(e.target.value)} error={revealErr} />
          <div className="flex justify-end"><Button type="submit">Show number</Button></div>
        </form>
      </Modal>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete this document?">
        <p className="text-muted">“{doc.title}” will be permanently deleted, with its summary, dates, search passages and share links. This can't be undone.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>Keep it</Button>
          <Button variant="danger" loading={busy} onClick={remove}>Delete document</Button>
        </div>
      </Modal>
    </div>
  );
}
