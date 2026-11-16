<script setup lang="ts">
import { Info } from "lucide-vue-next";
import type { ChatMessage } from "../lib/thread";
import ReceiptIcon from "./ReceiptIcon.vue";
import MessageContent from "./MessageContent.vue";

defineProps<{ msg: ChatMessage; senderName?: string }>();
defineEmits<{ info: [] }>();
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
</script>

<template>
  <div class="flex flex-col" :class="msg.mine ? 'items-end' : 'items-start'">
    <div class="relative max-w-[85%] rounded-lg px-2.5 py-1.5 shadow-sm"
      :class="msg.mine ? 'rounded-tr-none bg-emerald-100' : 'rounded-tl-none bg-white'">
      <p v-if="senderName" class="text-xs font-semibold text-emerald-700">{{ senderName }}</p>
      <MessageContent :text="msg.message" text-class="text-sm text-slate-900" />
      <button v-if="msg.mine" class="absolute -left-6 top-1 rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
        title="Message info" aria-label="Message info" @click="$emit('info')"><Info class="h-4 w-4" /></button>
      <div class="mt-0.5 flex items-center justify-end gap-1 text-2xs text-slate-500">
        <span>{{ time(msg.created_at) }}</span>
        <ReceiptIcon v-if="msg.mine" :receipt="msg.receipt" />
      </div>
    </div>
  </div>
</template>
