<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, CircleAlert, Eye, MessageSquareText } from "lucide-vue-next";
import { supabase, type HeaderMessage } from "../lib/supabase";

// Developer-only settings. The message is shown left of the refresh button for everyone.
const props = defineProps<{ headerMessage: HeaderMessage | null }>();
const emit = defineEmits<{ headerSaved: [value: HeaderMessage] }>();

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
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
    <div class="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-sm">
      <!-- Card header: icon, title and description, matching the admin section headers -->
      <div class="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <MessageSquareText class="h-4 w-4" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-semibold text-slate-900">Header message</h2>
          <p class="mt-0.5 text-xs text-slate-500">Shown to the left of the refresh button for every signed-in user.</p>
        </div>
      </div>

      <div class="space-y-5 px-5 py-5">
        <!-- Live preview: mirrors the app header bar -->
        <div>
          <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            <Eye class="h-3 w-3" /> Preview
          </p>
          <div class="flex items-center justify-end gap-2 rounded-lg bg-slate-200 px-3 py-2">
            <span class="min-w-0 flex-1 truncate text-right text-xs"
              :class="isLive ? 'text-slate-600' : 'italic text-slate-400'">
              {{ isLive ? previewText : (draftEnabled ? "Empty message" : "Hidden") }}
            </span>
          </div>
        </div>

        <!-- Message field -->
        <div>
          <label for="header-message" class="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Message</label>
          <input id="header-message" v-model="draftMessage" :maxlength="MESSAGE_MAX" placeholder="Type a message…"
            @input="markDirty"
            class="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          <div class="mt-2 flex items-center gap-2">
            <div class="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div class="h-full rounded-full transition-all"
                :class="usage >= 1 ? 'bg-red-500' : usage > 0.9 ? 'bg-amber-500' : 'bg-emerald-500'"
                :style="{ width: `${Math.min(usage, 1) * 100}%` }" />
            </div>
            <span class="text-[11px] tabular-nums text-slate-500">{{ draftMessage.length }}/{{ MESSAGE_MAX }}</span>
          </div>
        </div>

        <!-- Visibility switch -->
        <label class="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-slate-50 px-3 py-2.5">
          <span>
            <span class="block text-sm font-medium text-slate-900">Show in header</span>
            <span class="block text-xs text-slate-500">Turn off to hide the message without deleting it.</span>
          </span>
          <input v-model="draftEnabled" type="checkbox" role="switch" class="peer sr-only" @change="markDirty" />
          <span class="relative h-5 w-9 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500">
            <span class="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
              :class="draftEnabled ? 'translate-x-4' : ''" />
          </span>
        </label>
      </div>

      <!-- Footer: status on the left, primary action on the right -->
      <div class="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
        <p class="flex min-w-0 items-center gap-1.5 text-xs">
          <span v-if="error" class="flex items-center gap-1.5 text-red-600"><CircleAlert class="h-3.5 w-3.5 shrink-0" /> {{ error }}</span>
          <span v-else-if="saved" class="flex items-center gap-1.5 text-emerald-700"><Check class="h-3.5 w-3.5 shrink-0" /> Saved</span>
        </p>
        <button :disabled="saving" @click="save"
          class="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
          {{ saving ? "Saving…" : "Save" }}
        </button>
      </div>
    </div>
  </div>
</template>
