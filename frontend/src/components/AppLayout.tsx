import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronDown, FileText, Gauge, HeartHandshake, KeyRound, LayoutGrid, NotebookPen, Lock, LogOut, MessageCircleHeart, Search, Settings, ShieldCheck, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { relative } from "../lib/format";
import ChatBubble from "./ChatBubble";
import Mascot from "./Mascot";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/app/documents", label: "Documents", icon: FileText },
  { to: "/app/search", label: "Search", icon: Search },
  { to: "/app/chat", label: "Ask Cubby", icon: MessageCircleHeart },
  { to: "/app/family", label: "Family", icon: HeartHandshake },
  { to: "/app/insights", label: "Insights", icon: Sparkles },
  { to: "/app/studio", label: "Studio", icon: NotebookPen },
  { to: "/app/passwords", label: "Passwords", icon: KeyRound },
  { to: "/app/trust", label: "Trust Center", icon: ShieldCheck },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

const MOBILE = NAV.filter((n) => ["/app", "/app/documents", "/app/chat", "/app/family", "/app/insights", "/app/passwords"].includes(n.to));

const TITLES: [RegExp, string][] = [
  [/^\/app\/?$/, "Overview"], [/^\/app\/documents\/.+/, "Document"], [/^\/app\/documents/, "Documents"],
  [/^\/app\/search/, "Search"], [/^\/app\/chat/, "Ask Cubby"], [/^\/app\/family/, "Family"], [/^\/app\/insights/, "Insights"],
  [/^\/app\/studio/, "Studio"], [/^\/app\/passwords/, "Passwords"], [/^\/app\/trust/, "Trust Center"], [/^\/app\/settings/, "Settings"], [/^\/app\/admin/, "Admin"],
];

const IDLE_MS = 15 * 60 * 1000;

type Notif = { id: string; title: string; body: string; link: string; read: boolean; created_at: string };

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Cubby";
  const nav = user?.is_admin ? [...NAV, { to: "/app/admin", label: "Admin", icon: Gauge, end: false }] : NAV;
  const [recoveryLeft, setRecoveryLeft] = useState<string | null>(() => sessionStorage.getItem("cubby:used-recovery"));
  function dismissRecovery() { sessionStorage.removeItem("cubby:used-recovery"); setRecoveryLeft(null); }

  // Auto-lock after 15 minutes without activity.
  useEffect(() => {
    let timer = window.setTimeout(lock, IDLE_MS);
    function reset() { window.clearTimeout(timer); timer = window.setTimeout(lock, IDLE_MS); }
    async function lock() { await logout(); navigate("/login?locked=1"); }
    const events = ["pointerdown", "keydown", "scroll", "pointermove"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => { window.clearTimeout(timer); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [logout, navigate]);

  async function lockNow() { await logout(); navigate("/login?locked=1"); }

  // Unread family messages and invites put a dot on the Family icon.
  const [familyDot, setFamilyDot] = useState(false);
  useEffect(() => {
    const load = () => api.get<{ messages: number; invites: number }>("/family/unread")
      .then((r) => setFamilyDot(r.messages + r.invites > 0)).catch(() => {});
    load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, [pathname]);

  return (
    <div className="min-h-full p-0 md:p-5 lg:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-[1400px] bg-ink md:min-h-[calc(100vh-4rem)] md:rounded-[40px] md:p-3 md:shadow-[0_30px_60px_-30px_rgba(35,35,38,0.45)]">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-[84px] shrink-0 flex-col items-center py-4 md:flex">
          <Link to="/app" aria-label="Cubby home" className="grid size-14 place-items-center rounded-[18px] bg-cream">
            <Mascot size={44} track={false} />
          </Link>
          <nav className="mt-8 flex flex-1 flex-col items-center gap-1" aria-label="Main">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} aria-label={label}
                className={({ isActive }) => `group relative grid size-12 place-items-center rounded-2xl transition ${isActive ? "text-white" : "text-white/45 hover:text-white/85"}`}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="nav-bar" className="absolute -left-[18px] h-8 w-[4px] rounded-r-full bg-white" />}
                    <Icon className="size-[22px]" strokeWidth={1.8} />
                    {to === "/app/family" && familyDot && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full border-2 border-ink bg-mint" />}
                    <span className="pointer-events-none absolute left-14 z-20 whitespace-nowrap rounded-lg bg-paper px-2.5 py-1 text-xs font-semibold text-ink opacity-0 shadow-md transition group-hover:opacity-100">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <button onClick={lockNow} aria-label="Lock vault" className="grid size-12 place-items-center rounded-2xl text-white/45 hover:text-white cursor-pointer">
            <LogOut className="size-[22px]" strokeWidth={1.8} />
          </button>
        </aside>

        {/* Canvas */}
        <main className="flex min-w-0 flex-1 flex-col bg-paper pb-24 md:rounded-[32px] md:pb-0">
          <header className="flex items-center gap-3 px-5 pt-6 md:px-10 md:pt-9">
            <h1 className="flex-1 truncate text-[26px] font-extrabold sm:text-[30px] md:text-[38px]">{title}</h1>
            <button onClick={() => navigate("/app/search")} aria-label="Search"
              className="grid size-11 place-items-center rounded-full bg-mist transition hover:bg-line cursor-pointer"><Search className="size-5" /></button>
            <Notifications />
            <UserMenu name={user?.name || ""} onLock={lockNow} />
          </header>
          {recoveryLeft !== null && (
            <div className="mx-5 mt-5 flex items-center gap-3 rounded-[20px] bg-cream px-5 py-3 text-sm text-cream-ink md:mx-10">
              <span className="flex-1 font-semibold">
                You logged in with a recovery code ({recoveryLeft} left). If you lost your phone, move two-factor sign-in to your new one.
              </span>
              <Link to="/app/settings" onClick={dismissRecovery} className="font-bold underline underline-offset-4">Go to Settings</Link>
              <button onClick={dismissRecovery} aria-label="Dismiss" className="cursor-pointer"><X className="size-4" /></button>
            </div>
          )}
          <div className="flex-1 px-5 py-6 md:px-10 md:py-8">
            <AnimatePresence mode="wait">
              <motion.div key={pathname.split("/").slice(0, 3).join("/")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Bottom bar (mobile) */}
      <nav className="fixed inset-x-3 bottom-3 z-40 flex justify-between rounded-[24px] bg-ink px-2 py-2 md:hidden" aria-label="Main">
        {MOBILE.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} aria-label={label}
            className={({ isActive }) => `relative grid size-12 place-items-center rounded-2xl ${isActive ? "bg-white/15 text-white" : "text-white/50"}`}>
            <Icon className="size-5" />
            {to === "/app/family" && familyDot && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full border-2 border-ink bg-mint" />}
          </NavLink>
        ))}
      </nav>
      <ChatBubble />
    </div>
  );
}

function useOutside(ref: React.RefObject<HTMLElement>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOut]);
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread: number; items: Notif[] }>({ unread: 0, items: [] });
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useOutside(ref, () => setOpen(false));

  useEffect(() => {
    const load = () => api.get<{ unread: number; items: Notif[] }>("/notifications").then(setData).catch(() => {});
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, []);

  async function toggle() {
    setOpen((o) => !o);
    if (!open && data.unread) {
      await api.post("/notifications/read-all").catch(() => {});
      setData((d) => ({ ...d, unread: 0 }));
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ""}`}
        className="relative grid size-11 place-items-center rounded-full bg-mist transition hover:bg-line cursor-pointer">
        <Bell className="size-5" />
        {data.unread > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full border-2 border-mist bg-rose-ink" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 top-14 z-30 w-[320px] overflow-hidden rounded-3xl border border-line bg-paper shadow-xl">
            <div className="px-5 pb-2 pt-4 font-display text-lg font-bold">Vault Pulse</div>
            <div className="max-h-[360px] overflow-y-auto pb-2">
              {data.items.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-muted">Nothing yet. Reminders for expiries and renewals show up here.</p>
              ) : data.items.map((n) => (
                <button key={n.id} onClick={() => { setOpen(false); if (n.link) navigate(n.link); }}
                  className="block w-full px-5 py-3 text-left hover:bg-mist cursor-pointer">
                  <div className="text-sm font-semibold">{n.title}</div>
                  <div className="text-xs text-muted">{n.body} · {relative(n.created_at)}</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu({ name, onLock }: { name: string; onLock: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const first = name.split(" ")[0] || "You";
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}
        className="flex h-11 items-center gap-2 rounded-full bg-mist pl-1 pr-3 transition hover:bg-line cursor-pointer">
        <span className="grid size-9 place-items-center rounded-full bg-lav font-display text-base font-bold text-lav-ink">{first[0]?.toUpperCase()}</span>
        <span className="hidden text-sm font-semibold sm:inline">{first}</span>
        <ChevronDown className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 top-14 z-30 w-52 overflow-hidden rounded-2xl border border-line bg-paper p-1.5 shadow-xl">
            <Link to="/app/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-mist"><Settings className="size-4" />Settings</Link>
            <button onClick={onLock} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-mist cursor-pointer"><Lock className="size-4" />Lock vault</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
