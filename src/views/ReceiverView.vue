<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from "vue";
import { CheckCheck, Clock } from "lucide-vue-next";
import { supabase, type Notification, type Profile } from "../lib/supabase";
import { onlineIds } from "../lib/presence";
import { onRefresh } from "../lib/refresh";
import { onActive } from "../lib/active";
import { cached } from "../lib/cache";
import { dayLabel } from "../lib/thread";
import BuildFooter from "../components/BuildFooter.vue";
import MessageContent from "../components/MessageContent.vue";

// Receiver's home: the same chat look as the sender, but showing only incoming shouts.
// Shouts still pop up in their own alert window; this is the history behind it.
const props = defineProps<{ me: Profile }>();

// Cached per receiver: the last shout history and sender names show before the network answers.
const shouts = cached<Notification[]>(`shouts:${props.me.id}`, []);
const senders = cached<Record<string, Profile>>(`senders:${props.me.id}`, {});
const scroller = ref<HTMLElement | null>(null);

// Egress design (same as the sender thread): the first load takes the newest FIRST_LOAD rows, later loads
// only rows that changed since the last sync, and older history comes PAGE rows at a time on request.
const PAGE = 30, FIRST_LOAD = 100, KEEP_ROWS = 500, SYNC_MARGIN_MS = 60_000;
const lastSeen = cached<string | null>(`shouts-seen:${props.me.id}`, null);
const allLoaded = cached<boolean>(`shouts-all:${props.me.id}`, false);
const exhausted = ref(false);
const loadingEarlier = ref(false);
const visible = ref(PAGE);
const stamp = (n: Notification) =>
  Math.max(Date.parse(n.created_at), Date.parse(n.delivered_at ?? "") || 0, Date.parse(n.acknowledged_at ?? "") || 0);

function mergeShouts(list: Notification[]) {
  const byId = new Map(shouts.value.map((n) => [n.id, n]));
  for (const n of list) byId.set(n.id, { ...byId.get(n.id), ...n });
  const all = [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (all.length > KEEP_ROWS) allLoaded.value = false;
  shouts.value = all.slice(0, KEEP_ROWS);
  const newest = Math.max(0, ...shouts.value.map(stamp));
  if (newest) lastSeen.value = new Date(newest).toISOString();
}

async function loadSenders(list: Notification[]) {
  const missing = [...new Set(list.map((n) => n.sender_id))].filter((id) => !senders.value[id]);
  if (missing.length) {
    const { data: people, error: peopleErr } = await supabase.from("profiles").select("*").in("id", missing);
    if (peopleErr) throw peopleErr;
    for (const p of (people ?? []) as Profile[]) senders.value[p.id] = p;
  }
}

async function load() {
  const delta = !!lastSeen.value && shouts.value.length > 0;
  let q = supabase.from("notifications").select("*").eq("recipient_id", props.me.id);
  if (delta) {
    const since = new Date(Date.parse(lastSeen.value!) - SYNC_MARGIN_MS).toISOString();
    q = q.or(`created_at.gt.${since},delivered_at.gt.${since},acknowledged_at.gt.${since}`).order("created_at", { ascending: false }).limit(KEEP_ROWS);
  } else {
    q = q.order("created_at", { ascending: false }).limit(FIRST_LOAD);
  }
  const { data, error } = await q;
  // On failure keep the cached history on screen and report the error.
  if (error) throw error;
  const list = (data ?? []) as Notification[];
  if (delta) mergeShouts(list);
  else {
    shouts.value = [];
    mergeShouts(list);
    allLoaded.value = list.length < FIRST_LOAD;
    exhausted.value = false;
  }
  await loadSenders(list);
}

async function loadEarlier() {
  if (loadingEarlier.value) return;
  visible.value += PAGE;
  if (shouts.value.length >= visible.value || allLoaded.value || exhausted.value) return; // enough is already local
  loadingEarlier.value = true;
  try {
    const oldest = shouts.value.length ? Math.min(...shouts.value.map((n) => Date.parse(n.created_at))) : Date.now();
    const { data, error } = await supabase.from("notifications").select("*").eq("recipient_id", props.me.id)
      .lt("created_at", new Date(oldest).toISOString()).order("created_at", { ascending: false }).limit(PAGE);
    if (error) throw error;
    const list = (data ?? []) as Notification[];
    mergeShouts(list);
    if (list.length < PAGE) exhausted.value = true;
    await loadSenders(list);
  } catch (e) {
    console.error("Load earlier failed", e);
  } finally {
    loadingEarlier.value = false;
  }
}
const canEarlier = computed(() => shouts.value.length > visible.value || (!allLoaded.value && !exhausted.value));

const loadQuietly = () => { load().catch((e) => console.error("Load failed", e)); };

// Oldest first, with a day separator whenever the day changes (like the sender's thread).
const items = computed(() => {
  let last = "";
  return shouts.value.slice(0, visible.value).reverse().map((n) => {
    const day = new Date(n.created_at).toDateString();
    const sep = day !== last ? dayLabel(n.created_at) : null;
    last = day;
    return { n, sep };
  });
});

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const nameOf = (id: string) => senders.value[id]?.full_name ?? "Someone";

function toBottom() {
  nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; });
}
// "Load earlier messages" adds rows above: keep the reading position instead of jumping to the bottom.
let earlierH = 0, earlierTop = 0;
function pressEarlier() {
  const el = scroller.value;
  if (el) { earlierH = el.scrollHeight; earlierTop = el.scrollTop; }
  void loadEarlier();
}
watch(() => [items.value.length, items.value[0]?.n.id, items.value[items.value.length - 1]?.n.id] as const,
  ([len, first, last], [oldLen, oldFirst, oldLast]) => {
    if (len > oldLen && first !== oldFirst && last === oldLast) {
      nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight - earlierH + earlierTop; });
    } else if (len !== oldLen) toBottom();
  });

// Realtime is the fast path; the sync on becoming active covers events missed while hidden.
const channel = supabase
  .channel(`receiver-inbox-${props.me.id}`)
  .on("postgres_changes",
    { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${props.me.id}` },
    (p) => {
      // Egress: merge the pushed row instead of refetching the whole history on every event.
      const n = p.new as Notification | undefined;
      if (!n || !("id" in n)) return;
      mergeShouts([n]);
      loadSenders([n]).catch((e) => console.error("Sender lookup failed", e)); // only if this sender is unknown
    });

// Refresh button: reload the shout history (KeepAlive: only while shown).
let offRefresh: (() => void) | null = null;
onActivated(() => { offRefresh = onRefresh(load); });
onDeactivated(() => offRefresh?.());

let offActive: (() => void) | undefined;
onMounted(() => {
  channel.subscribe((s) => { if (s === "SUBSCRIBED") loadQuietly(); });
  offActive = onActive(loadQuietly); // egress: no polling timer
});
onUnmounted(() => {
  offRefresh?.();
  offActive?.();
  supabase.removeChannel(channel);
});
</script>

<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
    <!-- Chat wallpaper -->
    <div ref="scroller" class="min-h-0 flex-1 space-y-1.5 overflow-auto bg-[#efeae2] px-4 py-3">
      <div v-if="canEarlier && items.length" class="flex justify-center pb-1">
        <button type="button" :disabled="loadingEarlier" @click="pressEarlier"
          class="rounded-full bg-white px-3 py-1 text-2xs font-medium text-slate-600 shadow-sm hover:bg-slate-100 disabled:opacity-50">
          {{ loadingEarlier ? "Loading…" : "Load earlier messages" }}
        </button>
      </div>
      <p v-if="!items.length" class="mx-auto mt-8 w-fit rounded-lg bg-amber-50 px-3 py-1.5 text-center text-xs text-slate-600 shadow-sm">
        No shouts yet. You'll see them here when someone reaches you.
      </p>
      <template v-for="{ n, sep } in items" :key="n.id">
        <div v-if="sep" class="flex justify-center py-1">
          <span class="rounded-lg bg-white/90 px-3 py-1 text-2xs font-medium uppercase text-slate-500 shadow-sm">{{ sep }}</span>
        </div>
        <div class="flex justify-start">
          <div class="relative max-w-[85%] rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 shadow-sm">
            <p class="text-xs font-semibold text-emerald-700">{{ nameOf(n.sender_id) }}</p>
            <MessageContent :text="n.message" text-class="text-sm text-slate-900" />
            <div class="mt-0.5 flex items-center justify-end gap-1 text-2xs text-slate-500">
              <template v-if="n.status === 'acknowledged'">
                <CheckCheck class="h-3.5 w-3.5 text-emerald-600" />
                <span class="text-emerald-700">Acknowledged</span>
              </template>
              <template v-else>
                <Clock class="h-3 w-3" />
                <span>Waiting for your reply</span>
              </template>
              <span class="ml-1">{{ time(n.created_at) }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="flex items-center justify-center gap-3 bg-slate-100 px-4 py-2.5 text-xs text-slate-500">
      <BuildFooter />
    </div>

    <!-- Floating online counter -->
    <div class="absolute bottom-12 right-3 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md">
      <span class="h-2 w-2 rounded-full bg-emerald-500" />
      {{ onlineIds.size }} online
    </div>
  </div>
</template>
