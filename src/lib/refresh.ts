import { ref } from "vue";

// Manual "refresh everything" button. Each dashboard view registers its own reload
// function while it is shown, and refreshAll() runs all of them together.
type RefreshHandler = () => unknown;

const handlers = new Set<RefreshHandler>();
export const refreshing = ref(false);

export function onRefresh(fn: RefreshHandler): () => void {
  handlers.add(fn);
  return () => { handlers.delete(fn); };
}

export async function refreshAll(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    // allSettled: one failing view must not stop the others from reloading.
    await Promise.allSettled([...handlers].map((fn) => Promise.resolve().then(fn)));
  } finally {
    refreshing.value = false;
  }
}
