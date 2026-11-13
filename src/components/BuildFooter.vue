<script setup lang="ts">
// Version and build time are injected by Vite at build time (see vite.config.ts).
const version = __APP_VERSION__;
const built = new Date(__BUILD_TIME__).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
</script>

<template>
  <p class="whitespace-nowrap text-2xs text-slate-400">v{{ version }} · Last updated {{ built }}</p>
</template>
