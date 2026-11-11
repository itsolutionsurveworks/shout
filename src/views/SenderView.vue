<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { supabase, type Notification, type Profile } from "../lib/supabase";

const props = defineProps<{ me: Profile }>();

const people = ref<Profile[]>([]);
const groups = ref<{ id: string; name: string; members: string[] }[]>([]);
const query = ref("");
const groupFilter = ref("");
const selected = ref<Profile | null>(null);
const custom = ref("");
const toast = ref("");
const presets = ["Please come to Office 3", "Call Ext. 102", "Please come to my desk"];

async function load() {
  const [p, g] = await Promise.all([
    supabase.from("profiles").select("*").neq("id", props.me.id).order("full_name"),
    supabase.from("groups").select("id, name, group_members(user_id)"),
  ]);
  people.value = (p.data ?? []) as Profile[];
  groups.value = (g.data ?? []).map((x: any) => ({
    id: x.id,
    name: x.name,
    members: x.group_members.map((m: any) => m.user_id),
  }));
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

async function send(message: string) {
  if (!selected.value || !message.trim()) return;
  const { error } = await supabase.from("notifications").insert({
    sender_id: props.me.id,
    recipient_id: selected.value.id,
    message: message.trim(),
  });
  showToast(error ? `Failed: ${error.message}` : `Sent to ${selected.value.full_name}`);
  if (!error) custom.value = "";
}

function showToast(t: string) {
  toast.value = t;
  setTimeout(() => (toast.value = ""), 4000);
}

// Delivery feedback: updates to notifications I sent.
const channel = supabase
  .channel(`sent-${props.me.id}`)
  .on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "notifications", filter: `sender_id=eq.${props.me.id}` },
    (payload) => {
      const n = payload.new as Notification;
      const name = people.value.find((p) => p.id === n.recipient_id)?.full_name ?? "Recipient";
      if (n.status === "delivered") showToast(`Delivered to ${name}`);
      if (n.status === "acknowledged") showToast(`${name} acknowledged: on their way`);
    },
  );

onMounted(() => {
  load();
  channel.subscribe();
});
onUnmounted(() => supabase.removeChannel(channel));
</script>

<template>
  <div class="mx-auto grid max-w-4xl grid-cols-2 gap-4">
    <section>
      <div class="mb-2 flex gap-2">
        <input v-model="query" placeholder="Search name or department"
          class="flex-1 rounded border px-3 py-2" />
        <select v-model="groupFilter" class="rounded border px-2">
          <option value="">All groups</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </div>
      <ul class="max-h-[75vh] divide-y overflow-auto rounded border bg-white">
        <li v-for="u in filtered" :key="u.id"
          class="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-blue-50"
          :class="selected?.id === u.id && 'bg-blue-100'" @click="selected = u">
          <span>{{ u.full_name }}<small class="ml-2 text-slate-500">{{ u.department }}</small></span>
          <span class="h-2 w-2 rounded-full" :class="u.is_online ? 'bg-green-500' : 'bg-slate-300'" />
        </li>
      </ul>
    </section>

    <section class="space-y-2">
      <h2 class="font-medium">{{ selected ? `To: ${selected.full_name}` : "Select someone" }}</h2>
      <button v-for="p in presets" :key="p" :disabled="!selected"
        class="block w-full rounded border bg-white px-3 py-2 text-left hover:bg-blue-50 disabled:opacity-40"
        @click="send(p)">{{ p }}</button>
      <form class="flex gap-2" @submit.prevent="send(custom)">
        <input v-model="custom" maxlength="500" placeholder="Custom message"
          class="flex-1 rounded border px-3 py-2" />
        <button :disabled="!selected" class="rounded bg-blue-600 px-4 text-white disabled:opacity-40">
          Send
        </button>
      </form>
    </section>

    <div v-if="toast" class="fixed bottom-4 right-4 rounded bg-slate-900 px-4 py-2 text-white shadow">
      {{ toast }}
    </div>
  </div>
</template>
