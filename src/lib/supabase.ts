import { createClient } from "@supabase/supabase-js";

export type Role = "admin" | "sender" | "receiver";
export type NotifStatus = "sent" | "delivered" | "acknowledged" | "on_my_way";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  department: string;
  role: Role;
  avatar_url: string | null;
  is_online: boolean;
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
  created_at: string;
  delivered_at: string | null;
  acknowledged_at: string | null;
}

// Session persists in the WebView's localStorage (survives restarts).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } },
);
