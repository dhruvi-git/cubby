import { lazy, ReactNode, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import Mascot from "./components/Mascot";
import { useAuth } from "./lib/auth";
import ErrorBoundary from "./components/ErrorBoundary";
import Chat from "./pages/Chat";
import DocumentDetail from "./pages/DocumentDetail";
import Documents from "./pages/Documents";
import Insights from "./pages/Insights";
import ForgotPassword from "./pages/ForgotPassword";
import Landing from "./pages/Landing";
import { NotFound, Privacy, Terms } from "./pages/Legal";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Overview from "./pages/Overview";
import ResetPassword from "./pages/ResetPassword";
import Search from "./pages/Search";
import Settings from "./pages/Settings";
import Setup2FA from "./pages/Setup2FA";
import Signup from "./pages/Signup";
import Trust from "./pages/Trust";

// Bigger screens load only when opened, so the app starts faster.
const Admin = lazy(() => import("./pages/Admin"));
const Family = lazy(() => import("./pages/Family"));
const Passwords = lazy(() => import("./pages/Passwords"));
const PublicShare = lazy(() => import("./pages/PublicShare"));
const Studio = lazy(() => import("./pages/Studio"));

function Splash() {
  return <div className="grid min-h-full place-items-center"><Mascot mood="thinking" size={100} /></div>;
}

/** Only fully logged-in users (password + 2FA) get past this. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.scope !== "full") return <Navigate to="/setup-2fa" replace />;
  if (!user.onboarded && loc.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user?.scope === "full") return <Navigate to="/app" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.is_admin ? <>{children}</> : <NotFound />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <Suspense fallback={<Splash />}>
    <Routes>
      <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/s/:token" element={<PublicShare />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/setup-2fa" element={<Setup2FA />} />
      <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
      <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Overview />} />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/:id" element={<DocumentDetail />} />
        <Route path="search" element={<Search />} />
        <Route path="chat" element={<Chat />} />
        <Route path="chat/:id" element={<Chat />} />
        <Route path="family" element={<Family />} />
        <Route path="family/:id" element={<Family />} />
        <Route path="insights" element={<Insights />} />
        <Route path="studio" element={<Studio />} />
        <Route path="studio/:id" element={<Studio />} />
        <Route path="passwords" element={<Passwords />} />
        <Route path="trust" element={<Trust />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin" element={<AdminOnly><Admin /></AdminOnly>} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
  );
}
