<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { CheckCheck, Clock } from "lucide-vue-next";
import { supabase, type Notification, type Profile } from "../lib/supabase";
import { onlineIds } from "../lib/presence";
import { dayLabel } from "../lib/thread";

// Receiver's home: the same chat look as the sender, but showing only incoming shouts.
// Shouts still pop up in their own alert window; this is the history behind it.
const props = defineProps<{ me: Profile }>();

const shouts = ref<Notification[]>([]);
const senders = ref<Record<string, Profile>>({});
const scroller = ref<HTMLElement | null>(null);

async function load() {
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", props.me.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const list = (data ?? []) as Notification[];
  shouts.value = list;

  const missing = [...new Set(list.map((n) => n.sender_id))].filter((id) => !senders.value[id]);
  if (missing.length) {
    const { data: people } = await supabase.from("profiles").select("*").in("id", missing);
    for (const p of (people ?? []) as Profile[]) senders.value[p.id] = p;
  }
}

// Oldest first, with a day separator whenever the day changes (like the sender's thread).
const items = computed(() => {
  let last = "";
  return [...shouts.value].reverse().map((n) => {
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
watch(() => items.value.length, toBottom);

// Realtime is the fast path; the refetch on focus and on a timer covers dropped events.
const channel = supabase
  .channel(`receiver-inbox-${props.me.id}`)
  .on("postgres_changes",
    { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${props.me.id}` },
    () => load());

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  channel.subscribe((s) => { if (s === "SUBSCRIBED") load(); });
  timer = setInterval(load, 8000);
  window.addEventListener("focus", load);
});
onUnmounted(() => {
  clearInterval(timer);
  window.removeEventListener("focus", load);
  supabase.removeChannel(channel);
});
</script>

<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">
    <!-- Chat wallpaper -->
    <div ref="scroller" class="min-h-0 flex-1 space-y-1.5 overflow-auto bg-[#efeae2] px-4 py-3">
      <p v-if="!items.length" class="mx-auto mt-8 w-fit rounded-lg bg-amber-50 px-3 py-1.5 text-center text-xs text-slate-600 shadow-sm">
        No shouts yet. You'll see them here when someone reaches you.
      </p>
      <template v-for="{ n, sep } in items" :key="n.id">
        <div v-if="sep" class="flex justify-center py-1">
          <span class="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-medium uppercase text-slate-500 shadow-sm">{{ sep }}</span>
        </div>
        <div class="flex justify-start">
          <div class="relative max-w-[85%] rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 shadow-sm">
            <p class="text-xs font-semibold text-emerald-700">{{ nameOf(n.sender_id) }}</p>
            <p class="whitespace-pre-wrap break-words text-sm text-slate-900">{{ n.message }}</p>
            <div class="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
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

    <div class="bg-slate-100 px-4 py-2.5 text-xs text-slate-500">
      <span class="inline-flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-emerald-500" />
        New shouts pop up on your screen automatically.
      </span>
    </div>

    <!-- Floating online counter -->
    <div class="absolute bottom-12 right-7 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md">
      <span class="h-2 w-2 rounded-full bg-emerald-500" />
      {{ onlineIds.size }} online
    </div>
  </div>
</template>
