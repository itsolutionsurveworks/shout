<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef } from "vue";
import { MessageCircle } from "lucide-vue-next";
import { supabase, type Notification, type Profile } from "../lib/supabase";
import { onlineIds } from "../lib/presence";
import { useThread, type ChatGroup, type ChatTarget } from "../lib/thread";
import ChatList from "../components/ChatList.vue";
import ChatThread from "../components/ChatThread.vue";

const props = defineProps<{ me: Profile }>();

const people = ref<Profile[]>([]);
const groups = ref<ChatGroup[]>([]);
const target = ref<ChatTarget | null>(null);
const toast = ref("");
const thread = useThread(toRef(() => props.me.id));

async function load() {
  const [p, g] = await Promise.all([
    supabase.from("profiles").select("*").neq("id", props.me.id).order("full_name"),
    supabase.from("groups").select("id, name, group_members(user_id)"),
  ]);
  people.value = (p.data ?? []) as Profile[];
  groups.value = (g.data ?? []).map((x: any) => ({
    id: x.id,
    name: x.name,
    members: x.group_members.map((m: any) => m.user_id),
  }));
}

const user = computed(() => (target.value?.kind === "user" ? people.value.find((u) => u.id === target.value!.id) ?? null : null));
const group = computed(() => (target.value?.kind === "group" ? groups.value.find((g) => g.id === target.value!.id) ?? null : null));
// Shouts only go to people who are online right now.
const recipients = computed(() => {
  const list = user.value ? [user.value] : people.value.filter((u) => group.value?.members.includes(u.id));
  return list.filter((u) => onlineIds.value.has(u.id));
});
const canSend = computed(() => recipients.value.length > 0);
const messages = computed(() => thread.forTarget(target.value));

async function send(message: string) {
  const list = recipients.value;
  const text = message.trim();
  if (!list.length) return showToast("No one is online to receive this shout.");
  if (!text) return;
  // Without a valid session the insert goes out as anonymous and RLS rejects it.
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return showToast("Your session has expired. Please sign out and sign in again.");

  const batch_id = crypto.randomUUID();
  const group_id = group.value?.id ?? null;
  const { data, error } = await supabase
    .from("notifications")
    .insert(list.map((u) => ({ sender_id: props.me.id, recipient_id: u.id, message: text, batch_id, group_id })))
    .select();
  if (error) {
    const hint = error.code === "42501" ? " (session expired? sign out and back in)" : "";
    return showToast(`Failed: ${error.message}${hint}`);
  }
  for (const n of (data ?? []) as Notification[]) thread.merge(n);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(t: string) {
  toast.value = t;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 4000);
}

onMounted(() => {
  load();
  thread.start();
});
onUnmounted(() => {
  clearTimeout(toastTimer);
  thread.stop();
});
</script>

<template>
  <!-- WhatsApp Web layout: chat list on the left, conversation on the right. -->
  <div class="flex min-h-0 min-w-0 flex-1 bg-white">
    <section class="flex w-[240px] shrink-0 flex-col border-r border-slate-200">
      <ChatList :people="people" :groups="groups" :online="onlineIds" :selected="target"
        :for-target="thread.forTarget" @select="target = $event" />
    </section>

    <ChatThread v-if="user || group" :me="me" :user="user" :group="group" :people="people" :online="onlineIds"
      :messages="messages" :can-send="canSend" @send="send" @error="showToast" />
    <section v-else class="flex flex-1 flex-col items-center justify-center bg-slate-50 text-center text-slate-500">
      <MessageCircle class="mb-3 h-14 w-14 text-slate-300" />
      <p class="text-lg font-light text-slate-600">Office Shout</p>
      <p class="mt-1 max-w-xs text-sm">Pick a person or group to send a shout and see when it's delivered and seen.</p>
    </section>

    <div v-if="toast" class="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
      {{ toast }}
    </div>
  </div>
</template>
