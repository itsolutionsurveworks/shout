<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Send, Smile, Users, Zap } from "lucide-vue-next";
import EmojiGifPicker from "./EmojiGifPicker.vue";
import type { Notification, Profile } from "../lib/supabase";
import { dayLabel, type ChatGroup, type ChatMessage } from "../lib/thread";
import { replyLabel } from "../lib/receipts";
import ReplyBubble from "./ReplyBubble.vue";
import UserAvatar from "./UserAvatar.vue";
import MessageBubble from "./MessageBubble.vue";
import MessageInfo from "./MessageInfo.vue";
import QuickShouts from "./QuickShouts.vue";

const props = defineProps<{
  me: Profile;
  user: Profile | null;
  group: ChatGroup | null;
  people: Profile[];
  online: Set<string>;
  messages: ChatMessage[];
  canSend: boolean;
}>();
const emit = defineEmits<{ send: [text: string]; error: [m: string] }>();

const draft = ref("");
const showQuick = ref(false);
const showPicker = ref(false);
const infoKey = ref<string | null>(null);
const scroller = ref<HTMLElement | null>(null);
const infoMsg = computed(() => props.messages.find((m) => m.key === infoKey.value) ?? null);

const memberOnline = computed(() => props.group?.members.filter((m) => props.online.has(m)).length ?? 0);
const subtitle = computed(() =>
  props.user
    ? props.online.has(props.user.id) ? "online" : "offline · shouts reach online people only"
    : `${memberOnline.value} of ${props.group?.members.length ?? 0} online`);

// Timeline: my messages plus each recipient's reply, ordered by time, with a date
// separator whenever the day changes.
type Entry = { id: string; at: string; m?: ChatMessage; reply?: Notification };
const items = computed(() => {
  const entries: Entry[] = [];
  for (const m of props.messages) {
    entries.push({ id: m.key, at: m.created_at, m });
    for (const r of m.rows) {
      if (replyLabel(r.status)) entries.push({ id: `r-${r.id}`, at: r.acknowledged_at ?? r.delivered_at ?? r.created_at, reply: r });
    }
  }
  entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let last = "";
  return entries.map((e) => {
    const day = new Date(e.at).toDateString();
    const sep = day !== last ? dayLabel(e.at) : null;
    last = day;
    return { e, sep };
  });
});
const nameOf = (id: string) => props.people.find((p) => p.id === id)?.full_name ?? "Someone";

function submit() {
  if (!draft.value.trim() || !props.canSend) return;
  emit("send", draft.value);
  draft.value = "";
}

function sendGif(url: string) {
  if (!props.canSend) return;
  emit("send", url);
  showPicker.value = false;
}

function toBottom() {
  nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; });
}
// Follow the whole timeline, not just my messages: new sends, incoming replies and the
// initial history load all change the entry count, so the latest item stays in view.
watch(() => items.value.length, toBottom);
watch(() => [props.user?.id, props.group?.id], () => { infoKey.value = null; toBottom(); }, { immediate: true });
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <!-- Header and chat wallpaper. The info panel is confined to this area, so it covers the
         header but stops above the quick shouts. -->
    <div class="relative flex min-h-0 flex-1 flex-col">
      <header class="flex items-center gap-3 bg-slate-100 px-4 py-2.5">
        <UserAvatar v-if="user" :user="user" size-class="h-10 w-10" />
        <span v-else class="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Users class="h-5 w-5" /></span>
        <div class="min-w-0">
          <h2 class="truncate font-medium leading-tight">{{ user?.full_name ?? group?.name }}</h2>
          <p class="text-xs" :class="subtitle.startsWith('offline') ? 'text-slate-500' : 'text-emerald-600'">{{ subtitle }}</p>
        </div>
      </header>

      <div ref="scroller" class="min-h-0 flex-1 space-y-1.5 overflow-auto bg-slate-50 px-4 py-3">
        <p v-if="!items.length" class="mx-auto mt-8 w-fit rounded-lg bg-amber-50 px-3 py-1.5 text-center text-xs text-slate-600 shadow-sm">
          No shouts yet. Tap a quick shout below to send it.
        </p>
        <template v-for="{ e, sep } in items" :key="e.id">
          <div v-if="sep" class="flex justify-center py-1">
            <span class="rounded-lg bg-white/90 px-3 py-1 text-2xs font-medium uppercase text-slate-500 shadow-sm">{{ sep }}</span>
          </div>
          <MessageBubble v-if="e.m" :msg="e.m" @info="infoKey = e.m.key" />
          <ReplyBubble v-else-if="e.reply" :row="e.reply" :name="nameOf(e.reply.recipient_id)" :show-name="!!group" />
        </template>
      </div>
    </div>

    <div v-if="canSend" class="relative">
      <!-- Quick shouts: floating card above the input bar, toggled by the Zap button. -->
      <div v-show="showQuick" class="absolute bottom-full left-3 right-3 z-20 mb-2 rounded-xl shadow-xl">
        <QuickShouts :me="me" @send="(t) => emit('send', t)" @error="(m) => emit('error', m)" />
      </div>

      <!-- Input bar: quick shout toggle on the left, custom message, send. -->
      <div v-show="showPicker" class="absolute bottom-full left-3 right-3 z-20 mb-2">
        <EmojiGifPicker @emoji="(e) => (draft += e)" @gif="sendGif" />
      </div>

      <form class="flex items-center gap-2 bg-slate-100 px-3 py-2" @submit.prevent="submit">
        <button type="button" aria-label="Emoji and GIFs" title="Emoji and GIFs"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors"
          :class="showPicker ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-600 hover:bg-emerald-50'"
          @click="showPicker = !showPicker; showQuick = false">
          <Smile class="h-4 w-4" />
        </button>
        <button type="button" :aria-expanded="showQuick" aria-label="Quick shouts"
          :title="showQuick ? 'Hide quick shouts' : 'Show quick shouts'"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors"
          :class="showQuick ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white text-emerald-600 hover:bg-emerald-50'"
          @click="showQuick = !showQuick; showPicker = false">
          <Zap class="h-4 w-4" />
        </button>
        <input v-model="draft" maxlength="500" :disabled="!canSend" placeholder="Type a custom message"
          class="flex-1 rounded-lg bg-white px-3 py-2 text-sm focus:outline-none disabled:bg-slate-50" />
        <button :disabled="!draft.trim() || !canSend"
          class="rounded-full bg-emerald-600 p-2.5 text-white hover:bg-emerald-700 disabled:opacity-40" title="Send">
          <Send class="h-4 w-4" />
        </button>
      </form>
    </div>
    <div v-else class="bg-slate-50 px-4 py-3 text-center text-xs text-slate-600">
      Nobody here is online right now, so shouts can't be sent.
    </div>

    <!-- Overlays the whole chat (header, messages, quick shouts, custom message). -->
    <Transition name="side-panel">
      <MessageInfo v-if="infoMsg" :msg="infoMsg" :people="people" :group-members="group?.members" @close="infoKey = null" />
    </Transition>
  </div>
</template>
