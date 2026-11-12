<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { supabase, type Notification, type Profile } from "../lib/supabase";
import UserAvatar from "../components/UserAvatar.vue";

const props = defineProps<{ me: Profile }>();

const queue = ref<{ n: Notification; sender: Profile | null }[]>([]);
const now = ref(Date.now());
const replyError = ref("");
// getCurrentWindow() only works inside the Tauri desktop app. In a plain browser
// (npm run dev) it's null and the window calls are skipped, so the modal still works.
const win = "__TAURI_INTERNALS__" in window ? getCurrentWindow() : null;

const current = computed(() => queue.value[0] ?? null);

async function enqueue(n: Notification) {
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

async function acknowledge() {
  const item = queue.value[0];
  if (!item) return;
  const { error } = await supabase.from("notifications").update({ status: "acknowledged" }).eq("id", item.n.id);
  if (error) {
    // Keep the shout on screen so the user can retry instead of silently losing the reply.
    console.error("Reply failed", error);
    replyError.value = `Couldn't send reply: ${error.message}`;
    return;
  }
  replyError.value = "";
  queue.value.shift();
  if (queue.value.length === 0 && win) {
    await win.setAlwaysOnTop(false);
    await win.hide(); // back to the system tray
  }
}

// Catch up on anything sent while the app was offline.
async function loadPending() {
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", props.me.id)
    .in("status", ["sent", "delivered"])
    .order("created_at");
  for (const n of (data ?? []) as Notification[]) await enqueue(n);
}

function ago(iso: string) {
  const s = Math.max(0, Math.round((now.value - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const channel = supabase.channel(`inbox-${props.me.id}`).on(
  "postgres_changes",
  { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${props.me.id}` },
  (p) => enqueue(p.new as Notification),
);

let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 30_000);
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") loadPending(); // also re-runs after reconnects
  });
});
onUnmounted(() => {
  clearInterval(clock);
  supabase.removeChannel(channel);
});
</script>

<template>
  <!-- Fills the alert window (no dimming overlay of the main app). -->
  <div v-if="current" class="flex h-screen w-screen flex-col overflow-hidden bg-[#efeae2] font-sans text-slate-900">
    <!-- Header: same bar style as the chat header, emerald for an incoming alert -->
    <header class="flex shrink-0 items-center justify-between bg-emerald-600 px-4 py-2.5 text-white">
      <span class="text-xs font-semibold uppercase tracking-wider">Incoming shout</span>
      <span class="flex items-center gap-2 text-[11px] text-emerald-100">
        <span v-if="queue.length > 1" class="rounded-full bg-white/20 px-2 py-0.5 font-semibold text-white">
          1 of {{ queue.length }}
        </span>
        {{ ago(current.n.created_at) }}
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
    <div class="flex min-h-0 flex-1 items-center px-4 py-3">
      <div class="relative w-full rounded-lg rounded-tl-none bg-white px-5 py-4 shadow-sm">
        <p class="line-clamp-4 whitespace-pre-wrap break-words text-lg font-medium leading-snug text-slate-900">
          {{ current.n.message }}
        </p>
      </div>
    </div>

    <!-- Actions -->
    <div class="shrink-0 space-y-2 bg-slate-100 px-4 py-3">
      <p v-if="queue.length > 1" class="text-center text-[11px] text-slate-500">
        {{ queue.length - 1 }} more waiting
      </p>
      <p v-if="replyError" class="text-center text-xs text-red-600">{{ replyError }}</p>
      <button class="w-full rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
        @click="acknowledge">Acknowledged</button>
    </div>
  </div>
</template>
