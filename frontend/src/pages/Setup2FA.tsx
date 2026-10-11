import { Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import CodeInput from "../components/CodeInput";
import Mascot from "../components/Mascot";
import RecoveryCodes from "../components/RecoveryCodes";
import { useToast } from "../components/ui";
import { api, User } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Setup2FA() {
  const { user, loading, setUser } = useAuth();
  const [setup, setSetup] = useState<{ otpauth_uri: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (user && user.scope === "setup") api.get<{ otpauth_uri: string; secret: string }>("/auth/2fa/setup").then(setSetup).catch((e) => setError(e.message));
  }, [user]);

  if (loading) return <div className="grid min-h-full place-items-center"><Mascot mood="thinking" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.scope === "full" && !done) return <Navigate to="/app" replace />;

  async function verify(c: string) {
    setBusy(true); setError("");
    try {
      const res = await api.post<{ user: User; recovery_codes: string[] }>("/auth/2fa/enable", { code: c });
      setDone(true);
      setCodes(res.recovery_codes);
      setUser(res.user);
    } catch (err) { setError((err as Error).message); setCode(""); }
    finally { setBusy(false); }
  }

  if (codes) {
    return (
      <AuthShell mood="happy" bubble="Keep these somewhere safe!">
        <h1 className="text-[34px] font-extrabold">Save your recovery codes</h1>
        <p className="mt-2 mb-6 text-muted">If you ever lose your phone, each of these codes lets you log in once instead of a 6-digit code. You won't see them again.</p>
        <RecoveryCodes codes={codes} onDone={() => navigate(user.onboarded ? "/app" : "/onboarding", { replace: true })} doneLabel="Continue" />
      </AuthShell>
    );
  }

  return (
    <AuthShell mood={done ? "happy" : error ? "worried" : "idle"}
      bubble={done ? "Double-locked. Nice!" : "One more lock on the door."}>
      <h1 className="text-[34px] font-extrabold">Turn on two-factor sign-in</h1>
      <p className="mt-2 text-muted">Every Cubby vault needs it. You'll enter a code from your phone each time you log in.</p>

      <ol className="mt-7 space-y-6">
        <li>
          <p className="font-semibold">1. Install an authenticator app</p>
          <p className="text-sm text-muted">Google Authenticator, Microsoft Authenticator or Authy all work.</p>
        </li>
        <li>
          <p className="font-semibold">2. Scan this code with the app</p>
          <div className="mt-3 flex flex-wrap items-center gap-5">
            <div className="rounded-3xl bg-paper p-3 ring-1 ring-line">
              {setup ? <QRCodeSVG value={setup.otpauth_uri} size={148} fgColor="#232326" /> : <div className="size-[148px] animate-pulse rounded-2xl bg-mist" />}
            </div>
            {setup && (
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted">Can't scan? Type this key instead:</p>
                <button onClick={() => { navigator.clipboard.writeText(setup.secret); toast("Key copied"); }}
                  className="mt-1 flex max-w-full items-center gap-2 rounded-xl bg-mist px-3 py-2 font-mono text-sm font-semibold hover:bg-line cursor-pointer">
                  <span className="truncate">{setup.secret.match(/.{1,4}/g)?.join(" ")}</span><Copy className="size-4 shrink-0" />
                </button>
              </div>
            )}
          </div>
        </li>
        <li>
          <p className="mb-3 font-semibold">3. Enter the 6-digit code it shows</p>
          <CodeInput value={code} onChange={setCode} onComplete={verify} disabled={busy || done} />
          {error && <p className="mt-3 rounded-2xl bg-rose px-4 py-3 text-sm font-semibold text-rose-ink">{error}</p>}
        </li>
      </ol>
    </AuthShell>
  );
}
