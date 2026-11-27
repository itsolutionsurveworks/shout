import { ref } from "vue";

// Egress guardrails, kept deliberately simple.
//  1. A meter: requests and kilobytes per endpoint since the app started, shown in the Dev tab, so a
//     polling bug is visible within minutes instead of at the monthly quota.
//  2. A budget: at most GET_BUDGET_PER_HOUR read requests per hour. Writes (sending a shout, replying,
//     acknowledging) are never limited, so shouts always go through. A runaway loop stops by itself.
// RULE FOR NEW CODE: no polling timers against Supabase. Use Realtime for live data and
// src/lib/active.ts for "refresh when the app becomes active"; fetch only what changed (see lib/thread.ts).
export const netStats = ref<Record<string, { requests: number; bytes: number }>>({});
export const budgetBlocked = ref(0);

export const GET_BUDGET_PER_HOUR = 600;
const getTimes: number[] = [];

// True when another read request is allowed right now (and counts it).
export function allowRead(): boolean {
  const cutoff = Date.now() - 3_600_000;
  while (getTimes.length && getTimes[0] < cutoff) getTimes.shift();
  if (getTimes.length >= GET_BUDGET_PER_HOUR) { budgetBlocked.value += 1; return false; }
  getTimes.push(Date.now());
  return true;
}

export function recordRequest(key: string, bytes: number) {
  const s = (netStats.value[key] ??= { requests: 0, bytes: 0 });
  s.requests += 1;
  s.bytes += bytes;
}

export function resetNetStats() {
  netStats.value = {};
  budgetBlocked.value = 0;
}
