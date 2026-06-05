import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import AgoraRTC, {
  type IAgoraRTCClient,
  type IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { supabase } from "@/integrations/supabase/client";
import { getAgoraToken } from "@/lib/agora.functions";
import { toast } from "sonner";
import { Mic, MicOff, PhoneOff, Volume2, Hand } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { getSharedAudioContext } from "@/lib/audio-unlock";

export type Participant = {
  id: string;
  user_id: string;
  channel_id: string;
  server_id: string;
  can_speak: boolean;
  hand_raised: boolean;
  is_muted: boolean;
  profile?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

type ActiveCall = {
  channelId: string;
  channelName: string;
  serverId: string;
  ownerId: string;
  currentUserId: string;
};

type Ctx = {
  activeCall: ActiveCall | null;
  joining: boolean;
  joined: boolean;
  canPublish: boolean;
  micOn: boolean;
  speakingUids: Set<number>;
  participants: Participant[] | undefined;
  isOwner: boolean;
  myRow: Participant | undefined;
  join: (call: ActiveCall, opts?: { grantSpeak?: boolean }) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleHand: () => Promise<void>;
  setSpeakPermission: (participantId: string, canSpeak: boolean) => Promise<void>;
  forceMute: (participantId: string) => Promise<void>;
  kick: (participantId: string, durationMinutes: number) => Promise<void>;
  uidFor: (userId: string) => number;
  muteAllActive: boolean;
  toggleMuteAll: () => Promise<void>;
  inviteUser: (toUserId: string) => Promise<void>;
};

const VoiceCallContext = createContext<Ctx | null>(null);

export function useVoiceCall() {
  const ctx = useContext(VoiceCallContext);
  if (!ctx) throw new Error("useVoiceCall must be used within VoiceCallProvider");
  return ctx;
}

function uidFor(userId: string) {
  return Math.abs([...userId].reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 0)) % 2_000_000_000;
}

export function VoiceCallProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const tokenFn = useServerFn(getAgoraToken);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [speakingUids, setSpeakingUids] = useState<Set<number>>(new Set());

  const isOwner = !!activeCall && activeCall.ownerId === activeCall.currentUserId;

  const { data: participants } = useQuery({
    queryKey: ["voice-participants", activeCall?.channelId],
    enabled: !!activeCall,
    queryFn: async () => {
      const { data } = await supabase
        .from("voice_room_participants")
        .select("*")
        .eq("channel_id", activeCall!.channelId)
        .order("joined_at", { ascending: true });
      if (!data || data.length === 0) return [] as Participant[];
      const userIds = data.map((p) => p.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((p) => ({
        ...p,
        profile: map.get(p.user_id)
          ? {
              username: map.get(p.user_id)!.username,
              display_name: map.get(p.user_id)!.display_name,
              avatar_url: map.get(p.user_id)!.avatar_url,
            }
          : null,
      })) as Participant[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!activeCall) return;
    const ch = supabase
      .channel(`voice-${activeCall.channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_room_participants", filter: `channel_id=eq.${activeCall.channelId}` },
        () => qc.invalidateQueries({ queryKey: ["voice-participants", activeCall.channelId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeCall?.channelId, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const myRow = participants?.find((p) => p.user_id === activeCall?.currentUserId);

  const leave = useCallback(async (removeRow = true) => {
    try {
      if (micTrackRef.current) {
        micTrackRef.current.stop();
        micTrackRef.current.close();
        micTrackRef.current = null;
      }
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current = null;
      }
    } catch (e) { console.error(e); }
    const call = activeCall;
    setJoined(false);
    setMicOn(false);
    setCanPublish(false);
    setActiveCall(null);
    if (removeRow && call) {
      await supabase.from("voice_room_participants").delete().eq("channel_id", call.channelId).eq("user_id", call.currentUserId);
    }
  }, [activeCall]);

  const join = useCallback(async (call: ActiveCall, opts?: { grantSpeak?: boolean }) => {
    if (joining) return;
    // If switching channels, leave first
    if (activeCall && activeCall.channelId !== call.channelId) {
      await leave(true);
    }
    if (joined && activeCall?.channelId === call.channelId) return;

    // Check active ban
    const { data: ban } = await supabase
      .from("voice_room_bans")
      .select("expires_at")
      .eq("channel_id", call.channelId)
      .eq("user_id", call.currentUserId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (ban) {
      const mins = Math.max(1, Math.ceil((new Date(ban.expires_at).getTime() - Date.now()) / 60000));
      toast.error(`أنت مطرود من الغرفة. حاول بعد ${mins} دقيقة`);
      return;
    }

    // Prevent conflict with an active 1:1 DM call
    const { data: dmActive } = await supabase
      .from("dm_calls")
      .select("id")
      .or(`caller_id.eq.${call.currentUserId},callee_id.eq.${call.currentUserId}`)
      .in("status", ["ringing", "accepted"])
      .limit(1)
      .maybeSingle();
    if (dmActive) {
      toast.error("أنهِ مكالمتك الحالية قبل الانضمام للغرفة الصوتية");
      return;
    }



    setJoining(true);
    setActiveCall(call);
    try {
      const { data: existing } = await supabase
        .from("voice_room_participants")
        .select("id")
        .eq("channel_id", call.channelId)
        .eq("user_id", call.currentUserId)
        .maybeSingle();
      const ownerHere = call.ownerId === call.currentUserId;
      const grantSpeak = !!opts?.grantSpeak;
      const initialCanSpeak = ownerHere || grantSpeak;
      const initialMuted = !grantSpeak; // unmuted when accepting an invite
      if (!existing) {
        await supabase.from("voice_room_participants").insert({
          channel_id: call.channelId, server_id: call.serverId, user_id: call.currentUserId,
          can_speak: initialCanSpeak, is_muted: initialMuted,
        });
      } else if (grantSpeak) {
        await supabase.from("voice_room_participants")
          .update({ can_speak: true, is_muted: false })
          .eq("id", existing.id);
      }

      const { token, appId, uid, canPublish: serverCanPublish } = await tokenFn({ data: { channelId: call.channelId } });
      setCanPublish(serverCanPublish);

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      clientRef.current = client;

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio") user.audioTrack?.play();
      });
      client.on("user-unpublished", (user) => { user.audioTrack?.stop(); });
      client.enableAudioVolumeIndicator();
      client.on("volume-indicator", (volumes) => {
        const speaking = new Set<number>();
        volumes.forEach((v) => { if (v.level > 5) speaking.add(Number(v.uid)); });
        setSpeakingUids(speaking);
      });

      await client.join(appId, call.channelId, token, uid);

      if (serverCanPublish) {
        const mic = await AgoraRTC.createMicrophoneAudioTrack();
        micTrackRef.current = mic;
        const startMuted = !grantSpeak;
        await mic.setMuted(startMuted);
        await client.publish([mic]);
        setMicOn(!startMuted);
        if (grantSpeak) selfMicActionRef.current = "unmute";
      }

      setJoined(true);
      toast.success("انضممت للغرفة الصوتية");

    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "تعذر الانضمام");
      setActiveCall(null);
    } finally {
      setJoining(false);
    }
  }, [joining, activeCall, joined, leave, tokenFn]);

  const selfMicActionRef = useRef<"mute" | "unmute" | null>(null);

  // React to row changes (perms / kick / force-mute)
  useEffect(() => {
    if (!joined || !activeCall) return;
    if (participants && !myRow) {
      toast.error("تم طردك من الغرفة");
      leave(false);
      return;
    }
    if (!myRow) return;
    const newCanPublish = isOwner || myRow.can_speak;
    if (newCanPublish !== canPublish) {
      // Update role in place — renew token then publish/unpublish mic (no rejoin)
      (async () => {
        try {
          const client = clientRef.current;
          if (!client || !activeCall) return;
          const { token } = await tokenFn({ data: { channelId: activeCall.channelId } });
          await client.renewToken(token);
          if (newCanPublish) {
            if (!micTrackRef.current) {
              const mic = await AgoraRTC.createMicrophoneAudioTrack();
              micTrackRef.current = mic;
              await mic.setMuted(true);
              await client.publish([mic]);
            }
            setCanPublish(true);
            setMicOn(false);
            toast.success("تم منحك إذن التحدث");
          } else {
            if (micTrackRef.current) {
              try { await client.unpublish([micTrackRef.current]); } catch {}
              micTrackRef.current.stop();
              micTrackRef.current.close();
              micTrackRef.current = null;
            }
            setCanPublish(false);
            setMicOn(false);
            toast.message("تم سحب إذن التحدث");
          }
        } catch (e: any) {
          console.error(e);
          toast.error(e?.message || "تعذر تحديث الصلاحيات");
        }
      })();
      return;
    }
    if (myRow.is_muted && selfMicActionRef.current === "mute") {
      selfMicActionRef.current = null;
      if (micOn && micTrackRef.current) {
        micTrackRef.current.setMuted(true);
        setMicOn(false);
      }
      return;
    }
    if (!myRow.is_muted && selfMicActionRef.current === "unmute") {
      selfMicActionRef.current = null;
      return;
    }
    if (myRow.is_muted && micOn && micTrackRef.current) {
      micTrackRef.current.setMuted(true);
      setMicOn(false);
      toast.message("تم كتم المايك من قبل الأدمن");
      return;
    }
    if (!myRow.is_muted && newCanPublish && !micOn && micTrackRef.current) {
      micTrackRef.current.setMuted(false);
      setMicOn(true);
    }
  }, [joined, myRow?.can_speak, myRow?.is_muted, participants?.length, canPublish, micOn, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMic = useCallback(async () => {
    if (!canPublish) { toast.error("ليس لديك إذن التحدث."); return; }
    if (!micTrackRef.current || !activeCall) return;
    const next = !micOn;
    selfMicActionRef.current = next ? "unmute" : "mute";
    await micTrackRef.current.setMuted(!next);
    setMicOn(next);
    await supabase.from("voice_room_participants").update({ is_muted: !next }).eq("channel_id", activeCall.channelId).eq("user_id", activeCall.currentUserId);
    if (!next) toast.message("تم كتم المايك");
  }, [canPublish, micOn, activeCall]);

  const toggleHand = useCallback(async () => {
    if (!myRow) return;
    await supabase.from("voice_room_participants").update({ hand_raised: !myRow.hand_raised }).eq("id", myRow.id);
  }, [myRow]);

  const setSpeakPermission = useCallback(async (participantId: string, canSpeak: boolean) => {
    const { error } = await supabase
      .from("voice_room_participants")
      .update({ can_speak: canSpeak, hand_raised: false, is_muted: !canSpeak })
      .eq("id", participantId);
    if (error) toast.error(error.message);
    else toast.success(canSpeak ? "تم منح إذن التحدث" : "تم سحب إذن التحدث");
  }, []);

  const forceMute = useCallback(async (participantId: string) => {
    const { error } = await supabase
      .from("voice_room_participants")
      .update({ is_muted: true })
      .eq("id", participantId);
    if (error) toast.error(error.message);
    else toast.success("تم كتم المستخدم");
  }, []);

  const kick = useCallback(async (participantId: string, durationMinutes: number) => {
    const p = participants?.find((x) => x.id === participantId);
    if (!p || !activeCall) return;
    const expiresAt = new Date(Date.now() + durationMinutes * 60_000).toISOString();
    const { error: banErr } = await supabase
      .from("voice_room_bans")
      .upsert(
        {
          channel_id: p.channel_id,
          server_id: p.server_id,
          user_id: p.user_id,
          banned_by: activeCall.currentUserId,
          expires_at: expiresAt,
        },
        { onConflict: "channel_id,user_id" },
      );
    if (banErr) { toast.error(banErr.message); return; }
    const { error, count } = await supabase
      .from("voice_room_participants")
      .delete({ count: "exact" })
      .eq("id", participantId);
    if (error) toast.error(error.message);
    else if (!count) toast.error("لا تملك صلاحية الطرد");
    else {
      const label = durationMinutes >= 60 ? `${Math.round(durationMinutes / 60)} ساعة` : `${durationMinutes} دقيقة`;
      toast.success(`تم طرد المستخدم لمدة ${label}`);
    }
  }, [participants, activeCall]);

  // Mute-all (owner): snapshot then restore
  const muteAllSnapshotRef = useRef<Map<string, { can_speak: boolean; is_muted: boolean }> | null>(null);
  const [muteAllActive, setMuteAllActive] = useState(false);

  const toggleMuteAll = useCallback(async () => {
    if (!activeCall || !isOwner || !participants) return;
    if (!muteAllActive) {
      const snap = new Map<string, { can_speak: boolean; is_muted: boolean }>();
      const targets = participants.filter((p) => p.user_id !== activeCall.ownerId);
      targets.forEach((p) => snap.set(p.id, { can_speak: p.can_speak, is_muted: p.is_muted }));
      muteAllSnapshotRef.current = snap;
      const { error } = await supabase
        .from("voice_room_participants")
        .update({ can_speak: false, is_muted: true })
        .in("id", targets.map((p) => p.id));
      if (error) { toast.error(error.message); return; }
      setMuteAllActive(true);
      toast.success("تم كتم الجميع");
    } else {
      const snap = muteAllSnapshotRef.current;
      if (snap && snap.size > 0) {
        await Promise.all(
          [...snap.entries()].map(([id, s]) =>
            supabase.from("voice_room_participants").update({ can_speak: s.can_speak, is_muted: s.is_muted }).eq("id", id),
          ),
        );
      }
      muteAllSnapshotRef.current = null;
      setMuteAllActive(false);
      toast.success("تم استعادة الأذونات السابقة");
    }
  }, [activeCall, isOwner, participants, muteAllActive]);

  // Leave on unload / tab close — use fetch keepalive with auth so RLS allows the delete
  useEffect(() => {
    if (!activeCall) return;
    const onUnload = () => {
      const call = activeCall;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/voice_room_participants?channel_id=eq.${call.channelId}&user_id=eq.${call.currentUserId}`;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      let token = key;
      try {
        const authKey = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
        if (authKey) {
          const s = JSON.parse(localStorage.getItem(authKey) || "{}");
          if (s?.access_token) token = s.access_token;
        }
      } catch {}
      try {
        fetch(url, {
          method: "DELETE",
          keepalive: true,
          headers: { apikey: key, Authorization: `Bearer ${token}` },
        });
      } catch {}
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [activeCall]);

  // Leave on sign-out — delete row before the session disappears
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_OUT" && activeCall) {
        try {
          await supabase
            .from("voice_room_participants")
            .delete()
            .eq("channel_id", activeCall.channelId)
            .eq("user_id", activeCall.currentUserId);
        } catch {}
        await leave(false);
      }
    });
    return () => subscription.unsubscribe();
  }, [activeCall, leave]);

  const inviteUser = useCallback(async (toUserId: string) => {
    if (!activeCall) { toast.error("لست داخل غرفة"); return; }
    const { data: inv, error } = await supabase.from("voice_call_invites").insert({
      channel_id: activeCall.channelId,
      server_id: activeCall.serverId,
      channel_name: activeCall.channelName,
      from_user: activeCall.currentUserId,
      to_user: toUserId,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    toast.success("تم إرسال الدعوة");

    // Fire-and-forget push notification (so the recipient's phone rings even if app is closed)
    try {
      const { data: me } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", activeCall.currentUserId)
        .maybeSingle();
      const fromName = me?.display_name || me?.username || "صديق";
      const { sendCallNotification } = await import("@/lib/onesignal.functions");
      sendCallNotification({
        data: {
          toUserId,
          fromName,
          channelName: activeCall.channelName,
          inviteId: inv?.id,
        },
      }).catch((e) => console.warn("push failed", e));
    } catch (e) {
      console.warn("push setup failed", e);
    }
  }, [activeCall]);

  const value: Ctx = {
    activeCall, joining, joined, canPublish, micOn, speakingUids,
    participants, isOwner, myRow,
    join, leave: () => leave(true), toggleMic, toggleHand,
    setSpeakPermission, forceMute, kick, uidFor,
    muteAllActive, toggleMuteAll, inviteUser,
  };

  return (
    <VoiceCallContext.Provider value={value}>
      {children}
      <FloatingCallBar />
      <IncomingCallDialog />
    </VoiceCallContext.Provider>
  );
}

type IncomingInvite = {
  id: string;
  channel_id: string;
  server_id: string;
  channel_name: string;
  from_user: string;
  to_user: string;
  status: string;
  expires_at: string;
  fromProfile?: { display_name: string | null; username: string; avatar_url: string | null } | null;
  serverName?: string | null;
};

function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: number | undefined;
    let started = false;

    const playBeep = () => {
      const ctx = getSharedAudioContext();
      if (!ctx || stopped || ctx.state !== "running") return;
      try {
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
        const o1 = ctx.createOscillator();
        o1.type = "sine"; o1.frequency.value = 880;
        const o2 = ctx.createOscillator();
        o2.type = "sine"; o2.frequency.value = 660;
        o1.connect(gain); o2.connect(gain); gain.connect(ctx.destination);
        o1.start(now); o2.start(now + 0.4);
        o1.stop(now + 0.4); o2.stop(now + 0.8);
      } catch {}
    };

    const beginInterval = () => {
      if (started || stopped) return;
      started = true;
      playBeep();
      timer = window.setInterval(playBeep, 1500);
    };

    const tryStart = async () => {
      const ctx = getSharedAudioContext();
      if (!ctx) return false;
      try { if (ctx.state === "suspended") await ctx.resume(); } catch {}
      if (ctx.state === "running") { beginInterval(); return true; }
      return false;
    };

    tryStart();

    // If the user hasn't interacted yet, retry on the next gesture.
    const unlock = async () => {
      const ok = await tryStart();
      if (ok) {
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("click", unlock);
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    window.addEventListener("click", unlock);

    return () => {
      stopped = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("click", unlock);
      if (timer) clearInterval(timer);
    };
  }, [active]);
}


function IncomingCallDialog() {
  const { join, activeCall } = useVoiceCall();
  const [invite, setInvite] = useState<IncomingInvite | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null)).catch(() => setUserId(null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const handleIncoming = async (row: IncomingInvite) => {
      if (row.to_user !== userId || row.status !== "pending") return;
      if (new Date(row.expires_at).getTime() < Date.now()) return;
      const [{ data: prof }, { data: srv }] = await Promise.all([
        supabase.from("profiles").select("display_name, username, avatar_url").eq("id", row.from_user).maybeSingle(),
        supabase.from("servers").select("name").eq("id", row.server_id).maybeSingle(),
      ]);
      setInvite({ ...row, fromProfile: prof ?? null, serverName: srv?.name ?? null });
    };
    // Check existing pending
    supabase
      .from("voice_call_invites")
      .select("*")
      .eq("to_user", userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) handleIncoming(data as IncomingInvite); });

    const ch = supabase
      .channel(`invites-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "voice_call_invites", filter: `to_user=eq.${userId}` },
        (payload) => handleIncoming(payload.new as IncomingInvite),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  // Auto-dismiss on expiry
  useEffect(() => {
    if (!invite) return;
    const ms = new Date(invite.expires_at).getTime() - Date.now();
    if (ms <= 0) { setInvite(null); return; }
    const t = setTimeout(() => setInvite(null), ms);
    return () => clearTimeout(t);
  }, [invite]);

  useRingtone(!!invite);



  if (!invite || !userId) return null;

  const decline = async () => {
    await supabase.from("voice_call_invites").update({ status: "declined" }).eq("id", invite.id);
    setInvite(null);
  };

  const accept = async () => {
    const { data: srv } = await supabase
      .from("servers")
      .select("owner_id")
      .eq("id", invite.server_id)
      .maybeSingle();
    if (!srv) { toast.error("السيرفر غير موجود"); setInvite(null); return; }
    await supabase.from("voice_call_invites").update({ status: "accepted" }).eq("id", invite.id);
    const inv = invite;
    setInvite(null);
    if (activeCall?.channelId === inv.channel_id) return;
    await join({
      channelId: inv.channel_id,
      channelName: inv.channel_name,
      serverId: inv.server_id,
      ownerId: srv.owner_id,
      currentUserId: userId,
    }, { grantSpeak: true });

  };

  const name = invite.fromProfile?.display_name || invite.fromProfile?.username || "لاعب";

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-primary/30 shadow-elegant p-6 text-center animate-in zoom-in-95">
        <div className="size-20 rounded-full bg-gradient-gold mx-auto flex items-center justify-center text-primary-foreground font-bold text-2xl overflow-hidden mb-3">
          {invite.fromProfile?.avatar_url ? (
            <img src={invite.fromProfile.avatar_url} alt="" className="size-full object-cover" />
          ) : name.slice(0, 1)}
        </div>
        <p className="text-xs text-muted-foreground">مكالمة واردة</p>
        <h3 className="text-xl font-bold mt-1">{name}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          يدعوك للانضمام إلى <span className="text-primary font-bold">{invite.channel_name}</span>
          {invite.serverName && (
            <> في سيرفر <span className="text-primary font-bold">{invite.serverName}</span></>
          )}
        </p>

        <div className="flex gap-3 mt-6">
          <button onClick={decline} className="flex-1 h-12 rounded-full bg-destructive text-destructive-foreground font-bold hover:bg-destructive/90 flex items-center justify-center gap-2">
            <PhoneOff className="size-4" /> رفض
          </button>
          <button onClick={accept} className="flex-1 h-12 rounded-full bg-green-600 text-white font-bold hover:bg-green-700 flex items-center justify-center gap-2">
            <Volume2 className="size-4" /> قبول
          </button>
        </div>
      </div>
    </div>
  );
}

function FloatingCallBar() {
  const { activeCall, joined, micOn, canPublish, toggleMic, leave, toggleHand, myRow } = useVoiceCall();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!activeCall || !joined) return null;
  // Hide when on the same server's page (the VoiceRoom UI is visible)
  const onSameServer = pathname.includes(`/app/servers/${activeCall.serverId}`);
  if (onSameServer) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 rounded-xl bg-surface/95 backdrop-blur border border-primary/30 shadow-elegant p-3 flex items-center gap-2">
      <div className="size-9 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0">
        <Volume2 className="size-4" />
      </div>
      <Link
        to="/app/servers/$serverId"
        params={{ serverId: activeCall.serverId }}
        className="flex-1 min-w-0"
      >
        <p className="text-[10px] text-muted-foreground">متصل بالغرفة</p>
        <p className="text-sm font-bold truncate">{activeCall.channelName}</p>
      </Link>
      {!canPublish && (
        <button
          onClick={toggleHand}
          className={`size-9 rounded-full flex items-center justify-center transition shrink-0 ${myRow?.hand_raised ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-surface/80"}`}
          title="رفع اليد لطلب التحدث"
        >
          <Hand className="size-4" />
        </button>
      )}
      <button
        onClick={toggleMic}
        disabled={!canPublish}
        className={`size-9 rounded-full flex items-center justify-center transition ${
          !canPublish ? "bg-surface opacity-40" : micOn ? "bg-green-600 text-white" : "bg-surface hover:bg-surface/80"
        }`}
      >
        {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
      </button>
      <button
        onClick={leave}
        className="size-9 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90"
      >
        <PhoneOff className="size-4" />
      </button>
    </div>
  );
}
