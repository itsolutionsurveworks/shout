<script setup lang="ts">
import { onMounted, ref } from "vue";
import { CHANGELOG, SIGNATURE, hasUnseenRelease, markReleaseSeen } from "../lib/changelog";

// Version and build time are injected by Vite at build time (see vite.config.ts).
const version = __APP_VERSION__;
const built = new Date(__BUILD_TIME__).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

const open = ref(false);
const sections = [
  { key: "added", label: "Added" },
  { key: "changed", label: "Changed" },
  { key: "fixed", label: "Fixed" },
] as const;

function close() {
  open.value = false;
  markReleaseSeen(version);
}

// Opens by itself once after each update; the version link reopens it any time.
onMounted(() => {
  if (hasUnseenRelease(version)) open.value = true;
});
</script>

<template>
  <!-- Single root element: the parent's class (e.g. absolute positioning) only applies when there is one root -->
  <div>
    <p class="text-center text-2xs text-slate-400">
      <button type="button" class="hover:text-slate-600 hover:underline" title="What's new" @click="open = true">v{{ version }}</button>
      · Last updated {{ built }}
    </p>

  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="close">
      <div class="flex max-h-[85vh] w-[380px] flex-col rounded-2xl bg-white p-6 text-slate-800 shadow-xl">
        <h2 class="mb-4 text-lg font-semibold">What's new</h2>
        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <section v-for="r in CHANGELOG" :key="r.version">
            <h3 class="text-sm font-semibold">v{{ r.version }} <span class="font-normal text-slate-400">· {{ r.date }}</span></h3>
            <template v-for="s in sections" :key="s.key">
              <div v-if="r[s.key]?.length" class="mt-2">
                <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ s.label }}</p>
                <ul class="ml-4 list-disc text-sm text-slate-600">
                  <li v-for="item in r[s.key]" :key="item">{{ item }}</li>
                </ul>
              </div>
            </template>
          </section>
        </div>
        <p class="mt-5 text-sm italic text-slate-500">{{ SIGNATURE }}</p>
        <button type="button" class="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90" @click="close">Got it</button>
      </div>
    </div>
  </Teleport>
  </div>
</template>
