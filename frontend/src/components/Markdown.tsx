import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Citation } from "../lib/api";
import { useViewer } from "../lib/viewer";

/** Renders Markdown. [1]-style citations become buttons that open the source page. */
export default function Markdown({ text, citations = [] }: { text: string; citations?: Citation[] }) {
  const openViewer = useViewer();
  const linked = citations.length ? text.replace(/\[(\d+)\](?!\()/g, (m, n) => citations.some((c) => c.n === Number(n)) ? `[${n}](#cite-${n})` : m) : text;
  return (
    <div className="prose-cubby">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        a({ href, children }) {
          const m = href?.match(/^#cite-(\d+)$/);
          const c = m && citations.find((x) => x.n === Number(m[1]));
          if (c) {
            return <button type="button" onClick={() => openViewer({ documentId: c.document_id, title: c.title, page: c.page, snippet: c.snippet })}
              title={`${c.title}, page ${c.page}`}
              className="mx-0.5 inline-grid size-5 -translate-y-0.5 place-items-center rounded-full bg-lav text-[11px] font-bold text-lav-ink no-underline cursor-pointer">{children}</button>;
          }
          return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
        },
      }}>{linked}</ReactMarkdown>
    </div>
  );
}
