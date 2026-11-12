import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_EVERY_MS = 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | undefined;

// Looks for a newer release on GitHub. If one exists, it downloads and installs it,
// then restarts the app. Failures (offline, no release yet) are logged and ignored.
export async function checkForUpdates() {
  if (!("__TAURI_INTERNALS__" in window)) return;
  try {
    const update = await check();
    if (!update) return;
    console.info(`Installing update ${update.version}`);
    await update.downloadAndInstall();
    await relaunch();
  } catch (e) {
    console.error("Update check failed", e);
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
