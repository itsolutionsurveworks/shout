<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Check, CircleAlert, Eye, MessageSquareText, Palette, Send, Users } from "lucide-vue-next";
import { supabase, type HeaderMessage, type Profile } from "../lib/supabase";
import { THEMES, THEME_KEYS, isThemeKey, type ThemeKey } from "../lib/themes";

// Developer-only tools. The header message is shown left of the refresh button for everyone.
const props = defineProps<{ headerMessage: HeaderMessage | null; users: Profile[] }>();
const emit = defineEmits<{ headerSaved: [value: HeaderMessage] }>();

// ---- App versions -------------------------------------------------------
// An account is up to date when its last reported version matches this build.
const CURRENT_VERSION = __APP_VERSION__;
type VersionFilter = "all" | "current" | "outdated";
const versionFilter = ref<VersionFilter>("outdated");

const currentUsers = computed(() => props.users.filter((u) => u.app_version === CURRENT_VERSION));
const outdatedUsers = computed(() => props.users
  .filter((u) => u.app_version !== CURRENT_VERSION)
  .sort((a, b) => (a.app_version ?? "").localeCompare(b.app_version ?? "") || a.full_name.localeCompare(b.full_name)));

const shownUsers = computed(() => {
  if (versionFilter.value === "current") return currentUsers.value;
  if (versionFilter.value === "outdated") return outdatedUsers.value;
  return [...props.users].sort((a, b) => a.full_name.localeCompare(b.full_name));
});

// Clicking a count filters the list to it; clicking it again shows everyone.
function toggleFilter(f: Exclude<VersionFilter, "all">) {
  versionFilter.value = versionFilter.value === f ? "all" : f;
}

// ---- Push update --------------------------------------------------------
// Writes a new timestamp to app_update. Every open app is subscribed and checks for a release.
const pushing = ref(false);
const pushError = ref("");
const pushed = ref(false);

async function pushUpdate() {
  pushError.value = "";
  pushed.value = false;
  pushing.value = true;
  const { error: dbErr } = await supabase.from("app_update")
    .update({ pushed_at: new Date().toISOString() }).eq("id", 1);
  pushing.value = false;
  if (dbErr) return (pushError.value = dbErr.message);
  pushed.value = true;
}

// ---- App theme ----------------------------------------------------------
// Stored in the app_theme table. App.vue applies it to everyone, live.
const themeKey = ref<ThemeKey>("default");
const themeDraft = ref<ThemeKey>("default");
const themeSaving = ref(false);
const themeError = ref("");
const themeSaved = ref(false);

async function loadTheme() {
  const { data } = await supabase.from("app_theme").select("theme_key").eq("id", 1).single();
  const key = data?.theme_key;
  if (isThemeKey(key)) themeKey.value = themeDraft.value = key;
}

async function saveTheme() {
  themeError.value = "";
  themeSaved.value = false;
  themeSaving.value = true;
  const { error: dbErr } = await supabase.from("app_theme")
    .update({ theme_key: themeDraft.value, updated_at: new Date().toISOString() }).eq("id", 1);
  themeSaving.value = false;
  if (dbErr) return (themeError.value = dbErr.message);
  themeKey.value = themeDraft.value;
  themeSaved.value = true;
}

onMounted(loadTheme);

// ---- Header message -----------------------------------------------------
const MESSAGE_MAX = 200;
const draftMessage = ref(props.headerMessage?.message ?? "");
const draftEnabled = ref(props.headerMessage?.enabled ?? false);
const error = ref("");
const saved = ref(false);
const saving = ref(false);

// Keep the form in step with the stored value when it reloads (refresh, realtime).
watch(() => props.headerMessage, (h) => {
  if (!saved.value) {
    draftMessage.value = h?.message ?? "";
    draftEnabled.value = h?.enabled ?? false;
  }
});

const usage = computed(() => draftMessage.value.length / MESSAGE_MAX);
const previewText = computed(() => draftMessage.value.trim());
const isLive = computed(() => draftEnabled.value && previewText.value.length > 0);

function markDirty() {
  saved.value = false;
}

async function save() {
  const message = draftMessage.value.trim();
  error.value = "";
  saved.value = false;
  if (message.length > MESSAGE_MAX) return (error.value = `Keep it under ${MESSAGE_MAX} characters.`);
  const value: HeaderMessage = { message, enabled: draftEnabled.value };
  saving.value = true;
  const { error: dbErr } = await supabase.from("header_message").update(value).eq("id", 1);
  saving.value = false;
  if (dbErr) return (error.value = dbErr.message);
  emit("headerSaved", value);
  saved.value = true;
}
</script>

<template>
  <div class="min-h-0 min-w-0 flex-1 overflow-auto">
    <div class="grid gap-4 md:grid-cols-2">
      <!-- Left column: releases and version status -->
      <div class="flex min-w-0 flex-col gap-4">
        <section class="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header class="flex items-center gap-3 px-5 py-4">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center text-emerald-700">
              <Send class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-semibold text-slate-900">Push update</h2>
              <p class="text-xs text-slate-500">Open apps check for the latest release right away. Publish it first.</p>
            </div>
            <button :disabled="pushing" @click="pushUpdate"
              class="shrink-0 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
              {{ pushing ? "Pushing…" : "Push" }}
            </button>
          </header>
          <p v-if="pushError || pushed" class="flex items-center gap-1.5 border-t border-slate-100 px-5 py-2.5 text-xs">
            <span v-if="pushError" class="flex items-center gap-1.5 text-red-600"><CircleAlert class="h-3.5 w-3.5 shrink-0" /> {{ pushError }}</span>
            <span v-else class="flex items-center gap-1.5 text-emerald-700"><Check class="h-3.5 w-3.5 shrink-0" /> Pushed to online users</span>
          </p>
        </section>

        <section class="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
          <header class="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center text-emerald-700">
              <Users class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-semibold text-slate-900">App versions</h2>
              <p class="text-xs text-slate-500">Current build {{ CURRENT_VERSION }}. Click a count to filter.</p>
            </div>
          </header>

          <!-- Counts double as filters -->
          <div class="grid grid-cols-2 gap-3 px-5 py-4">
            <button type="button" :aria-pressed="versionFilter === 'current'" @click="toggleFilter('current')"
              class="rounded-lg border px-3 py-2.5 text-left transition-colors"
              :class="versionFilter === 'current' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'">
              <span class="block text-xl font-semibold tabular-nums text-emerald-700">{{ currentUsers.length }}</span>
              <span class="text-xs text-slate-600">Up to date</span>
            </button>
            <button type="button" :aria-pressed="versionFilter === 'outdated'" @click="toggleFilter('outdated')"
              class="rounded-lg border px-3 py-2.5 text-left transition-colors"
              :class="versionFilter === 'outdated' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'">
              <span class="block text-xl font-semibold tabular-nums text-amber-700">{{ outdatedUsers.length }}</span>
              <span class="text-xs text-slate-600">Not up to date</span>
            </button>
          </div>

          <div class="flex items-center justify-between border-t border-slate-100 px-5 py-2 text-2xs font-medium uppercase tracking-wide text-slate-500">
            <span>{{ versionFilter === 'all' ? 'Everyone' : versionFilter === 'current' ? 'Up to date' : 'Not up to date' }}</span>
            <span class="tabular-nums">{{ shownUsers.length }}</span>
          </div>
          <ul v-if="shownUsers.length" class="max-h-72 divide-y divide-slate-100 overflow-auto border-t border-slate-100 text-xs">
            <li v-for="u in shownUsers" :key="u.id" class="flex items-center justify-between gap-3 px-5 py-2">
              <span class="min-w-0 truncate text-slate-800">{{ u.full_name }}</span>
              <span class="shrink-0 tabular-nums"
                :class="u.app_version === CURRENT_VERSION ? 'text-emerald-700' : 'text-amber-700'">
                {{ u.app_version ? 'v' + u.app_version : 'never reported' }}
              </span>
            </li>
          </ul>
          <p v-else class="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">No accounts here.</p>
        </section>
      </div>

      <!-- Right column: appearance and header message -->
      <div class="flex min-w-0 flex-col gap-4">
        <section class="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header class="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center text-emerald-700">
              <Palette class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-semibold text-slate-900">App theme</h2>
              <p class="text-xs text-slate-500">Applies to every signed-in user, right away.</p>
            </div>
          </header>
          <div class="space-y-3 px-5 py-4">
            <!-- Mini preview of the header and background for the picked theme -->
            <div class="overflow-hidden rounded-lg border border-slate-200" :style="{ background: THEMES[themeDraft].background }">
              <div class="flex items-center gap-2 px-3 py-2" :style="{ background: THEMES[themeDraft].header }">
                <span v-if="THEMES[themeDraft].badge" class="text-base leading-none" aria-hidden="true">{{ THEMES[themeDraft].badge }}</span>
                <span class="text-xs font-semibold text-slate-800">{{ THEMES[themeDraft].label }}</span>
                <span class="ml-auto h-1 w-10 rounded-full" :style="{ background: THEMES[themeDraft].accent }" />
              </div>
              <p class="px-3 py-3 text-xs text-slate-600">{{ THEMES[themeDraft].preview }}</p>
            </div>
            <div class="flex items-center gap-2">
              <select v-model="themeDraft" aria-label="App theme"
                class="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                <option v-for="k in THEME_KEYS" :key="k" :value="k">{{ THEMES[k].badge ? THEMES[k].badge + ' ' : '' }}{{ THEMES[k].label }}</option>
              </select>
              <button :disabled="themeSaving || themeDraft === themeKey" @click="saveTheme"
                class="shrink-0 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
                {{ themeSaving ? "Saving…" : "Apply" }}
              </button>
            </div>
          </div>
          <p v-if="themeError || themeSaved" class="flex items-center gap-1.5 border-t border-slate-100 px-5 py-2.5 text-xs">
            <span v-if="themeError" class="flex items-center gap-1.5 text-red-600"><CircleAlert class="h-3.5 w-3.5 shrink-0" /> {{ themeError }}</span>
            <span v-else class="flex items-center gap-1.5 text-emerald-700"><Check class="h-3.5 w-3.5 shrink-0" /> Theme applied</span>
          </p>
        </section>

        <section class="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header class="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center text-emerald-700">
              <MessageSquareText class="h-4 w-4" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-semibold text-slate-900">Header message</h2>
              <p class="text-xs text-slate-500">Shown left of the refresh button for every user.</p>
            </div>
          </header>

          <div class="space-y-4 px-5 py-4">
            <div>
              <p class="mb-1.5 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-slate-500">
                <Eye class="h-3 w-3" /> Preview
              </p>
              <div class="flex items-center justify-end rounded-lg bg-slate-200 px-3 py-2">
                <span class="min-w-0 flex-1 truncate text-right text-xs"
                  :class="isLive ? 'text-slate-600' : 'italic text-slate-400'">
                  {{ isLive ? previewText : (draftEnabled ? "Empty message" : "Hidden") }}
                </span>
              </div>
            </div>

            <div>
              <label for="header-message" class="mb-1.5 block text-2xs font-medium uppercase tracking-wide text-slate-500">Message</label>
              <input id="header-message" v-model="draftMessage" :maxlength="MESSAGE_MAX" placeholder="Type a message…"
                @input="markDirty"
                class="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              <div class="mt-2 flex items-center gap-2">
                <div class="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full transition-all"
                    :class="usage >= 1 ? 'bg-red-500' : usage > 0.9 ? 'bg-amber-500' : 'bg-emerald-500'"
                    :style="{ width: `${Math.min(usage, 1) * 100}%` }" />
                </div>
                <span class="text-2xs tabular-nums text-slate-500">{{ draftMessage.length }}/{{ MESSAGE_MAX }}</span>
              </div>
            </div>

            <label class="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2.5">
              <span>
                <span class="block text-sm font-medium text-slate-900">Show in header</span>
                <span class="block text-xs text-slate-500">Turn off to hide without deleting.</span>
              </span>
              <input v-model="draftEnabled" type="checkbox" role="switch" class="peer sr-only" @change="markDirty" />
              <span class="relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500">
                <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                  :class="draftEnabled ? 'translate-x-4' : ''" />
              </span>
            </label>
          </div>

          <div class="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
            <p class="flex min-w-0 items-center gap-1.5 text-xs">
              <span v-if="error" class="flex items-center gap-1.5 text-red-600"><CircleAlert class="h-3.5 w-3.5 shrink-0" /> {{ error }}</span>
              <span v-else-if="saved" class="flex items-center gap-1.5 text-emerald-700"><Check class="h-3.5 w-3.5 shrink-0" /> Saved</span>
            </p>
            <button :disabled="saving" @click="save"
              class="shrink-0 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
              {{ saving ? "Saving…" : "Save" }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
