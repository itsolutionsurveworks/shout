<script setup lang="ts">
import { ref } from "vue";
import { CircleCheck, Info } from "lucide-vue-next";
import type { AckSummary, ChatMessage } from "../lib/thread";
import ReceiptIcon from "./ReceiptIcon.vue";

defineProps<{ msg: ChatMessage; ack?: AckSummary }>();
defineEmits<{ info: [] }>();
const showPending = ref(false);
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
</script>

<template>
  <div class="group flex flex-col items-end">
    <div class="relative max-w-[85%] rounded-lg rounded-tr-none bg-emerald-100 px-2.5 py-1.5 shadow-sm">
      <p class="whitespace-pre-wrap break-words text-sm text-slate-900">{{ msg.message }}</p>
      <div v-if="ack" class="mt-1">
        <button class="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline" @click="showPending = !showPending">
          <CircleCheck class="h-3.5 w-3.5 shrink-0" /> {{ ack.done }}/{{ ack.total }} acknowledged
        </button>
        <p v-if="showPending" class="mt-0.5 text-[11px] text-slate-600">
          <span class="font-semibold">Not yet acknowledged:</span>
          {{ ack.pending.length ? ack.pending.join(", ") : "everyone has acknowledged" }}
        </p>
      </div>
      <div class="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-slate-500">
        <span>{{ time(msg.created_at) }}</span>
        <ReceiptIcon :receipt="msg.receipt" />
      </div>
      <button class="absolute -left-6 top-1 hidden rounded-full p-0.5 text-slate-400 hover:text-slate-700 group-hover:block"
        title="Message info" @click="$emit('info')"><Info class="h-4 w-4" /></button>
    </div>
  </div>
</template>
