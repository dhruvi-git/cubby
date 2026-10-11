import { motion } from "framer-motion";
import { CalendarClock, MoreHorizontal, ShieldCheck, Star, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import UploadZone from "../components/UploadZone";
import { ShelfPill } from "../components/ui";
import { api, KeyDate } from "../lib/api";
import { bytes, daysLabel, shortDate } from "../lib/format";

type OverviewData = {
  total: number; ready: number; processing: number; failed: number; bytes: number; pages: number;
  timeline: { date: string; added: number; total: number }[];
  shelves: { name: string; count: number }[];
  upcoming: KeyDate[];
};
type Summary = { encrypted: boolean; key_held_separately: boolean; backed_up: boolean; two_factor: boolean; recovery_codes_left: number };

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: { date: string; total: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return <div className="rounded-full bg-ink px-3.5 py-1.5 text-sm font-bold text-white">{p.total} docs · {shortDate(p.date)}</div>;
}

export default function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const navigate = useNavigate();

  const load = () => api.get<OverviewData>("/insights/overview").then(setData).catch(() => {});
  useEffect(() => {
    load();
    api.get<Summary>("/trust/summary").then(setSummary).catch(() => {});
  }, []);

  const next = data?.upcoming.find((u) => u.days_left >= 0);
  const attention = (data?.failed ?? 0);
  const health = [
    { title: "Protected", sub: summary?.backed_up ? "Encrypted, with a backup copy" : "Every file encrypted",
      value: data ? `${data.total} doc${data.total === 1 ? "" : "s"} locked` : "…", cls: "bg-lav", ink: "text-lav-ink", icon: ShieldCheck, to: "/app/trust" },
    { title: "Next up", sub: next ? next.label : "Nothing due soon",
      value: next ? daysLabel(next.days_left) : "All clear", cls: "bg-cream", ink: "text-cream-ink", icon: CalendarClock, to: "/app/insights" },
    { title: "Needs you", sub: attention ? "Files Cubby couldn't read"
        : summary && summary.recovery_codes_left < 3 ? "Recovery codes running low" : "Nothing to fix",
      value: attention ? `${attention} file${attention > 1 ? "s" : ""}` : summary && summary.recovery_codes_left < 3 ? `${summary.recovery_codes_left} left` : "All good",
      cls: "bg-mint", ink: attention ? "text-rose-ink" : "text-mint-ink", icon: TriangleAlert,
      to: attention ? "/app/documents" : "/app/settings" },
  ];

  return (
    <div className="space-y-10">
      <div className="grid gap-8 xl:grid-cols-[1fr_1.45fr]">
        {/* Vault card */}
        <section>
          <h2 className="mb-4 text-2xl font-bold">Your vault</h2>
          <div className="relative h-[200px] overflow-hidden rounded-[26px] bg-blue/55">
            <div className="relative z-10 p-6">
              <div className="flex items-start justify-between">
                <div className="font-display text-[34px] font-extrabold leading-none">{data ? data.total : "–"}<span className="ml-2 text-lg font-bold text-ink/60">documents</span></div>
                <MoreHorizontal className="size-5 text-ink/40" />
              </div>
              <p className="mt-2 text-sm font-semibold text-ink/70">
                {data ? `${bytes(data.bytes)} · ${data.pages} pages · ${data.ready} ready` : "Loading…"}
              </p>
            </div>
            {data && (
              <div className="absolute inset-x-0 bottom-0 h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.timeline} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="vault" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5b9bd5" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#5b9bd5" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={[-0.15, (max: number) => Math.max(2, Math.ceil(max * 1.25))]} />
                    <Tooltip content={<ChartTip />} cursor={{ stroke: "#5b9bd5", strokeDasharray: "4 4" }} />
                    <Area type="monotone" dataKey="total" stroke="#5b9bd5" strokeWidth={2} fill="url(#vault)" activeDot={{ r: 6, fill: "#5b9bd5", stroke: "#fff", strokeWidth: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* Vault health */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Vault health</h2>
            <Link to="/app/trust" className="text-sm font-semibold text-muted hover:text-ink">How we protect it</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {health.map((h, i) => {
              const Icon = h.icon;
              return (
                <motion.button key={h.title} onClick={() => navigate(h.to)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }} whileHover={{ y: -4 }}
                  className={`flex min-h-[150px] flex-col rounded-[26px] p-5 text-left sm:h-[200px] cursor-pointer ${h.cls}`}>
                  <div className="flex w-full items-start justify-between">
                    <div className="font-display text-[22px] font-extrabold leading-tight">{h.title}</div>
                    <MoreHorizontal className="size-5 text-ink/40" />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-ink/70">{h.sub}</p>
                  <div className="mt-auto flex w-full items-end justify-between">
                    <span className="grid size-12 place-items-center rounded-2xl bg-paper"><Icon className="size-6" /></span>
                    <span className={`text-sm font-bold ${h.ink}`}>{h.value}</span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>
      </div>

      {data && data.total === 0 && <UploadZone onUploaded={() => load()} />}

      <div className="grid gap-8 xl:grid-cols-[1.45fr_1fr]">
        {/* Coming up */}
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">
              {data?.upcoming.filter((u) => u.days_left >= 0 && u.days_left <= 90).length
                ? `${data.upcoming.filter((u) => u.days_left >= 0 && u.days_left <= 90).length} dates in the next 90 days`
                : "Coming up"}
            </h2>
            <Link to="/app/insights" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink/30">All dates</Link>
          </div>
          {data && data.upcoming.length === 0 ? (
            <p className="rounded-[22px] bg-mist p-6 text-muted">When Cubby finds expiry, renewal or due dates in your documents, they line up here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="text-sm text-muted">
                    <th className="pb-3 font-medium">Reminder</th><th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">When</th><th className="pb-3 font-medium">Shelf</th><th className="pb-3 text-center font-medium">Pin</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.upcoming.map((u) => (
                    <tr key={u.id} className="cursor-pointer hover:bg-mist/70" onClick={() => navigate(`/app/documents/${u.document_id}`)}>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3">
                          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink font-display text-sm font-bold text-white">{new Date(u.date).getDate()}</span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{u.label}</div>
                            <div className="truncate text-xs text-muted">{u.document_title}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-semibold">{shortDate(u.date)}</td>
                      <td className={`py-3 pr-3 font-semibold ${u.days_left < 0 ? "text-rose-ink" : u.days_left <= 30 ? "text-cream-ink" : "text-mint-ink"}`}>{daysLabel(u.days_left)}</td>
                      <td className="py-3 pr-3"><ShelfPill shelf={u.shelf} /></td>
                      <td className="py-3 text-center">
                        <button aria-label={u.pinned ? "Unpin" : "Pin to top"} className="cursor-pointer"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await api.patch(`/insights/dates/${u.id}`, { pinned: !u.pinned });
                            load();
                          }}>
                          <Star className={`size-5 ${u.pinned ? "fill-cream-ink text-cream-ink" : "text-line hover:text-muted"}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Ask card */}
        <section className="relative self-start">
          <div className="relative z-10 overflow-hidden rounded-[30px] bg-ink p-7 text-white">
            <h2 className="text-[30px] font-extrabold leading-tight">
              Ask{" "}
              <span className="inline-block -rotate-3 rounded-2xl border-2 border-white px-3 py-0.5 text-lav">anything</span>{" "}
              about your papers
            </h2>
            <p className="mt-4 max-w-[300px] text-sm text-white/75">“What does my health policy cover?” Cubby answers from your own documents and shows the page.</p>
            <button onClick={() => navigate("/app/chat")} className="relative z-10 mt-7 rounded-full bg-blue px-7 py-3.5 font-semibold text-blue-ink transition hover:brightness-95 active:scale-95 cursor-pointer">Ask Cubby</button>
            <svg className="pointer-events-none absolute -bottom-6 right-0 h-48 w-56" viewBox="0 0 220 190" fill="none" aria-hidden="true">
              <rect x="60" y="40" width="150" height="170" rx="18" stroke="white" strokeOpacity=".35" strokeWidth="2" transform="rotate(-14 60 40)" />
              <rect x="90" y="30" width="150" height="170" rx="18" stroke="white" strokeOpacity=".55" strokeWidth="2" transform="rotate(-6 90 30)" />
            </svg>
          </div>
          <div className="absolute inset-x-6 -bottom-3 h-10 rounded-b-[30px] bg-line" />
        </section>
      </div>
    </div>
  );
}
