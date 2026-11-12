<script setup lang="ts">
// Round avatar: the user's uploaded photo, or a default person icon when they have none.
// Parents can overlay a status dot through the default slot.
defineProps<{ user: { full_name?: string | null; avatar_url?: string | null }; sizeClass?: string }>();
</script>

<template>
  <span class="relative flex shrink-0 items-center justify-center" :class="sizeClass ?? 'h-9 w-9'">
    <img v-if="user.avatar_url" :src="user.avatar_url" :alt="user.full_name ?? ''"
      class="h-full w-full rounded-full bg-slate-100 object-cover" />
    <span v-else class="flex h-full w-full items-center justify-center rounded-full bg-slate-100 p-[22%] text-slate-400"
      role="img" :aria-label="user.full_name ?? 'No photo'">
      <svg viewBox="0 0 24 24" class="h-full w-full" fill="currentColor" aria-hidden="true">
        <path d="M12 12.25a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2Zm0 2.25c-3.5 0-7.75 1.75-7.75 4.75V21h15.5v-1.75c0-3-4.25-4.75-7.75-4.75Z" />
      </svg>
    </span>
    <slot />
  </span>
</template>
