import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DocumentViewer from "../components/LazyViewer";

type Target = {
  documentId: string; title: string; page?: number; snippet?: string;
  /** Where to load the file from (defaults to the person's own document). */
  src?: string;
  /** Link for the "Details" button; null hides it. */
  detailsLink?: string | null;
};
const Ctx = createContext<(t: Target) => void>(() => {});

/** openViewer({documentId, title, page, snippet}) slides the document in from the right. */
export const useViewer = () => useContext(Ctx);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const open = useCallback((t: Target) => setTarget(t), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTarget(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={open}>
      {children}
      <AnimatePresence>
        {target && (
          <motion.div className="fixed inset-0 z-[55] flex justify-end bg-ink/35" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={() => setTarget(null)}>
            <motion.aside role="dialog" aria-label={target.title} onMouseDown={(e) => e.stopPropagation()}
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="flex h-full w-full max-w-[760px] flex-col bg-paper p-4 shadow-2xl md:rounded-l-[32px] md:p-6">
              <div className="mb-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-xl font-bold">{target.title}</div>
                  {target.page && <div className="text-sm text-muted">Opened at page {target.page}</div>}
                </div>
                {target.detailsLink !== null && (
                  <Link to={target.detailsLink || `/app/documents/${target.documentId}`} onClick={() => setTarget(null)}
                    className="hidden h-10 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-semibold hover:border-ink/30 sm:inline-flex">
                    Details<ExternalLink className="size-3.5" /></Link>
                )}
                <button onClick={() => setTarget(null)} aria-label="Close" className="grid size-10 place-items-center rounded-full bg-mist hover:bg-line cursor-pointer"><X className="size-5" /></button>
              </div>
              <div className="min-h-0 flex-1">
                <DocumentViewer key={`${target.documentId}-${target.page}`} src={target.src || `/api/documents/${target.documentId}/file`}
                  page={target.page} snippet={target.snippet} downloadName={target.title} />
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
