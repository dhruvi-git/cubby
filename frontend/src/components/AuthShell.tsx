import { motion } from "framer-motion";
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import Mascot, { Mood } from "./Mascot";

/** Shared frame for sign up, log in and 2FA: form on the left, Cubby on the right. */
export default function AuthShell({ mood, bubble, children }: { mood: Mood; bubble: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center p-4 md:p-8">
      <div className="grid w-full max-w-[980px] overflow-hidden rounded-[36px] bg-paper shadow-[0_30px_60px_-30px_rgba(35,35,38,0.35)] md:grid-cols-[1.05fr_1fr]">
        <div className="p-7 md:p-12">
          <Link to="/" className="mb-10 inline-flex items-center gap-2 font-display text-xl font-extrabold">
            <span className="grid size-9 place-items-center rounded-xl bg-cream"><Mascot size={28} track={false} /></span>
            Cubby
          </Link>
          {children}
        </div>
        <div className="relative hidden flex-col items-center justify-center bg-ink p-10 md:flex">
          <motion.div key={bubble} initial={{ opacity: 0, y: 6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            className="relative mb-6 max-w-[260px] rounded-[22px] bg-paper px-5 py-3 text-center text-[15px] font-semibold">
            {bubble}
            <span className="absolute -bottom-2 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-paper" />
          </motion.div>
          <div className="rounded-[40px] bg-cream/10 p-6"><Mascot mood={mood} size={190} /></div>
        </div>
      </div>
    </div>
  );
}
