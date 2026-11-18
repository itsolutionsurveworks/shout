<script lang="ts">
import { ref as vref } from "vue";
import { supabase as sb } from "../lib/supabase";

// The hint is shown until the user first opens quick shouts; stays hidden until sign-out.
const HINT_KEY = "quickShoutHintSeen";
const hintSeen = vref(sessionStorage.getItem(HINT_KEY) === "1");
sb.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    sessionStorage.removeItem(HINT_KEY);
    hintSeen.value = false;
  }
});
function markHintSeen() {
  hintSeen.value = true;
  sessionStorage.setItem(HINT_KEY, "1");
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ImagePlus, MessageCircle, Send, Smile } from "lucide-vue-next";
import GroupAvatar from "./GroupAvatar.vue";
import EmojiGifPicker from "./EmojiGifPicker.vue";
import { supabase, type Profile } from "../lib/supabase";
import { dayLabel, type ChatGroup, type ChatMessage } from "../lib/thread";
import UserAvatar from "./UserAvatar.vue";
import MessageBubble from "./MessageBubble.vue";
import MessageInfo from "./MessageInfo.vue";
import QuickShouts from "./QuickShouts.vue";
import GroupMembersPanel from "./GroupMembersPanel.vue";
import { SHOUT_MAX } from "../lib/limits";
import { photoBox } from "../lib/media";

const props = defineProps<{
  me: Profile;
  user: Profile | null;
  group: ChatGroup | null;
  people: Profile[];
  online: Set<string>;
  messages: ChatMessage[];
  canSend: boolean;
}>();
const emit = defineEmits<{ send: [text: string]; error: [m: string]; groupPhoto: [id: string, url: string | null]; groupRename: [id: string, name: string] }>();

const draft = ref("");
// Quick shouts are open by default.
const showQuick = ref(false);
const showPicker = ref(false);
const infoKey = ref<string | null>(null);
const showMembers = ref(false);
const scroller = ref<HTMLElement | null>(null);
const infoMsg = computed(() => props.messages.find((m) => m.key === infoKey.value) ?? null);

const memberOnline = computed(() => props.group?.members.filter((m) => props.online.has(m)).length ?? 0);
const subtitle = computed(() =>
  props.user
    ? props.online.has(props.user.id) ? "online" : "offline · shouts reach online people only"
    : `${memberOnline.value} of ${props.group?.members.length ?? 0} online`);

// Timeline: every message in the conversation (sent and received), oldest first, with a
// date separator whenever the day changes.
const items = computed(() => {
  let last = "";
  return props.messages.map((m) => {
    const day = new Date(m.created_at).toDateString();
    const sep = day !== last ? dayLabel(m.created_at) : null;
    last = day;
    return { m, sep };
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

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTO_PX = 1280;
const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

// Downscale and re-encode as WebP so uploads stay small; the .webp URL is shown as an image.
async function toWebp(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (!blob) throw new Error("Could not process the image.");
  return { blob, w: canvas.width, h: canvas.height };
}

// While a photo uploads, a dimmed preview bubble with a spinner sits at the bottom of the thread.
const pending = ref<{ url: string; w: number; h: number } | null>(null);
// Same sizing rule MessageContent uses for photos, so the placeholder and the final bubble match.
const photoBoxStyle = photoBox;
function clearPending() {
  if (!pending.value || uploading.value) return;
  URL.revokeObjectURL(pending.value.url);
  pending.value = null;
}
watch(() => items.value.length, clearPending);

async function sendPhoto(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !props.canSend) return;
  if (!file.type.startsWith("image/")) return emit("error", "Please choose an image file.");
  if (file.size > MAX_PHOTO_BYTES) return emit("error", "Photo must be 10 MB or smaller.");
  uploading.value = true;
  try {
    const { blob, w, h } = await toWebp(file);
    pending.value = { url: URL.createObjectURL(blob), w, h };
    toBottom();
    const path = `${props.me.id}/${Date.now()}.webp`;
    const { error } = await supabase.storage.from("chat-images").upload(path, blob, { contentType: "image/webp" });
    if (error) throw error;
    // The size rides along in the URL fragment so every viewer can reserve the right space before it loads.
    emit("send", `${supabase.storage.from("chat-images").getPublicUrl(path).data.publicUrl}#${w}x${h}`);
  } catch (err) {
    emit("error", err instanceof Error ? err.message : "Could not upload the photo.");
  } finally {
    uploading.value = false;
    // Hand over to the real message as soon as it shows up in the thread (or after a short fallback).
    setTimeout(clearPending, 4000);
  }
}

function toBottom() {
  atBottom.value = true;
  nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; });
}
// Whether the user is at (or near) the newest message. Tracked on scroll so a GIF finishing
// its load can keep the view pinned to the bottom, instead of leaving a gap below.
const atBottom = ref(true);
function updateAtBottom() {
  const el = scroller.value;
  if (el) atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}
function onMediaLoad() {
  if (atBottom.value) toBottom();
}
// Follow the whole timeline, not just my messages: new sends, incoming replies and the
// initial history load all change the entry count, so the latest item stays in view.
watch(() => items.value.length, toBottom);
watch(() => [props.user?.id, props.group?.id], () => { infoKey.value = null; showMembers.value = false; toBottom(); }, { immediate: true });

// Pressing anywhere outside the quick shout and emoji/GIF panels (and their toggle buttons)
// collapses them. The toggle buttons are excluded so their own click handlers still work.
const quickPanel = ref<HTMLElement | null>(null);
const pickerPanel = ref<HTMLElement | null>(null);
const quickToggle = ref<HTMLElement | null>(null);
const pickerToggle = ref<HTMLElement | null>(null);
function onOutsidePress(e: PointerEvent) {
  const t = e.target as Node;
  const inside = [quickPanel, pickerPanel, quickToggle, pickerToggle].some((r) => r.value?.contains(t));
  if (inside) return;
  showQuick.value = false;
  showPicker.value = false;
}
onMounted(() => document.addEventListener("pointerdown", onOutsidePress));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onOutsidePress));
</script>

<template>
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
    <!-- Header and chat wallpaper. The info panel is confined to this area, so it covers the
         header but stops above the quick shouts. -->
    <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <header class="bg-slate-100">
        <!-- For a group the whole avatar + name + counter block is one button that opens the group panel. -->
        <button v-if="group && !user" type="button" title="Group info"
          class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-200/60" @click="showMembers = true">
          <GroupAvatar :group="group" size-class="h-10 w-10" icon-class="h-5 w-5" />
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium leading-tight">{{ group.name }}</span>
            <span class="block text-xs text-emerald-600">{{ subtitle }}</span>
          </span>
        </button>
        <div v-else class="flex items-center gap-3 px-4 py-2.5">
          <UserAvatar v-if="user" :user="user" size-class="h-10 w-10" />
          <div class="min-w-0">
            <h2 class="truncate text-sm font-medium leading-tight">{{ user?.full_name }}</h2>
            <p class="text-xs" :class="subtitle.startsWith('offline') ? 'text-slate-500' : 'text-emerald-600'">{{ subtitle }}</p>
          </div>
        </div>
      </header>

      <div ref="scroller" class="min-h-0 flex-1 space-y-1.5 overflow-auto bg-slate-50 px-4 py-3"
        @scroll="updateAtBottom" @load.capture="onMediaLoad">
        <p v-if="!items.length" class="mx-auto mt-8 w-fit rounded-lg bg-amber-50 px-3 py-1.5 text-center text-xs text-slate-600 shadow-sm">
          No shouts yet. Tap a quick shout below to send it.
        </p>
        <template v-for="{ m, sep } in items" :key="m.key">
          <div v-if="sep" class="flex justify-center py-1">
            <span class="rounded-lg bg-white/90 px-3 py-1 text-2xs font-medium uppercase text-slate-500 shadow-sm">{{ sep }}</span>
          </div>
          <MessageBubble :msg="m" :sender-name="!m.mine && group ? nameOf(m.sender_id) : ''" @info="infoKey = m.key" />
        </template>
        <!-- Photo being uploaded: sized to the image, dimmed, with a spinner. -->
        <div v-if="pending" class="flex flex-col items-end">
          <div class="relative max-w-[85%] rounded-lg rounded-tr-none bg-emerald-100 p-2.5 shadow-sm">
            <div class="relative overflow-hidden rounded-md" :style="photoBoxStyle(pending.w, pending.h)">
              <img :src="pending.url" alt="" class="h-full w-full object-contain opacity-50" />
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="h-8 w-8 animate-spin rounded-full border-[3px] border-white border-t-emerald-600 shadow"></span>
              </div>
            </div>
            <p class="mt-0.5 text-right text-2xs text-slate-500">Uploading…</p>
          </div>
        </div>
      </div>
    </div>

    <div v-if="canSend" class="relative">
      <!-- Quick shouts: floating card above the input bar, toggled by the Zap button. -->
      <Transition name="picker-rise">
        <div v-show="showQuick" ref="quickPanel" class="absolute bottom-full left-3 right-3 z-20 mb-2 rounded-xl shadow-xl">
          <QuickShouts :me="me" @send="(t) => emit('send', t)" @error="(m) => emit('error', m)" />
        </div>
      </Transition>

      <!-- Input bar: quick shout toggle on the left, custom message, send. -->
      <Transition name="picker-rise">
        <div v-show="showPicker" ref="pickerPanel" class="absolute bottom-full left-3 right-3 z-20 mb-2 rounded-xl shadow-xl">
          <EmojiGifPicker @emoji="(e) => (draft = (draft + e).slice(0, SHOUT_MAX))" @gif="sendGif" />
        </div>
      </Transition>

      <form class="relative z-30 flex items-center gap-2 bg-slate-100 px-3 py-2" @submit.prevent="submit">
        <div class="relative shrink-0">
          <span v-if="!showQuick && !hintSeen" aria-hidden="true"
            class="pointer-events-none absolute bottom-full left-0 mb-3 animate-bounce whitespace-nowrap rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white shadow">
            Quick Shouts
            <span class="absolute left-[14px] top-full h-0 w-0 border-x-4 border-t-4 border-x-transparent border-t-emerald-600"></span>
          </span>
          <button ref="quickToggle" type="button" :aria-expanded="showQuick" aria-label="Quick shouts"
            :title="showQuick ? 'Hide quick shouts' : 'Show quick shouts'"
            class="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
            :class="showQuick ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white text-emerald-600 hover:bg-emerald-50'"
            @click="showQuick = !showQuick; showPicker = false; markHintSeen()">
            <MessageCircle class="h-4 w-4" />
          </button>
        </div>
        <button ref="pickerToggle" type="button" aria-label="Emoji and GIFs" title="Emoji and GIFs"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors"
          :class="showPicker ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-600 hover:bg-emerald-50'"
          @click="showPicker = !showPicker; showQuick = false">
          <Smile class="h-4 w-4" />
        </button>
        <template v-if="group || user">
          <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="sendPhoto" />
          <button type="button" aria-label="Send photo" title="Send photo" :disabled="uploading"
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 transition-colors hover:bg-emerald-50 disabled:opacity-40"
            @click="showQuick = false; showPicker = false; fileInput?.click()">
            <ImagePlus class="h-4 w-4" />
          </button>
        </template>
        <div class="relative flex-1">
          <input v-model="draft" :maxlength="SHOUT_MAX" :disabled="!canSend" placeholder="Type a custom message"
            class="w-full rounded-lg bg-white py-2 pl-3 pr-14 text-sm focus:outline-none disabled:bg-slate-50" />
          <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-2xs tabular-nums"
            :class="draft.length >= SHOUT_MAX ? 'font-semibold text-red-600' : 'text-slate-500'">
            {{ draft.length }}/{{ SHOUT_MAX }}
          </span>
        </div>
        <button :disabled="!draft.trim() || !canSend"
          class="rounded-full bg-emerald-600 p-2.5 text-white hover:bg-emerald-700 disabled:opacity-40" title="Send">
          <Send class="h-4 w-4" />
        </button>
      </form>
    </div>
    <div v-else class="bg-slate-50 px-4 py-3 text-center text-xs text-slate-600">
      Nobody here is online right now, so shouts can't be sent.
    </div>

    <!-- Group members, split into online and offline. -->
    <Transition name="side-panel">
      <GroupMembersPanel v-if="showMembers && group" :group="group" :me="me" :people="people" :online="online"
        @close="showMembers = false" @photo="(url) => emit('groupPhoto', group!.id, url)" @rename="(name) => emit('groupRename', group!.id, name)" />
    </Transition>

    <!-- Overlays the whole chat (header, messages, quick shouts, custom message). -->
    <Transition name="side-panel">
      <MessageInfo v-if="infoMsg" :msg="infoMsg" :people="people" :group-members="group?.members" @close="infoKey = null" />
    </Transition>
  </div>
</template>

<style>
.picker-rise-enter-active, .picker-rise-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.picker-rise-enter-from, .picker-rise-leave-to { transform: translateY(100%); opacity: 0; }
</style>
