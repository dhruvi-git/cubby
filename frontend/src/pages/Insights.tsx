import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty, ShelfPill } from "../components/ui";
import { api, KeyDate } from "../lib/api";
import { bytes, daysLabel, shortDate } from "../lib/format";

const SHELF_HEX: Record<string, string> = {
  Finance: "#8fd0a8", Health: "#f0aaa3", Identity: "#b9a6e6", Home: "#ecd17d",
  Work: "#8fbeed", Legal: "#f2b98a", Education: "#a9c9ea", Other: "#c9cfd8",
};

type OverviewData = { total: number; ready: number; failed: number; pages: number; bytes: number; shelves: { name: string; count: number }[] };

export default function Insights() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [dates, setDates] = useState<KeyDate[] | null>(null);

  useEffect(() => {
    api.get<OverviewData>("/insights/overview").then(setData).catch(() => {});
    api.get<KeyDate[]>("/insights/dates").then(setDates).catch(() => setDates([]));
  }, []);

  const groups = [
    { title: "Overdue", items: dates?.filter((d) => d.days_left < 0 && d.days_left >= -365) ?? [], tone: "bg-rose text-rose-ink" },
    { title: "Next 30 days", items: dates?.filter((d) => d.days_left >= 0 && d.days_left <= 30) ?? [], tone: "bg-cream text-cream-ink" },
    { title: "Later", items: dates?.filter((d) => d.days_left > 30) ?? [], tone: "bg-mint text-mint-ink" },
  ];

  const stats = data ? [
    { label: "Documents", value: data.total, cls: "bg-blue/60" },
    { label: "Pages read", value: data.pages, cls: "bg-lav/70" },
    { label: "Stored", value: bytes(data.bytes), cls: "bg-cream/80" },
    { label: "Need attention", value: data.failed, cls: data.failed ? "bg-rose" : "bg-mint/70" },
  ] : [];

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className={`rounded-[24px] p-5 ${s.cls}`}>
            <div className="font-display text-[34px] font-extrabold leading-none">{s.value}</div>
            <div className="mt-2 text-sm font-semibold text-ink/65">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_1.2fr]">
        <section>
          <h2 className="mb-4 text-2xl font-bold">What's on your shelves</h2>
          {data && data.shelves.length > 0 ? (
            <div className="h-[300px] rounded-[26px] border border-line p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.shelves} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis type="category" dataKey="name" width={80} axisLine={false} tickLine={false} tick={{ fontSize: 13, fontWeight: 600, fill: "#232326" }} />
                  <Tooltip cursor={{ fill: "#f2f5f9" }} contentStyle={{ borderRadius: 14, border: "none", background: "#232326", color: "#fff" }} itemStyle={{ color: "#fff" }} />
                  <Bar dataKey="count" name="Documents" radius={[10, 10, 10, 10]} barSize={22}>
                    {data.shelves.map((s) => <Cell key={s.name} fill={SHELF_HEX[s.name] || SHELF_HEX.Other} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty title="No documents yet">Upload a few and Cubby will chart them here.</Empty>}
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-bold">Dates Cubby found</h2>
          {dates && dates.length === 0 ? (
            <p className="rounded-[22px] bg-mist p-6 text-muted">No dates yet. Cubby looks for expiries, renewals and due dates in every document you add.</p>
          ) : (
            <div className="space-y-6">
              {groups.filter((g) => g.items.length).map((g) => (
                <div key={g.title}>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${g.tone}`}>{g.title} · {g.items.length}</span>
                  <ul className="mt-3 divide-y divide-line rounded-[22px] border border-line">
                    {g.items.map((d) => (
                      <li key={d.id}>
                        <Link to={`/app/documents/${d.document_id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-mist/60">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold">{d.label}</div>
                            <div className="truncate text-sm text-muted">{d.document_title}</div>
                          </div>
                          <ShelfPill shelf={d.shelf} className="hidden sm:inline-flex" />
                          <div className="text-right text-sm">
                            <div className="font-semibold">{shortDate(d.date)}</div>
                            <div className="text-muted">{daysLabel(d.days_left)}</div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
