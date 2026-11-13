import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_EVERY_MS = 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | undefined;

// "installing" means a newer release was found; the app restarts right after.
export type UpdateStatus = "up-to-date" | "installing" | "error";

let inFlight: Promise<UpdateStatus> | null = null;

// Looks for a newer release on GitHub. If one exists, it downloads and installs it,
// then restarts the app. Only one check runs at a time: a button press during a timer
// check (or the reverse) joins the check already running instead of starting a second install.
export function checkForUpdates(): Promise<UpdateStatus> {
  if (!("__TAURI_INTERNALS__" in window)) return Promise.resolve("error");
  inFlight ??= runCheck().finally(() => { inFlight = null; });
  return inFlight;
}

async function runCheck(): Promise<UpdateStatus> {
  try {
    const update = await check();
    if (!update) return "up-to-date";
    console.info(`Installing update ${update.version}`);
    await update.downloadAndInstall();
    await relaunch();
    return "installing";
  } catch (e) {
    console.error("Update check failed", e);
    return "error";
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
