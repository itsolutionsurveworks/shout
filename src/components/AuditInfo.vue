<script setup lang="ts">
import { computed } from "vue";
import type { Profile } from "../lib/supabase";
import { receiptOf, receiptLabel } from "../lib/receipts";
import UserAvatar from "./UserAvatar.vue";
import ReceiptIcon from "./ReceiptIcon.vue";
import SidePanel from "./SidePanel.vue";

// Admin audit "Show" panel for a group shout: every member, their status, and how long their ack took.
const props = defineProps<{
  message: string;
  sentAt: string;
  rows: any[];          // notification rows for this shout (one per recipient who got it)
  members: string[];    // group member ids at the time of the audit view
  people: Profile[];
  groupName: string;
}>();
defineEmits<{ close: [] }>();

const fmt = (ms: number) => {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}m`;
  return `${(s / 3600).toFixed(1)}h`;
};
const person = (id: string) => props.people.find((p) => p.id === id) ?? { full_name: "Unknown", avatar_url: null };

interface Line { id: string; name: string; avatar: Pick<Profile, "full_name" | "avatar_url">; status: "acked" | "pending" | "notSent"; receipt: ReturnType<typeof receiptOf> | null; latency: string | null; ms: number | null }

const lines = computed<Line[]>(() => {
  const byId = new Map(props.rows.map((r) => [r.recipient_id, r]));
  const ids = [...new Set([...props.members, ...props.rows.map((r) => r.recipient_id)])];
  return ids
    .map((id): Line => {
      const r = byId.get(id);
      const p = person(id);
      if (!r) return { id, name: p.full_name ?? "Unknown", avatar: p, status: "notSent", receipt: null, latency: null, ms: null };
      if (!r.acknowledged_at) return { id, name: p.full_name ?? "Unknown", avatar: p, status: "pending", receipt: receiptOf(r.status), latency: null, ms: null };
      const ms = Date.parse(r.acknowledged_at) - Date.parse(r.created_at);
      return { id, name: p.full_name ?? "Unknown", avatar: p, status: "acked", receipt: receiptOf(r.status), latency: fmt(ms), ms };
    })
    // Fastest acknowledgements first, then still-pending, then members who never got it.
    .sort((a, b) => {
      const rank = (l: Line) => (l.status === "acked" ? 0 : l.status === "pending" ? 1 : 2);
      return rank(a) - rank(b) || (a.ms ?? 0) - (b.ms ?? 0) || a.name.localeCompare(b.name);
    });
});

const acked = computed(() => lines.value.filter((l) => l.status === "acked").length);
</script>

<template>
  <SidePanel
    :title="`${acked} of ${lines.length} acknowledged`"
    :message="message" :sent-at="sentAt" @close="$emit('close')">
    <section class="py-2">
      <h4 class="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{{ groupName }} · latency</h4>
      <div v-for="l in lines" :key="l.id" class="flex items-center gap-2.5 px-3 py-1.5" :class="l.status === 'notSent' ? 'opacity-70' : ''">
        <UserAvatar :user="l.avatar" size-class="h-8 w-8" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ l.name }}</p>
          <p v-if="l.receipt" class="flex items-center gap-1 text-[11px] text-slate-500">
            <ReceiptIcon :receipt="l.receipt" /> {{ receiptLabel[l.receipt] }}
          </p>
          <p v-else class="text-[11px] text-slate-500">Not online · not sent</p>
        </div>
        <span v-if="l.status === 'acked'" class="shrink-0 text-xs font-medium tabular-nums text-sky-600">{{ l.latency }}</span>
        <span v-else-if="l.status === 'pending'" class="shrink-0 text-[10px] text-slate-400">No ack yet</span>
        <span v-else class="shrink-0 text-[10px] text-slate-400">—</span>
      </div>
    </section>
  </SidePanel>
</template>
