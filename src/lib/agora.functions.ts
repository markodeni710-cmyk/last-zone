import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole } = pkg;
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  channelId: z.string().uuid(),
});

export const getAgoraToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Fetch channel + server to determine role
    const { data: ch, error: chErr } = await supabase
      .from("channels")
      .select("id, server_id, type")
      .eq("id", data.channelId)
      .single();
    if (chErr || !ch) throw new Error("Channel not found");
    if (ch.type !== "voice") throw new Error("Not a voice channel");

    const { data: srv } = await supabase
      .from("servers")
      .select("owner_id")
      .eq("id", ch.server_id)
      .single();

    const isOwner = srv?.owner_id === userId;

    // Check can_speak permission
    const { data: participant } = await supabase
      .from("voice_room_participants")
      .select("can_speak")
      .eq("channel_id", data.channelId)
      .eq("user_id", userId)
      .maybeSingle();

    const canPublish = isOwner || participant?.can_speak === true;

    // Prefer admin-managed values from app_settings, fallback to env
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["AGORA_APP_ID", "AGORA_APP_CERTIFICATE"]);
    const settingsMap = new Map((settings ?? []).map((s: any) => [s.key, s.value]));
    const appId = (settingsMap.get("AGORA_APP_ID") as string | undefined) || process.env.AGORA_APP_ID!;
    const appCertificate = (settingsMap.get("AGORA_APP_CERTIFICATE") as string | undefined) || process.env.AGORA_APP_CERTIFICATE!;
    if (!appId || !appCertificate) throw new Error("Agora not configured");

    // Agora UID must be a 32-bit uint; derive deterministic numeric ID from user UUID
    const numericUid = Math.abs(
      [...userId].reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 0)
    ) % 2_000_000_000;

    const role = canPublish ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expireSeconds = 3600;
    const privilegeExpireTs = Math.floor(Date.now() / 1000) + expireSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      data.channelId,
      numericUid,
      role,
      privilegeExpireTs,
      privilegeExpireTs,
    );

    return {
      token,
      appId,
      uid: numericUid,
      channelName: data.channelId,
      canPublish,
      isOwner,
    };
  });
