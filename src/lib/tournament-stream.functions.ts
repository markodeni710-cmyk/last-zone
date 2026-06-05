import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole } = pkg;
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ tournamentId: z.string().uuid() });

export const getTournamentStreamToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: t, error } = await supabase
      .from("tournaments")
      .select("id, organizer_id, live_stream_active")
      .eq("id", data.tournamentId)
      .single();
    if (error || !t) throw new Error("Tournament not found");

    const isOrganizer = t.organizer_id === userId;

    // Prefer admin-managed settings
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["AGORA_APP_ID", "AGORA_APP_CERTIFICATE"]);
    const map = new Map((settings ?? []).map((s: any) => [s.key, s.value]));
    const appId = (map.get("AGORA_APP_ID") as string | undefined) || process.env.AGORA_APP_ID!;
    const appCertificate =
      (map.get("AGORA_APP_CERTIFICATE") as string | undefined) || process.env.AGORA_APP_CERTIFICATE!;
    if (!appId || !appCertificate) throw new Error("Agora not configured");

    const numericUid =
      Math.abs([...userId].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0)) %
      2_000_000_000;

    const channelName = `tournament_live_${t.id}`;
    const role = isOrganizer ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const expireSeconds = 3600;
    const privilegeExpireTs = Math.floor(Date.now() / 1000) + expireSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      numericUid,
      role,
      privilegeExpireTs,
      privilegeExpireTs,
    );

    return { token, appId, uid: numericUid, channelName, isOrganizer };
  });
