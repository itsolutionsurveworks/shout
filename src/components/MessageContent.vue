<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { gifUrl, imageSize, photoBox } from "../lib/media";

// zoomable: clicking a GIF opens it full size in a centered lightbox. Turned off where the
// GIF already shows at full size (the incoming shout popup).
const props = withDefaults(defineProps<{ text: string; textClass?: string; imgClass?: string; maxH?: number; zoomable?: boolean }>(), { zoomable: true });
const gif = computed(() => gifUrl(props.text));
// Photos carry their size, so the box is reserved (with a pulsing skeleton) until the image loads.
const size = computed(() => imageSize(props.text));
const loaded = ref(false);
// A photo that fails to load has been removed by the weekly chat-photo cleanup.
const failed = ref(false);
watch(gif, () => { loaded.value = false; failed.value = false; });
function onImgError() {
  loaded.value = true;
  if (size.value) failed.value = true;
}
const boxStyle = computed(() => size.value ? photoBox(size.value.w, size.value.h, props.maxH) : undefined);
const capStyle = computed(() => props.maxH && !size.value ? { maxHeight: `${props.maxH}px` } : undefined);
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
    <div v-if="size && failed" class="max-w-full rounded-md bg-slate-200/70 px-3 py-2 text-sm italic text-slate-600"
      :class="imgClass?.includes('mx-auto') ? 'mx-auto' : ''" :style="{ minWidth: '96px' }">
      Photo cleared. Chat photos are deleted every Friday at 11:59 PM (PHT) to save space.
    </div>
    <div v-else-if="size" class="overflow-hidden rounded-md bg-slate-200/70" :class="[loaded ? '' : 'animate-pulse', imgClass?.includes('mx-auto') ? 'mx-auto' : '']"
      :style="boxStyle">
      <img :src="gif" alt="Image" referrerpolicy="no-referrer"
        class="h-full w-full object-contain transition-opacity duration-300" :class="[loaded ? 'opacity-100' : 'opacity-0', zoomable ? 'cursor-zoom-in' : '']"
        @load="loaded = true" @error="onImgError" @click="zoomable && (open = true)" />
    </div>
    <img v-else :src="gif" alt="Image" referrerpolicy="no-referrer" :style="capStyle"
      class="rounded-md object-contain" :class="[imgClass ?? 'max-h-56 max-w-full', zoomable ? 'cursor-zoom-in' : '']"
      @click="zoomable && (open = true)" />
    <!-- Teleported to the body and fixed, so it covers the whole app including the header. -->
    <Teleport to="body">
      <Transition name="gif-zoom">
        <div v-if="open && zoomable" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 p-6"
          role="dialog" aria-label="Image preview" @click.self="open = false">
          <button type="button" class="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-slate-800 shadow hover:bg-white"
            aria-label="Close" @click="open = false">Close</button>
          <img :src="gif" alt="Image" referrerpolicy="no-referrer"
            class="max-h-full max-w-full rounded-lg object-contain shadow-2xl" @click="open = false" />
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
