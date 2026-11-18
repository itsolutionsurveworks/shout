<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { gifUrl } from "../lib/media";

// zoomable: clicking a GIF opens it full size in a centered lightbox. Turned off where the
// GIF already shows at full size (the incoming shout popup).
const props = withDefaults(defineProps<{ text: string; textClass?: string; imgClass?: string; zoomable?: boolean }>(), { zoomable: true });
const gif = computed(() => gifUrl(props.text));
const open = ref(false);

function onKey(e: KeyboardEvent) { if (e.key === "Escape") open.value = false; }
watch(open, (v) => {
  if (v) window.addEventListener("keydown", onKey);
  else window.removeEventListener("keydown", onKey);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <template v-if="gif">
    <img :src="gif" alt="GIF" referrerpolicy="no-referrer"
      class="rounded-md" :class="[imgClass ?? 'max-h-56 max-w-full', zoomable ? 'cursor-zoom-in' : '']"
      @click="zoomable && (open = true)" />
    <!-- Teleported to the main area only (not the app header/footer), so it covers just the content. -->
    <Teleport to="#app-main">
      <Transition name="gif-zoom">
        <div v-if="open && zoomable" class="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/80 p-6"
          role="dialog" aria-label="GIF preview" @click.self="open = false">
          <button type="button" class="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-slate-800 shadow hover:bg-white"
            aria-label="Close" @click="open = false">Close</button>
          <img :src="gif" alt="GIF" referrerpolicy="no-referrer"
            class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl" @click="open = false" />
        </div>
      </Transition>
    </Teleport>
  </template>
  <p v-else class="whitespace-pre-wrap [overflow-wrap:anywhere]" :class="textClass">{{ text }}</p>
</template>

<style>
.gif-zoom-enter-active, .gif-zoom-leave-active { transition: opacity 0.2s ease; }
.gif-zoom-enter-active img, .gif-zoom-leave-active img { transition: transform 0.2s ease; }
.gif-zoom-enter-from, .gif-zoom-leave-to { opacity: 0; }
.gif-zoom-enter-from img, .gif-zoom-leave-to img { transform: scale(0.95); }
</style>
