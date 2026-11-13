<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import appIcon from "../../src-tauri/icons/128x128.png";
import { REMEMBERED_EMAIL_KEY, supabase } from "../lib/supabase";
import BuildFooter from "../components/BuildFooter.vue";

const email = ref(localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "");
const password = ref("");
const error = ref("");
const busy = ref(false);
let errorTimer: ReturnType<typeof setTimeout> | undefined;
onUnmounted(() => clearTimeout(errorTimer));

async function login() {
  busy.value = true;
  error.value = "";
  const { error: e } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  });
  if (e) {
    error.value = e.message;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => (error.value = ""), 4000);
  } else {
    // Save the email only after a successful sign-in, to pre-fill the form next time.
    localStorage.setItem(REMEMBERED_EMAIL_KEY, email.value);
  }
  busy.value = false;
}
</script>

<template>
  <div class="relative flex min-h-0 flex-1 items-center justify-center bg-white">
    <!-- shrink-0: the form keeps its 300px width, so App.vue's fitWindow() measures the real size, not a squeezed one -->
    <form class="w-[300px] shrink-0 space-y-3 px-5 pb-6 pt-3" @submit.prevent="login">
      <div class="flex flex-col items-center text-center">
        <img :src="appIcon" alt="Office Shout" class="mb-2 h-16 w-16" />
        <h1 class="text-2xl font-semibold leading-tight">Sign In to Shout</h1>
      </div>
      <input v-model="email" type="email" placeholder="Email" required
        class="w-full rounded-lg bg-slate-100 px-3 py-2.5 text-sm placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
      <input v-model="password" type="password" placeholder="Password" required
        class="w-full rounded-lg bg-slate-100 px-3 py-2.5 text-sm placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
      <button :disabled="busy"
        class="w-full rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50">
        {{ busy ? "Signing in…" : "Sign in" }}
      </button>
    </form>
    <Transition enter-active-class="transition duration-200" enter-from-class="-translate-y-2 opacity-0"
      leave-active-class="transition duration-200" leave-to-class="opacity-0">
      <div v-if="error" role="alert"
        class="fixed left-1/2 top-3 max-w-[90vw] -translate-x-1/2 truncate whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
        {{ error }}
      </div>
    </Transition>
    <BuildFooter class="absolute inset-x-0 bottom-2 text-center" />
  </div>
</template>
