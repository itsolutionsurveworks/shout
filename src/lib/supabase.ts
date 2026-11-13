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

// "Remember me" (on by default). Off means the session is cleared when the app next starts.
// The password itself is never stored; the session token is what keeps you signed in.
export const REMEMBER_KEY = "shout.rememberMe";
export const REMEMBERED_EMAIL_KEY = "shout.rememberedEmail";
export const shouldRemember = () => localStorage.getItem(REMEMBER_KEY) !== "0";

// Session persists in the WebView's localStorage (survives restarts).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } },
);
