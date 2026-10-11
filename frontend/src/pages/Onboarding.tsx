import { AnimatePresence, motion } from "framer-motion";
import { Brain, FileText, HardDrive, KeyRound, Lock } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Mascot, { Mood } from "../components/Mascot";
import { Button } from "../components/ui";
import { api, User } from "../lib/api";
import { useAuth } from "../lib/auth";

function DropScene() {
  const files = ["Passport.pdf", "Health policy.pdf", "Rent agreement.pdf"];
  return (
    <div className="relative grid h-64 place-items-center">
      {files.map((f, i) => (
        <motion.div key={f} className="absolute flex items-center gap-2 rounded-2xl bg-paper px-3 py-2 text-sm font-semibold shadow-md"
          initial={{ x: (i - 1) * 140, y: -110, opacity: 0, rotate: (i - 1) * 8 }}
          animate={{ x: [(i - 1) * 140, (i - 1) * 140, 0], y: [-110, -90, 30], opacity: [0, 1, 0], scale: [1, 1, 0.4] }}
          transition={{ duration: 1.8, delay: 0.3 + i * 0.5, repeat: Infinity, repeatDelay: 1.2 }}>
          <FileText className="size-4" />{f}
        </motion.div>
      ))}
      <div className="mt-16"><Mascot mood="happy" size={130} /></div>
    </div>
  );
}

function SplitScene() {
  const parts = [
    { icon: HardDrive, title: "AWS", text: "keeps the locked box", cls: "bg-cream text-cream-ink" },
    { icon: KeyRound, title: "Azure", text: "keeps the key", cls: "bg-lav text-lav-ink" },
    { icon: Brain, title: "Google Cloud", text: "reads and answers", cls: "bg-mint text-mint-ink" },
  ];
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-6">
      <motion.div className="grid size-16 place-items-center rounded-2xl bg-ink text-white"
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}>
        <Lock className="size-7" />
      </motion.div>
      <div className="grid w-full max-w-lg grid-cols-3 gap-3">
        {parts.map(({ icon: Icon, title, text, cls }, i) => (
          <motion.div key={title} className={`rounded-3xl p-4 text-center ${cls}`}
            initial={{ y: -40, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 + i * 0.25, type: "spring", stiffness: 240, damping: 18 }}>
            <Icon className="mx-auto size-6" />
            <div className="mt-2 font-display font-bold">{title}</div>
            <div className="text-xs font-semibold opacity-80">{text}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AskScene() {
  return (
    <div className="mx-auto flex h-64 max-w-md flex-col justify-center gap-3">
      <motion.div className="self-end rounded-[22px] rounded-br-md bg-ink px-4 py-3 text-sm font-semibold text-white"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        When does my passport expire?
      </motion.div>
      <motion.div className="flex items-end gap-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
        <div className="shrink-0"><Mascot mood="happy" size={52} track={false} /></div>
        <div className="rounded-[22px] rounded-bl-md bg-mist px-4 py-3 text-sm">
          On 20 November 2031.
          <span className="ml-1.5 rounded-full bg-lav px-2 py-0.5 text-xs font-bold text-lav-ink">Passport, page 2</span>
        </div>
      </motion.div>
    </div>
  );
}

const STEPS: { title: string; body: string; scene: () => JSX.Element; mood: Mood }[] = [
  { title: "Drop in your papers", body: "PDFs, scans and photos. Cubby reads them and files each one on the right shelf.", scene: DropScene, mood: "happy" },
  { title: "Locked, then split up", body: "Every file is encrypted before it leaves this page. No single cloud holds both the box and the key.", scene: SplitScene, mood: "idle" },
  { title: "Ask, and see the proof", body: "Questions get answers from your own documents, with the exact page they came from.", scene: AskScene, mood: "idle" },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const { setUser, user } = useAuth();
  const navigate = useNavigate();
  const Scene = STEPS[step].scene;
  const last = step === STEPS.length - 1;

  async function finish() {
    setBusy(true);
    try {
      const u = await api.post<User>("/auth/onboarded");
      setUser(u);
      navigate("/app/documents", { replace: true });
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-[720px] rounded-[36px] bg-paper p-7 md:p-12">
        <p className="font-semibold text-muted">Welcome, {user?.name.split(" ")[0]}</p>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
            <h1 className="mt-1 text-[34px] font-extrabold md:text-[42px]">{STEPS[step].title}</h1>
            <p className="mt-2 max-w-lg text-lg text-ink/70">{STEPS[step].body}</p>
            <div className="mt-6 rounded-[28px] bg-sky/60"><Scene /></div>
          </motion.div>
        </AnimatePresence>
        <div className="mt-8 flex items-center justify-between">
          <div className="flex gap-2" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => <span key={i} className={`h-2 rounded-full transition-all ${i === step ? "w-8 bg-ink" : "w-2 bg-line"}`} />)}
          </div>
          <div className="flex gap-2">
            {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
            {last ? <Button loading={busy} onClick={finish}>Open my vault</Button> : <Button onClick={() => setStep(step + 1)}>Next</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
