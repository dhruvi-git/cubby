import { useEffect, useRef } from "react";

/** Six-digit code field that submits itself when complete. */
export default function CodeInput({ value, onChange, onComplete, disabled }: {
  value: string; onChange: (v: string) => void; onComplete: (v: string) => void; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <div className="flex justify-between gap-2" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`grid h-16 flex-1 place-items-center rounded-2xl font-display text-3xl font-bold transition ${i === value.length ? "bg-paper ring-2 ring-blue-ink/40" : "bg-mist"}`}>
            {value[i] || ""}
          </div>
        ))}
      </div>
      <input ref={ref} value={value} disabled={disabled} inputMode="numeric" autoComplete="one-time-code" aria-label="6-digit code"
        maxLength={6} className="absolute inset-0 cursor-default opacity-0"
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(v);
          if (v.length === 6) onComplete(v);
        }} />
    </div>
  );
}
