import { ref } from "vue";

// Manual "refresh everything" button. Each dashboard view registers its own reload
// function while it is shown, and refreshAll() runs all of them together.
type RefreshHandler = () => unknown;

const handlers = new Set<RefreshHandler>();
export const refreshing = ref(false);

// Status line shown left of the refresh button. "ok" / "error" keep the time of the last run.
export type RefreshState = "fetching" | "ok" | "error";
export const refreshState = ref<RefreshState>("ok");
export const refreshedAt = ref<Date | null>(null);

export function onRefresh(fn: RefreshHandler): () => void {
  handlers.add(fn);
  return () => { handlers.delete(fn); };
}

export async function refreshAll(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  refreshState.value = "fetching";
  try {
    // allSettled: one failing view must not stop the others from reloading.
    const results = await Promise.allSettled([...handlers].map((fn) => Promise.resolve().then(fn)));
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    failures.forEach((r) => console.error("Refresh failed", r.reason));
    refreshState.value = failures.length ? "error" : "ok";
  } finally {
    refreshedAt.value = new Date();
    refreshing.value = false;
  }
}
