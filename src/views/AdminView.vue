<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from "vue";
import { ChevronDown, ChevronLeft, ChevronRight, Code, Plus, ScrollText, Search, UserRound, UsersRound } from "lucide-vue-next";
import { supabase, type HeaderMessage, type Profile, type Role } from "../lib/supabase";
import DevPanel from "../components/DevPanel.vue";
import { onlineIds } from "../lib/presence";
import { onRefresh } from "../lib/refresh";
import { chatTime } from "../lib/thread";
import { receiptLabel, receiptOf } from "../lib/receipts";
import ReceiptIcon from "../components/ReceiptIcon.vue";
import UserAvatar from "../components/UserAvatar.vue";
import ScrollHint from "../components/ScrollHint.vue";

// isDev: the signed-in user has the developer role, so the Dev section is listed.
const props = defineProps<{ isDev: boolean; headerMessage: HeaderMessage | null }>();
const emit = defineEmits<{ headerSaved: [value: HeaderMessage] }>();

const users = ref<Profile[]>([]);
const groups = ref<{ id: string; name: string; members: string[] }[]>([]);
const logs = ref<any[]>([]);
const newGroup = ref("");
const err = ref("");
const selectedGroupId = ref<string | null>(null);
const memberQuery = ref("");

// Same frame as the People tab: a list on the left, the selected section on the right.
const section = ref<"users" | "groups" | "audit" | "dev">("users");
const query = ref("");

// Status column filter: the column header is the dropdown trigger.
type StatusFilter = "all" | "online" | "offline";
const statusFilter = ref<StatusFilter>("all");
const statusOptions: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "offline", label: "Offline" },
];
const statusMenuOpen = ref(false);
const statusMenu = ref<HTMLElement | null>(null);
function pickStatus(key: StatusFilter) {
  statusFilter.value = key;
  statusMenuOpen.value = false;
}
function closeStatusMenuOnOutside(e: PointerEvent) {
  if (statusMenuOpen.value && !statusMenu.value?.contains(e.target as Node)) statusMenuOpen.value = false;
}

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
  if (!groups.value.some((g) => g.id === selectedGroupId.value)) {
    selectedGroupId.value = groups.value[0]?.id ?? null;
  }
}

async function updateUser(u: Profile, patch: Partial<{ full_name: string; role: Role; department: string }>) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", u.id);
  err.value = error?.message ?? "";
  load();
}

// Admin renames a user; empty names are ignored and the field snaps back to the stored value.
function renameUser(u: Profile, e: Event) {
  const input = e.target as HTMLInputElement;
  const name = input.value.trim();
  if (!name || name === u.full_name) {
    input.value = u.full_name;
    return;
  }
  updateUser(u, { full_name: name });
}

async function addGroup() {
  if (!newGroup.value.trim()) return;
  const { error } = await supabase.from("groups").insert({ name: newGroup.value.trim() });
  err.value = error?.message ?? "";
  newGroup.value = "";
  load();
}

// Bulk add/remove in one request, used by "Select all" for the currently filtered people.
async function setMembers(groupId: string, userIds: string[], add: boolean) {
  if (!userIds.length) return;
  const q = supabase.from("group_members");
  const { error } = add
    ? await q.insert(userIds.map((user_id) => ({ group_id: groupId, user_id })))
    : await q.delete().eq("group_id", groupId).in("user_id", userIds);
  err.value = error?.message ?? "";
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


const q = computed(() => query.value.trim().toLowerCase());
const shownUsers = computed(() =>
  users.value.filter((u) => {
    if (statusFilter.value === "online" && !onlineIds.value.has(u.id)) return false;
    if (statusFilter.value === "offline" && onlineIds.value.has(u.id)) return false;
    return !q.value || u.full_name.toLowerCase().includes(q.value) || u.email.toLowerCase().includes(q.value) || (u.department ?? "").toLowerCase().includes(q.value);
  }));
const shownGroups = computed(() => groups.value.filter((g) => !q.value || g.name.toLowerCase().includes(q.value)));
const selectedGroup = computed(() => groups.value.find((g) => g.id === selectedGroupId.value) ?? null);
const allShownSelected = computed(() => {
  const g = selectedGroup.value;
  return !!g && groupPeople.value.length > 0 && groupPeople.value.every((u) => g.members.includes(u.id));
});
// Acts only on the people currently visible after filtering.
function toggleAllShown() {
  const g = selectedGroup.value;
  if (!g) return;
  const ids = groupPeople.value.map((u) => u.id);
  if (allShownSelected.value) setMembers(g.id, ids, false);
  else setMembers(g.id, ids.filter((id) => !g.members.includes(id)), true);
}
// Members float to the top of the list, but the order is frozen while the list is in use.
// It is re-captured only when the view is shown again or another group is picked.
const memberOrder = ref<string[]>([]);
function snapshotMemberOrder() {
  const g = selectedGroup.value;
  memberOrder.value = users.value
    .slice()
    .sort((a, b) => Number(g?.members.includes(b.id) ?? 0) - Number(g?.members.includes(a.id) ?? 0)
      || a.full_name.localeCompare(b.full_name))
    .map((u) => u.id);
}
const rank = (id: string) => {
  const i = memberOrder.value.indexOf(id);
  return i === -1 ? Infinity : i;
};
const groupPeople = computed(() => {
  const mq = memberQuery.value.trim().toLowerCase();
  return users.value
    .filter((u) => !mq || u.full_name.toLowerCase().includes(mq) || (u.department ?? "").toLowerCase().includes(mq))
    .slice()
    .sort((a, b) => {
      const ra = rank(a.id), rb = rank(b.id);
      if (ra !== rb) return ra < rb ? -1 : 1;
      return a.full_name.localeCompare(b.full_name);
    });
});
const shownLogs = computed(() =>
  logs.value.filter((n) => !q.value || (n.message ?? "").toLowerCase().includes(q.value)
    || (n.sender?.full_name ?? "").toLowerCase().includes(q.value) || (n.recipient?.full_name ?? "").toLowerCase().includes(q.value)));

// Audit log pagination: a new search starts on page 1; live reloads keep the page but clamp it.
const PAGE_SIZE = 20;
const page = ref(0);
const pageCount = computed(() => Math.max(1, Math.ceil(shownLogs.value.length / PAGE_SIZE)));
const pagedLogs = computed(() => shownLogs.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE));
watch(q, () => { page.value = 0; });
watch(pageCount, (c) => { if (page.value > c - 1) page.value = c - 1; });

const nav = computed(() => [
  { key: "users" as const, label: "Users", icon: UserRound, count: users.value.length },
  { key: "groups" as const, label: "Groups", icon: UsersRound, count: groups.value.length },
  { key: "audit" as const, label: "Audit log", icon: ScrollText, count: null },
  // Developers only: sits below Audit log.
  ...(props.isDev ? [{ key: "dev" as const, label: "Dev", icon: Code, count: null }] : []),
]);
const title = computed(() => nav.value.find((n) => n.key === section.value)?.label ?? "");

// Runs on first show and on every return to the tab (KeepAlive). Existing rows stay until new data arrives.
// Re-capturing the member order happens here, not in load(), so toggling a member never reshuffles the list.
// Refresh button: reload users, groups and the audit log while this tab is shown.
let offRefresh: (() => void) | null = null;
onActivated(async () => {
  active = true;
  offRefresh = onRefresh(load);
  await load();
  snapshotMemberOrder();
});
onDeactivated(() => {
  active = false;
  offRefresh?.();
});
watch(selectedGroupId, snapshotMemberOrder);

// Live updates: any change to people, groups, memberships or shouts refetches the data
// while this tab is visible. Refetch only; the frozen member order is left alone.
let active = false;
let pending: ReturnType<typeof setTimeout> | undefined;
function refresh() {
  if (!active) return;
  clearTimeout(pending);
  pending = setTimeout(load, 150); // coalesce bursts (e.g. "select all") into one fetch
}
const channel = supabase
  .channel("admin-live")
  .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, refresh)
  .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, refresh)
  .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, refresh)
  .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, refresh);

// Safety net for dropped realtime events and for returning to the window.
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  channel.subscribe();
  timer = setInterval(refresh, 30000);
  window.addEventListener("focus", refresh);
  document.addEventListener("pointerdown", closeStatusMenuOnOutside);
});
onUnmounted(() => {
  offRefresh?.();
  clearInterval(timer);
  clearTimeout(pending);
  window.removeEventListener("focus", refresh);
  document.removeEventListener("pointerdown", closeStatusMenuOnOutside);
  supabase.removeChannel(channel);
});
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1">
    <!-- Left list, narrower than the chat list -->
    <aside class="flex w-[22%] min-w-[160px] max-w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div class="px-3 pb-3 pt-4">
        <div class="relative">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input v-model="query" :placeholder="`Search ${title.toLowerCase()}`"
            class="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
        </div>
      </div>
      <nav class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2 py-1.5">
        <button v-for="n in nav" :key="n.key"
          class="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
          :class="section === n.key
            ? 'bg-white font-semibold text-emerald-800 shadow-sm ring-1 ring-slate-200'
            : 'font-medium text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'"
          @click="section = n.key">
          <component :is="n.icon" class="h-4 w-4 shrink-0"
            :class="section === n.key ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'" />
          <span class="min-w-0 flex-1 truncate">{{ n.label }}</span>
          <span v-if="n.count != null"
            class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
            :class="section === n.key ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'">{{ n.count }}</span>
        </button>
      </nav>
    </aside>

    <!-- Right content: header bar and body mirror the chat thread -->
    <section class="flex min-w-0 flex-1 flex-col bg-slate-50">
      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5">
        <p v-if="err" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{{ err }}</p>

        <!-- Users -->
        <template v-if="section === 'users'">
          <ScrollHint>
            <table class="w-full table-fixed text-sm">
              <thead class="sticky top-0 z-10 bg-white">
                <tr class="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th class="w-[5%] px-4 py-2.5 font-medium">#</th>
                  <th class="w-[39%] px-4 py-2.5 font-medium">User</th>
                  <th class="w-[19%] px-2 py-2.5 font-medium">Department</th>
                  <th class="w-[19%] px-2 py-2.5 font-medium">Role</th>
                  <th class="relative w-[18%] px-4 py-2.5 font-medium" ref="statusMenu">
                    <button type="button" aria-haspopup="listbox" :aria-expanded="statusMenuOpen"
                      class="flex items-center gap-1 rounded uppercase tracking-wide hover:text-slate-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                      :class="statusFilter !== 'all' ? 'text-emerald-700' : ''"
                      @click="statusMenuOpen = !statusMenuOpen">
                      {{ statusFilter === "all" ? "Status" : statusOptions.find((o) => o.key === statusFilter)?.label }}
                      <ChevronDown class="h-3 w-3 shrink-0 transition-transform" :class="statusMenuOpen ? 'rotate-180' : ''" />
                    </button>
                    <div v-if="statusMenuOpen" role="listbox"
                      class="absolute left-2 top-full z-20 mt-1 min-w-[8rem] rounded-lg border border-slate-200 bg-white py-1 normal-case tracking-normal shadow-lg">
                      <button v-for="o in statusOptions" :key="o.key" type="button" role="option" :aria-selected="statusFilter === o.key"
                        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-100"
                        :class="statusFilter === o.key ? 'font-semibold text-emerald-800' : 'text-slate-700'"
                        @click="pickStatus(o.key)">
                        <span class="h-2 w-2 rounded-full"
                          :class="o.key === 'online' ? 'bg-emerald-500' : o.key === 'offline' ? 'bg-slate-300' : 'bg-transparent'" />
                        {{ o.label }}
                      </button>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(u, i) in shownUsers" :key="u.id" class="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td class="px-4 py-2.5 text-xs tabular-nums text-slate-400">{{ i + 1 }}</td>
                  <td class="px-4 py-2.5">
                    <span class="flex items-center gap-2.5">
                      <UserAvatar :user="u" size-class="h-8 w-8" />
                      <span class="min-w-0 flex-1">
                        <input :value="u.full_name" title="Edit name" aria-label="Edit name"
                          class="-mx-1 block w-[calc(100%+0.5rem)] truncate rounded px-1 py-0.5 font-medium text-slate-900 hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          @change="renameUser(u, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
                        <span class="block truncate px-1 text-xs text-slate-500">{{ u.email }}</span>
                      </span>
                    </span>
                  </td>
                  <td class="px-2 py-2.5">
                    <input :value="u.department" class="w-full rounded-lg bg-slate-100 px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      @change="updateUser(u, { department: ($event.target as HTMLInputElement).value })" />
                  </td>
                  <td class="px-2 py-2.5">
                    <div class="relative">
                      <!-- Developer role is managed only in the Supabase dashboard: shown read-only here -->
                      <select :value="u.role" :disabled="u.role === 'developer'"
                        class="w-full appearance-none rounded-lg bg-slate-100 py-1.5 pl-2.5 pr-9 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        @change="updateUser(u, { role: ($event.target as HTMLSelectElement).value as Role })">
                        <option v-if="u.role === 'developer'" value="developer">developer</option>
                        <option value="admin">admin</option><option value="sender">sender</option><option value="receiver">receiver</option>
                      </select>
                      <ChevronDown class="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    </div>
                  </td>
                  <td class="px-4 py-2.5">
                    <span class="flex items-center gap-1.5 text-xs" :class="onlineIds.has(u.id) ? 'text-emerald-700' : 'text-slate-500'">
                      <span class="h-2 w-2 rounded-full" :class="onlineIds.has(u.id) ? 'bg-emerald-500' : 'bg-slate-300'" />
                      {{ onlineIds.has(u.id) ? "Online" : "Offline" }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="!shownUsers.length" class="p-6 text-center text-sm text-slate-400">No people found</p>
          </ScrollHint>
        </template>

        <!-- Groups -->
        <template v-if="section === 'groups'">
          <div class="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <!-- Pick a group, create new ones at the top -->
            <div class="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
              <form class="flex shrink-0 gap-2 px-3 pb-3 pt-4" @submit.prevent="addGroup">
                <input v-model="newGroup" placeholder="New group name" maxlength="12"
                  class="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <button :disabled="!newGroup.trim()" title="Create group" aria-label="Create group"
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40">
                  <Plus class="h-4 w-4" />
                </button>
              </form>
              <div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-2 py-1.5">
                <button v-for="(g, i) in shownGroups" :key="g.id"
                  class="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
                  :class="g.id === selectedGroupId
                    ? 'bg-white font-semibold text-emerald-800 shadow-sm ring-1 ring-slate-200'
                    : 'font-medium text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'"
                  @click="selectedGroupId = g.id">
                  <span class="w-4 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{{ i + 1 }}</span>
                  <span class="min-w-0 flex-1 truncate" :title="g.name">{{ g.name }}</span>
                  <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                    :class="g.id === selectedGroupId ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'">{{ g.members.length }}</span>
                </button>
                <p v-if="!shownGroups.length" class="p-6 text-center text-sm text-slate-400">No groups yet</p>
              </div>
            </div>

            <!-- Manage the selected group's members -->
            <div v-if="selectedGroup" class="flex min-w-0 flex-1 flex-col">
              <div class="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <h3 class="min-w-0 truncate font-medium" :title="selectedGroup.name">{{ selectedGroup.name }}</h3>
                <input v-model="memberQuery" placeholder="Filter people"
                  class="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                <label v-if="groupPeople.length" class="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" class="h-4 w-4 accent-emerald-600" :checked="allShownSelected" @change="toggleAllShown" />
                  All
                </label>
              </div>
              <div class="min-h-0 flex-1 overflow-auto">
                <label v-for="(u, i) in groupPeople" :key="u.id"
                  class="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2 last:border-0 hover:bg-slate-50">
                  <span class="w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">{{ i + 1 }}</span>
                  <UserAvatar :user="u" size-class="h-8 w-8" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-slate-900">{{ u.full_name }}</span>
                    <span class="block truncate text-xs text-slate-500">{{ u.department || u.email }}</span>
                  </span>
                  <input type="checkbox" class="h-4 w-4 shrink-0 accent-emerald-600"
                    :checked="selectedGroup.members.includes(u.id)"
                    @change="toggleMember(selectedGroup.id, u.id, selectedGroup.members.includes(u.id))" />
                </label>
                <p v-if="!groupPeople.length" class="p-6 text-center text-sm text-slate-400">No people found</p>
              </div>
            </div>
            <div v-else class="flex flex-1 items-center justify-center text-sm text-slate-400">
              {{ groups.length ? "Select a group" : "Create a group to add people to it" }}
            </div>
          </div>
        </template>

        <!-- Dev (developers only) -->
        <template v-if="section === 'dev' && isDev">
          <DevPanel :header-message="headerMessage" @header-saved="emit('headerSaved', $event)" />
        </template>

        <!-- Audit log -->
        <template v-if="section === 'audit'">
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-sm">
          <ScrollHint :card="false">
            <table class="w-full table-fixed text-xs">
              <thead class="sticky top-0 z-10 bg-white">
                <tr class="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                  <th class="w-[5%] px-2 py-2.5 font-medium">#</th>
                  <th class="w-[10%] px-2 py-2.5 font-medium">Time</th>
                  <th class="w-[20%] px-2 py-2.5 font-medium">From / To</th>
                  <th class="w-[37%] px-2 py-2.5 font-medium">Message</th>
                  <th class="w-[14%] px-2 py-2.5 font-medium">Status</th>
                  <th class="w-[14%] px-2 py-2.5 font-medium">Latency</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(n, i) in pagedLogs" :key="n.id" class="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td class="px-2 py-2.5 text-[10px] tabular-nums text-slate-400">{{ page * PAGE_SIZE + i + 1 }}</td>
                  <td class="truncate px-2 py-2.5 text-[10px] text-slate-500">{{ chatTime(n.created_at) }}</td>
                  <td class="px-2 py-2.5 text-xs">
                    <span class="block truncate font-medium text-slate-900" :title="n.sender?.full_name">{{ n.sender?.full_name }}</span>
                    <span class="block truncate text-slate-500" :title="n.recipient?.full_name">→ {{ n.recipient?.full_name }}</span>
                  </td>
                  <td class="truncate px-2 py-2.5 text-slate-700" :title="n.message">{{ n.message }}</td>
                  <td class="px-2 py-2.5">
                    <span class="flex items-center gap-1.5 text-[11px]" :class="receiptOf(n.status) === 'seen' ? 'text-sky-600' : 'text-slate-500'">
                      <ReceiptIcon :receipt="receiptOf(n.status)" />
                      {{ receiptLabel[receiptOf(n.status)] }}
                    </span>
                  </td>
                  <td class="truncate px-2 py-2.5 text-xs text-slate-500">{{ latency(n) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="!shownLogs.length" class="p-6 text-center text-sm text-slate-400">No shouts found</p>
          </ScrollHint>
          <div v-if="shownLogs.length > PAGE_SIZE" class="flex shrink-0 items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            <span class="tabular-nums">{{ page * PAGE_SIZE + 1 }}–{{ Math.min((page + 1) * PAGE_SIZE, shownLogs.length) }} of {{ shownLogs.length }}</span>
            <div class="flex items-center gap-1">
              <button :disabled="page === 0" title="Previous page" aria-label="Previous page" @click="page--"
                class="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                <ChevronLeft class="h-4 w-4" />
              </button>
              <span class="px-2 tabular-nums">Page {{ page + 1 }} of {{ pageCount }}</span>
              <button :disabled="page >= pageCount - 1" title="Next page" aria-label="Next page" @click="page++"
                class="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                <ChevronRight class="h-4 w-4" />
              </button>
            </div>
          </div>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
