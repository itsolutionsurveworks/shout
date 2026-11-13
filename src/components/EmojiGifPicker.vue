<script setup lang="ts">
import { ref, watch } from "vue";
import { EMOJIS, GIPHY_KEY, searchGifs, type Gif } from "../lib/media";

const emit = defineEmits<{ emoji: [e: string]; gif: [url: string] }>();
const tab = ref<"emoji" | "gif">("emoji");
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
  <div class="flex h-80 flex-col overflow-hidden rounded-xl shadow-xl">
    <!-- Chrome-style tab strip, same look as the People / Admin tabs in the header. -->
    <nav class="flex shrink-0 items-end gap-1 text-xs">
      <button type="button" class="relative flex-1 rounded-t-lg py-2 font-medium uppercase transition-colors"
        :class="tab === 'emoji' ? 'bg-white text-slate-900' : 'text-slate-600 hover:bg-slate-300/60'" @click="tab = 'emoji'">Emoji</button>
      <button type="button" class="relative flex-1 rounded-t-lg py-2 font-medium uppercase transition-colors"
        :class="tab === 'gif' ? 'bg-white text-slate-900' : 'text-slate-600 hover:bg-slate-300/60'" @click="tab = 'gif'">GIF</button>
    </nav>
    <div class="flex min-h-0 flex-1 flex-col bg-white p-2">
    <div v-if="tab === 'emoji'" class="grid min-h-0 flex-1 grid-cols-6 content-start gap-1 overflow-auto">
      <button v-for="e in EMOJIS" :key="e" type="button" class="flex h-12 items-center justify-center rounded-lg text-3xl leading-none hover:bg-slate-100" @click="emit('emoji', e)">{{ e }}</button>
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
