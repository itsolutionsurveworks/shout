<script setup lang="ts">
import { Info } from "lucide-vue-next";
import type { ChatMessage } from "../lib/thread";
import ReceiptIcon from "./ReceiptIcon.vue";

defineProps<{ msg: ChatMessage }>();
defineEmits<{ info: [] }>();
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
</script>

<template>
  <div class="flex flex-col items-end">
    <div class="relative max-w-[85%] rounded-lg rounded-tr-none bg-emerald-100 px-2.5 py-1.5 shadow-sm">
      <p class="whitespace-pre-wrap break-words text-sm text-slate-900">{{ msg.message }}</p>
      <button class="absolute -left-6 top-1 rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
        title="Message info" aria-label="Message info" @click="$emit('info')"><Info class="h-4 w-4" /></button>
      <div class="mt-0.5 flex items-center justify-end gap-1 text-2xs text-slate-500">
        <span>{{ time(msg.created_at) }}</span>
        <ReceiptIcon :receipt="msg.receipt" />
      </div>
    </div>
  </div>
</template>
