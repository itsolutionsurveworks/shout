<script setup lang="ts">
import { Users } from "lucide-vue-next";
// Round group avatar: the group's photo, or a people icon when it has none.
defineProps<{ group: { name: string; avatar_url?: string | null }; sizeClass?: string; iconClass?: string }>();
</script>

<template>
  <img v-if="group.avatar_url" :src="group.avatar_url" :alt="group.name"
    class="shrink-0 rounded-full bg-slate-100 object-cover" :class="sizeClass ?? 'h-9 w-9'" />
  <span v-else class="flex shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" :class="sizeClass ?? 'h-9 w-9'">
    <Users :class="iconClass ?? 'h-4 w-4'" />
  </span>
</template>
