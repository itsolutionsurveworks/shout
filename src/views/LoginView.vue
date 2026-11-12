<script setup lang="ts">
import { ref } from "vue";
import appIcon from "../../src-tauri/icons/128x128.png";
import { REMEMBERED_EMAIL_KEY, REMEMBER_KEY, shouldRemember, supabase } from "../lib/supabase";
import BuildFooter from "../components/BuildFooter.vue";

const remember = ref(shouldRemember());
const email = ref(remember.value ? localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "" : "");
const password = ref("");
const error = ref("");
const busy = ref(false);

async function login() {
  busy.value = true;
  error.value = "";
  const { error: e } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  });
  if (e) {
    error.value = e.message;
  } else {
    // Save the choice only after a successful sign-in.
    localStorage.setItem(REMEMBER_KEY, remember.value ? "1" : "0");
    if (remember.value) localStorage.setItem(REMEMBERED_EMAIL_KEY, email.value);
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  }
  busy.value = false;
}
</script>

<template>
  <div class="relative flex min-h-0 flex-1 items-center justify-center bg-white">
    <form class="w-[300px] space-y-3 p-6" @submit.prevent="login">
      <div class="flex flex-col items-center text-center">
        <img :src="appIcon" alt="Office Shout" class="mb-2 h-12 w-12" />
        <h1 class="text-lg font-semibold leading-tight">Sign In to Shout</h1>
      </div>
      <input v-model="email" type="email" placeholder="Email" required
        class="w-full rounded-lg bg-slate-100 px-3 py-2.5 text-sm placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
      <input v-model="password" type="password" placeholder="Password" required
        class="w-full rounded-lg bg-slate-100 px-3 py-2.5 text-sm placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500" />
      <label class="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-600">
        <input v-model="remember" type="checkbox" class="h-3.5 w-3.5 accent-emerald-600" />
        Remember me
      </label>
      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{{ error }}</p>
      <button :disabled="busy"
        class="w-full rounded-full bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50">
        {{ busy ? "Signing in…" : "Sign in" }}
      </button>
    </form>
    <BuildFooter class="absolute inset-x-0 bottom-2 text-center" />
  </div>
</template>
