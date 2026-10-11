import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { Button, useToast } from "./ui";

/** Shows recovery codes once, with copy/download, and asks the person to confirm they saved them. */
export default function RecoveryCodes({ codes, onDone, doneLabel = "I've saved them" }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const text = `Cubby recovery codes\nEach code works once. Keep them somewhere safe and private.\n\n${codes.join("\n")}\n`;

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "cubby-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 rounded-3xl bg-mist p-4">
        {codes.map((c) => <code key={c} className="rounded-xl bg-paper px-3 py-2 text-center font-mono text-[15px] font-semibold tracking-wider">{c}</code>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="light" type="button" onClick={download}><Download className="size-4" />Download</Button>
        <Button variant="light" type="button" onClick={() => { navigator.clipboard.writeText(text); toast("Codes copied"); }}><Copy className="size-4" />Copy</Button>
      </div>
      <label className="mt-5 flex cursor-pointer items-start gap-3 text-[15px]">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1 size-4 accent-ink" />
        <span>I've saved these somewhere safe. I understand they're the only way back in if I lose my phone.</span>
      </label>
      <Button className="mt-5 w-full !h-12" disabled={!saved} onClick={onDone}><Check className="size-4" />{doneLabel}</Button>
    </div>
  );
}
