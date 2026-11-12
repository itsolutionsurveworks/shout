<script setup lang="ts">
import { ref } from "vue";
import { supabase } from "../lib/supabase";

const email = ref("");
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
  if (e) error.value = e.message;
  busy.value = false;
}
</script>

<template>
  <div class="w-[400px] bg-white">
    <form class="space-y-4 p-8" @submit.prevent="login">
      <div class="text-center">
        <p class="mt-1 text-sm text-slate-500">Sign in to continue</p>
      </div>
      <input v-model="email" type="email" placeholder="Email" required
        class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none" />
      <input v-model="password" type="password" placeholder="Password" required
        class="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none" />
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <button :disabled="busy"
        class="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {{ busy ? "Signing in…" : "Sign in" }}
      </button>
    </form>
  </div>
</template>
