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
  <div class="flex min-h-screen items-center justify-center bg-slate-100">
    <form class="w-80 space-y-3 rounded-lg bg-white p-6 shadow" @submit.prevent="login">
      <h1 class="text-xl font-semibold">Office Shout</h1>
      <input v-model="email" type="email" placeholder="Email" required
        class="w-full rounded border px-3 py-2" />
      <input v-model="password" type="password" placeholder="Password" required
        class="w-full rounded border px-3 py-2" />
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <button :disabled="busy" class="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50">
        Sign in
      </button>
    </form>
  </div>
</template>
