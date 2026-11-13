import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_EVERY_MS = 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | undefined;

// "ready" means a newer release is downloaded and waits for the window to be opened.
// "error" means the check or download failed.
export type UpdateStatus = "up-to-date" | "ready" | "error";

let inFlight: Promise<UpdateStatus> | null = null;
let pending: Update | null = null;

// Looks for a newer release on GitHub and downloads it. Nothing is installed yet, so a PC
// in the background is never restarted mid-shout. installPendingUpdate() runs when the
// window is opened. Only one check runs at a time.
export function checkForUpdates(): Promise<UpdateStatus> {
  if (!("__TAURI_INTERNALS__" in window)) return Promise.resolve("error");
  inFlight ??= runCheck().finally(() => { inFlight = null; });
  return inFlight;
}

async function runCheck(): Promise<UpdateStatus> {
  try {
    if (pending) return "ready";
    const update = await check();
    if (!update) return "up-to-date";
    console.info(`Downloading update ${update.version}`);
    await update.download();
    pending = update;
    return "ready";
  } catch (e) {
    console.error("Update check failed", e);
    return "error";
  }
}

// Installs a downloaded release and restarts. Called when the window gains focus (opened from the tray).
export async function installPendingUpdate(): Promise<void> {
  const update = pending;
  if (!update) return;
  pending = null;
  try {
    console.info(`Installing update ${update.version}`);
    await update.install();
    await relaunch();
  } catch (e) {
    console.error("Update install failed", e);
    pending = update;
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
