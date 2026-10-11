import { ComponentProps, lazy, Suspense } from "react";
import Mascot from "./Mascot";

const DocumentViewer = lazy(() => import("./DocumentViewer"));

/** The PDF engine is large, so it's only downloaded the first time a document is opened. */
export default function LazyViewer(props: ComponentProps<typeof DocumentViewer>) {
  return (
    <Suspense fallback={<div className="grid min-h-60 place-items-center rounded-[22px] bg-mist" style={{ height: props.height }}><Mascot mood="thinking" size={80} track={false} /></div>}>
      <DocumentViewer {...props} />
    </Suspense>
  );
}
