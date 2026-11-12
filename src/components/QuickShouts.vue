<script setup lang="ts">
import { onMounted, ref } from "vue";
import { supabase, type Profile, type QuickShout } from "../lib/supabase";

const props = defineProps<{ me: Profile; disabled?: boolean }>();
const emit = defineEmits<{ send: [text: string]; error: [message: string] }>();

// Used once, to seed a brand-new account so the list isn't empty on first use.
const DEFAULTS = ["Please come to Office 3", "Call Ext. 102", "Please come to my desk"];

const items = ref<QuickShout[]>([]);
const draft = ref("");
const editingId = ref<string | null>(null);
const editText = ref("");
const loaded = ref(false);

async function load() {
  const { data, error } = await supabase
    .from("quick_shouts")
    .select("*")
    .eq("owner_id", props.me.id)
    .order("created_at");
  if (error) return emit("error", error.message);
  if (!data.length) {
    const { data: seeded, error: seedErr } = await supabase
      .from("quick_shouts")
      .insert(DEFAULTS.map((text) => ({ owner_id: props.me.id, text })))
      .select();
    if (seedErr) return emit("error", seedErr.message);
    items.value = seeded as QuickShout[];
  } else {
    items.value = data as QuickShout[];
  }
  loaded.value = true;
}

async function add() {
  const text = draft.value.trim();
  if (!text) return;
  const { data, error } = await supabase
    .from("quick_shouts")
    .insert({ owner_id: props.me.id, text })
    .select()
    .single();
  if (error) return emit("error", error.message);
  items.value.push(data as QuickShout);
  draft.value = "";
}

function startEdit(q: QuickShout) {
  editingId.value = q.id;
  editText.value = q.text;
}

async function saveEdit(q: QuickShout) {
  const text = editText.value.trim();
  if (!text) return;
  const { data, error } = await supabase
    .from("quick_shouts")
    .update({ text })
    .eq("id", q.id)
    .select()
    .single();
  if (error) return emit("error", error.message);
  const i = items.value.findIndex((x) => x.id === q.id);
  if (i !== -1) items.value[i] = data as QuickShout;
  editingId.value = null;
}

async function remove(q: QuickShout) {
  const { error } = await supabase.from("quick_shouts").delete().eq("id", q.id);
  if (error) return emit("error", error.message);
  items.value = items.value.filter((x) => x.id !== q.id);
}

onMounted(load);
</script>

<template>
  <div>
    <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Quick shout</p>
    <p v-if="loaded && !items.length" class="mb-2 text-sm text-slate-400">No quick shouts yet. Add one below.</p>

    <div class="grid gap-2">
      <div v-for="q in items" :key="q.id" class="flex items-center gap-2">
        <template v-if="editingId === q.id">
          <input v-model="editText" maxlength="500" autofocus
            class="flex-1 rounded-lg border border-blue-400 px-3 py-2 text-sm focus:outline-none"
            @keydown.enter.prevent="saveEdit(q)" @keydown.esc="editingId = null" />
          <button class="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            :disabled="!editText.trim()" @click="saveEdit(q)">Save</button>
          <button class="px-2 py-2 text-sm text-slate-500 hover:text-slate-900" @click="editingId = null">Cancel</button>
        </template>
        <template v-else>
          <button class="flex-1 truncate rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-medium hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
            :disabled="disabled" :title="q.text" @click="emit('send', q.text)">{{ q.text }}</button>
          <button class="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit" aria-label="Edit"
            @click="startEdit(q)">✎</button>
          <button class="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete" aria-label="Delete"
            @click="remove(q)">✕</button>
        </template>
      </div>
    </div>

    <form class="mt-2 flex gap-2" @submit.prevent="add">
      <input v-model="draft" maxlength="500" placeholder="New quick shout…"
        class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
      <button :disabled="!draft.trim()"
        class="rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
        Add
      </button>
    </form>
  </div>
</template>
