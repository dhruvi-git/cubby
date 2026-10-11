import { motion } from "framer-motion";
import { Brain, HardDrive, KeyRound } from "lucide-react";
import { Link } from "react-router-dom";
import Mascot from "../components/Mascot";

const CLOUDS = [
  { icon: HardDrive, text: "Files on AWS", cls: "bg-cream text-cream-ink", pos: "left-0 top-10 md:-left-10" },
  { icon: KeyRound, text: "Keys on Azure", cls: "bg-lav text-lav-ink", pos: "right-0 top-24 md:-right-12" },
  { icon: Brain, text: "Brain on Google Cloud", cls: "bg-mint text-mint-ink", pos: "bottom-4 left-6 md:-left-4" },
];

const FEATURES = [
  { title: "Find anything by meaning", body: "Ask for “my car insurance” and Cubby finds the policy, even if the file is called scan_0042.pdf.", cls: "bg-blue" },
  { title: "Answers with receipts", body: "Chat with your documents. Every answer points to the exact page it came from.", cls: "bg-lav" },
  { title: "Reminders you didn't set", body: "Cubby spots expiry and renewal dates as you upload and nudges you before they arrive.", cls: "bg-mint" },
];

export default function Landing() {
  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <span className="flex items-center gap-2 font-display text-xl font-extrabold">
          <span className="grid size-10 place-items-center rounded-xl bg-cream"><Mascot size={30} track={false} /></span>Cubby
        </span>
        <div className="flex gap-2">
          <Link to="/login" className="rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-paper/60">Log in</Link>
          <Link to="/signup" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">Create vault</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-[1.15fr_1fr] md:pt-14">
        <div>
          <h1 className="text-[44px] font-extrabold leading-[1.02] md:text-[68px]">Your important papers, tucked in safe.</h1>
          <p className="mt-6 max-w-[520px] text-lg text-ink/70">
            Cubby keeps your passports, policies, bills and reports in one private vault. Search them, ask them questions,
            and get reminded before anything expires.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/signup" className="rounded-full bg-ink px-7 py-4 font-semibold text-white transition hover:bg-ink-soft">Create your vault</Link>
            <Link to="/login" className="rounded-full bg-paper px-7 py-4 font-semibold transition hover:bg-paper/70">I already have one</Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[420px]">
          <div className="grid aspect-square place-items-center rounded-[48px] bg-paper">
            <Mascot size={250} />
          </div>
          {CLOUDS.map(({ icon: Icon, text, cls, pos }, i) => (
            <motion.div key={text} className={`absolute ${pos} flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold shadow-md ${cls}`}
              initial={{ opacity: 0, scale: 0.6, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.25, type: "spring", stiffness: 260, damping: 18 }}>
              <Icon className="size-4" />{text}
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <p className="mb-6 max-w-2xl text-lg text-ink/70">
          No single cloud ever holds both your files and the key to read them. Even a breach at one provider only finds locked boxes.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className={`rounded-[28px] p-7 ${f.cls}`}>
              <h2 className="text-2xl font-bold">{f.title}</h2>
              <p className="mt-3 text-ink/75">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 pb-10 text-sm text-muted">
        <span>© {new Date().getFullYear()} Cubby</span>
        <Link to="/privacy" className="hover:text-ink">Privacy</Link>
        <Link to="/terms" className="hover:text-ink">Terms</Link>
      </footer>
    </div>
  );
}
