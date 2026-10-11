import { Download, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DocumentViewer from "../components/LazyViewer";
import Mascot from "../components/Mascot";
import { api } from "../lib/api";
import { bytes, shortDate } from "../lib/format";

type Meta = { title: string; doc_type: string | null; mime_type: string; size_bytes: number; page_count: number;
  owner: string; label: string; allow_download: boolean; expires_at: string; views_left: number | null };

/** What someone sees when they open a share link. No account needed. */
export default function PublicShare() {
  const { token = "" } = useParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return; // each open counts as one view, so only ask once
    asked.current = true;
    api.get<Meta>(`/public/share/${token}`).then(setMeta).catch((e) => setError((e as Error).message));
  }, [token]);

  return (
    <div className="min-h-full px-4 py-6 md:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display text-xl font-extrabold">
            <span className="grid size-10 place-items-center rounded-xl bg-cream"><Mascot size={30} track={false} /></span>Cubby
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-semibold"><Lock className="size-3.5" />Shared privately</span>
        </header>

        {error ? (
          <div className="grid place-items-center rounded-[32px] bg-paper px-6 py-16 text-center">
            <Mascot mood="sleeping" size={130} />
            <h1 className="mt-4 text-[28px] font-extrabold">This link isn't available</h1>
            <p className="mt-2 max-w-md text-muted">{error} Ask the person who shared it for a new link.</p>
          </div>
        ) : !meta ? (
          <div className="grid h-80 place-items-center rounded-[32px] bg-paper"><Mascot mood="thinking" size={90} /></div>
        ) : (
          <div className="rounded-[32px] bg-paper p-5 md:p-8">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-muted">{meta.owner} shared a document with you{meta.label ? ` (${meta.label})` : ""}</p>
                <h1 className="mt-1 text-[28px] font-extrabold leading-tight">{meta.title}</h1>
                <p className="mt-1 text-sm text-muted">
                  {[meta.doc_type, bytes(meta.size_bytes), `link works until ${shortDate(meta.expires_at)}`,
                    meta.views_left !== null ? `${meta.views_left} view${meta.views_left === 1 ? "" : "s"} left` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              {meta.allow_download && (
                <a href={`/api/public/share/${token}/file?download=1`} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-white">
                  <Download className="size-4" />Download
                </a>
              )}
            </div>
            <div className="mt-6">
              <DocumentViewer src={`/api/public/share/${token}/file`} allowDownload={false} height="75vh" />
            </div>
          </div>
        )}
        <p className="mt-6 text-center text-sm text-muted">Cubby keeps personal documents encrypted. <Link to="/" className="font-semibold underline underline-offset-4">Make your own vault</Link></p>
      </div>
    </div>
  );
}
