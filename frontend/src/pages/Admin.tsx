import { AlertTriangle, CircleCheck, CircleSlash, CircleX, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui";
import { api } from "../lib/api";
import { relative } from "../lib/format";

type Service = { cloud: string; service: string; role: string; status: "ok" | "error" | "off"; ms: number; detail: string };
type Data = {
  checked_at: string; env: string; services: Service[]; problems: string[]; warnings: string[];
  stats: { users: number; new_users_7d: number; active_sessions: number; documents: number;
    documents_by_status: Record<string, number>; answers_7d_by_provider: Record<string, number> };
  failed_documents: { id: string; title: string; owner: string; error: string; detail: string; created_at: string }[];
  settings: Record<string, string | boolean>;
};

const ICON = { ok: CircleCheck, error: CircleX, off: CircleSlash };
const TONE = { ok: "text-mint-ink", error: "text-rose-ink", off: "text-muted" };
const CLOUD_BG: Record<string, string> = { AWS: "bg-cream", Azure: "bg-lav", "Google Cloud": "bg-mint", Groq: "bg-blue" };

export default function Admin() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  async function load(refresh = false) {
    setBusy(true);
    try { setData(await api.get<Data>(`/admin/overview${refresh ? "?refresh=true" : ""}`)); } finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  if (!data) return <div className="h-64 animate-pulse rounded-[26px] bg-mist" />;
  const s = data.stats;
  const tiles = [
    ["Users", s.users, `+${s.new_users_7d} this week`],
    ["Signed-in devices", s.active_sessions, "active sessions"],
    ["Documents", s.documents, `${s.documents_by_status.failed ?? 0} failed`],
    ["Answers (7 days)", Object.values(s.answers_7d_by_provider).reduce((a, b) => a + b, 0),
      Object.entries(s.answers_7d_by_provider).map(([k, v]) => `${k} ${v}`).join(", ") || "none yet"],
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">Only admins see this page. Environment: <b className="text-ink">{data.env}</b> · checked {relative(data.checked_at)}</p>
        <Button variant="light" loading={busy} onClick={() => load(true)}><RefreshCw className="size-4" />Run checks now</Button>
      </div>

      {data.problems.length > 0 && (
        <div className="rounded-[22px] bg-rose p-5 text-rose-ink">
          <div className="flex items-center gap-2 font-bold"><AlertTriangle className="size-5" />Settings problems</div>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">{data.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {data.warnings.length > 0 && (
        <div className="rounded-[22px] bg-cream p-5 text-cream-ink">
          <div className="font-bold">Worth knowing</div>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">{data.warnings.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="rounded-[24px] bg-mist p-5">
            <div className="font-display text-[32px] font-extrabold leading-none">{value}</div>
            <div className="mt-2 text-sm font-semibold">{label}</div>
            <div className="text-xs text-muted">{sub}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Service health</h2>
        <div className="overflow-x-auto rounded-[24px] border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="text-muted"><th className="px-5 py-3 font-medium">Cloud</th><th className="px-5 py-3 font-medium">Service</th>
              <th className="px-5 py-3 font-medium">Used for</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Detail</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.services.map((x) => {
                const Icon = ICON[x.status];
                return (
                  <tr key={x.cloud + x.service}>
                    <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${CLOUD_BG[x.cloud] || "bg-mist"}`}>{x.cloud}</span></td>
                    <td className="px-5 py-3 font-semibold">{x.service}</td>
                    <td className="px-5 py-3 text-muted">{x.role}</td>
                    <td className={`px-5 py-3 font-semibold ${TONE[x.status]}`}>
                      <span className="flex items-center gap-1.5"><Icon className="size-4" />{x.status === "ok" ? `OK${x.ms ? ` · ${x.ms} ms` : ""}` : x.status === "error" ? "Failing" : "Off"}</span>
                    </td>
                    <td className="max-w-[360px] px-5 py-3 font-mono text-xs text-muted break-words">{x.detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Failed documents</h2>
        {data.failed_documents.length === 0 ? <p className="rounded-[22px] bg-mist p-6 text-muted">None. Every document was read successfully.</p> : (
          <ul className="space-y-2">
            {data.failed_documents.map((d) => (
              <li key={d.id} className="rounded-[20px] border border-line">
                <button onClick={() => setOpen(open === d.id ? null : d.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left cursor-pointer">
                  <span className="font-semibold">{d.title}</span>
                  <span className="text-sm text-muted">{d.owner}</span>
                  <span className="ml-auto text-sm text-muted">{relative(d.created_at)}</span>
                </button>
                {open === d.id && (
                  <div className="space-y-2 border-t border-line px-5 py-4 text-sm">
                    <p><span className="text-muted">User saw:</span> {d.error}</p>
                    <pre className="whitespace-pre-wrap rounded-xl bg-mist p-3 font-mono text-xs">{d.detail || "No technical detail stored."}</pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Current settings</h2>
        <dl className="grid gap-2 rounded-[24px] bg-mist p-5 text-sm sm:grid-cols-2">
          {Object.entries(data.settings).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="font-mono font-semibold">{String(v)}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}
