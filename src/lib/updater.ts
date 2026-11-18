import { ref } from "vue";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_EVERY_MS = 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | undefined;

// "ready" means a newer release was downloaded and installed (the app restarts).
// "error" means the check, download or install failed.
export type UpdateStatus = "up-to-date" | "ready" | "error";

// What the update check is doing right now, e.g. "Checking for updates…" or "Downloading 0.1.8 · 42%".
// Null when idle. The header status line shows it while it is set.
export const updateActivity = ref<string | null>(null);
// Result of the last finished check, shown in the header until the next check. Null when up to date.
export const updateNotice = ref<{ text: string; error: boolean } | null>(null);

let inFlight: Promise<UpdateStatus> | null = null;
let pending: Update | null = null;

// Looks for a newer release on GitHub, downloads it and installs it silently (passive mode,
// then relaunch). Only one check runs at a time; a second caller joins the running one.
export function checkForUpdates(): Promise<UpdateStatus> {
  if (!("__TAURI_INTERNALS__" in window)) return Promise.resolve("error");
  inFlight ??= runCheck().finally(() => {
    inFlight = null;
    updateActivity.value = null;
  });
  return inFlight;
}

async function runCheck(): Promise<UpdateStatus> {
  try {
    if (pending) {
      // A previous install failed; retry it now.
      await installPendingUpdate();
      return "ready";
    }
    updateActivity.value = "Checking for updates…";
    console.info("Checking for updates");
    const update = await check();
    if (!update) {
      console.info("Up to date");
      updateNotice.value = null;
      return "up-to-date";
    }
    console.info(`Update ${update.version} found (current ${update.currentVersion})`);
    updateActivity.value = `Downloading ${update.version}…`;
    let total = 0;
    let received = 0;
    await update.download((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0;
        console.info(`Downloading ${update.version}: ${total ? `${total} bytes` : "unknown size"}`);
      } else if (event.event === "Progress") {
        received += event.data.chunkLength;
        const percent = total ? Math.floor((received / total) * 100) : null;
        updateActivity.value = `Downloading ${update.version}${percent === null ? "" : ` · ${percent}%`}`;
      } else {
        console.info(`Downloaded ${update.version}`);
      }
    });
    // Install right away in the background; the app restarts into the new version on its own.
    // If the install fails, installPendingUpdate() keeps the update in `pending` and reports the error.
    pending = update;
    await installPendingUpdate();
    return "ready";
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error("Update check failed", e);
    updateNotice.value = { text: `Update check failed: ${reason}`, error: true };
    return "error";
  }
}

// Installs a downloaded release and restarts the app.
async function installPendingUpdate(): Promise<void> {
  const update = pending;
  if (!update) return;
  pending = null;
  try {
    console.info(`Installing update ${update.version}`);
    updateActivity.value = `Installing ${update.version}…`;
    await update.install();
    await relaunch();
  } catch (e) {
    console.error("Update install failed", e);
    pending = update;
    const reason = e instanceof Error ? e.message : String(e);
    updateNotice.value = { text: `Install failed: ${reason}`, error: true };
  } finally {
    updateActivity.value = null;
  }
}

export function startUpdateChecks() {
  void checkForUpdates();
  timer ??= setInterval(checkForUpdates, CHECK_EVERY_MS);
}

export function stopUpdateChecks() {
  clearInterval(timer);
  timer = undefined;
}
