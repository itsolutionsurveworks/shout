<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { supabase, type Notification, type Profile } from "../lib/supabase";

const props = defineProps<{ me: Profile }>();

const queue = ref<{ n: Notification; sender: Profile | null }[]>([]);
const win = getCurrentWindow();

async function enqueue(n: Notification) {
  const { data } = await supabase.from("profiles").select("*").eq("id", n.sender_id).single();
  queue.value.push({ n, sender: data as Profile | null });
  await supabase.from("notifications").update({ status: "delivered" }).eq("id", n.id);
  await win.show();
  await win.unminimize();
  await win.setAlwaysOnTop(true);
  await win.setFocus();
  new Audio("/chime.mp3").play().catch(() => {});
}

async function acknowledge() {
  const current = queue.value.shift();
  if (!current) return;
  await supabase.from("notifications").update({ status: "acknowledged" }).eq("id", current.n.id);
  if (queue.value.length === 0) {
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

const channel = supabase.channel(`inbox-${props.me.id}`).on(
  "postgres_changes",
  { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${props.me.id}` },
  (p) => enqueue(p.new as Notification),
);

onMounted(() => {
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") loadPending(); // also re-runs after reconnects
  });
});
onUnmounted(() => supabase.removeChannel(channel));
</script>

<template>
  <div v-if="queue.length" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
    <div class="w-[28rem] rounded-xl bg-white p-8 text-center shadow-2xl">
      <img v-if="queue[0].sender?.avatar_url" :src="queue[0].sender.avatar_url"
        class="mx-auto mb-3 h-20 w-20 rounded-full object-cover" />
      <div v-else class="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-3xl text-blue-700">
        {{ queue[0].sender?.full_name?.[0] ?? "?" }}
      </div>
      <h2 class="text-xl font-semibold">{{ queue[0].sender?.full_name ?? "Someone" }}</h2>
      <p class="text-sm text-slate-500">{{ queue[0].sender?.department }}</p>
      <p class="my-6 text-2xl">{{ queue[0].n.message }}</p>
      <p v-if="queue.length > 1" class="mb-2 text-xs text-slate-500">+{{ queue.length - 1 }} more waiting</p>
      <button class="w-full rounded-lg bg-green-600 py-4 text-lg font-semibold text-white hover:bg-green-700"
        @click="acknowledge">Acknowledged / On My Way</button>
    </div>
  </div>
</template>
