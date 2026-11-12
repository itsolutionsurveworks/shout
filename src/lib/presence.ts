import { ref } from "vue";
import { supabase, type Profile } from "./supabase";

type RealtimeChannel = ReturnType<typeof supabase.channel>;

// Live "who is online" set, driven by Supabase Realtime Presence.
// Every signed-in client joins one shared channel and tracks itself. The server
// pushes joins/leaves to everyone instantly, and drops a user as soon as their
// socket closes (app quit, network lost, sign-out). No DB writes are needed.
export const onlineIds = ref<Set<string>>(new Set());

let channel: RealtimeChannel | null = null;
let trackedUserId: string | null = null;

export function startPresence(me: Profile) {
  // Token refreshes re-fire auth events; don't tear down a live channel for the same user.
  if (channel && trackedUserId === me.id) return;
  stopPresence();

  trackedUserId = me.id;
  const ch = supabase.channel("office-presence", {
    config: { presence: { key: me.id } },
  });
  channel = ch;

  ch.on("presence", { event: "sync" }, () => {
    onlineIds.value = new Set(Object.keys(ch.presenceState()));
  }).subscribe(async (status) => {
    // Fires again after every reconnect, so we re-announce ourselves each time.
    if (status === "SUBSCRIBED") {
      await ch.track({ name: me.full_name, role: me.role, online_at: new Date().toISOString() });
    }
  });
}

export function stopPresence() {
  if (channel) {
    // removeChannel untracks and leaves the channel; others see us go offline right away.
    supabase.removeChannel(channel);
    channel = null;
  }
  trackedUserId = null;
  onlineIds.value = new Set();
}
