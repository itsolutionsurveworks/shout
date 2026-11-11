<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { supabase, type Profile } from "./lib/supabase";
import LoginView from "./views/LoginView.vue";
import SenderView from "./views/SenderView.vue";
import AdminView from "./views/AdminView.vue";
import NotificationModal from "./views/NotificationModal.vue";

const me = ref<Profile | null>(null);
const loading = ref(true);
const tab = ref<"send" | "admin">("send");

async function loadProfile(userId: string | null) {
  if (!userId) {
    me.value = null;
    return;
  }
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  me.value = data as Profile | null;
  if (me.value) await supabase.from("profiles").update({ is_online: true }).eq("id", userId);
}

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
onUnmounted(() => sub?.unsubscribe());

async function logout() {
  if (me.value) await supabase.from("profiles").update({ is_online: false }).eq("id", me.value.id);
  await supabase.auth.signOut();
}
</script>

<template>
  <div v-if="loading" class="p-8 text-slate-500">Loading…</div>
  <LoginView v-else-if="!me" />
  <template v-else>
    <!-- Always mounted for every role: listens for incoming shouts. -->
    <NotificationModal :me="me" />

    <div class="min-h-screen bg-slate-50 text-slate-900">
      <header class="flex items-center justify-between border-b bg-white px-4 py-2">
        <nav class="flex gap-2">
          <button v-if="me.role !== 'receiver'" class="rounded px-3 py-1"
            :class="tab === 'send' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'"
            @click="tab = 'send'">Send</button>
          <button v-if="me.role === 'admin'" class="rounded px-3 py-1"
            :class="tab === 'admin' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100'"
            @click="tab = 'admin'">Admin</button>
          <span v-if="me.role === 'receiver'" class="px-3 py-1 text-slate-500">
            Running in the background. You'll be alerted here when someone needs you.
          </span>
        </nav>
        <div class="flex items-center gap-3 text-sm">
          <span>{{ me.full_name }} · {{ me.role }}</span>
          <button class="text-blue-600 hover:underline" @click="logout">Sign out</button>
        </div>
      </header>
      <main class="p-4">
        <SenderView v-if="me.role !== 'receiver' && tab === 'send'" :me="me" />
        <AdminView v-else-if="me.role === 'admin' && tab === 'admin'" />
      </main>
    </div>
  </template>
</template>
