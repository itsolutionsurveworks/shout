import { ref } from "vue";
import { checkForUpdates } from "./updater";

// Manual "refresh everything" button. Each dashboard view registers its own reload
// function while it is shown, and refreshAll() runs all of them together.
type RefreshHandler = () => unknown;

const handlers = new Set<RefreshHandler>();
export const refreshing = ref(false);
// Short status shown next to the button ("Up to date", "Couldn't check…"). Cleared after a few seconds.
export const refreshStatus = ref("");
let statusTimer: ReturnType<typeof setTimeout> | undefined;

export function onRefresh(fn: RefreshHandler): () => void {
  handlers.add(fn);
  return () => { handlers.delete(fn); };
}

function showStatus(text: string) {
  refreshStatus.value = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { refreshStatus.value = ""; }, 4000);
}

export async function refreshAll(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  refreshStatus.value = "Checking for updates…";
  try {
    // The update check starts first, but the data reload runs alongside it instead of
    // waiting on the network. If a release is found it installs and restarts the app anyway.
    const update = checkForUpdates();
    // allSettled: one failing view must not stop the others from reloading.
    const reload = Promise.allSettled([...handlers].map((fn) => Promise.resolve().then(fn)));
    const [status] = await Promise.all([update, reload]);
    showStatus(
      status === "up-to-date" ? "Up to date" :
      status === "installing" ? "Installing update…" :
      "Couldn't check for updates",
    );
  } finally {
    refreshing.value = false;
  }
}
