<script setup lang="ts">
import type { Notification } from "../lib/supabase";
import { CircleCheck } from "lucide-vue-next";
import { replyLabel } from "../lib/receipts";

// Incoming bubble: the recipient's "Acknowledged" answer, quoting the original shout.
defineProps<{ row: Notification; name: string; showName: boolean }>();
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
</script>

<template>
  <div class="flex justify-start">
    <div class="relative max-w-[85%] rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 shadow-sm">
      <p v-if="showName" class="text-xs font-semibold text-emerald-700">{{ name }}</p>
      <div class="mb-1 rounded border-l-4 border-emerald-500 bg-slate-100 px-2 py-1">
        <p class="text-[11px] font-semibold text-emerald-700">You</p>
        <p class="line-clamp-2 break-words text-xs text-slate-600">{{ row.message }}</p>
      </div>
      <p class="flex items-center gap-1.5 pr-12 text-sm font-medium text-slate-900"><CircleCheck class="h-4 w-4 shrink-0 text-emerald-600" />{{ replyLabel(row.status) }}</p>
      <span class="absolute bottom-1 right-2 text-[10px] text-slate-500">{{ time(row.acknowledged_at ?? row.delivered_at ?? row.created_at) }}</span>
    </div>
  </div>
</template>
