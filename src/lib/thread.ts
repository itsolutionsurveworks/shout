import { computed, ref, type Ref } from "vue";
import { supabase, type Notification } from "./supabase";
import { cached } from "./cache";
import { aggregateReceipt, type Receipt } from "./receipts";
import { onActive } from "./active";

// One chat message = one send action. A group shout is several rows sharing a batch_id.
export interface ChatMessage {
  key: string;
  message: string;
  created_at: string;
  group_id: string | null;
  sender_id: string;
  mine: boolean;
  rows: Notification[];
  receipt: Receipt | undefined;
}

export type ChatTarget = { kind: "user" | "group"; id: string };

// History paging (rows, not messages). See the egress notes in useThread().
export const PAGE = 30;            // rows per "Load earlier messages" press, and messages shown per step
const FIRST_LOAD = 100;            // rows fetched on a cold start (cache empty)
const KEEP_ROWS = 500;             // local cache cap
const SYNC_MARGIN_MS = 60_000;

// History of everything I've sent, kept live through Realtime.
// Rows are stored by id so an insert echo / update never duplicates a message.
export function useThread(meId: Ref<string> | string) {
  const id = () => (typeof meId === "string" ? meId : meId.value);
  // Cached per sender, so the history shows instantly on the next launch.
  const rows = cached<Record<string, Notification>>(`sent:${id()}`, {});

  // Egress design: the first load fetches only the newest FIRST_LOAD rows. After that, load() asks for
  // rows that CHANGED since the last sync (new, delivered or acknowledged), usually a handful. Older
  // history is fetched in PAGE-row steps, only when the user presses "Load earlier messages".
  const lastSeen = cached<string | null>(`sent-seen:${id()}`, null); // newest timestamp already synced
  const allLoaded = cached<boolean>(`sent-all:${id()}`, false);      // true when the first load held all history
  const exhausted = ref<Record<string, boolean>>({});                // conversations with nothing older left
  const loadingEarlier = ref(false);

  function merge(n: Notification) {
    rows.value[n.id] = { ...rows.value[n.id], ...n };
  }

  const stamp = (n: Notification) =>
    Math.max(Date.parse(n.created_at), Date.parse(n.delivered_at ?? "") || 0, Date.parse(n.acknowledged_at ?? "") || 0);
  const mineFilter = () => `sender_id.eq.${id()},recipient_id.eq.${id()}`;

  function trim() {
    const ids = Object.keys(rows.value);
    if (ids.length <= KEEP_ROWS) return;
    ids.sort((a, b) => Date.parse(rows.value[b].created_at) - Date.parse(rows.value[a].created_at));
    for (const old of ids.slice(KEEP_ROWS)) delete rows.value[old];
    allLoaded.value = false; // something older than the cache may exist again
  }

  async function load() {
    const seen = lastSeen.value;
    const delta = !!seen && Object.keys(rows.value).length > 0;
    let q = supabase.from("notifications").select("*");
    if (delta) {
      // Margin for clock skew and commit order. Re-fetching a row we already have is harmless.
      const since = new Date(Date.parse(seen!) - SYNC_MARGIN_MS).toISOString();
      q = q.or(`and(or(${mineFilter()}),or(created_at.gt.${since},delivered_at.gt.${since},acknowledged_at.gt.${since}))`)
        .order("created_at", { ascending: false }).limit(KEEP_ROWS);
    } else {
      q = q.or(mineFilter()).order("created_at", { ascending: false }).limit(FIRST_LOAD);
    }
    const { data, error } = await q;
    // On failure keep the rows we already show (the cached copy) instead of blanking them.
    if (error) throw error;
    const list = (data ?? []) as Notification[];
    if (delta) {
      for (const n of list) merge(n);
    } else {
      const map: Record<string, Notification> = {};
      for (const n of list) map[n.id] = n;
      rows.value = map;
      allLoaded.value = list.length < FIRST_LOAD;
      exhausted.value = {};
    }
    const newest = Math.max(0, ...Object.values(rows.value).map(stamp));
    if (newest) lastSeen.value = new Date(newest).toISOString();
    trim();
  }

  // Older history for ONE conversation, PAGE rows per press. Returns how many rows came back.
  async function loadEarlier(t: ChatTarget): Promise<number> {
    const key = `${t.kind}:${t.id}`;
    if (loadingEarlier.value) return 0;
    loadingEarlier.value = true;
    try {
      const mine = id();
      const local = Object.values(rows.value).filter((n) =>
        t.kind === "group" ? n.group_id === t.id
          : !n.group_id && ((n.sender_id === mine && n.recipient_id === t.id) || (n.sender_id === t.id && n.recipient_id === mine)));
      const oldest = local.length ? Math.min(...local.map((n) => Date.parse(n.created_at))) : Date.now();
      let q = supabase.from("notifications").select("*").lt("created_at", new Date(oldest).toISOString())
        .order("created_at", { ascending: false }).limit(PAGE);
      q = t.kind === "group"
        ? q.eq("group_id", t.id)
        : q.is("group_id", null).or(`and(sender_id.eq.${mine},recipient_id.eq.${t.id}),and(sender_id.eq.${t.id},recipient_id.eq.${mine})`);
      const { data, error } = await q;
      if (error) throw error;
      const list = (data ?? []) as Notification[];
      for (const n of list) merge(n);
      // A group shout is one row per recipient: finish the oldest batch so its receipts are complete.
      const tail = list[list.length - 1];
      if (tail?.batch_id) {
        const rest = await supabase.from("notifications").select("*").eq("batch_id", tail.batch_id);
        if (!rest.error) for (const n of (rest.data ?? []) as Notification[]) merge(n);
      }
      if (list.length < PAGE) exhausted.value[key] = true;
      trim();
      return list.length;
    } finally {
      loadingEarlier.value = false;
    }
  }
  // False once everything is known to be loaded, so the button disappears.
  const canLoadEarlier = (t: ChatTarget | null) => !!t && !allLoaded.value && !exhausted.value[`${t.kind}:${t.id}`];

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
        sender_id: rs[0].sender_id,
        mine: rs[0].sender_id === id(),
        rows: rs,
        receipt: aggregateReceipt(rs.map((r) => r.status)),
      }))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  });

  function forTarget(t: ChatTarget | null): ChatMessage[] {
    if (!t) return [];
    return messages.value.filter((m) =>
      t.kind === "group"
        ? m.group_id === t.id
        : !m.group_id && (m.mine ? m.rows[0].recipient_id === t.id : m.sender_id === t.id),
    );
  }

  const channel = supabase
    .channel(`thread-${id()}`)
    .on("postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `sender_id=eq.${id()}` },
      (p) => { if (p.new && "id" in p.new) merge(p.new as Notification); })
    .on("postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${id()}` },
      (p) => { if (p.new && "id" in p.new) merge(p.new as Notification); });

  // Background refetches stay quiet on failure; the cached rows remain on screen.
  const quietLoad = () => { load().catch(() => {}); };
  let offActive: (() => void) | undefined;

  return {
    rows, messages, forTarget, merge, load, loadEarlier, canLoadEarlier, loadingEarlier,
    // Realtime is the fast path; a light refetch (and on window focus) guarantees replies
    // still show up if an event is dropped.
    start() {
      channel.subscribe((s) => { if (s === "SUBSCRIBED") quietLoad(); });
      // Egress: no polling timer. Realtime pushes changes; this refetches when the app becomes active.
      offActive = onActive(quietLoad);
    },
    stop() {
      offActive?.();
      supabase.removeChannel(channel);
    },
  };
}

export interface ChatGroup { id: string; name: string; members: string[]; avatar_url?: string | null; can_edit_photo?: boolean }

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
