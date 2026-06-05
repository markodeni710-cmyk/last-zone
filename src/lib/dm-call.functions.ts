import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole } = pkg;
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ callId: z.string().uuid() });

export const getDmCallToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: call, error } = await supabase
      .from("dm_calls")
      .select("id, caller_id, callee_id, status")
      .eq("id", data.callId)
      .single();
    if (error || !call) throw new Error("Call not found");
    if (call.caller_id !== userId && call.callee_id !== userId) {
      throw new Error("Not a participant");
    }
    if (call.status === "ended" || call.status === "declined" || call.status === "missed" || call.status === "canceled") {
      throw new Error("Call is no longer active");
    }

    const appId = process.env.AGORA_APP_ID!;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE!;
    if (!appId || !appCertificate) throw new Error("Agora not configured");

    const numericUid = Math.abs(
      [...userId].reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 0)
    ) % 2_000_000_000;

    const expireSeconds = 3600;
    const privilegeExpireTs = Math.floor(Date.now() / 1000) + expireSeconds;

    const channelName = `dm_${call.id}`;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      numericUid,
      RtcRole.PUBLISHER,
      privilegeExpireTs,
      privilegeExpireTs,
    );

    return { token, appId, uid: numericUid, channelName };
  });
