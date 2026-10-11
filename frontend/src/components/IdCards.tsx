import { motion } from "framer-motion";
import { BadgeCheck, CreditCard, Fingerprint, IdCard as IdIcon, Plane, Vote } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Doc } from "../lib/api";
import { daysLabel, shortDate } from "../lib/format";

const LOOK: Record<string, { cls: string; icon: typeof Plane }> = {
  passport: { cls: "bg-lav", icon: Plane },
  aadhaar: { cls: "bg-cream", icon: Fingerprint },
  pan: { cls: "bg-blue", icon: CreditCard },
  driving_licence: { cls: "bg-mint", icon: IdIcon },
  voter_id: { cls: "bg-peach", icon: Vote },
  other_id: { cls: "bg-mist", icon: IdIcon },
};

/** "Your IDs": every current identity document as a little card, grouped by person. */
export default function IdCards({ docs }: { docs: Doc[] }) {
  const navigate = useNavigate();
  const ids = docs.filter((d) => d.id_card && !d.superseded_by);
  if (!ids.length) return null;
  const groups = new Map<string, Doc[]>();
  ids.forEach((d) => {
    const who = d.id_card!.holder_name || "Unknown holder";
    groups.set(who, [...(groups.get(who) || []), d]);
  });
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <section>
      <h2 className="mb-3 text-xl font-bold">Your IDs</h2>
      <div className="space-y-4">
        {[...groups.entries()].map(([who, list]) => (
          <div key={who}>
            {groups.size > 1 && <div className="mb-2 text-sm font-semibold text-muted">{who}</div>}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {list.map((d, i) => {
                const c = d.id_card!;
                const look = LOOK[c.id_type] || LOOK.other_id;
                const Icon = look.icon;
                const days = c.expiry_date ? Math.round((new Date(c.expiry_date).getTime() - today.getTime()) / 86400000) : null;
                return (
                  <motion.button key={d.id} onClick={() => navigate(`/app/documents/${d.id}`)}
                    initial={{ opacity: 0, rotate: -2, y: 8 }} animate={{ opacity: 1, rotate: 0, y: 0 }} transition={{ delay: i * 0.05 }}
                    whileHover={{ y: -4, rotate: -1 }}
                    className={`relative flex h-[150px] w-[250px] shrink-0 flex-col rounded-[22px] p-4 text-left cursor-pointer ${look.cls}`}>
                    <div className="flex items-center justify-between">
                      <span className="grid size-9 place-items-center rounded-xl bg-paper"><Icon className="size-5" /></span>
                      {c.verified && <span className="inline-flex items-center gap-1 rounded-full bg-paper/80 px-2 py-0.5 text-[11px] font-bold" title={c.verified_by || ""}><BadgeCheck className="size-3.5 text-mint-ink" />Verified</span>}
                    </div>
                    <div className="mt-3 font-display text-lg font-bold leading-tight">{c.label}</div>
                    <div className="font-mono text-sm tracking-wider text-ink/70">{c.number || "Number not found"}</div>
                    <div className="mt-auto text-xs font-semibold">
                      {days === null ? <span className="text-ink/60">No expiry</span>
                        : <span className={days < 0 ? "text-rose-ink" : days <= 180 ? "text-cream-ink" : "text-ink/60"}>
                            {days < 0 ? `Expired ${shortDate(c.expiry_date!)}` : `Expires ${shortDate(c.expiry_date!)} · ${daysLabel(days)}`}
                          </span>}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
