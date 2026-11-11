<script setup lang="ts">
import { onMounted, ref } from "vue";
import { supabase, type Profile, type Role } from "../lib/supabase";

const users = ref<Profile[]>([]);
const groups = ref<{ id: string; name: string; members: string[] }[]>([]);
const logs = ref<any[]>([]);
const newGroup = ref("");
const err = ref("");

async function load() {
  const [u, g, l] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("groups").select("id, name, group_members(user_id)").order("name"),
    supabase
      .from("notifications")
      .select("id, message, status, created_at, acknowledged_at, sender:sender_id(full_name), recipient:recipient_id(full_name)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  users.value = (u.data ?? []) as Profile[];
  groups.value = (g.data ?? []).map((x: any) => ({
    id: x.id, name: x.name, members: x.group_members.map((m: any) => m.user_id),
  }));
  logs.value = l.data ?? [];
}

async function updateUser(u: Profile, patch: Partial<{ role: Role; department: string }>) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", u.id);
  err.value = error?.message ?? "";
  load();
}

async function addGroup() {
  if (!newGroup.value.trim()) return;
  const { error } = await supabase.from("groups").insert({ name: newGroup.value.trim() });
  err.value = error?.message ?? "";
  newGroup.value = "";
  load();
}

async function toggleMember(groupId: string, userId: string, isMember: boolean) {
  const q = supabase.from("group_members");
  const { error } = isMember
    ? await q.delete().match({ group_id: groupId, user_id: userId })
    : await q.insert({ group_id: groupId, user_id: userId });
  err.value = error?.message ?? "";
  load();
}

function latency(n: any) {
  if (!n.acknowledged_at) return "—";
  const s = (Date.parse(n.acknowledged_at) - Date.parse(n.created_at)) / 1000;
  return s < 60 ? `${s.toFixed(0)}s` : `${(s / 60).toFixed(1)}m`;
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-8">
    <p v-if="err" class="text-red-600">{{ err }}</p>
    <p class="text-sm text-slate-500">
      New accounts are created in the Supabase dashboard (Auth → Users). Set
      <code>full_name</code> and <code>department</code> in user metadata; a profile is created automatically.
    </p>

    <section>
      <h2 class="mb-2 font-semibold">Users</h2>
      <table class="w-full bg-white text-sm">
        <thead><tr class="border-b text-left"><th class="p-2">Name</th><th>Email</th><th>Department</th><th>Role</th></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" class="border-b">
            <td class="p-2">{{ u.full_name }}</td>
            <td>{{ u.email }}</td>
            <td><input :value="u.department" class="rounded border px-2 py-1"
              @change="updateUser(u, { department: ($event.target as HTMLInputElement).value })" /></td>
            <td>
              <select :value="u.role" class="rounded border px-2 py-1"
                @change="updateUser(u, { role: ($event.target as HTMLSelectElement).value as Role })">
                <option>admin</option><option>sender</option><option>receiver</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2 class="mb-2 font-semibold">Groups</h2>
      <form class="mb-3 flex gap-2" @submit.prevent="addGroup">
        <input v-model="newGroup" placeholder="New group (e.g. Floor 2)" class="rounded border px-3 py-1" />
        <button class="rounded bg-blue-600 px-3 text-white">Add</button>
      </form>
      <details v-for="g in groups" :key="g.id" class="mb-2 rounded border bg-white p-2">
        <summary class="cursor-pointer">{{ g.name }} ({{ g.members.length }})</summary>
        <div class="mt-2 grid grid-cols-3 gap-1 text-sm">
          <label v-for="u in users" :key="u.id" class="flex items-center gap-2">
            <input type="checkbox" :checked="g.members.includes(u.id)"
              @change="toggleMember(g.id, u.id, g.members.includes(u.id))" />
            {{ u.full_name }}
          </label>
        </div>
      </details>
    </section>

    <section>
      <h2 class="mb-2 font-semibold">Audit log</h2>
      <table class="w-full bg-white text-sm">
        <thead><tr class="border-b text-left"><th class="p-2">Time</th><th>From</th><th>To</th><th>Message</th><th>Status</th><th>Ack latency</th></tr></thead>
        <tbody>
          <tr v-for="n in logs" :key="n.id" class="border-b">
            <td class="p-2">{{ new Date(n.created_at).toLocaleString() }}</td>
            <td>{{ n.sender?.full_name }}</td>
            <td>{{ n.recipient?.full_name }}</td>
            <td>{{ n.message }}</td>
            <td>{{ n.status }}</td>
            <td>{{ latency(n) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
