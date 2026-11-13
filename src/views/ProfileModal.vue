<script setup lang="ts">
import { ref } from "vue";
import { isAdminRole, roleLabel, supabase, type Profile } from "../lib/supabase";
import UserAvatar from "../components/UserAvatar.vue";

const props = defineProps<{ me: Profile }>();
const emit = defineEmits<{ close: []; saved: [avatar_url: string | null] }>();

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const busy = ref(false);
const error = ref("");

// Path inside the bucket, taken from the public URL we stored earlier.
function pathFromUrl(url: string | null): string | null {
  const marker = "/object/public/avatars/";
  const i = url?.indexOf(marker) ?? -1;
  return i === -1 || !url ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

async function removeOldFile(url: string | null) {
  const path = pathFromUrl(url);
  if (path) await supabase.storage.from("avatars").remove([path]);
}

const OUTPUT_PX = 512;

// Centre-crop to a square and scale to OUTPUT_PX so the photo stays sharp at every size it's shown.
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = OUTPUT_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image.");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff"; // keeps transparent PNGs from turning black
  ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, OUTPUT_PX, OUTPUT_PX,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
  if (!blob) throw new Error("Could not process the image.");
  return blob;
}

async function upload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // allow picking the same file again later
  if (!file) return;
  if (!TYPES[file.type]) return (error.value = "Please choose a JPG, PNG, WebP or GIF image.");
  if (file.size > MAX_BYTES) return (error.value = "Photo must be 2 MB or smaller.");

  busy.value = true;
  error.value = "";
  let processed: Blob;
  try {
    processed = await toSquareWebp(file);
  } catch (err) {
    busy.value = false;
    return (error.value = err instanceof Error ? err.message : "Could not process the image.");
  }
  // A new file name per upload means the URL changes and no stale copy is shown.
  const path = `${props.me.id}/${Date.now()}.webp`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, processed, { contentType: "image/webp", upsert: false });
  if (upErr) {
    busy.value = false;
    return (error.value = upErr.message);
  }
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error: dbErr } = await supabase
    .from("profiles")
    .update({ avatar_url: data.publicUrl })
    .eq("id", props.me.id);
  if (dbErr) {
    await supabase.storage.from("avatars").remove([path]);
    busy.value = false;
    return (error.value = dbErr.message);
  }
  await removeOldFile(props.me.avatar_url);
  emit("saved", data.publicUrl);
  busy.value = false;
}

async function removePhoto() {
  busy.value = true;
  error.value = "";
  const { error: dbErr } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", props.me.id);
  if (dbErr) {
    busy.value = false;
    return (error.value = dbErr.message);
  }
  await removeOldFile(props.me.avatar_url);
  emit("saved", null);
  busy.value = false;
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" @click.self="emit('close')">
    <div class="flex w-[360px] flex-col overflow-hidden rounded-2xl bg-[#efeae2] shadow-xl">
      <!-- Header: same bar style as the chat header -->
      <header class="flex shrink-0 items-center justify-between bg-emerald-600 px-4 py-2.5 text-white">
        <span class="text-xs font-semibold uppercase tracking-wider">Your profile</span>
        <button class="-mr-1 flex h-6 w-6 items-center justify-center rounded-full text-emerald-100 transition hover:bg-white/20 hover:text-white"
          aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <!-- Identity card on the chat wallpaper -->
      <div class="px-4 py-5">
        <div class="flex flex-col items-center rounded-lg bg-white px-5 py-5 text-center shadow-sm">
          <div class="relative">
            <UserAvatar :user="me" size-class="h-28 w-28" />
            <div v-if="busy" class="absolute inset-0 flex items-center justify-center rounded-full bg-white/70 text-xs font-medium text-slate-600">
              Saving…
            </div>
          </div>
          <h3 class="mt-3 font-medium leading-tight">{{ me.full_name }}</h3>
          <p class="text-xs text-slate-500">{{ me.department }} · {{ roleLabel(me.role) }}</p>
          <p v-if="!isAdminRole(me.role)" class="mt-3 text-2xs text-slate-400">Your name is set by an administrator.</p>
        </div>
        <p v-if="error" class="mt-3 text-center text-xs text-red-600">{{ error }}</p>
      </div>

      <!-- Actions -->
      <div class="shrink-0 space-y-2 bg-slate-100 px-4 py-3">
        <label
          class="block w-full cursor-pointer rounded-full bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
          :class="busy && 'pointer-events-none opacity-50'">
          {{ me.avatar_url ? "Change photo" : "Upload photo" }}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden" @change="upload" />
        </label>
        <button v-if="me.avatar_url" :disabled="busy"
          class="w-full rounded-full border border-slate-300 bg-white py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          @click="removePhoto">Remove photo</button>
      </div>
    </div>
  </div>
</template>
