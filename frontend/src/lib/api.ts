// One small wrapper for every call to the backend.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: { "X-Cubby": "1", ...(body && !isForm ? { "Content-Type": "application/json" } : {}) },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach Cubby. Check your internet connection and try again.");
  }
  if (!res.ok) {
    let message = res.status >= 500
      ? "Cubby is having trouble right now. Please try again in a moment."
      : "That didn't work. Please try again.";
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = data.detail.map((d: { msg: string }) => d.msg.replace(/^Value error, /, "")).join(" ");
    } catch { /* not JSON */ }
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("cubby:logged-out"));
    throw new ApiError(res.status, message);
  }
  const type = res.headers.get("content-type") || "";
  return (type.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  patch: <T>(p: string, b: unknown) => request<T>("PATCH", p, b),
  put: <T>(p: string, b: unknown) => request<T>("PUT", p, b),
  del: <T>(p: string) => request<T>("DELETE", p),
  upload: <T>(p: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<T>("POST", p, fd);
  },
};

// ---------- Shared types ----------
export type User = {
  id: string; name: string; email: string; totp_enabled: boolean;
  onboarded: boolean; created_at: string; scope: "full" | "setup";
  is_admin: boolean; recovery_codes_left: number; email_reminders: boolean;
};

export type IdCard = {
  id_type: string; label: string; holder_name: string | null; number: string | null;
  date_of_birth: string | null; issue_date: string | null; expiry_date: string | null;
  nationality: string | null; verified: boolean; verified_by: string | null;
};

export type Doc = {
  id: string; title: string; filename: string; mime_type: string; size_bytes: number;
  shelf: string; doc_type: string | null; status: "processing" | "ready" | "failed";
  error: string | null; page_count: number; read_from_scan: boolean; backed_up: boolean;
  starred: boolean; needs_review: boolean; superseded_by: string | null; id_card: IdCard | null;
  created_at: string; processed_at: string | null;
};

export type DocDetail = Doc & {
  summary: string; passages: number; superseded_by_title: string | null; active_shares: number;
  dates: { label: string; kind: string; date: string }[];
};

export type KeyDate = {
  id: string; label: string; kind: string; date: string; days_left: number; pinned: boolean;
  document_id: string; document_title: string; shelf: string;
};

export type Citation = { n: number; document_id: string; title: string; page: number; snippet: string };
export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; citations: Citation[]; created_at: string };
export type Conversation = { id: string; title: string; document_id: string | null; document_title: string | null; updated_at: string };

export type Share = {
  id: string; document_id: string; document_title: string | null; label: string; allow_download: boolean;
  max_views: number | null; views: number; expires_at: string; created_at: string; last_viewed_at: string | null;
  state: "active" | "expired" | "revoked" | "used up"; url?: string;
};

export type NoteSummary = {
  id: string; kind: "note" | "report"; template: string | null; title: string; pinned: boolean;
  preview: string; created_at: string; updated_at: string;
};
export type Note = NoteSummary & { body: string; citations: Citation[] };

// ---------- Family vaults ----------
export type FamilySummary = {
  id: string; name: string; emoji: string; color: string; role: "admin" | "member";
  members: number; documents: number; unread: number; preview: string; last_activity: string;
};
export type FamilyDocCard = {
  id: string; title: string; filename: string; mime_type: string; size_bytes: number; page_count: number;
  shelf: string; doc_type: string | null;
  shared_by: { id: string | null; name: string }; id_card: IdCard | null;
  expiry_status: "valid" | "expiring" | "expired" | "no_expiry"; days_left: number | null; created_at: string;
  summary?: string; dates?: { label: string; kind: string; date: string }[];
};
export type FamilyMember = { user_id: string; name: string; email: string; role: "admin" | "member"; joined_at: string; last_read_at: string };
export type FamilyDetail = {
  id: string; name: string; emoji: string; color: string; role: "admin" | "member"; me: string; created_at: string;
  open_requests: number; members: FamilyMember[]; documents: FamilyDocCard[];
  dates: { id: string; label: string; kind: string; date: string; days_left: number; family_doc_id: string; document_title: string }[];
  invites: { id: string; email: string; created_at: string }[];
};
export type FamilyCitation = { n: number; family_doc_id: string; title: string; page: number; snippet: string };
export type FamilyMessage = {
  id: string; kind: "text" | "doc" | "request" | "cubby" | "system"; created_at: string; mine: boolean;
  sender: { id: string | null; name: string } | null; text: string; citations: FamilyCitation[];
  doc: FamilyDocCard | null; doc_removed: boolean;
  request: { label: string; status: "open" | "fulfilled" | "declined" | "cancelled"; target: { id: string; name: string } | null } | null;
  reply: { id: string; sender_name: string; preview: string } | null;
};
export type FamilyInvite = {
  id: string; family_id: string; family_name: string; emoji: string; color: string;
  invited_by: string; members: number; created_at: string;
};
