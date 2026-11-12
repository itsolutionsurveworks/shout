<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { supabase, type Profile } from "./lib/supabase";
import { startPresence, stopPresence, onlineIds } from "./lib/presence";
import LoginView from "./views/LoginView.vue";
import SenderView from "./views/SenderView.vue";
import AdminView from "./views/AdminView.vue";
import NotificationModal from "./views/NotificationModal.vue";
import ProfileModal from "./views/ProfileModal.vue";
import UserAvatar from "./components/UserAvatar.vue";

// The "alert" window is a small frameless popup that shows only the shout modal.
// It runs this same app, so it renders just NotificationModal instead of the dashboard.
const isAlertWindow = "__TAURI_INTERNALS__" in window && getCurrentWindow().label === "alert";

const me = ref<Profile | null>(null);
const loading = ref(true);
const tab = ref<"people" | "admin">("people");
const showProfile = ref(false);

async function loadProfile(userId: string | null) {
  if (!userId) {
    stopPresence();
    me.value = null;
    return;
  }
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  me.value = data as Profile | null;
  // Only the main window announces presence; the alert popup just listens for shouts.
  if (me.value && !isAlertWindow) startPresence(me.value);
}

// The window is exactly the size of the current view's card: each view has a fixed
// size, so the shell hugs its content and we copy that size onto the window.
const shell = ref<HTMLElement | null>(null);
let lastView = "";
let resizeObserver: ResizeObserver | null = null;

async function fitWindow() {
  if (isAlertWindow || !shell.value || !("__TAURI_INTERNALS__" in window)) return;
  const { width, height } = shell.value.getBoundingClientRect();
  const win = getCurrentWindow();
  await win.setSize(new LogicalSize(Math.ceil(width), Math.ceil(height)));
  // Re-center only when the view changes, not on every content resize.
  const view = !me.value ? "login" : `${me.value.role}:${tab.value}`;
  if (view !== lastView) {
    lastView = view;
    await win.center();
  }
}

watch(shell, (el) => {
  resizeObserver?.disconnect();
  if (el) {
    resizeObserver ??= new ResizeObserver(() => fitWindow());
    resizeObserver.observe(el);
  }
});
watch([me, tab, loading], () => nextTick(fitWindow));

let sub: { unsubscribe(): void } | null = null;
onMounted(async () => {
  const { data } = await supabase.auth.getSession();
  await loadProfile(data.session?.user.id ?? null);
  loading.value = false;
  sub = supabase.auth.onAuthStateChange((_e, s) => {
    // Defer: don't await supabase calls inside the callback.
    setTimeout(() => loadProfile(s?.user.id ?? null), 0);
  }).data.subscription;
});
onUnmounted(() => {
  sub?.unsubscribe();
  stopPresence();
  resizeObserver?.disconnect();
});

function onAvatarSaved(url: string | null) {
  if (me.value) me.value.avatar_url = url;
}

async function logout() {
  // Leave presence first so others see us go offline immediately.
  stopPresence();
  try {
    // Try a global sign-out first. If the server call fails (offline, or the
    // token was already revoked from another device), fall back to clearing
    // the local session so the desktop app still signs out.
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: "local" });
  } catch (e) {
    console.error("Sign-out failed", e);
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  } finally {
    // Always leave the signed-in view, even if the network calls failed.
    me.value = null;
  }
}
</script>

<template>
  <NotificationModal v-if="isAlertWindow && me" :me="me" />
  <div v-else-if="isAlertWindow" />
  <div v-else ref="shell" class="block w-max bg-slate-50 text-slate-900">
  <div v-if="loading" class="flex h-[300px] w-[400px] items-center justify-center text-slate-400">Loading…</div>
  <LoginView v-else-if="!me" />
  <div v-else class="flex flex-col">
    <header class="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
      <div class="flex items-center gap-6">
        <nav v-if="me.role !== 'receiver'" class="flex gap-1 text-sm">
          <button class="rounded-md px-3 py-1.5 font-medium"
            :class="tab === 'people' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'"
            @click="tab = 'people'">People</button>
          <button v-if="me.role === 'admin'" class="rounded-md px-3 py-1.5 font-medium"
            :class="tab === 'admin' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'"
            @click="tab = 'admin'">Admin</button>
        </nav>
      </div>
      <div class="flex items-center gap-4 text-sm">
        <button class="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-slate-100" title="Edit profile"
          @click="showProfile = true">
          <span class="h-2.5 w-2.5 rounded-full bg-green-500" />
          <UserAvatar :user="me" size-class="h-7 w-7" />
          <span class="font-medium">{{ me.full_name }}</span>
          <span class="text-slate-400">· {{ me.role }}</span>
        </button>
        <button class="text-slate-500 hover:text-slate-900" @click="logout">Sign out</button>
      </div>
    </header>

    <main class="flex">
      <!-- Receivers have nothing to do here: alerts arrive in their popup window. -->
      <div v-if="me.role === 'receiver'" class="w-[400px] bg-white p-8 text-center">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <span class="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <h2 class="text-lg font-semibold">You're online</h2>
        <p class="mt-2 text-sm text-slate-500">
          You're all set! You can close this window, and you'll get a notification when someone needs you.
        </p>
        <p class="mt-4 text-xs text-slate-400">{{ onlineIds.size }} people online</p>
      </div>
      <SenderView v-else-if="tab === 'people'" :me="me" />
      <AdminView v-else-if="me.role === 'admin' && tab === 'admin'" />
    </main>
    <ProfileModal v-if="showProfile" :me="me" @close="showProfile = false"
      @saved="onAvatarSaved" />
  </div>
  </div>
</template>
