<script setup lang="ts">
import { computed } from "vue";
import { gifUrl } from "../lib/media";

const props = defineProps<{ text: string; textClass?: string; imgClass?: string }>();
const gif = computed(() => gifUrl(props.text));
</script>

<template>
  <img v-if="gif" :src="gif" alt="GIF" loading="lazy" referrerpolicy="no-referrer"
    class="rounded-md" :class="imgClass ?? 'max-h-56 max-w-full'" />
  <p v-else class="whitespace-pre-wrap break-words" :class="textClass">{{ text }}</p>
</template>
