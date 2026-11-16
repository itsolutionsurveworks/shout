<script setup lang="ts">
import { computed } from "vue";
import { X } from "lucide-vue-next";
import type { Profile } from "../lib/supabase";
import type { ChatGroup } from "../lib/thread";
import UserAvatar from "./UserAvatar.vue";

// Right-side panel listing every member of a group, split into online and offline.
// Opened by clicking the "X of Y online" counter under the group name in the chat header.
const props = defineProps<{ group: ChatGroup; me: Profile; people: Profile[]; online: Set<string> }>();
defineEmits<{ close: [] }>();

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
        <h3 class="flex-1 truncate text-sm font-medium">{{ group.name }}</h3>
        <button class="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900" title="Close" aria-label="Close" @click="$emit('close')"><X class="h-4 w-4" /></button>
      </header>
      <div class="min-h-0 flex-1 overflow-auto">
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
