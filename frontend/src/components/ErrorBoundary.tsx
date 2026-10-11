import { Component, ReactNode } from "react";
import Mascot from "./Mascot";

/** Catches a crash in any screen and shows a friendly page instead of a blank one. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error("Cubby screen crashed:", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-h-full place-items-center p-6 text-center">
        <div>
          <Mascot mood="worried" size={140} />
          <h1 className="mt-4 text-[30px] font-extrabold">Something on this screen broke</h1>
          <p className="mt-2 text-muted">Your documents are safe. Reloading usually fixes it.</p>
          <button onClick={() => window.location.reload()} className="mt-6 h-11 rounded-full bg-ink px-6 font-semibold text-white cursor-pointer">Reload</button>
        </div>
      </div>
    );
  }
}
