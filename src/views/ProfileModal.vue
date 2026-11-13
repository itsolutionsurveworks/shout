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
    <div class="w-[340px] rounded-2xl bg-white p-6 shadow-xl">
      <h2 class="mb-5 text-lg font-semibold">Your profile</h2>

      <div class="flex flex-col items-center text-center">
        <UserAvatar :user="me" size-class="h-28 w-28" />
        <p class="mt-3 text-sm font-semibold">{{ me.full_name }}</p>
        <p class="text-sm text-slate-500">{{ me.department }} · {{ roleLabel(me.role) }}</p>
        <p v-if="!isAdminRole(me.role)" class="mt-1 text-xs text-slate-400">Your name is set by an administrator.</p>
      </div>

      <div class="mt-6 space-y-2">
        <label
          class="block w-full cursor-pointer rounded-lg bg-blue-600 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700"
          :class="busy && 'pointer-events-none opacity-50'">
          {{ me.avatar_url ? "Change photo" : "Upload photo" }}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden" @change="upload" />
        </label>
        <button v-if="me.avatar_url" :disabled="busy"
          class="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          @click="removePhoto">Remove photo</button>
        <button class="w-full py-2 text-sm text-slate-500 hover:text-slate-900" @click="emit('close')">Close</button>
      </div>

      <p v-if="busy" class="mt-3 text-center text-xs text-slate-400">Saving…</p>
      <p v-if="error" class="mt-3 text-center text-sm text-red-600">{{ error }}</p>
    </div>
  </div>
</template>
