<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, toRef, watch } from "vue";
import { MessageCircle, ShieldAlert } from "lucide-vue-next";
import { supabase, type Notification, type Profile } from "../lib/supabase";
import { onlineIds } from "../lib/presence";
import { onRefresh } from "../lib/refresh";
import { cached, isFresh, markFetched, MINUTES } from "../lib/cache";
import { onActive } from "../lib/active";
import { PAGE, useThread, type ChatGroup, type ChatTarget } from "../lib/thread";
import ChatList from "../components/ChatList.vue";
import ChatThread from "../components/ChatThread.vue";

const props = defineProps<{ me: Profile }>();

// People and groups are cached per user: the list shows at once, then fresh data replaces it.
const people = cached<Profile[]>(`people:${props.me.id}`, []);
const groups = cached<ChatGroup[]>(`groups:${props.me.id}`, []);
// Plain senders can message people 1:1 but have no access to groups or group shouts.
const canUseGroups = props.me.role !== "sender";
const target = ref<ChatTarget | null>(null);
const toast = ref("");
const toastSpam = ref(false);
const thread = useThread(toRef(() => props.me.id));

async function load() {
  const [p, g] = await Promise.all([
    supabase.from("profiles").select("*").neq("id", props.me.id).order("full_name"),
    canUseGroups ? supabase.from("groups").select("id, name, avatar_url, created_by, group_members(user_id)") : Promise.resolve({ data: [], error: null }),
  ]);
  // A failed request keeps the last known list on screen; the error goes to the caller.
  if (p.error) throw p.error;
  if (g.error) throw g.error;
  markFetched(`people:${props.me.id}`);
  people.value = (p.data ?? []) as Profile[];
  groups.value = (g.data ?? []).map((x: any) => ({
    id: x.id,
    name: x.name,
    avatar_url: x.avatar_url,
    // Creator or member (checked before filtering myself out below) may change the photo.
    can_edit_photo: x.created_by === props.me.id || x.group_members.some((m: any) => m.user_id === props.me.id),
    // You can't shout yourself, so you're never a recipient of your own group shout.
    members: x.group_members.map((m: any) => m.user_id).filter((id: string) => id !== props.me.id),
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
// Only the newest PAGE messages of a conversation are shown; "Load earlier messages" widens the window
// (from the local cache first, then from the server) so nobody scrolls through unlimited history.
const visible = ref(PAGE);
watch(target, () => { visible.value = PAGE; });
const allMessages = computed(() => thread.forTarget(target.value));
const messages = computed(() => allMessages.value.slice(-visible.value));
const canEarlier = computed(() => allMessages.value.length > messages.value.length || thread.canLoadEarlier(target.value));
async function showEarlier() {
  visible.value += PAGE;
  if (allMessages.value.length < visible.value && target.value) {
    try { await thread.loadEarlier(target.value); } catch (e) { showToast(e instanceof Error ? e.message : "Could not load earlier messages."); }
  }
}

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
    // Rate limit from supabase/shout_rate_limit.sql: lasts as long as the 5-second window.
    if (error.message.includes("Spam Detected")) return showToast("Spam Detected", { spam: true, ms: 5000 });
    const hint = error.code === "42501" ? " (session expired? sign out and back in)" : "";
    return showToast(`Failed: ${error.message}${hint}`);
  }
  for (const n of (data ?? []) as Notification[]) thread.merge(n);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(t: string, opts: { spam?: boolean; ms?: number } = {}) {
  toast.value = t;
  toastSpam.value = !!opts.spam;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), opts.ms ?? 4000);
}

// Refresh button: reload people, groups and sent history (KeepAlive: only while shown).
let offRefresh: (() => void) | null = null;
onActivated(() => { offRefresh = onRefresh(() => Promise.all([load(), thread.load()])); });
onDeactivated(() => offRefresh?.());

// People and groups change rarely: while the cached copy is under 10 minutes old, opening or returning to
// the app does not refetch them (the Refresh button always does).
const PEOPLE_TTL = 10 * MINUTES;
const loadPeopleIfStale = () => {
  if (people.value.length && isFresh(`people:${props.me.id}`, PEOPLE_TTL)) return;
  load().catch((e) => console.error("Load failed", e)); // keep showing cached data
};
let offActive: (() => void) | undefined;
onMounted(() => {
  loadPeopleIfStale();
  offActive = onActive(loadPeopleIfStale, PEOPLE_TTL);
  thread.start();
});
onUnmounted(() => {
  offRefresh?.();
  offActive?.();
  clearTimeout(toastTimer);
  thread.stop();
});
</script>

<template>
  <!-- WhatsApp Web layout: chat list on the left, conversation on the right. -->
  <div class="flex min-h-0 min-w-0 flex-1 bg-white">
    <section class="flex w-[240px] shrink-0 flex-col border-r border-slate-200">
      <ChatList :people="people" :groups="canUseGroups ? groups : []" :show-groups="canUseGroups" :online="onlineIds" :selected="target"
        :for-target="thread.forTarget" @select="target = $event" />
    </section>

    <ChatThread v-if="user || group" :me="me" :user="user" :group="group" :people="people" :online="onlineIds"
      :messages="messages" :can-send="canSend" :can-earlier="canEarlier" :loading-earlier="thread.loadingEarlier.value"
      @earlier="showEarlier" @send="send" @error="showToast"
      @group-photo="(id, url) => { const g = groups.find((x) => x.id === id); if (g) g.avatar_url = url; }"
      @group-rename="(id, name) => { const g = groups.find((x) => x.id === id); if (g) g.name = name; }" />
    <section v-else class="flex flex-1 flex-col items-center justify-center bg-slate-50 text-center text-slate-500">
      <MessageCircle class="mb-3 h-14 w-14 text-slate-300" />
      <p class="text-lg font-light text-slate-600">Office Shout</p>
      <p class="mt-1 max-w-xs text-sm">Pick a person{{ canUseGroups ? " or group" : "" }} to send a shout and see when it's delivered and seen.</p>
    </section>

    <div v-if="toast" class="fixed bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-2.5 text-sm leading-none text-white shadow-lg"
      :class="toastSpam ? 'bg-amber-500' : 'bg-slate-900'" role="status">
      <ShieldAlert v-if="toastSpam" class="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{{ toast }}</span>
    </div>
  </div>
</template>
