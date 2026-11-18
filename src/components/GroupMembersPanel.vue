<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, Pencil, X } from "lucide-vue-next";
import { isAdminRole, supabase, type Profile } from "../lib/supabase";
import type { ChatGroup } from "../lib/thread";
import { toSquareWebp } from "../lib/media";
import UserAvatar from "./UserAvatar.vue";
import GroupAvatar from "./GroupAvatar.vue";

// Right-side panel listing every member of a group, split into online and offline.
// Opened by clicking the "X of Y online" counter under the group name in the chat header.
const props = defineProps<{ group: ChatGroup; me: Profile; people: Profile[]; online: Set<string> }>();
const emit = defineEmits<{ close: []; photo: [url: string | null]; rename: [name: string] }>();

const editingName = ref(false);
const nameDraft = ref("");
function startRename() { nameDraft.value = props.group.name; error.value = ""; editingName.value = true; }
async function saveName() {
  const name = nameDraft.value.trim();
  if (!name || name === props.group.name) return (editingName.value = false);
  busy.value = true;
  const { error: err } = await supabase.from("groups").update({ name }).eq("id", props.group.id);
  busy.value = false;
  if (err) return (error.value = err.code === "23505" ? "A group with that name already exists." : err.message);
  emit("rename", name);
  editingName.value = false;
}

// Admins, the group's creator and its members can change the group photo.
const canEdit = computed(() => isAdminRole(props.me.role) || !!props.group.can_edit_photo);
const fileInput = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const error = ref("");
const BUCKET = "group-avatars";

function pathFromUrl(url: string | null | undefined) {
  const marker = `/object/public/${BUCKET}/`;
  const i = url?.indexOf(marker) ?? -1;
  return i === -1 || !url ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

async function setPhoto(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) return (error.value = "Please choose an image file.");
  if (file.size > 5 * 1024 * 1024) return (error.value = "Photo must be 5 MB or smaller.");
  busy.value = true;
  error.value = "";
  const path = `${props.group.id}/${Date.now()}.webp`;
  try {
    const blob = await toSquareWebp(file);
    const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/webp" });
    if (up.error) throw up.error;
    const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const db = await supabase.from("groups").update({ avatar_url: url }).eq("id", props.group.id);
    if (db.error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw db.error;
    }
    const old = pathFromUrl(props.group.avatar_url);
    if (old) await supabase.storage.from(BUCKET).remove([old]);
    emit("photo", url);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Could not upload the photo.";
  } finally {
    busy.value = false;
  }
}

const memberProfiles = computed(() =>
  props.group.members
    .map((id) => (id === props.me.id ? props.me : props.people.find((p) => p.id === id)) ?? { id, full_name: "Unknown", avatar_url: null } as Profile)
);
const onlineMembers = computed(() =>
  memberProfiles.value.filter((p) => props.online.has(p.id)).sort((a, b) => a.full_name.localeCompare(b.full_name)));
const offlineMembers = computed(() =>
  memberProfiles.value.filter((p) => !props.online.has(p.id)).sort((a, b) => a.full_name.localeCompare(b.full_name)));
</script>

<template>
  <!-- Full-size overlay: clicking anywhere outside the panel closes it. -->
  <div class="absolute inset-0 z-20 flex justify-end bg-transparent" @click.self="$emit('close')">
    <aside class="flex w-80 flex-col border-l border-slate-200 bg-white shadow-xl">
      <header class="flex items-center gap-2 bg-slate-100 px-3 py-2.5">
        <!-- The header name doubles as the rename field. -->
        <form v-if="canEdit && editingName" class="flex min-w-0 flex-1 items-center gap-1" @submit.prevent="saveName">
          <input v-model="nameDraft" maxlength="60" autofocus @keydown.esc.stop="editingName = false"
            class="min-w-0 flex-1 rounded-md bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          <button :disabled="busy || !nameDraft.trim()" class="rounded p-1 text-emerald-600 hover:bg-slate-200 disabled:opacity-40" title="Save name"><Check class="h-4 w-4" /></button>
          <button type="button" class="rounded p-1 text-slate-500 hover:bg-slate-200" title="Cancel" @click="editingName = false"><X class="h-4 w-4" /></button>
        </form>
        <template v-else>
          <h3 class="min-w-0 truncate text-sm font-medium">{{ group.name }}</h3>
          <button v-if="canEdit" type="button" class="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900" title="Edit name" @click="startRename"><Pencil class="h-3.5 w-3.5" /></button>
          <span class="flex-1" />
        </template>
        <button v-if="!editingName" class="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900" title="Close" aria-label="Close" @click="$emit('close')"><X class="h-4 w-4" /></button>
      </header>
      <div class="min-h-0 flex-1 overflow-auto">
        <section class="flex flex-col items-center gap-2 border-b border-slate-100 py-4">
          <div class="relative">
            <GroupAvatar :group="group" size-class="h-24 w-24" icon-class="h-10 w-10" :class="busy ? 'opacity-50' : ''" />
            <template v-if="canEdit">
              <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="setPhoto" />
              <button type="button" :disabled="busy" :title="group.avatar_url ? 'Change photo' : 'Upload photo'"
                class="absolute right-0 top-0 rounded-full bg-white p-1.5 text-slate-600 shadow ring-1 ring-slate-200 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                @click="fileInput?.click()">
                <Pencil class="h-3.5 w-3.5" />
              </button>
            </template>
          </div>
          <p v-if="error" class="px-3 text-center text-xs text-red-600">{{ error }}</p>
        </section>
        <section class="border-b border-slate-100 py-2">
          <h4 class="px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-emerald-600">Online · {{ onlineMembers.length }}</h4>
          <p v-if="!onlineMembers.length" class="px-3 py-1.5 text-xs text-slate-500">No one is online.</p>
          <div v-for="p in onlineMembers" :key="p.id" class="flex items-center gap-2.5 px-3 py-1.5">
            <div class="relative shrink-0">
              <UserAvatar :user="p" size-class="h-8 w-8" />
              <span class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ p.full_name }}<span v-if="p.id === me.id" class="text-slate-500"> (you)</span></p>
              <p v-if="p.department" class="truncate text-2xs text-slate-500">{{ p.department }}</p>
            </div>
          </div>
        </section>
        <section class="py-2">
          <h4 class="px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-slate-500">Offline · {{ offlineMembers.length }}</h4>
          <div v-for="p in offlineMembers" :key="p.id" class="flex items-center gap-2.5 px-3 py-1.5 opacity-70">
            <div class="relative shrink-0">
              <UserAvatar :user="p" size-class="h-8 w-8" />
              <span class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-300" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm">{{ p.full_name }}<span v-if="p.id === me.id" class="text-slate-500"> (you)</span></p>
              <p v-if="p.department" class="truncate text-2xs text-slate-500">{{ p.department }}</p>
            </div>
          </div>
        </section>
      </div>
    </aside>
  </div>
</template>
