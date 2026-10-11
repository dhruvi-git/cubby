import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useState, ButtonHTMLAttributes, InputHTMLAttributes, forwardRef } from "react";
import { SHELF_STYLE } from "../lib/format";
import Mascot, { Mood } from "./Mascot";

type Variant = "dark" | "light" | "blue" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  dark: "bg-ink text-white hover:bg-ink-soft",
  light: "bg-paper text-ink border border-line hover:border-ink/30",
  blue: "bg-blue text-blue-ink hover:brightness-95 shadow-[0_6px_0_-2px_rgba(31,92,150,0.18)]",
  ghost: "bg-transparent text-ink hover:bg-mist",
  danger: "bg-rose text-rose-ink hover:brightness-95",
};

export function Button({ variant = "dark", loading, className = "", children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 h-11 text-[15px] font-semibold transition active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${VARIANTS[variant]} ${className}`}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }>(
  function Input({ label, hint, error, className = "", id, ...rest }, ref) {
    const inputId = id || rest.name || label.toLowerCase().replace(/\s+/g, "-");
    return (
      <label htmlFor={inputId} className="block">
        <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
        <input ref={ref} id={inputId} {...rest}
          className={`h-12 w-full rounded-2xl border-2 bg-mist px-4 text-[15px] outline-none transition placeholder:text-muted/70 focus:bg-paper ${error ? "border-rose-ink/50" : "border-transparent focus:border-blue-ink/40"} ${className}`} />
        {error ? <span className="mt-1.5 block text-sm text-rose-ink">{error}</span>
          : hint ? <span className="mt-1.5 block text-sm text-muted">{hint}</span> : null}
      </label>
    );
  });

export function Card({ className = "", children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`rounded-[26px] p-6 ${className}`}>{children}</div>;
}

export function ShelfPill({ shelf, className = "" }: { shelf: string; className?: string }) {
  const s = SHELF_STYLE[shelf] || SHELF_STYLE.Other;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.ink} ${className}`}>{shelf}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    ready: "bg-mint text-mint-ink",
    processing: "bg-blue text-blue-ink",
    failed: "bg-rose text-rose-ink",
  };
  const label: Record<string, string> = { ready: "Ready", processing: "Reading…", failed: "Needs attention" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[status] || ""}`}>
      {status === "processing" && <Loader2 className="size-3 animate-spin" />}
      {label[status] || status}
    </span>
  );
}

export function Empty({ mood = "idle", title, children }: { mood?: Mood; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <Mascot mood={mood} size={110} />
      <h3 className="mt-4 text-xl font-bold">{title}</h3>
      {children && <div className="mt-2 max-w-sm text-muted">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className="w-full max-w-md rounded-[28px] bg-paper p-6 shadow-2xl"
            initial={{ y: 24, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-mist cursor-pointer"><X className="size-5" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-8" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ y: 20, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0, y: 10 }}
              className={`pointer-events-auto rounded-full px-5 py-3 text-sm font-semibold shadow-lg ${t.tone === "ok" ? "bg-ink text-white" : "bg-rose text-rose-ink"}`}>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
