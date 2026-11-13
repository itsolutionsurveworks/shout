import { ref, watch, type Ref } from "vue";

// Last-known-data cache. Every cached ref starts with the value saved on the previous run,
// so screens paint immediately; the normal loaders then replace it when fresh data arrives.
// Bump CACHE_VERSION if a stored shape changes, so old entries are ignored instead of misread.
const CACHE_VERSION = "v1";
const PREFIX = `oas-cache:${CACHE_VERSION}:`;
const SAVE_DELAY_MS = 300;

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Quota exceeded or storage unavailable: keep working with in-memory data only.
    console.warn("Cache write failed", key, e);
  }
}

// A ref that is restored from localStorage and saved back whenever it changes (debounced).
export function cached<T>(name: string, fallback: T): Ref<T> {
  const key = PREFIX + name;
  const state = ref(read<T>(key, fallback)) as Ref<T>;
  watch(state, (value) => {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      write(key, value);
    }, SAVE_DELAY_MS));
  }, { deep: true });
  return state;
}

// Read a stored value outside a component (used before the views exist, e.g. at startup).
export function readCache<T>(name: string, fallback: T): T {
  return read<T>(PREFIX + name, fallback);
}

// Drop everything this app has cached. Called on sign-out so the next person on this machine
// never sees the previous account's data, and pending saves can't write it back.
export function clearCache() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}
