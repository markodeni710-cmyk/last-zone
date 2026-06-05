import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  toUserId: z.string().uuid(),
  fromName: z.string().min(1).max(100),
  channelName: z.string().min(1).max(100),
  inviteId: z.string().uuid().optional(),
});

/**
 * Send a push notification to a user's registered Android devices via OneSignal.
 * Looks up player_ids from `device_tokens` and triggers a high-priority call alert.
 */
export const sendCallNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const appId = process.env.ONESIGNAL_APP_ID;
    const restKey = process.env.ONESIGNAL_REST_API_KEY;
    if (!appId || !restKey) {
      console.error("OneSignal not configured");
      return { sent: false, reason: "not_configured" };
    }

    // Get recipient's device player_ids
    const { data: tokens, error } = await supabase
      .from("device_tokens")
      .select("player_id")
      .eq("user_id", data.toUserId);

    if (error) {
      console.error("device_tokens lookup failed", error);
      return { sent: false, reason: "lookup_failed" };
    }

    const playerIds = (tokens ?? []).map((t) => t.player_id).filter(Boolean);
    if (playerIds.length === 0) {
      return { sent: false, reason: "no_devices" };
    }

    const payload = {
      app_id: appId,
      include_player_ids: playerIds,
      headings: { en: "مكالمة واردة", ar: "مكالمة واردة" },
      contents: {
        en: `${data.fromName} يتصل بك في ${data.channelName}`,
        ar: `${data.fromName} يتصل بك في ${data.channelName}`,
      },
      priority: 10,
      android_channel_id: undefined,
      android_sound: "ringtone",
      ttl: 45,
      data: {
        type: "incoming_call",
        inviteId: data.inviteId ?? null,
        channelName: data.channelName,
        fromName: data.fromName,
      },
    };

    try {
      const res = await fetch("https://api.onesignal.com/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${restKey}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("OneSignal error", res.status, json);
        return { sent: false, reason: "api_error", status: res.status };
      }
      return { sent: true, recipients: playerIds.length };
    } catch (e) {
      console.error("OneSignal fetch failed", e);
      return { sent: false, reason: "network_error" };
    }
  });
