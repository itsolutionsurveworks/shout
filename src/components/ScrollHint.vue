<script setup lang="ts">
// Scroll container with a hidden scrollbar. Used by the admin tables.
withDefaults(defineProps<{ card?: boolean }>(), { card: true });
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" :class="card ? 'rounded-xl bg-white shadow-sm' : ''">
      <slot />
    </div>
  </div>
</template>
