<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { supabase, type Notification, type NotifStatus, type Profile } from "../lib/supabase";
import { onlineIds } from "../lib/presence";
import UserAvatar from "../components/UserAvatar.vue";
import QuickShouts from "../components/QuickShouts.vue";
import ReceiptIcon from "../components/ReceiptIcon.vue";

const props = defineProps<{ me: Profile }>();

const people = ref<Profile[]>([]);
const groups = ref<{ id: string; name: string; members: string[] }[]>([]);
const query = ref("");
const groupFilter = ref("");
const selected = ref<Profile | null>(null);
const custom = ref("");
const toast = ref("");
// Latest delivery status of my most recent shout to each recipient (drives the ticks by names).
const statusByRecipient = ref<Record<string, NotifStatus>>({});

async function load() {
  const [p, g, n] = await Promise.all([
    supabase.from("profiles").select("*").neq("id", props.me.id).order("full_name"),
    supabase.from("groups").select("id, name, group_members(user_id)"),
    supabase
      .from("notifications")
      .select("recipient_id, status, created_at")
      .eq("sender_id", props.me.id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  people.value = (p.data ?? []) as Profile[];
  groups.value = (g.data ?? []).map((x: any) => ({
    id: x.id,
    name: x.name,
    members: x.group_members.map((m: any) => m.user_id),
  }));
  // Rows are newest-first, so the first row seen per recipient is the latest status.
  const map: Record<string, NotifStatus> = {};
  for (const row of (n.data ?? []) as Pick<Notification, "recipient_id" | "status">[]) {
    if (!(row.recipient_id in map)) map[row.recipient_id] = row.status;
  }
  statusByRecipient.value = map;
}

const filtered = computed(() => {
  const q = query.value.toLowerCase();
  const members = groups.value.find((g) => g.id === groupFilter.value)?.members;
  return people.value.filter(
    (u) =>
      (!q || u.full_name.toLowerCase().includes(q) || u.department.toLowerCase().includes(q)) &&
      (!members || members.includes(u.id)),
  );
});

const online = computed(() => filtered.value.filter((u) => onlineIds.value.has(u.id)));
const offline = computed(() => filtered.value.filter((u) => !onlineIds.value.has(u.id)));
const selectedOnline = computed(() => !!selected.value && onlineIds.value.has(selected.value.id));

// Group targeting: with a group chosen (and no single person picked), a shout goes to every member.
const group = computed(() => groups.value.find((g) => g.id === groupFilter.value) ?? null);
const groupTargets = computed(() =>
  group.value ? people.value.filter((u) => group.value!.members.includes(u.id)) : [],
);
const groupOnlineCount = computed(() => groupTargets.value.filter((u) => onlineIds.value.has(u.id)).length);
const targets = computed<Profile[]>(() => (selected.value ? [selected.value] : groupTargets.value));
// Shouts only go to people who are online right now.
const sendable = computed(() => targets.value.filter((u) => onlineIds.value.has(u.id)));
const canSend = computed(() => sendable.value.length > 0);

async function send(message: string) {
  const list = sendable.value;
  if (!list.length) {
    showToast("No one is online to receive this shout.");
    return;
  }
  if (!message.trim()) return;
  // Without a valid session the insert goes out as anonymous and RLS rejects it.
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) {
    showToast("Your session has expired. Please sign out and sign in again.");
    return;
  }
  const { error } = await supabase.from("notifications").insert(
    list.map((u) => ({ sender_id: props.me.id, recipient_id: u.id, message: message.trim() })),
  );
  const hint = error?.code === "42501" ? " (session expired? sign out and back in)" : "";
  if (error) {
    showToast(`Failed: ${error.message}${hint}`);
    return;
  }
  for (const u of list) statusByRecipient.value[u.id] = "sent";
  if (list.length > 1) showToast(`Sent to ${list.length} people in ${group.value?.name ?? "group"}`);
  custom.value = "";
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(t: string) {
  toast.value = t;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 4000);
}

// Live status updates for notifications I sent. Delivery and "on my way" show as ticks only;
// acknowledgements also get a short toast.
const channel = supabase
  .channel(`sent-${props.me.id}`)
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "notifications", filter: `sender_id=eq.${props.me.id}` },
    (payload) => {
      const n = payload.new as Notification;
      statusByRecipient.value[n.recipient_id] = n.status;
      if (n.status === "acknowledged") {
        const name = people.value.find((p) => p.id === n.recipient_id)?.full_name ?? "Recipient";
        showToast(`${name} acknowledged your shout`);
      }
    },
  );

onMounted(() => {
  load();
  channel.subscribe();
});
onUnmounted(() => {
  clearTimeout(toastTimer);
  supabase.removeChannel(channel);
});
</script>

<template>
  <!-- One compact card, centered in the window: people list on the left, compose on the right. -->
  <div class="grid h-[460px] w-[720px] grid-cols-5 bg-white">
    <!-- People -->
    <section class="col-span-2 flex min-h-0 flex-col border-r border-slate-100">
      <div class="space-y-2 border-b border-slate-100 p-4">
        <input v-model="query" placeholder="Search name or department"
          class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
        <select v-model="groupFilter"
          class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none">
          <option value="">Everyone</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </div>

      <div class="min-h-0 flex-1 overflow-auto p-2">
        <p class="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Online · {{ online.length }}
        </p>
        <button v-for="u in online" :key="u.id" class="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
          :class="selected?.id === u.id ? 'bg-blue-50 hover:bg-blue-50' : ''" @click="selected = u">
          <UserAvatar :user="u"><span class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500" /></UserAvatar>
          <span class="min-w-0 flex-1 text-left">
            <span class="flex items-center gap-1.5">
              <span class="truncate font-medium">{{ u.full_name }}</span>
              <ReceiptIcon :status="statusByRecipient[u.id]" />
            </span>
            <span class="block truncate text-xs text-slate-500">{{ u.department }}</span>
          </span>
        </button>

        <p class="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Offline · {{ offline.length }}
        </p>
        <button v-for="u in offline" :key="u.id" class="flex w-full items-center gap-3 rounded-lg px-2 py-2 opacity-70 hover:bg-slate-50"
          :class="selected?.id === u.id ? 'bg-blue-50 hover:bg-blue-50' : ''" @click="selected = u">
          <UserAvatar :user="u"><span class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-slate-300" /></UserAvatar>
          <span class="min-w-0 flex-1 text-left">
            <span class="flex items-center gap-1.5">
              <span class="truncate font-medium">{{ u.full_name }}</span>
              <ReceiptIcon :status="statusByRecipient[u.id]" />
            </span>
            <span class="block truncate text-xs text-slate-500">{{ u.department }}</span>
          </span>
        </button>
      </div>
    </section>

    <!-- Compose -->
    <section class="col-span-3 flex min-h-0 flex-col overflow-auto p-5">
      <template v-if="targets.length">
        <div class="mb-5 flex items-center gap-3">
          <UserAvatar v-if="selected" :user="selected" size-class="h-12 w-12" />
          <span v-else class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-700">{{ group?.name?.[0]?.toUpperCase() }}</span>
          <div>
            <h2 class="text-lg font-semibold">{{ selected ? selected.full_name : group?.name }}</h2>
            <p v-if="selected" class="flex items-center gap-1.5 text-sm"
              :class="selectedOnline ? 'text-green-600' : 'text-slate-400'">
              <span class="h-2 w-2 rounded-full" :class="selectedOnline ? 'bg-green-500' : 'bg-slate-300'" />
              {{ selectedOnline ? "Online" : "Offline. Shouts can only be sent to people who are online." }}
            </p>
            <p v-else class="text-sm text-slate-500">
              Group · {{ groupOnlineCount }} of {{ groupTargets.length }} online. Only online members receive the shout.
            </p>
          </div>
        </div>

        <QuickShouts :me="me" :disabled="!canSend" @send="send" @error="showToast" />

        <p class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">Custom message</p>
        <form class="flex gap-2" @submit.prevent="canSend && send(custom)">
          <input v-model="custom" maxlength="500" placeholder="Type a message…"
            class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
          <button :disabled="!custom.trim() || !canSend"
            class="rounded-lg bg-blue-600 px-5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
            Send
          </button>
        </form>
      </template>
      <div v-else class="m-auto text-center text-slate-400">
        <p class="text-base">Pick someone on the left, or choose a group to shout at all its members.</p>
      </div>
    </section>

    <div v-if="toast" class="fixed bottom-5 right-5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
      {{ toast }}
    </div>
  </div>
</template>
