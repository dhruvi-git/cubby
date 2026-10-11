import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export type Mood = "idle" | "happy" | "thinking" | "sleeping" | "worried";

const INK = "#232326";

/**
 * Cubby: a little vault with a face. Its eyes follow your pointer, it blinks,
 * bounces when something good happens, ponders while the AI thinks, and
 * falls asleep when the vault is locked.
 */
export default function Mascot({ mood = "idle", size = 120, track = true }: { mood?: Mood; size?: number; track?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (!track || mood !== "idle") { setLook({ x: 0, y: 0 }); return; }
    const onMove = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 300);
      setLook({ x: (dx / d) * 3.2 * k, y: (dy / d) * 2.6 * k });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [track, mood]);

  useEffect(() => {
    if (mood !== "idle" && mood !== "worried") return;
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 140);
        loop();
      }, 2600 + Math.random() * 2600);
    };
    loop();
    return () => window.clearTimeout(t);
  }, [mood]);

  const eyeLook = mood === "thinking" ? { x: -2.5, y: -3 } : look;

  const body = {
    idle: { y: [0, -2, 0], transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } },
    happy: { y: [0, -10, 0, -5, 0], transition: { duration: 0.9, repeat: Infinity, repeatDelay: 1.4 } },
    thinking: { rotate: [0, -3, 0, 3, 0], transition: { duration: 2.4, repeat: Infinity } },
    sleeping: { scaleY: [1, 0.96, 1], transition: { duration: 3.6, repeat: Infinity, ease: "easeInOut" } },
    worried: { x: [0, -1.5, 1.5, 0], transition: { duration: 0.5, repeat: Infinity, repeatDelay: 2 } },
  }[mood];

  return (
    <svg ref={ref} width={size} height={size * 0.95} viewBox="0 0 120 114" role="img" aria-label={`Cubby the vault, ${mood}`}>
      <motion.g style={{ originX: "60px", originY: "104px" }} animate={body}>
        {/* feet */}
        <rect x="30" y="96" width="16" height="10" rx="5" fill={INK} />
        <rect x="74" y="96" width="16" height="10" rx="5" fill={INK} />
        {/* handle */}
        <rect x="42" y="6" width="36" height="16" rx="8" fill="none" stroke={INK} strokeWidth="4" />
        {/* body */}
        <rect x="10" y="16" width="100" height="84" rx="30" fill="#F7EDCF" stroke={INK} strokeWidth="4" />
        <rect x="20" y="26" width="80" height="64" rx="22" fill="none" stroke="#E9D9A8" strokeWidth="3" />
        {/* dial */}
        <circle cx="92" cy="80" r="8" fill="#E6DEF6" stroke={INK} strokeWidth="3" />
        <motion.line x1="92" y1="80" x2="92" y2="75" stroke={INK} strokeWidth="2.5" strokeLinecap="round"
          style={{ originX: "92px", originY: "80px" }}
          animate={mood === "thinking" ? { rotate: 360 } : { rotate: 0 }}
          transition={mood === "thinking" ? { duration: 1.6, repeat: Infinity, ease: "linear" } : { duration: 0.3 }} />
        {/* cheeks */}
        <ellipse cx="33" cy="66" rx="7" ry="4.5" fill="#F4B7AE" opacity={mood === "sleeping" ? 0.4 : 0.75} />
        <ellipse cx="87" cy="66" rx="7" ry="4.5" fill="#F4B7AE" opacity={mood === "sleeping" ? 0.4 : 0.75} />

        {/* eyes */}
        {mood === "happy" ? (
          <g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round">
            <path d="M38 56 q6 -8 12 0" />
            <path d="M70 56 q6 -8 12 0" />
          </g>
        ) : mood === "sleeping" ? (
          <g stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round">
            <path d="M38 54 q6 5 12 0" />
            <path d="M70 54 q6 5 12 0" />
          </g>
        ) : (
          <motion.g animate={{ x: eyeLook.x, y: eyeLook.y, scaleY: blink ? 0.1 : 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }} style={{ originY: "52px" }}>
            <circle cx="44" cy="52" r="6" fill={INK} />
            <circle cx="76" cy="52" r="6" fill={INK} />
            <circle cx="46" cy="50" r="1.8" fill="#fff" />
            <circle cx="78" cy="50" r="1.8" fill="#fff" />
          </motion.g>
        )}
        {mood === "worried" && (
          <g stroke={INK} strokeWidth="3" strokeLinecap="round">
            <line x1="37" y1="40" x2="49" y2="43" />
            <line x1="83" y1="40" x2="71" y2="43" />
          </g>
        )}

        {/* mouth */}
        {mood === "happy" ? (
          <path d="M50 66 q10 12 20 0 z" fill={INK} />
        ) : mood === "worried" ? (
          <path d="M50 72 q5 -5 10 0 q5 5 10 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        ) : mood === "thinking" ? (
          <circle cx="62" cy="70" r="3.5" fill={INK} />
        ) : mood === "sleeping" ? (
          <path d="M55 70 q5 3 10 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M51 66 q9 8 18 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
        )}
      </motion.g>

      <AnimatePresence>
        {mood === "sleeping" && (
          <motion.text key="z" x="100" y="20" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="800" fontSize="16" fill={INK}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: [0, 1, 0], y: [6, -4, -10] }} exit={{ opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity }}>z</motion.text>
        )}
        {mood === "thinking" && (
          <motion.g key="dots" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {[0, 1, 2].map((i) => (
              <motion.circle key={i} cx={96 + i * 7} cy={12} r="2.6" fill={INK}
                animate={{ y: [0, -4, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
}
