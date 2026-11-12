<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { supabase, type Notification, type NotifStatus, type Profile } from "../lib/supabase";
import UserAvatar from "../components/UserAvatar.vue";

const props = defineProps<{ me: Profile }>();

const queue = ref<{ n: Notification; sender: Profile | null }[]>([]);
const now = ref(Date.now());
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

async function respond(status: NotifStatus) {
  const item = queue.value.shift();
  if (!item) return;
  await supabase.from("notifications").update({ status }).eq("id", item.n.id);
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
  <div v-if="current" class="flex h-screen w-screen flex-col overflow-hidden bg-white font-sans">
    <!-- Header band -->
    <div class="relative flex h-24 shrink-0 items-start justify-between bg-gradient-to-br from-blue-600 to-indigo-600 px-5 pt-4 text-white">
      <span class="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Incoming shout</span>
      <span class="flex items-center gap-2 text-[11px] text-blue-100">
        <span v-if="queue.length > 1" class="rounded-full bg-white/20 px-2 py-0.5 font-semibold text-white">
          1 of {{ queue.length }}
        </span>
        {{ ago(current.n.created_at) }}
      </span>
    </div>

    <!-- Sender -->
    <div class="-mt-10 flex flex-col items-center px-6 text-center">
      <div class="rounded-full bg-white p-1 shadow-md">
        <UserAvatar :user="current.sender ?? {}" size-class="h-16 w-16" />
      </div>
      <h2 class="mt-2 text-lg font-semibold leading-tight text-slate-900">
        {{ current.sender?.full_name ?? "Someone" }}
      </h2>
      <p class="text-xs text-slate-500">{{ current.sender?.department }}</p>
    </div>

    <!-- Message -->
    <div class="flex min-h-0 flex-1 items-center justify-center px-6 py-3">
      <div class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
        <p class="line-clamp-4 break-words text-center text-xl font-semibold leading-snug text-slate-900">
          {{ current.n.message }}
        </p>
      </div>
    </div>

    <!-- Actions -->
    <div class="px-6 pb-5">
      <p v-if="queue.length > 1" class="mb-2 text-center text-[11px] text-slate-400">
        {{ queue.length - 1 }} more waiting
      </p>
      <div class="grid grid-cols-2 gap-3">
        <button class="rounded-xl bg-green-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 active:scale-[0.98]"
          @click="respond('acknowledged')">Acknowledged</button>
        <button class="rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
          @click="respond('on_my_way')">On My Way</button>
      </div>
    </div>
  </div>
</template>
