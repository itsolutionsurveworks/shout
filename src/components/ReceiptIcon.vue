<script setup lang="ts">
import { computed } from "vue";
import type { NotifStatus } from "../lib/supabase";

// Delivery tick shown beside a recipient's name:
// one grey tick = sent, two grey ticks = delivered, two blue ticks = acknowledged / on my way.
const props = defineProps<{ status?: NotifStatus }>();

const label = computed(() => {
  switch (props.status) {
    case "sent": return "Sent";
    case "delivered": return "Delivered";
    case "acknowledged":
    case "on_my_way": return "Seen";
    default: return "";
  }
});
const seen = computed(() => props.status === "acknowledged" || props.status === "on_my_way");
</script>

<template>
  <svg v-if="status" viewBox="0 0 16 11" class="h-3 w-4 shrink-0" :class="seen ? 'text-blue-500' : 'text-slate-400'"
    fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    role="img" :aria-label="label">
    <title>{{ label }}</title>
    <path d="M1 5.5 4.5 9 10 2.5" />
    <path v-if="status !== 'sent'" d="M5 5.5 8.5 9 15 2.5" />
  </svg>
</template>
