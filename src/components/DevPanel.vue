<script setup lang="ts">
import { ref, watch } from "vue";
import { supabase, type HeaderMessage } from "../lib/supabase";

// Developer-only settings. The message is shown left of the refresh button for everyone.
const props = defineProps<{ headerMessage: HeaderMessage | null }>();
const emit = defineEmits<{ headerSaved: [value: HeaderMessage] }>();

const MESSAGE_MAX = 200;
const draftMessage = ref(props.headerMessage?.message ?? "");
const draftEnabled = ref(props.headerMessage?.enabled ?? false);
const error = ref("");
const saved = ref(false);

// Keep the form in step with the stored value when it reloads (refresh, realtime).
watch(() => props.headerMessage, (h) => {
  if (!saved.value) {
    draftMessage.value = h?.message ?? "";
    draftEnabled.value = h?.enabled ?? false;
  }
});

async function save() {
  const message = draftMessage.value.trim();
  error.value = "";
  saved.value = false;
  if (message.length > MESSAGE_MAX) return (error.value = `Keep it under ${MESSAGE_MAX} characters.`);
  const value: HeaderMessage = { message, enabled: draftEnabled.value };
  const { error: dbErr } = await supabase.from("header_message").update(value).eq("id", 1);
  if (dbErr) return (error.value = dbErr.message);
  emit("headerSaved", value);
  saved.value = true;
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto rounded-xl bg-white p-5 shadow-sm">
    <h2 class="text-sm font-semibold text-slate-900">Header message</h2>
    <p class="mt-1 text-xs text-slate-500">Shown to the left of the refresh button for every signed-in user.</p>

    <input v-model="draftMessage" :maxlength="MESSAGE_MAX" placeholder="Type a message…" @input="saved = false"
      class="mt-4 w-full max-w-md rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
    <p class="mt-1 text-xs text-slate-400">{{ draftMessage.length }}/{{ MESSAGE_MAX }}</p>

    <label class="mt-3 flex items-center gap-2 text-sm text-slate-700">
      <input v-model="draftEnabled" type="checkbox" class="h-4 w-4 accent-emerald-600" @change="saved = false" />
      Show message in header
    </label>

    <button class="mt-4 w-fit rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      @click="save">Save</button>
    <p v-if="saved" class="mt-2 text-xs text-emerald-700">Saved</p>
    <p v-if="error" class="mt-2 text-xs text-red-600">{{ error }}</p>
  </div>
</template>
