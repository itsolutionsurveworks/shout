<script setup lang="ts">
import { computed } from "vue";
import type { Receipt } from "../lib/receipts";
import { receiptLabel } from "../lib/receipts";

// WhatsApp ticks: one grey = sent, two grey = delivered, two blue = seen.
const props = defineProps<{ receipt?: Receipt }>();
const label = computed(() => (props.receipt ? receiptLabel[props.receipt] : ""));
</script>

<template>
  <svg v-if="receipt" viewBox="0 0 16 11" class="h-3 w-4 shrink-0 transition-colors duration-300"
    :class="receipt === 'seen' ? 'text-sky-500' : 'text-slate-400'"
    fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    role="img" :aria-label="label">
    <title>{{ label }}</title>
    <path d="M1 5.5 4.5 9 10 2.5" />
    <path v-if="receipt !== 'sent'" d="M5 5.5 8.5 9 15 2.5" />
  </svg>
</template>
