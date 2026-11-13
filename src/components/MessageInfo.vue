<script setup lang="ts">
import { computed } from "vue";
import type { Notification, Profile } from "../lib/supabase";
import { receiptOf, replyLabel, type Receipt } from "../lib/receipts";
import type { ChatMessage } from "../lib/thread";
import UserAvatar from "./UserAvatar.vue";
import ReceiptIcon from "./ReceiptIcon.vue";
import SidePanel from "./SidePanel.vue";

// WhatsApp "Message info": who has seen it, who only got it, who is still pending.
const props = defineProps<{ msg: ChatMessage; people: Profile[]; groupMembers?: string[] }>();
defineEmits<{ close: [] }>();

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
const person = (id: string) => props.people.find((p) => p.id === id) ?? { full_name: "Unknown", avatar_url: null };

interface Section { title: string; rows: Notification[]; at: (r: Notification) => string | null; receipt: Receipt }

const sections = computed<Section[]>(() => {
  const by = (r: Receipt) => props.msg.rows.filter((x) => receiptOf(x.status) === r);
  const all: Section[] = [
    { title: "Seen by", rows: by("seen"), at: (r) => r.acknowledged_at, receipt: "seen" },
    { title: "Delivered to", rows: by("delivered"), at: (r) => r.delivered_at, receipt: "delivered" },
    { title: "Sent to", rows: by("sent"), at: (r) => r.created_at, receipt: "sent" },
  ];
  return all.filter((s) => s.rows.length);
});

// Group members who weren't online when it went out never received a row.
const skipped = computed(() => {
  const got = new Set(props.msg.rows.map((r) => r.recipient_id));
  return (props.groupMembers ?? []).filter((id) => !got.has(id));
});

// Group shouts only: how many members have acknowledged, out of everyone in the group.
const ackCount = computed(() => {
  if (!props.groupMembers) return null;
  const acked = new Set(props.msg.rows.filter((r) => r.status === "acknowledged").map((r) => r.recipient_id));
  return { done: props.groupMembers.filter((id) => acked.has(id)).length, total: props.groupMembers.length };
});
</script>

<template>
  <SidePanel
    :title="ackCount ? `${ackCount.done} of ${ackCount.total} acknowledged` : ''"
    :message="msg.message" :sent-at="msg.created_at" @close="$emit('close')">
    <section v-for="s in sections" :key="s.title" class="border-b border-slate-100 py-2">
      <h4 class="flex items-center gap-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <ReceiptIcon :receipt="s.receipt" /> {{ s.title }}
      </h4>
      <div v-for="r in s.rows" :key="r.id" class="flex items-center gap-2.5 px-3 py-1.5">
        <UserAvatar :user="person(r.recipient_id)" size-class="h-8 w-8" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ person(r.recipient_id).full_name }}</p>
          <p v-if="replyLabel(r.status)" class="text-[11px] font-medium text-sky-600">{{ replyLabel(r.status) }}</p>
        </div>
        <span class="shrink-0 text-[10px] text-slate-500">{{ time(s.at(r)) }}</span>
      </div>
    </section>
    <section v-if="skipped.length" class="py-2">
      <h4 class="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Not online · not sent</h4>
      <div v-for="id in skipped" :key="id" class="flex items-center gap-2.5 px-3 py-1.5 opacity-70">
        <UserAvatar :user="person(id)" size-class="h-8 w-8" />
        <p class="truncate text-sm">{{ person(id).full_name }}</p>
      </div>
    </section>
  </SidePanel>
</template>
