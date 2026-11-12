<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { ChevronDown } from "lucide-vue-next";

// Scroll container with a hidden scrollbar and a bouncing chevron that
// appears until the user has scrolled to the very bottom.
const props = withDefaults(defineProps<{ card?: boolean }>(), { card: true });
const scroller = ref<HTMLElement | null>(null);
const atEnd = ref(true);
let observer: ResizeObserver | null = null;

function check() {
  const el = scroller.value;
  if (!el) return;
  atEnd.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
}

onMounted(() => {
  check();
  if (scroller.value && typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(check);
    observer.observe(scroller.value);
    if (scroller.value.firstElementChild) observer.observe(scroller.value.firstElementChild);
  }
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <div ref="scroller" class="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" :class="card ? 'rounded-xl bg-white shadow-sm' : ''" @scroll="check">
      <slot />
    </div>
    <div v-show="!atEnd" class="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 animate-bounce items-center justify-center rounded-full bg-emerald-600 p-1.5 text-white shadow">
      <ChevronDown class="h-5 w-5" />
    </div>
  </div>
</template>
