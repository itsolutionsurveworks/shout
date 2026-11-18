<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { EMOJI_CATEGORIES, GIPHY_KEY, searchGifs, type Gif } from "../lib/media";

const emit = defineEmits<{ emoji: [e: string]; gif: [url: string] }>();
const tab = ref<"emoji" | "gif">("emoji");
const category = ref(0);
const currentEmojis = computed(() => EMOJI_CATEGORIES[category.value].emojis);
const q = ref("");
const gifs = ref<Gif[]>([]);
const loading = ref(false);
const err = ref("");
let timer: ReturnType<typeof setTimeout>;

async function load() {
  loading.value = true; err.value = "";
  try { gifs.value = await searchGifs(q.value); } catch (e) { err.value = (e as Error).message; }
  loading.value = false;
}
watch(tab, (t) => { if (t === "gif" && GIPHY_KEY && !gifs.value.length) load(); });
watch(q, () => { clearTimeout(timer); timer = setTimeout(load, 350); });
</script>

<template>
  <!-- Fixed height so the Emoji and GIF tabs are the same size. -->
  <div class="flex h-80 flex-col">
    <!-- Chrome-style flap tabs; the active flap is white and joins the card below. -->
    <nav class="relative z-10 -mb-px flex shrink-0 items-end gap-1 text-xs">
      <button type="button" class="w-24 rounded-t-lg border border-b-0 py-1.5 font-medium uppercase transition-colors"
        :class="tab === 'emoji' ? 'border-slate-200 bg-white text-slate-900' : 'border-transparent bg-slate-200 text-slate-600 hover:bg-slate-300'" @click="tab = 'emoji'">Emoji</button>
      <button type="button" class="w-24 rounded-t-lg border border-b-0 py-1.5 font-medium uppercase transition-colors"
        :class="tab === 'gif' ? 'border-slate-200 bg-white text-slate-900' : 'border-transparent bg-slate-200 text-slate-600 hover:bg-slate-300'" @click="tab = 'gif'">GIF</button>
    </nav>
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl rounded-tl-none border border-slate-200 bg-white p-4 shadow-sm">
    <div v-if="tab === 'emoji'" class="flex min-h-0 flex-1 flex-col">
      <!-- Category strip -->
      <div class="mb-2 flex shrink-0 gap-1 border-b border-slate-200 pb-2">
        <button v-for="(c, i) in EMOJI_CATEGORIES" :key="c.name" type="button" :title="c.name" :aria-label="c.name"
          class="flex h-10 flex-1 items-center justify-center rounded-md text-2xl leading-none transition-colors"
          :class="category === i ? 'bg-slate-200' : 'hover:bg-slate-100'" @click="category = i">{{ c.icon }}</button>
      </div>
      <p class="mb-1 shrink-0 text-xs font-medium uppercase text-slate-500">{{ EMOJI_CATEGORIES[category].name }}</p>
      <div class="grid min-h-0 flex-1 grid-cols-6 content-start gap-1 overflow-auto">
        <button v-for="e in currentEmojis" :key="e" type="button" class="flex h-12 items-center justify-center rounded-lg text-3xl leading-none hover:bg-slate-100" @click="emit('emoji', e)">{{ e }}</button>
      </div>
    </div>
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <p v-if="!GIPHY_KEY" class="p-2 text-xs text-slate-600">
        GIF search isn't set up (add VITE_GIPHY_KEY). You can still paste a GIF link into the message box.
      </p>
      <template v-else>
        <input v-model="q" placeholder="Search GIFs" class="mb-2 w-full shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 text-sm focus:outline-none" />
        <p v-if="err" class="shrink-0 text-xs text-red-600">{{ err }}</p>
        <p v-else-if="loading" class="shrink-0 text-xs text-slate-500">Loading…</p>
        <div class="grid min-h-0 flex-1 grid-cols-3 content-start gap-1 overflow-auto">
          <button v-for="g in gifs" :key="g.id" type="button" @click="emit('gif', g.url)">
            <img :src="g.preview" class="h-20 w-full rounded object-cover" loading="lazy" />
          </button>
        </div>
      </template>
    </div>
    </div>
  </div>
</template>
