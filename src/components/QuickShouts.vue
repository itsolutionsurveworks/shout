<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { Check, Pencil, Plus, Trash2, X } from "lucide-vue-next";
import { supabase, type Profile, type QuickShout } from "../lib/supabase";
import { onRefresh } from "../lib/refresh";
import { cached } from "../lib/cache";

const props = defineProps<{ me: Profile; disabled?: boolean }>();
const emit = defineEmits<{ send: [text: string]; error: [message: string] }>();

// Used once, to seed a brand-new account so the list isn't empty on first use.
const DEFAULTS = ["Please come to Office 3", "Call Ext. 102", "Please come to my desk"];

// Cached per user, so the saved shouts appear at once; the fresh list replaces them when it arrives.
const items = cached<QuickShout[]>(`quick:${props.me.id}`, []);
const draft = ref("");
const editingId = ref<string | null>(null);
const editText = ref("");
const loaded = ref(items.value.length > 0);
const manage = ref(false);

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

// Quick shouts are part of the dashboard, so the refresh button reloads them too.
let offRefresh: (() => void) | null = null;
onMounted(() => {
  load();
  offRefresh = onRefresh(load);
});
onUnmounted(() => offRefresh?.());
</script>

<template>
  <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <header class="mb-3 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-900">Quick shouts</h3>
      <button class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
        :class="manage ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-slate-200 text-slate-600 hover:bg-slate-100'"
        @click="manage = !manage">
        {{ manage ? "Done" : "Manage" }}
      </button>
    </header>

    <p v-if="loaded && !items.length" class="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
      No quick shouts yet. Click Manage to add one.
    </p>

    <!-- Send mode: one-tap chips -->
    <div v-if="!manage" class="flex max-h-28 flex-wrap gap-1.5 overflow-auto">
      <button v-for="q in items" :key="q.id"
        class="max-w-full truncate rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="disabled" :title="q.text" @click="emit('send', q.text)">{{ q.text }}</button>
    </div>

    <!-- Manage mode: edit / delete / add -->
    <template v-else>
      <ul class="flex max-h-40 flex-col gap-1 overflow-auto">
        <li v-for="q in items" :key="q.id" class="flex items-center gap-1.5">
          <template v-if="editingId === q.id">
            <input v-model="editText" maxlength="500" autofocus
              class="min-w-0 flex-1 rounded-md border border-emerald-500 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
              @keydown.enter.prevent="saveEdit(q)" @keydown.esc="editingId = null" />
            <button :disabled="!editText.trim()" title="Save" aria-label="Save"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              @click="saveEdit(q)"><Check class="h-3.5 w-3.5" /></button>
            <button title="Cancel" aria-label="Cancel"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              @click="editingId = null"><X class="h-3.5 w-3.5" /></button>
          </template>
          <template v-else>
            <span class="min-w-0 flex-1 truncate rounded-md bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700" :title="q.text">{{ q.text }}</span>
            <button title="Edit" aria-label="Edit"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              @click="startEdit(q)"><Pencil class="h-3.5 w-3.5" /></button>
            <button title="Delete" aria-label="Delete"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
              @click="remove(q)"><Trash2 class="h-3.5 w-3.5" /></button>
          </template>
        </li>
      </ul>
      <form class="mt-3 flex gap-1.5" @submit.prevent="add">
        <input v-model="draft" maxlength="500" placeholder="New quick shout…"
          class="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
        <button :disabled="!draft.trim()" title="Add" aria-label="Add"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40">
          <Plus class="h-4 w-4" />
        </button>
      </form>
    </template>

    <footer v-if="$slots.footer" class="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
      <slot name="footer" />
    </footer>
  </section>
</template>
