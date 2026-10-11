import { ChevronLeft, ChevronRight, Download, Highlighter, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { getDocument, GlobalWorkerOptions, Util, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import Mascot from "./Mascot";

GlobalWorkerOptions.workerSrc = workerUrl;

type Box = { left: number; top: number; width: number; height: number };

function words(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4);
}

/** Shows a PDF, image or text file inside Cubby. For PDFs it opens on `page` and
 *  highlights the lines that match `snippet` (the passage an answer came from). */
export default function DocumentViewer({ src, page = 1, snippet, downloadName, allowDownload = true, height = "100%" }: {
  src: string; page?: number; snippet?: string; downloadName?: string; allowDownload?: boolean; height?: string;
}) {
  const [kind, setKind] = useState<"loading" | "pdf" | "image" | "text" | "error">("loading");
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [blobUrl, setBlobUrl] = useState("");
  const [text, setText] = useState("");
  const [pageNo, setPageNo] = useState(page);
  const [zoom, setZoom] = useState(1);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPageNo(page); }, [page, src]);

  // Load the file once.
  useEffect(() => {
    let cancelled = false;
    let url = "";
    setKind("loading"); setPdf(null);
    (async () => {
      try {
        const res = await fetch(src, { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const type = res.headers.get("content-type") || "";
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([buf], { type }));
        setBlobUrl(url);
        if (type.includes("pdf")) {
          const doc = await getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
          if (!cancelled) { setPdf(doc); setKind("pdf"); }
        } else if (type.startsWith("image/")) setKind("image");
        else { setText(new TextDecoder().decode(buf)); setKind("text"); }
      } catch {
        if (!cancelled) setKind("error");
      }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [src]);

  // Render the current page and work out which lines to highlight.
  useEffect(() => {
    if (!pdf || !canvasRef.current || !wrapRef.current) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      setRendering(true);
      const p = await pdf.getPage(Math.min(Math.max(pageNo, 1), pdf.numPages));
      const base = p.getViewport({ scale: 1 });
      const fit = Math.max(280, (wrapRef.current?.clientWidth || 600) - 32) / base.width;
      const viewport = p.getViewport({ scale: fit * zoom });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current!;
      canvas.width = viewport.width * ratio;
      canvas.height = viewport.height * ratio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const render = p.render({ canvasContext: ctx, viewport });
      task = render;
      await render.promise;
      if (cancelled) return;

      const found: Box[] = [];
      if (snippet) {
        const target = new Set(words(snippet));
        const content = await p.getTextContent();
        for (const item of content.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          const w = words(item.str);
          const hits = w.filter((x) => target.has(x)).length;
          if (w.length && hits >= Math.max(2, Math.ceil(w.length * 0.6))) {
            const t = Util.transform(viewport.transform, item.transform);
            const h = Math.hypot(t[2], t[3]);
            found.push({ left: t[4], top: t[5] - h, width: item.width * viewport.scale, height: h * 1.15 });
          }
        }
      }
      if (cancelled) return;
      setBoxes(found);
      setRendering(false);
      if (found.length && scrollRef.current) {
        scrollRef.current.scrollTo({ top: Math.max(0, found[0].top - 120), behavior: "smooth" });
      }
    })().catch(() => setRendering(false));
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, pageNo, zoom, snippet]);

  const total = pdf?.numPages ?? 1;

  return (
    <div ref={wrapRef} className="flex min-h-0 flex-col overflow-hidden rounded-[22px] bg-mist" style={{ height }}>
      {kind === "pdf" && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-paper px-3 py-2">
          <button aria-label="Previous page" disabled={pageNo <= 1} onClick={() => setPageNo(pageNo - 1)}
            className="grid size-9 place-items-center rounded-full hover:bg-mist disabled:opacity-30 cursor-pointer"><ChevronLeft className="size-5" /></button>
          <span className="min-w-[88px] text-center text-sm font-semibold">Page {pageNo} of {total}</span>
          <button aria-label="Next page" disabled={pageNo >= total} onClick={() => setPageNo(pageNo + 1)}
            className="grid size-9 place-items-center rounded-full hover:bg-mist disabled:opacity-30 cursor-pointer"><ChevronRight className="size-5" /></button>
          <span className="mx-1 h-5 w-px bg-line" />
          <button aria-label="Zoom out" onClick={() => setZoom(Math.max(0.6, zoom - 0.2))} className="grid size-9 place-items-center rounded-full hover:bg-mist cursor-pointer"><ZoomOut className="size-4" /></button>
          <button aria-label="Zoom in" onClick={() => setZoom(Math.min(2.4, zoom + 0.2))} className="grid size-9 place-items-center rounded-full hover:bg-mist cursor-pointer"><ZoomIn className="size-4" /></button>
          {boxes.length > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-cream-ink"><Highlighter className="size-3.5" />Passage highlighted</span>
          )}
          {rendering && <Loader2 className="size-4 animate-spin text-muted" />}
          {allowDownload && blobUrl && (
            <a href={blobUrl} download={downloadName} aria-label="Download" className="ml-auto grid size-9 place-items-center rounded-full hover:bg-mist"><Download className="size-4" /></a>
          )}
        </div>
      )}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto p-4">
        {kind === "loading" && <div className="grid h-full min-h-60 place-items-center"><Mascot mood="thinking" size={80} track={false} /></div>}
        {kind === "error" && <div className="grid h-full min-h-60 place-items-center text-center text-muted"><div><Mascot mood="worried" size={80} track={false} /><p className="mt-2">This file couldn't be opened here.</p></div></div>}
        {kind === "pdf" && (
          <div className="relative mx-auto w-fit shadow-[0_8px_30px_-12px_rgba(35,35,38,0.35)]">
            <canvas ref={canvasRef} className="block rounded-md bg-white" />
            {boxes.map((b, i) => (
              <span key={i} className="pointer-events-none absolute rounded-[3px] bg-[#f5d565]/45 mix-blend-multiply"
                style={{ left: b.left - 2, top: b.top - 1, width: b.width + 4, height: b.height + 2 }} />
            ))}
          </div>
        )}
        {kind === "image" && <img src={blobUrl} alt="Document" className="mx-auto max-w-full rounded-md" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }} />}
        {kind === "text" && <pre className="whitespace-pre-wrap rounded-md bg-paper p-5 font-sans text-[15px] leading-relaxed">{text}</pre>}
      </div>
    </div>
  );
}
