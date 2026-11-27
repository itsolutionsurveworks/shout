import { createClient } from "@supabase/supabase-js";
import { allowRead, recordRequest } from "./netstats";

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
const synthetic = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers: { "Content-Type": "application/json" } });

const backoffFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const isApi = url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/auth/v1/");
  // Read budget (see netstats.ts): a runaway loop can't burn the quota. Writes are never limited.
  if (isApi && method === "GET" && !allowRead()) return synthetic(429, "Read budget reached, try again later");
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
    if (isApi) {
      // Meter: size from Content-Length when the server sends it, otherwise from a copy of the body.
      const len = Number(res.headers.get("content-length"));
      const key = `${method} ${url.pathname.replace(/^\/(rest|auth)\/v1\//, "$1/")}`;
      if (len > 0) recordRequest(key, len);
      else res.clone().arrayBuffer().then((b) => recordRequest(key, b.byteLength)).catch(() => recordRequest(key, 0));
    }
    return res;
  } catch (e) {
    trip();
    throw e;
  }
};

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true }, global: { fetch: backoffFetch },
    // Websocket reconnects back off too (1s, 2s, 5s, 10s, 30s, then every 60s), so a blocked or
    // down project is not hit with a handshake every second by every open app.
    realtime: { reconnectAfterMs: (tries: number) => [1_000, 2_000, 5_000, 10_000, 30_000][tries - 1] ?? 60_000 } },
);
