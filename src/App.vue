<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { isAdminRole, roleLabel, shouldRemember, supabase, type HeaderMessage, type Profile } from "./lib/supabase";
import { startPresence, stopPresence } from "./lib/presence";
import { startUpdateChecks, stopUpdateChecks } from "./lib/updater";
import { onRefresh, refreshAll, refreshing, refreshStatus } from "./lib/refresh";
import LoginView from "./views/LoginView.vue";
import SenderView from "./views/SenderView.vue";
import ReceiverView from "./views/ReceiverView.vue";
import AdminView from "./views/AdminView.vue";
import NotificationModal from "./views/NotificationModal.vue";
import ProfileModal from "./views/ProfileModal.vue";
import UserAvatar from "./components/UserAvatar.vue";
import BuildFooter from "./components/BuildFooter.vue";
import { ChevronDown, LogOut, RotateCw, UserRoundPen } from "lucide-vue-next";

// The "alert" window is a small frameless popup that shows only the shout modal.
// It runs this same app, so it renders just NotificationModal instead of the dashboard.
const isAlertWindow = "__TAURI_INTERNALS__" in window && getCurrentWindow().label === "alert";

const me = ref<Profile | null>(null);
const loading = ref(true);
const tab = ref<"people" | "admin">("people");
const showProfile = ref(false);
const menuOpen = ref(false);
const headerMessage = ref<HeaderMessage | null>(null);

// Shared message shown left of the refresh button. Only developers can change it.
async function loadHeaderMessage() {
  const { data } = await supabase.from("header_message").select("message, enabled").eq("id", 1).single();
  headerMessage.value = (data as HeaderMessage | null) ?? null;
}

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

// The window opens at a sensible default size for each view, but the user can resize it.
// Views fill whatever size the window has. We only apply the default when the view
// changes, so a manual resize is not overwritten.
// People and Admin share one frame, so switching tabs never resizes the window.
const DEFAULT_CONTENT: Record<"login" | "main" | "admin" | "receiver", [number, number]> = {
  login: [400, 340],
  main: [800, 560],
  admin: [920, 560],
  receiver: [400, 560],
};
const MIN_WIDTH = 360;
const MIN_HEIGHT = 300;

const viewKey = computed<keyof typeof DEFAULT_CONTENT>(() => {
  if (!me.value) return "login";
  if (me.value.role === "receiver") return "receiver";
  return isAdminRole(me.value.role) ? "admin" : "main";
});
const header = ref<HTMLElement | null>(null);
const loginView = ref<{ $el: HTMLElement } | null>(null);
let lastView = "";

async function fitWindow() {
  if (isAlertWindow || !("__TAURI_INTERNALS__" in window)) return;
  const view = viewKey.value;
  if (view === lastView) return;
  lastView = view;
  let [width, contentHeight] = DEFAULT_CONTENT[view];
  if (view === "login" && loginView.value) {
    // The login window is exactly the sign-in form (no outer padding or card).
    const form = (loginView.value.$el as HTMLElement).firstElementChild as HTMLElement | null;
    if (form) {
      width = form.offsetWidth;
      contentHeight = form.offsetHeight;
    }
  }
  const headerHeight = header.value?.offsetHeight ?? 0;
  const win = getCurrentWindow();
  await win.setSize(new LogicalSize(width, contentHeight + headerHeight));
  await win.center();
}

watch([viewKey, loading], () => nextTick(fitWindow));

let sub: { unsubscribe(): void } | null = null;
let offRefresh: (() => void) | null = null;
onMounted(async () => {
  if ("__TAURI_INTERNALS__" in window && !isAlertWindow) {
    await getCurrentWindow().setMinSize(new LogicalSize(MIN_WIDTH, MIN_HEIGHT));
    // Only the main window checks for updates; the alert popup is short-lived.
    startUpdateChecks();
  }
  // Only the main window starts a session; "Remember me" off means signing in again after a restart.
  if (!isAlertWindow && !shouldRemember()) await supabase.auth.signOut({ scope: "local" });
  // The refresh button reloads the signed-in user's profile too (role or name may have changed).
  offRefresh = onRefresh(() => Promise.all([
    me.value && loadProfile(me.value.id),
    loadHeaderMessage(),
  ]));
  const { data } = await supabase.auth.getSession();
  await Promise.all([loadProfile(data.session?.user.id ?? null), loadHeaderMessage()]);
  loading.value = false;
  sub = supabase.auth.onAuthStateChange((_e, s) => {
    // Defer: don't await supabase calls inside the callback.
    setTimeout(() => loadProfile(s?.user.id ?? null), 0);
  }).data.subscription;
});
onUnmounted(() => {
  offRefresh?.();
  sub?.unsubscribe();
  stopPresence();
  stopUpdateChecks();
});

// The dev message is hidden the moment refresh is pressed. The reload below fetches it again,
// so it only comes back if it is still enabled.
function onRefreshClick() {
  if (refreshing.value) return;
  headerMessage.value = null;
  void refreshAll();
}

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
  <div v-else class="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 text-slate-900">
  <div v-if="loading" class="flex flex-1 items-center justify-center text-slate-400">Loading…</div>
  <LoginView v-else-if="!me" ref="loginView" />
  <div v-else class="flex min-h-0 flex-1 flex-col">
    <!-- Browser-style tab strip: the active tab rises into the white toolbar below it -->
    <header ref="header" class="flex shrink-0 items-end justify-between bg-slate-200 pr-3 pt-2">
      <div class="flex items-end self-stretch">
        <span v-if="me.role === 'sender' || me.role === 'receiver'" class="mb-2.5 pl-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{{ roleLabel(me.role) }}</span>
        <!-- Tabs span the same width as the admin sidebar so the Admin tab's right edge lines up with it -->
        <nav v-if="me.role !== 'receiver'" class="flex items-end text-sm w-[22%] min-w-[160px] max-w-[220px] pl-3">
          <button class="relative flex-1 rounded-t-lg px-3 py-2 font-medium transition-colors"
            :class="tab === 'people' ? 'bg-white text-slate-900' : 'text-slate-600 hover:bg-slate-300/60'"
            @click="tab = 'people'">People</button>
          <button v-if="isAdminRole(me.role)" class="relative flex-1 rounded-t-lg px-3 py-2 font-medium transition-colors"
            :class="tab === 'admin' ? 'bg-white text-slate-900' : 'text-slate-600 hover:bg-slate-300/60'"
            @click="tab = 'admin'">{{ me.role === 'developer' ? 'Dev' : 'Admin' }}</button>
        </nav>
      </div>
      <div class="relative mb-1.5 flex items-center gap-1 text-sm">
        <span v-if="headerMessage?.enabled && headerMessage.message" :title="headerMessage.message"
          class="mr-1 max-w-[260px] truncate text-xs text-slate-600">{{ headerMessage.message }}</span>
        <!-- Dev message wins; otherwise this slot shows the latest refresh status, or the update prompt for everyone. -->
        <span v-else role="status" class="mr-1 whitespace-nowrap text-xs text-slate-500">{{ refreshStatus || "Check for updates" }}</span>
        <button class="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-60"
          title="Refresh everything and check for updates" aria-label="Refresh" :disabled="refreshing" @click="onRefreshClick">
          <RotateCw class="h-4 w-4" :class="{ 'animate-spin': refreshing }" />
        </button>
        <button class="flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-slate-100" title="Account menu"
          aria-haspopup="menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
          <span class="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <UserAvatar :user="me" size-class="h-7 w-7" />
          <span class="flex flex-col items-start leading-tight">
            <span class="font-medium">{{ me.full_name }}</span>
            <span v-if="isAdminRole(me.role)" class="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{{ roleLabel(me.role) }}</span>
          </span>
          <ChevronDown class="h-4 w-4 text-slate-400" />
        </button>
        <div v-if="menuOpen" class="fixed inset-0 z-10" @click="menuOpen = false" />
        <div v-if="menuOpen" role="menu"
          class="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button role="menuitem" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100"
            @click="menuOpen = false; showProfile = true">
            <UserRoundPen class="h-4 w-4 text-slate-500" /> Edit profile
          </button>
          <div class="my-1 border-t border-slate-100" />
          <button role="menuitem" class="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
            @click="menuOpen = false; logout()">
            <LogOut class="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
    </header>

    <main id="app-main" class="relative flex min-h-0 flex-1">
      <!-- Receivers see their shout history here; new shouts still arrive in their popup window. -->
      <!-- KeepAlive: switching tabs reuses the mounted view and its data instead of re-fetching into an empty state -->
      <KeepAlive>
        <ReceiverView v-if="me.role === 'receiver'" :me="me" />
        <SenderView v-else-if="tab === 'people'" :me="me" />
        <AdminView v-else-if="isAdminRole(me.role) && tab === 'admin'" :is-dev="me.role === 'developer'"
          :header-message="headerMessage" @header-saved="headerMessage = $event" />
      </KeepAlive>
    </main>
    <!-- Build footer spans the full window width on the People and Admin views (receivers have it in their own bar) -->
    <footer v-if="me.role !== 'receiver'"
      class="flex shrink-0 justify-center border-t border-slate-200 bg-white px-5 py-1.5">
      <BuildFooter />
    </footer>
    <ProfileModal v-if="showProfile" :me="me" @close="showProfile = false"
      @saved="onAvatarSaved" />
  </div>
  </div>
</template>
