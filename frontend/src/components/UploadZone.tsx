import { motion } from "framer-motion";
import { UploadCloud } from "lucide-react";
import { DragEvent, useRef, useState } from "react";
import { api, Doc } from "../lib/api";
import Mascot from "./Mascot";
import { useToast } from "./ui";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,.md";

export default function UploadZone({ onUploaded, compact = false }: { onUploaded: (d: Doc) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function send(files: FileList | File[]) {
    const list = Array.from(files);
    setBusy((b) => b + list.length);
    for (const f of list) {
      try {
        const doc = await api.upload<Doc>("/documents", f);
        onUploaded(doc);
        toast(`${f.name} is in. Cubby is reading it.`);
      } catch (err) {
        toast(`${f.name}: ${(err as Error).message}`, "error");
      } finally {
        setBusy((b) => b - 1);
      }
    }
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) send(e.dataTransfer.files);
  }

  return (
    <motion.div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
      animate={{ scale: over ? 1.015 : 1 }}
      className={`relative flex items-center gap-5 rounded-[28px] border-2 border-dashed transition ${over ? "border-blue-ink bg-blue/60" : "border-sky-deep bg-sky/50"} ${compact ? "p-5" : "p-6 md:p-8"}`}>
      <div className="hidden shrink-0 sm:block"><Mascot mood={busy ? "thinking" : over ? "happy" : "idle"} size={compact ? 70 : 92} /></div>
      <div className="flex-1">
        <p className="font-display text-xl font-bold">{busy ? `Locking up ${busy} file${busy > 1 ? "s" : ""}…` : over ? "Let go to drop them in" : "Drop files here"}</p>
        <p className="mt-1 text-sm text-muted">PDF, PNG, JPG, TXT or MD, up to 20 MB each. Each file is encrypted before it's stored.</p>
      </div>
      <button onClick={() => input.current?.click()} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white hover:bg-ink-soft cursor-pointer">
        <UploadCloud className="size-4" />Choose files
      </button>
      <input ref={input} type="file" multiple accept={ACCEPT} className="hidden"
        onChange={(e) => { if (e.target.files) send(e.target.files); e.target.value = ""; }} />
    </motion.div>
  );
}
