import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const PRESENCE_CHANNEL = "presence:online-users";

// Singleton state shared across all hook callers in the app.
let channel: RealtimeChannel | null = null;
let trackedUserId: string | null = null;
let onlineIds: Set<string> = new Set();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

async function updateLastSeen(userId: string) {
  await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
}

function ensureChannel() {
  if (channel) return channel;
  const observerKey = "anon-" + Math.random().toString(36).slice(2);
  channel = supabase.channel(PRESENCE_CHANNEL, {
    config: { presence: { key: observerKey } },
  });
  const sync = () => {
    const state = channel!.presenceState() as Record<string, Array<{ user_id?: string }>>;
    const ids = new Set<string>();
    Object.values(state).forEach((arr) => {
      arr?.forEach((m) => { if (m.user_id) ids.add(m.user_id); });
    });
    onlineIds = ids;
    console.log("[presence] sync, online user_ids:", Array.from(ids));
    notify();
  };
  channel
    .on("presence", { event: "sync" }, sync)
    .on("presence", { event: "join" }, sync)
    .on("presence", { event: "leave" }, sync)
    .subscribe(async (status) => {
      console.log("[presence] channel status:", status, "trackedUserId:", trackedUserId);
      if (status === "SUBSCRIBED" && trackedUserId) {
        const res = await channel!.track({ user_id: trackedUserId, online_at: new Date().toISOString() });
        console.log("[presence] track() result:", res);
        await updateLastSeen(trackedUserId);
      }
    });
  return channel;
}

/**
 * Tracks the given userId on the shared presence channel.
 * Call once from a top-level component (e.g. the app shell).
 */
export function useTrackOnlinePresence(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    trackedUserId = userId;
    const ch = ensureChannel();
    // If the channel was already SUBSCRIBED before this effect ran, track now.
    // Otherwise the subscribe callback above will call track once SUBSCRIBED.
    if ((ch as unknown as { state?: string }).state === "joined") {
      ch.track({ user_id: userId, online_at: new Date().toISOString() })
        .then((res) => console.log("[presence] late track() result:", res))
        .catch((e) => console.warn("[presence] late track failed:", e));
      updateLastSeen(userId).catch(() => {});
    }
    return () => {
      if (trackedUserId === userId) {
        trackedUserId = null;
        ch.untrack().catch(() => {});
        updateLastSeen(userId).catch(() => {});
      }
    };
  }, [userId]);
}

/**
 * Returns the set of user_ids currently online (reactive).
 */
export function useOnlineUsers(): Set<string> {
  const [, setTick] = useState(0);
  useEffect(() => {
    ensureChannel();
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return onlineIds;
}
