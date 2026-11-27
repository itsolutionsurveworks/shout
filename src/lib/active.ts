// Run `fn` whenever the app becomes active (window focused, or shown again from the tray/minimised),
// at most once per `minGapMs`. This replaces polling timers: Realtime delivers changes as they happen,
// and this catches anything missed while the window was hidden, without a request every few seconds.
export function onActive(fn: () => unknown, minGapMs = 60_000): () => void {
  let last = 0;
  const run = () => {
    if (document.hidden) return;
    const now = Date.now();
    if (now - last < minGapMs) return;
    last = now;
    fn();
  };
  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", run);
  return () => {
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", run);
  };
}
