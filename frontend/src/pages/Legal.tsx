import { ReactNode } from "react";
import { Link } from "react-router-dom";
import Mascot from "../components/Mascot";

function Shell({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-full px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-[32px] bg-paper p-7 md:p-12">
        <Link to="/" className="inline-flex items-center gap-2 font-display text-xl font-extrabold">
          <span className="grid size-9 place-items-center rounded-xl bg-cream"><Mascot size={28} track={false} /></span>Cubby
        </Link>
        <h1 className="mt-8 text-[36px] font-extrabold">{title}</h1>
        <p className="mt-1 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">{children}</div>
      </div>
    </div>
  );
}

export function Privacy() {
  return (
    <Shell title="Privacy policy" updated="11 October 2026">
      <p>Cubby is a personal document vault. This page explains, in plain words, what we store and why.</p>
      <h2>What we store</h2>
      <ul>
        <li>Your name, email address and a scrambled (hashed) version of your password.</li>
        <li>The documents you upload, encrypted before they are stored.</li>
        <li>Text passages, summaries, important dates and chat messages created from your documents. The text is encrypted.</li>
        <li>A security log of sign-ins and actions (time, device type and IP address), so you can spot anything unusual.</li>
      </ul>
      <h2>How we use it</h2>
      <p>Only to run Cubby for you: storing your files, making them searchable, answering your questions and reminding you about dates. We don't sell your data and we don't use it for advertising.</p>
      <h2>AI processing</h2>
      <p>To answer questions and organise documents, the relevant passages are sent to an AI model run by a cloud provider under terms that don't allow them to train on your data. Only the passages needed for a task are sent.</p>
      <h2>Where it's kept</h2>
      <p>Your encrypted files and the key that unlocks them are held by different cloud providers, so no single provider can read your documents.</p>
      <h2>Your choices</h2>
      <ul>
        <li>Export everything at any time from the Trust Center.</li>
        <li>Delete a single document, or your whole vault, at any time. Deletion is permanent.</li>
      </ul>
      <h2>Contact</h2>
      <p>Questions about privacy? Contact the person or organisation that runs this Cubby instance.</p>
    </Shell>
  );
}

export function Terms() {
  return (
    <Shell title="Terms of use" updated="11 October 2026">
      <p>By creating a vault you agree to these terms.</p>
      <h2>Your account</h2>
      <ul>
        <li>Keep your password, authenticator app and recovery codes safe. Anyone with them can open your vault.</li>
        <li>If you lose both your phone and your recovery codes, we can't recover your account for you.</li>
      </ul>
      <h2>Your content</h2>
      <p>You own your documents. Only upload documents you have the right to store. Don't use Cubby for anything illegal.</p>
      <h2>AI answers</h2>
      <p>Answers are generated from your documents and can be wrong. Always check the cited page before relying on an answer for anything important, such as legal, medical or financial decisions.</p>
      <h2>Availability</h2>
      <p>We work hard to keep Cubby available and your data safe, but the service is provided as-is. Keep your own copies of anything critical using Export.</p>
      <h2>Changes</h2>
      <p>We may update these terms. Continuing to use Cubby after a change means you accept the new terms.</p>
    </Shell>
  );
}

export function NotFound() {
  return (
    <div className="grid min-h-full place-items-center p-6 text-center">
      <div>
        <Mascot mood="worried" size={150} />
        <h1 className="mt-4 text-[34px] font-extrabold">This page isn't in the vault</h1>
        <p className="mt-2 text-muted">The link may be old, or the page was moved.</p>
        <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-ink px-6 font-semibold text-white">Go home</Link>
      </div>
    </div>
  );
}
