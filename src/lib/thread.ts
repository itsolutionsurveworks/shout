import { computed, ref, type Ref } from "vue";
import { supabase, type Notification } from "./supabase";
import { aggregateReceipt, type Receipt } from "./receipts";

// One chat message = one send action. A group shout is several rows sharing a batch_id.
export interface ChatMessage {
  key: string;
  message: string;
  created_at: string;
  group_id: string | null;
  rows: Notification[];
  receipt: Receipt | undefined;
}

export type ChatTarget = { kind: "user" | "group"; id: string };

// History of everything I've sent, kept live through Realtime.
// Rows are stored by id so an insert echo / update never duplicates a message.
export function useThread(meId: Ref<string> | string) {
  const id = () => (typeof meId === "string" ? meId : meId.value);
  const rows = ref<Record<string, Notification>>({});

  function merge(n: Notification) {
    rows.value[n.id] = { ...rows.value[n.id], ...n };
  }

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("sender_id", id())
      .order("created_at", { ascending: false })
      .limit(500);
    const map: Record<string, Notification> = {};
    for (const n of (data ?? []) as Notification[]) map[n.id] = n;
    rows.value = map;
  }

  // Oldest-first list of messages.
  const messages = computed<ChatMessage[]>(() => {
    const byKey = new Map<string, Notification[]>();
    for (const n of Object.values(rows.value)) {
      const k = n.batch_id ?? n.id;
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(n);
    }
    return [...byKey.entries()]
      .map(([key, rs]) => ({
        key,
        message: rs[0].message,
        created_at: rs[0].created_at,
        group_id: rs[0].group_id,
        rows: rs,
        receipt: aggregateReceipt(rs.map((r) => r.status)),
      }))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  });

  function forTarget(t: ChatTarget | null): ChatMessage[] {
    if (!t) return [];
    return messages.value.filter((m) =>
      t.kind === "group" ? m.group_id === t.id : !m.group_id && m.rows[0].recipient_id === t.id,
    );
  }

  const channel = supabase
    .channel(`thread-${id()}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `sender_id=eq.${id()}` },
      (p) => { if (p.new && "id" in p.new) merge(p.new as Notification); });

  let timer: ReturnType<typeof setInterval> | undefined;

  return {
    rows, messages, forTarget, merge, load,
    // Realtime is the fast path; a light refetch (and on window focus) guarantees replies
    // still show up if an event is dropped.
    start() {
      channel.subscribe((s) => { if (s === "SUBSCRIBED") load(); });
      timer = setInterval(load, 8000);
      window.addEventListener("focus", load);
    },
    stop() {
      clearInterval(timer);
      window.removeEventListener("focus", load);
      supabase.removeChannel(channel);
    },
  };
}

export interface ChatGroup { id: string; name: string; members: string[] }

// "14:05" today, "Yesterday", weekday this week, otherwise a short date.
export function chatTime(iso: string): string {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  if (days <= 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "2-digit" });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((new Date(new Date().toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}
