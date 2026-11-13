<script setup lang="ts">
import { computed, ref } from "vue";
import { Users } from "lucide-vue-next";
import type { Profile } from "../lib/supabase";
import { chatTime, type ChatGroup, type ChatMessage, type ChatTarget } from "../lib/thread";
import UserAvatar from "./UserAvatar.vue";
import ReceiptIcon from "./ReceiptIcon.vue";

const props = defineProps<{
  people: Profile[];
  groups: ChatGroup[];
  online: Set<string>;
  selected: ChatTarget | null;
  forTarget: (t: ChatTarget) => ChatMessage[];
}>();
const emit = defineEmits<{ select: [t: ChatTarget] }>();

const query = ref("");
const filter = ref<"all" | "online" | "groups">("all");

interface Row { target: ChatTarget; name: string; sub: string; user?: Profile; last?: ChatMessage; online: boolean }

const rows = computed<Row[]>(() => {
  const q = query.value.toLowerCase();
  const out: Row[] = [];
  for (const g of props.groups) {
    const t: ChatTarget = { kind: "group", id: g.id };
    const onlineCount = g.members.filter((m) => props.online.has(m)).length;
    out.push({ target: t, name: g.name, sub: `${onlineCount} of ${g.members.length} online`, last: props.forTarget(t).slice(-1)[0], online: onlineCount > 0 });
  }
  for (const u of props.people) {
    const t: ChatTarget = { kind: "user", id: u.id };
    out.push({ target: t, name: u.full_name, sub: u.department, user: u, last: props.forTarget(t).slice(-1)[0], online: props.online.has(u.id) });
  }
  return out
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q))
    .filter((r) => filter.value === "all" || (filter.value === "online" ? r.online : r.target.kind === "group"))
    // Recent conversations first, then online people, then alphabetical (WhatsApp ordering).
    .sort((a, b) =>
      (b.last ? Date.parse(b.last.created_at) : 0) - (a.last ? Date.parse(a.last.created_at) : 0) ||
      Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
});

const isSel = (r: Row) => props.selected?.kind === r.target.kind && props.selected.id === r.target.id;
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="space-y-2 px-3 pb-2 pt-3">
      <input v-model="query" placeholder="Search or start new shout"
        class="w-full rounded-md bg-slate-100 px-2.5 py-1 text-xs placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
      <div class="flex gap-1.5 text-xs">
        <button v-for="f in (['all', 'online', 'groups'] as const)" :key="f"
          class="rounded-full px-2 py-0.5 font-medium capitalize"
          :class="filter === f ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
          @click="filter = f">{{ f }}</button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <button v-for="r in rows" :key="r.target.kind + r.target.id"
        class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50"
        :class="isSel(r) ? 'bg-slate-100 hover:bg-slate-100' : ''" @click="emit('select', r.target)">
        <UserAvatar v-if="r.user" :user="r.user" size-class="h-8 w-8">
          <span class="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white"
            :class="r.online ? 'bg-emerald-500' : 'bg-slate-300'" />
        </UserAvatar>
        <span v-else class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Users class="h-3.5 w-3.5" />
        </span>
        <span class="min-w-0 flex-1 border-b border-slate-100 pb-1.5">
          <span class="flex items-baseline justify-between gap-2">
            <span class="truncate text-xs font-medium text-slate-900">{{ r.name }}</span>
            <span v-if="r.last" class="shrink-0 text-2xs text-slate-500">{{ chatTime(r.last.created_at) }}</span>
          </span>
          <span class="flex items-center gap-1 text-2xs text-slate-500">
            <template v-if="r.last">
              <ReceiptIcon :receipt="r.last.receipt" />
              <span class="truncate">{{ r.last.message }}</span>
            </template>
            <span v-else class="truncate">{{ r.sub }}</span>
          </span>
        </span>
      </button>
      <p v-if="!rows.length" class="p-6 text-center text-sm text-slate-400">No chats found</p>
    </div>
  </div>
</template>
