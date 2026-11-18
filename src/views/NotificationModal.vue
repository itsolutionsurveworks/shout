<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { supabase, type Notification, type Profile } from "../lib/supabase";
import UserAvatar from "../components/UserAvatar.vue";
import MessageContent from "../components/MessageContent.vue";
import { SHOUT_MAX } from "../lib/limits";

const props = defineProps<{ me: Profile }>();

const queue = ref<{ n: Notification; sender: Profile | null }[]>([]);
const now = ref(Date.now());
const replyError = ref("");
// getCurrentWindow() only works inside the Tauri desktop app. In a plain browser
// (npm run dev) it's null and the window calls are skipped, so the modal still works.
const win = "__TAURI_INTERNALS__" in window ? getCurrentWindow() : null;

const current = computed(() => queue.value[0] ?? null);

// The popup has a fixed width but its height follows the content (text length, GIF size),
// so the alert window is resized to fit whatever is showing.
const ALERT_WIDTH = 460;
const root = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;
async function fitWindow() {
  if (!win || !root.value) return;
  // Round up so sub-pixel layout never leaves the window a pixel short (which shows a scrollbar).
  const height = Math.min(Math.ceil(root.value.getBoundingClientRect().height), window.screen.availHeight - 80);
  await win.setSize(new LogicalSize(ALERT_WIDTH, height));
}
// Re-measure whenever the content changes size (new shout, GIF finishing loading, reply box opening).
watch(root, (el) => {
  ro?.disconnect();
  if (!el) return;
  ro = new ResizeObserver(() => { fitWindow().catch((e) => console.error("Resize failed", e)); });
  ro.observe(el);
});
// Bring a new shout to the middle of the screen, since its height may differ from the last one.
watch(() => current.value?.n.id, async () => {
  await nextTick();
  if (win) await win.center();
});
// The alert window is sized to its content, so the page itself must never scroll.
if (win) {
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}
onUnmounted(() => {
  ro?.disconnect();
  if (win) {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
  }
});

// Every shout id shown or queued so far. Realtime and the catch-up poll can both deliver the
// same shout, so this makes sure one shout never opens twice (and never gets lost by a race).
const seen = new Set<string>();

async function enqueue(n: Notification) {
  if (seen.has(n.id)) return;
  seen.add(n.id);
  const { data } = await supabase.from("profiles").select("*").eq("id", n.sender_id).single();
  queue.value.push({ n, sender: data as Profile | null });
  await supabase.from("notifications").update({ status: "delivered" }).eq("id", n.id);
  if (win) {
    await win.show();
    await win.unminimize();
    await win.setAlwaysOnTop(true);
    await win.setFocus();
  }
  new Audio("/chime.mp3").play().catch(() => {});
}

const replying = ref(false);
const replyText = ref("");

// Acknowledge the current shout; with `reply`, also send that text back to its sender.
async function acknowledge(reply?: string) {
  const item = queue.value[0];
  if (!item) return;
  if (reply) {
    const { error: e } = await supabase.from("notifications")
      .insert({ sender_id: props.me.id, recipient_id: item.n.sender_id, message: reply, batch_id: crypto.randomUUID(), group_id: null });
    if (e) {
      replyError.value = e.message.includes("Spam Detected") ? "Spam Detected, wait a few seconds." : `Couldn't send reply: ${e.message}`;
      return;
    }
  }
  const { error } = await supabase.from("notifications").update({ status: "acknowledged" }).eq("id", item.n.id);
  if (error) {
    // Keep the shout on screen so the user can retry instead of silently losing the reply.
    console.error("Reply failed", error);
    replyError.value = `Couldn't send reply: ${error.message}`;
    return;
  }
  replyError.value = "";
  replying.value = false;
  replyText.value = "";
  queue.value.shift();
  if (queue.value.length === 0 && win) {
    await win.setAlwaysOnTop(false);
    await win.hide(); // back to the system tray
  }
}

// While a shout is unacknowledged, re-raise the popup every REPOP_MS so it can't stay
// buried under other windows. Stops as soon as the queue is empty.
const REPOP_MS = 5_000;
let repop: ReturnType<typeof setInterval> | undefined;

async function raiseWindow() {
  if (!win) return;
  await win.show();
  await win.unminimize();
  await win.setAlwaysOnTop(true);
  await win.setFocus();
}

function startRepop() {
  if (repop || !win) return;
  repop = setInterval(() => {
    if (queue.value.length === 0) return stopRepop();
    raiseWindow().catch((e) => console.error("Re-pop failed", e));
  }, REPOP_MS);
}

function stopRepop() {
  clearInterval(repop);
  repop = undefined;
}

watch(() => queue.value.length, (len) => (len > 0 ? startRepop() : stopRepop()));

// Pull every shout still waiting for this user. Runs on connect, after every reconnect, and on a
// timer, so a shout is never missed even if the realtime socket dropped (the alert window is
// often hidden, and Windows throttles hidden webviews).
async function loadPending() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", props.me.id)
    .in("status", ["sent", "delivered"])
    .order("created_at");
  if (error) return console.error("Could not load pending shouts", error);
  for (const n of (data ?? []) as Notification[]) await enqueue(n);
}

const CATCH_UP_MS = 5_000;
let catchUp: ReturnType<typeof setInterval> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;
let stopped = false;

function ago(iso: string) {
  const s = Math.max(0, Math.round((now.value - Date.parse(iso)) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} sec ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Live inbox. If the socket errors or closes, it is rebuilt after a short delay.
let channel: ReturnType<typeof supabase.channel> | null = null;
function connect() {
  if (stopped) return;
  channel = supabase.channel(`inbox-${props.me.id}`).on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${props.me.id}` },
    (p) => enqueue(p.new as Notification),
  );
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") return loadPending(); // also re-runs after reconnects
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      const dead = channel;
      channel = null;
      if (dead) supabase.removeChannel(dead);
      clearTimeout(retry);
      retry = setTimeout(connect, 3_000);
    }
  });
}

let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 5_000);
  connect();
  catchUp = setInterval(() => loadPending().catch((e) => console.error("Catch-up failed", e)), CATCH_UP_MS);
});
onUnmounted(() => {
  stopped = true;
  clearInterval(clock);
  clearInterval(catchUp);
  clearTimeout(retry);
  stopRepop();
  if (channel) supabase.removeChannel(channel);
});
</script>

<template>
  <!-- Fills the alert window (no dimming overlay of the main app). -->
  <div v-if="current" ref="root" class="flex w-[460px] flex-col overflow-hidden rounded-2xl bg-[#efeae2] font-sans text-slate-900">
    <!-- Header: same bar style as the chat header, emerald for an incoming alert -->
    <header class="flex shrink-0 items-center justify-between bg-emerald-600 px-4 py-2.5 text-white">
      <span class="text-xs font-semibold uppercase tracking-wider">Incoming shout</span>
      <span class="flex items-center gap-2 text-2xs text-emerald-100">
        {{ ago(current.n.created_at) }}
        <span v-if="queue.length > 1" class="rounded-full bg-white/20 px-2 py-0.5 font-semibold text-white">
          1 of {{ queue.length }}
        </span>
      </span>
    </header>

    <!-- Sender -->
    <div class="flex shrink-0 items-center gap-3 bg-slate-100 px-4 py-3">
      <UserAvatar :user="current.sender ?? {}" size-class="h-11 w-11" />
      <div class="min-w-0">
        <h2 class="truncate font-medium leading-tight">{{ current.sender?.full_name ?? "Someone" }}</h2>
        <p class="truncate text-xs text-slate-500">{{ current.sender?.department }}</p>
      </div>
    </div>

    <!-- Message: an incoming bubble on the chat wallpaper -->
    <div class="flex items-center px-4 py-3">
      <div class="relative w-full rounded-lg bg-white px-5 py-4 shadow-sm">
        <!-- No height cap on GIFs: the window grows to fit the full-size image. -->
        <MessageContent :text="current.n.message" img-class="mx-auto block max-w-full" :zoomable="false"
          text-class="font-medium leading-snug text-slate-900" />
      </div>
    </div>

    <!-- Actions -->
    <div class="shrink-0 space-y-2 bg-slate-100 px-4 py-3">
      <p v-if="queue.length > 1" class="text-center text-2xs text-slate-500">
        {{ queue.length - 1 }} more waiting
      </p>
      <p v-if="replyError" class="text-center text-xs text-red-600">{{ replyError }}</p>
      <form v-if="replying" class="flex items-center gap-2" @submit.prevent="replyText.trim() && acknowledge(replyText.trim())">
        <div class="relative flex-1">
          <input v-model="replyText" :maxlength="SHOUT_MAX" placeholder="Type a reply" autofocus
            class="w-full rounded-lg bg-white py-2 pl-3 pr-14 text-sm focus:outline-none" />
          <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-2xs tabular-nums"
            :class="replyText.length >= SHOUT_MAX ? 'font-semibold text-red-600' : 'text-slate-500'">
            {{ replyText.length }}/{{ SHOUT_MAX }}
          </span>
        </div>
        <button type="button" class="rounded-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-200" @click="replying = false">Cancel</button>
        <button :disabled="!replyText.trim()" class="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Send</button>
      </form>
      <div v-else class="flex gap-2">
        <button class="flex-1 rounded-full bg-white py-2.5 text-sm font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-600 transition hover:bg-emerald-50 active:scale-[0.98]"
          @click="replying = true">Reply</button>
        <button class="flex-1 rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
          @click="acknowledge()">Acknowledged</button>
      </div>
    </div>
  </div>
</template>
