import { createClient } from "@supabase/supabase-js";

export type Role = "admin" | "sender" | "receiver" | "developer";

// Developers get everything admins get, plus the Dev section.
export const isAdminRole = (r: Role | undefined) => r === "admin" || r === "developer";
// The developer role is shown as "dev" everywhere in the UI.
export const roleLabel = (r: Role) => (r === "developer" ? "dev" : r);

export interface HeaderMessage {
  message: string;
  enabled: boolean;
}
export type NotifStatus = "sent" | "delivered" | "acknowledged";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  department: string;
  role: Role;
  avatar_url: string | null;
  is_online: boolean;
  // Build the account last ran (reported by report_app_version); null if never reported.
  app_version?: string | null;
  app_version_at?: string | null;
}

export interface QuickShout {
  id: string;
  owner_id: string;
  text: string;
  created_at: string;
}

export interface Notification {
  id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  status: NotifStatus;
  batch_id: string | null;
  group_id: string | null;
  created_at: string;
  delivered_at: string | null;
  acknowledged_at: string | null;
}

// Only the email is remembered for pre-filling the sign-in form. The password is never stored.
export const REMEMBERED_EMAIL_KEY = "shout.rememberedEmail";

// Session persists in the WebView's localStorage (survives restarts) and stays signed in
// until the user signs out or the session is revoked.
// Backoff: when the API answers 402 (quota exceeded), 429 or 5xx, or the network fails, stop
// sending requests for a while (30s, doubling up to 5 min). Without this every client keeps
// retrying on its poll timers, which burns quota and log ingestion while the project is down.
let blockedUntil = 0;
let failures = 0;
const backoffFetch: typeof fetch = async (input, init) => {
  if (Date.now() < blockedUntil) {
    return new Response(JSON.stringify({ message: "Backing off after repeated failures" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }
  const trip = () => {
    failures += 1;
    blockedUntil = Date.now() + Math.min(30_000 * 2 ** (failures - 1), 300_000);
  };
  try {
    const res = await fetch(input, init);
    if (res.status === 402 || res.status === 429 || res.status >= 500) trip();
    else failures = 0;
    return res;
  } catch (e) {
    trip();
    throw e;
  }
};

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: backoffFetch } },
);
