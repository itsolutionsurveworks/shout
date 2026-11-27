<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { isAdminRole, supabase, type HeaderMessage, type Profile } from "./lib/supabase";
import { startPresence, stopPresence } from "./lib/presence";
import { checkForUpdates, startUpdateChecks, stopUpdateChecks, updateActivity, updateNotice } from "./lib/updater";
import { applyTheme, isThemeKey, THEMES, type ThemeKey } from "./lib/themes";
import { onRefresh, refreshAll, refreshedAt, refreshing, refreshState, refreshStep } from "./lib/refresh";
import { cached, clearCache, isFresh, markFetched, MINUTES } from "./lib/cache";
import LoginView from "./views/LoginView.vue";
import SenderView from "./views/SenderView.vue";
import ReceiverView from "./views/ReceiverView.vue";
import AdminView from "./views/AdminView.vue";
import NotificationModal from "./views/NotificationModal.vue";
import ProfileModal from "./views/ProfileModal.vue";
import UserAvatar from "./components/UserAvatar.vue";
import BuildFooter from "./components/BuildFooter.vue";
import { Code, LogOut, Menu, RotateCw, ShieldCheck, UserRoundPen, Users } from "lucide-vue-next";

// The "alert" window is a small frameless popup that shows only the shout modal.
// It runs this same app, so it renders just NotificationModal instead of the dashboard.
const isAlertWindow = "__TAURI_INTERNALS__" in window && getCurrentWindow().label === "alert";
// The alert window is transparent so the popup's rounded corners show through.
if (isAlertWindow) document.documentElement.style.background = "transparent";

const me = ref<Profile | null>(null);
// Last known profile of the signed-in user. Used at startup to show the app before the network answers.
const cachedProfile = cached<Profile | null>("profile", null);
const loading = ref(true);
const tab = ref<"people" | "admin">("people");
const showProfile = ref(false);
const menuOpen = ref(false);
// Cached so the header message is still shown on launch while the fresh copy loads.
const headerMessage = cached<HeaderMessage | null>("header", null);

// Shared message shown left of the refresh button. Only developers can change it.
// Loaders return the error (if any) instead of throwing, so the refresh button can report failures.
async function loadHeaderMessage() {
  const { data, error } = await supabase.from("header_message").select("message, enabled").eq("id", 1).single();
  if (error) return error;
  headerMessage.value = (data as HeaderMessage | null) ?? null;
  markFetched("header");
  return null;
}

// Status line, highest priority first:
// live update step (e.g. "Downloading 0.1.8 · 42%") > live refresh step > update result (ready / failed)
// > dev message if enabled > last refresh result.
const timeFormat: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
const statusLine = computed(() => {
  if (updateActivity.value) return { text: updateActivity.value, error: false };
  if (refreshState.value === "fetching") return { text: refreshStep.value || "Fetching…", error: false };
  if (updateNotice.value) return updateNotice.value;
  if (headerMessage.value?.enabled && headerMessage.value.message) return { text: headerMessage.value.message, error: false };
  const stamp = refreshedAt.value ? ` · ${refreshedAt.value.toLocaleString([], timeFormat)}` : "";
  if (refreshState.value === "error") return { text: `Refresh failed${stamp}`, error: true };
  return { text: `Up to date${stamp}`, error: false };
});

// App theme (seasonal/occasion colors). Set by developers in the Dev panel; applied to everyone live.
// Cached, so the last theme is applied straight away on launch (setTheme validates the stored value).
const themeKey = cached<ThemeKey>("theme", "default");
const themeBadge = computed(() => THEMES[themeKey.value].badge);
const themeOverlay = computed(() => THEMES[themeKey.value].overlay);
function setTheme(value: unknown) {
  themeKey.value = isThemeKey(value) ? value : "default";
  applyTheme(themeKey.value);
}
async function loadTheme() {
  const { data, error } = await supabase.from("app_theme").select("theme_key").eq("id", 1).single();
  if (error) return error;
  setTheme(data?.theme_key);
  markFetched("theme"); // changes also arrive live over Realtime, so this only covers missed events
  return null;
}
let themeChannel: ReturnType<typeof supabase.channel> | null = null;
let updateChannel: ReturnType<typeof supabase.channel> | null = null;

const REPORTED_VERSION_KEY = "oas-reported-version";
async function loadProfile(userId: string | null) {
  if (!userId) {
    stopPresence();
    me.value = null;
    // Signed out: nothing signed-in may stay on disk.
    cachedProfile.value = null;
    clearCache();
    return null;
  }
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) return error;
  me.value = data as Profile | null;
  cachedProfile.value = me.value;
  markFetched("profile");
  // Only the main window announces presence; the alert popup just listens for shouts.
  if (me.value && !isAlertWindow) startPresence(me.value);
  // Tell the database which build this account is running (shown in the Dev tab's App versions card).
  if (me.value && !isAlertWindow) {
    supabase.rpc("report_app_version", { v: __APP_VERSION__ }).then(({ error }) => {
      if (error) console.error("Version report failed", error);
      else localStorage.setItem(REPORTED_VERSION_KEY, __APP_VERSION__);
    });
  }
  return null;
}

// The window opens at a sensible default size for each view, but the user can resize it.
// Views fill whatever size the window has. We only apply the default when the view
// changes, so a manual resize is not overwritten.
// People and Admin share one frame, so switching tabs never resizes the window.
const DEFAULT_CONTENT: Record<"login" | "main" | "admin" | "receiver", [number, number]> = {
  login: [300, 300],
  main: [800, 560],
  admin: [920, 560],
  receiver: [400, 560],
};
const MIN_WIDTH = 300;
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
  // The refresh button checks for a new release, then reloads the signed-in user's profile too
  // (role or name may have changed). Data errors throw, which marks the refresh as failed in the
  // status line. Update problems are shown by the update notice instead.
  offRefresh = onRefresh(async () => {
    refreshStep.value = "Checking for updates…";
    const [, errors] = await Promise.all([
      isAlertWindow ? null : checkForUpdates(),
      Promise.all([
        me.value ? loadProfile(me.value.id) : null,
        loadHeaderMessage(),
        loadTheme(),
      ]),
    ]);
    const failed = errors.find(Boolean);
    if (failed) throw failed;
  });
  // Theme changes from a developer reach every open window immediately.
  themeChannel = supabase.channel("app-theme")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_theme" },
      (payload) => setTheme(payload.new.theme_key))
    .subscribe();
  // A developer's "Push update" changes this row; every open app checks for the new release now.
  if (!isAlertWindow) {
    updateChannel = supabase.channel("app-update")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_update" },
        () => void checkForUpdates())
      .subscribe();
  }
  // Paint from the cache first: the saved theme, and the saved profile when it belongs to the stored session.
  // Fresh data then replaces these values as soon as the requests finish.
  setTheme(themeKey.value);
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id ?? null;
  if (userId && cachedProfile.value?.id === userId) {
    me.value = cachedProfile.value;
    if (!isAlertWindow) startPresence(me.value);
    loading.value = false;
  }
  // Startup reuses the cached profile, header message and theme while they are young (the Refresh
  // button always fetches). A different user, or a first run, always loads.
  // A new build always reloads the profile once, because that is what reports the app version.
  const profileFresh = !!userId && cachedProfile.value?.id === userId && isFresh("profile", 30 * MINUTES)
    && localStorage.getItem(REPORTED_VERSION_KEY) === __APP_VERSION__;
  await Promise.all([
    profileFresh ? null : loadProfile(userId),
    isFresh("header", 30 * MINUTES) && headerMessage.value ? null : loadHeaderMessage(),
    isFresh("theme", 60 * MINUTES) ? null : loadTheme(),
  ]);
  refreshState.value = "ok";
  refreshedAt.value = new Date();
  loading.value = false;
  sub = supabase.auth.onAuthStateChange((_e, s) => {
    // Egress: token refreshes and window-focus SIGNED_IN events fire often; only reload the
    // profile when the signed-in user actually changed.
    const uid = s?.user.id ?? null;
    if (uid && uid === me.value?.id) return;
    // Defer: don't await supabase calls inside the callback.
    setTimeout(() => loadProfile(uid), 0);
  }).data.subscription;
});
onUnmounted(() => {
  offRefresh?.();
  sub?.unsubscribe();
  if (themeChannel) void supabase.removeChannel(themeChannel);
  if (updateChannel) void supabase.removeChannel(updateChannel);
  stopPresence();
  stopUpdateChecks();
});

function onRefreshClick() {
  if (refreshing.value) return;
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
    // Remove this account's cached data so the next sign-in (or another person) never sees it.
    cachedProfile.value = null;
    clearCache();
  }
}
</script>

<template>
  <NotificationModal v-if="isAlertWindow && me" :me="me" />
  <div v-else-if="isAlertWindow" />
  <div v-else class="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--theme-bg)] text-slate-900">
  <!-- Decorative theme layer: sits behind the header, content and footer (those are raised with z-10) -->
  <div v-if="themeOverlay !== 'none'" :class="`theme-overlay theme-overlay--${themeOverlay}`" aria-hidden="true" />
  <div v-if="loading" class="flex flex-1 flex-col items-center justify-center gap-3 bg-white" role="status" aria-label="Loading">
    <div class="h-8 w-8 animate-spin rounded-full border-[3px] border-emerald-600/20 border-t-emerald-600" />
    <div class="flex items-center gap-1" aria-hidden="true">
      <span v-for="i in 3" :key="i" class="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-600" :style="{ animationDelay: `${(i - 1) * 150}ms` }" />
    </div>
  </div>
  <LoginView v-else-if="!me" ref="loginView" />
  <div v-else class="flex min-h-0 flex-1 flex-col">
    <!-- Browser-style tab strip: the active tab rises into the white toolbar below it -->
    <header ref="header" class="relative z-30 flex shrink-0 items-end justify-between bg-[var(--theme-header)] pr-3 pt-2">
      <div class="flex items-end self-stretch">
        <span v-if="themeBadge" class="mb-2 ml-3 self-center text-base leading-none" aria-hidden="true">{{ themeBadge }}</span>
        <div v-if="me.role === 'receiver'" class="pointer-events-none absolute bottom-1.5 left-3 top-2 flex items-center gap-2">
          <UserAvatar :user="me" size-class="h-8 w-8" />
          <span class="hdr-fg-text text-sm font-bold uppercase tracking-wider text-slate-800">{{ me.full_name }}</span>
        </div>
        <!-- Tabs span the same width as the admin sidebar so the Admin tab's right edge lines up with it -->
        <nav v-if="me.role !== 'receiver'" class="flex items-end gap-1 pl-3 text-sm"
          :class="isAdminRole(me.role) ? 'w-[22%] min-w-[190px] max-w-[250px]' : 'w-[9%] min-w-[120px] max-w-[145px]'">
          <button class="relative flex flex-1 items-center justify-center whitespace-nowrap rounded-t-lg py-2 font-medium uppercase transition-colors"
            :class="[isAdminRole(me.role) ? 'px-3' : 'px-2', tab === 'people' ? 'bg-white text-slate-900' : 'hdr-fg text-slate-600 hover:bg-slate-300/60']"
            @click="tab = 'people'"><Users class="mr-1.5 h-3.5 w-3.5 shrink-0" />People</button>
          <button v-if="isAdminRole(me.role)" class="relative flex flex-1 items-center justify-center whitespace-nowrap rounded-t-lg py-2 font-medium uppercase transition-colors"
            :class="[isAdminRole(me.role) ? 'px-3' : 'px-2', tab === 'admin' ? 'bg-white text-slate-900' : 'hdr-fg text-slate-600 hover:bg-slate-300/60']"
            @click="tab = 'admin'"><component :is="me.role === 'developer' ? Code : ShieldCheck" class="mr-1.5 h-3.5 w-3.5 shrink-0" />{{ me.role === 'developer' ? 'Dev' : 'Admin' }}</button>
        </nav>
      </div>
      <div class="relative mb-1.5 flex items-center gap-1 text-sm">
        <span v-if="me.role !== 'receiver'" :title="statusLine.text"
          class="mr-1 max-w-[260px] truncate text-xs"
          :class="statusLine.error ? 'text-red-600' : 'hdr-fg-text text-slate-600'">{{ statusLine.text }}</span>
        <button class="hdr-fg mr-3 rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-60"
          title="Refresh everything" aria-label="Refresh" :disabled="refreshing" @click="onRefreshClick">
          <RotateCw class="h-5 w-5":class="{ 'animate-spin': refreshing }" />
        </button>
        <button v-if="me.role === 'receiver'" class="hdr-fg rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900" title="Menu"
          aria-label="Menu" aria-haspopup="menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
          <Menu class="h-5 w-5" />
        </button>
        <button v-else class="flex items-center gap-2 rounded-md border border-white/25 px-2 py-1 hover:opacity-80" title="Account menu"
          aria-haspopup="menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
          <UserAvatar :user="me" size-class="h-7 w-7" />
          <span class="flex flex-col items-start leading-tight">
            <span class="hdr-fg-text font-medium">{{ me.full_name }}</span>
            <span class="hdr-fg-text text-[10px] opacity-75">{{ me.department }}</span>
          </span>
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

    <main id="app-main" class="relative z-10 flex min-h-0 flex-1">
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
      class="relative z-10 flex shrink-0 justify-center border-t border-slate-200 bg-white px-5 py-1.5">
      <BuildFooter />
    </footer>
    <ProfileModal v-if="showProfile" :me="me" @close="showProfile = false"
      @saved="onAvatarSaved" />
  </div>
  </div>
</template>
