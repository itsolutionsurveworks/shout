<script setup lang="ts">
import { X } from "lucide-vue-next";

// Shared right-side info panel (WhatsApp "Message info" style). Every info panel in the app
// (chat message info, audit log member latency, ...) renders through this so the look and the
// open/close animation stay identical. Wrap it in <Transition name="side-panel"> where it is used.
defineProps<{ title: string; message: string; sentAt: string | null }>();
defineEmits<{ close: [] }>();

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
</script>

<template>
  <!-- Full-size overlay: clicking anywhere outside the panel closes it. -->
  <div class="absolute inset-0 z-20 flex justify-end bg-transparent" @click.self="$emit('close')">
  <aside class="flex w-80 flex-col border-l border-slate-200 bg-white shadow-xl">
    <header class="flex items-center gap-2 bg-slate-100 px-3 py-2.5">
      <h3 class="flex-1 text-sm font-medium">{{ title }}</h3>
      <button class="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900" title="Close" aria-label="Close" @click="$emit('close')"><X class="h-4 w-4" /></button>
    </header>
    <div class="min-h-0 flex-1 overflow-auto">
      <div class="bg-[#efeae2] px-3 py-3">
        <p class="ml-auto w-fit max-w-full break-words rounded-lg rounded-tr-none bg-emerald-100 px-2.5 py-1.5 text-sm shadow-sm">{{ message }}</p>
        <p class="mt-1 text-right text-[10px] text-slate-500">{{ time(sentAt) }}</p>
      </div>
      <slot />
    </div>
  </aside>
  </div>
</template>

<style>
/* Shared open/close animation: backdrop fades; the panel slides in from the right and back out. */
.side-panel-enter-active, .side-panel-leave-active { transition: opacity 0.2s ease; }
.side-panel-enter-from, .side-panel-leave-to { opacity: 0; }
.side-panel-enter-active aside, .side-panel-leave-active aside { transition: transform 0.25s ease; }
.side-panel-enter-from aside, .side-panel-leave-to aside { transform: translateX(100%); }
</style>
