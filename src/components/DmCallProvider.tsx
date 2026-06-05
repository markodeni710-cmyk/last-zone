import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import AgoraRTC, { type IAgoraRTCClient, type IMicrophoneAudioTrack, type ICameraVideoTrack, type IAgoraRTCRemoteUser } from "agora-rtc-sdk-ng";
import { supabase } from "@/integrations/supabase/client";
import { getDmCallToken } from "@/lib/dm-call.functions";
import { toast } from "sonner";
import { Mic, MicOff, PhoneOff, Phone, Volume2, ChevronDown, Video, VideoOff, SwitchCamera } from "lucide-react";
import { getSharedAudioContext } from "@/lib/audio-unlock";
import { AdminBadge } from "@/components/AdminBadge";

type CallKind = "audio" | "video";

type ActiveCall = {
  callId: string;
  otherId: string;
  otherName: string;
  otherUsername: string | null;
  otherAvatar: string | null;
  iAmCaller: boolean;
  kind: CallKind;
};

type Ctx = {
  active: ActiveCall | null;
  connected: boolean;
  micOn: boolean;
  camOn: boolean;
  startCall: (other: { id: string; name: string; username?: string | null; avatar: string | null }, kind?: CallKind) => Promise<void>;
  endCall: () => Promise<void>;
  toggleMic: () => Promise<void>;
  toggleCam: () => Promise<void>;
};

const DmCallContext = createContext<Ctx | null>(null);

export function useDmCall() {
  const ctx = useContext(DmCallContext);
  if (!ctx) throw new Error("useDmCall must be used within DmCallProvider");
  return ctx;
}

type IncomingRow = {
  id: string; caller_id: string; callee_id: string; status: string; expires_at: string; kind?: string;
};

type IncomingDisplay = IncomingRow & {
  fromProfile: { display_name: string | null; username: string; avatar_url: string | null } | null;
};

function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: number | undefined;
    const playBeep = () => {
      const ctx = getSharedAudioContext();
      if (!ctx || stopped || ctx.state !== "running") return;
      try {
        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
        const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = 880;
        const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = 660;
        o1.connect(gain); o2.connect(gain); gain.connect(ctx.destination);
        o1.start(now); o2.start(now + 0.4);
        o1.stop(now + 0.4); o2.stop(now + 0.8);
      } catch {}
    };
    const start = async () => {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      try { if (ctx.state === "suspended") await ctx.resume(); } catch {}
      if (ctx.state === "running" && !stopped) {
        playBeep();
        timer = window.setInterval(playBeep, 1500);
      }
    };
    start();
    return () => { stopped = true; if (timer) clearInterval(timer); };
  }, [active]);
}

export function DmCallProvider({ children }: { children: React.ReactNode }) {
  const tokenFn = useServerFn(getDmCallToken);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);
  const camRef = useRef<ICameraVideoTrack | null>(null);
  const localVideoRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRef = useRef<HTMLDivElement | null>(null);
  const remoteUserRef = useRef<IAgoraRTCRemoteUser | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [connected, setConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [incoming, setIncoming] = useState<IncomingDisplay | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [outgoing, setOutgoing] = useState<{
    callId: string; otherId: string; otherName: string; otherUsername: string | null; otherAvatar: string | null; kind: CallKind;
  } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const leaveAgora = useCallback(async () => {
    try {
      if (micRef.current) { micRef.current.stop(); micRef.current.close(); micRef.current = null; }
      if (camRef.current) { camRef.current.stop(); camRef.current.close(); camRef.current = null; }
      if (clientRef.current) { await clientRef.current.leave(); clientRef.current = null; }
    } catch (e) { console.error(e); }
    remoteUserRef.current = null;
    setConnected(false);
    setMicOn(true);
    setCamOn(true);
    setRemoteHasVideo(false);
  }, []);

  const joinAgora = useCallback(async (callId: string, kind: CallKind) => {
    const { token, appId, uid, channelName } = await tokenFn({ data: { callId } });
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    clientRef.current = client;
    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === "audio") user.audioTrack?.play();
      if (mediaType === "video") {
        remoteUserRef.current = user;
        setRemoteHasVideo(true);
        setTimeout(() => {
          if (remoteVideoRef.current) user.videoTrack?.play(remoteVideoRef.current, { fit: "contain" });
        }, 50);
      }
    });
    client.on("user-unpublished", (user, mediaType) => {
      if (mediaType === "audio") user.audioTrack?.stop();
      if (mediaType === "video") {
        user.videoTrack?.stop();
        setRemoteHasVideo(false);
      }
    });
    client.on("user-left", () => { setRemoteHasVideo(false); remoteUserRef.current = null; });
    await client.join(appId, channelName, token, uid);
    const mic = await AgoraRTC.createMicrophoneAudioTrack();
    micRef.current = mic;
    if (kind === "video") {
      try {
        const cam = await AgoraRTC.createCameraVideoTrack({ facingMode: "user" } as any);
        camRef.current = cam;
        await client.publish([mic, cam]);
        setTimeout(() => {
          if (localVideoRef.current) cam.play(localVideoRef.current, { fit: "cover", mirror: true });
        }, 50);
      } catch (e) {
        console.error("camera failed", e);
        toast.error("تعذر فتح الكاميرا");
        await client.publish([mic]);
      }
    } else {
      await client.publish([mic]);
    }
    setMicOn(true);
    setCamOn(true);
    setConnected(true);
  }, [tokenFn]);

  const endCall = useCallback(async () => {
    const a = active;
    const o = outgoing;
    await leaveAgora();
    setActive(null);
    setOutgoing(null);
    setMinimized(false);
    if (a) {
      await supabase.from("dm_calls").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", a.callId).in("status", ["ringing", "accepted"]);
    } else if (o) {
      await supabase.from("dm_calls").update({ status: "canceled", ended_at: new Date().toISOString() }).eq("id", o.callId).eq("status", "ringing");
    }
  }, [active, outgoing, leaveAgora]);

  const startCall = useCallback(async (other: { id: string; name: string; username?: string | null; avatar: string | null }, kind: CallKind = "audio") => {
    if (!userId) { toast.error("سجل دخول أولاً"); return; }
    if (active || outgoing) { toast.error("لديك مكالمة جارية"); return; }
    const { data: vroom } = await supabase
      .from("voice_room_participants")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (vroom) { toast.error("أنت داخل غرفة صوتية. اخرج منها أولاً"); return; }
    const { data, error } = await supabase
      .from("dm_calls")
      .insert({ caller_id: userId, callee_id: other.id, kind } as any)
      .select("id")
      .single();
    if (error || !data) { toast.error(error?.message || "تعذر بدء المكالمة"); return; }
    setOutgoing({ callId: data.id, otherId: other.id, otherName: other.name, otherUsername: other.username ?? null, otherAvatar: other.avatar, kind });
  }, [userId, active, outgoing]);


  const toggleMic = useCallback(async () => {
    if (!micRef.current) return;
    const next = !micOn;
    await micRef.current.setMuted(!next);
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    if (!camRef.current) return;
    const next = !camOn;
    await camRef.current.setMuted(!next);
    setCamOn(next);
  }, [camOn]);

  const switchCamera = useCallback(async () => {
    if (!camRef.current) return;
    try {
      const cams = await AgoraRTC.getCameras();
      if (cams.length < 2) { toast.message("لا توجد كاميرا أخرى"); return; }
      const currentId = camRef.current.getTrackLabel();
      const next = cams.find(c => c.label !== currentId) || cams[0];
      await camRef.current.setDevice(next.deviceId);
      setFacingMode(f => f === "user" ? "environment" : "user");
    } catch (e: any) {
      toast.error(e?.message || "تعذر التبديل");
    }
  }, []);

  // Watch outgoing call updates
  useEffect(() => {
    if (!outgoing) return;
    const ch = supabase
      .channel(`dm-call-out-${outgoing.callId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_calls", filter: `id=eq.${outgoing.callId}` },
        async (payload: any) => {
          const row = payload.new;
          if (row.status === "accepted") {
            const o = outgoing;
            setOutgoing(null);
            setActive({ callId: o.callId, otherId: o.otherId, otherName: o.otherName, otherUsername: o.otherUsername, otherAvatar: o.otherAvatar, iAmCaller: true, kind: o.kind });
            try { await joinAgora(o.callId, o.kind); } catch (e: any) {
              toast.error(e?.message || "تعذر الاتصال");
              await leaveAgora();
              setActive(null);
            }
          } else if (row.status === "declined") {
            const created = new Date(row.created_at).getTime();
            const ended = new Date(row.ended_at || Date.now()).getTime();
            if (ended - created < 3000) toast.message("الصديق مشغول حالياً في مكالمة أخرى");
            else toast.message("تم رفض المكالمة");
            setOutgoing(null);
          } else if (row.status === "canceled" || row.status === "ended" || row.status === "missed") {
            setOutgoing(null);
          }
        })
      .subscribe();
    const t = window.setTimeout(async () => {
      const cur = outgoing;
      if (!cur) return;
      await supabase.from("dm_calls").update({ status: "missed", ended_at: new Date().toISOString() }).eq("id", cur.callId).eq("status", "ringing");
      setOutgoing(null);
      toast.message("لم يتم الرد");
    }, 45_000);
    return () => { supabase.removeChannel(ch); clearTimeout(t); };
  }, [outgoing, joinAgora, leaveAgora]);

  useEffect(() => {
    if (!active) return;
    const ch = supabase
      .channel(`dm-call-active-${active.callId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_calls", filter: `id=eq.${active.callId}` },
        async (payload: any) => {
          const row = payload.new;
          if (row.status === "ended" || row.status === "canceled") {
            await leaveAgora();
            setActive(null);
            toast.message("انتهت المكالمة");
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [active, leaveAgora]);

  const activeRef = useRef<ActiveCall | null>(null);
  const outgoingRef = useRef<typeof outgoing>(null);
  const incomingRef = useRef<IncomingDisplay | null>(null);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { outgoingRef.current = outgoing; }, [outgoing]);
  useEffect(() => { incomingRef.current = incoming; }, [incoming]);

  useEffect(() => {
    if (!userId) return;
    const handle = async (row: IncomingRow) => {
      console.log("[dm-call] incoming event", row);
      if (row.callee_id !== userId || row.status !== "ringing") return;
      if (new Date(row.expires_at).getTime() < Date.now()) return;
      if (activeRef.current || outgoingRef.current || incomingRef.current) {
        await supabase.from("dm_calls")
          .update({ status: "declined", ended_at: new Date().toISOString() })
          .eq("id", row.id).eq("status", "ringing");
        return;
      }
      const { data: vroom } = await supabase
        .from("voice_room_participants")
        .select("id").eq("user_id", userId).limit(1).maybeSingle();
      if (vroom) {
        await supabase.from("dm_calls")
          .update({ status: "declined", ended_at: new Date().toISOString() })
          .eq("id", row.id).eq("status", "ringing");
        return;
      }
      const { data: prof } = await supabase
        .from("profiles").select("display_name, username, avatar_url")
        .eq("id", row.caller_id).maybeSingle();
      setIncoming({ ...row, fromProfile: prof ?? null });
    };

    supabase.from("dm_calls").select("*")
      .eq("callee_id", userId).eq("status", "ringing")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) handle(data as IncomingRow); });

    const ch = supabase
      .channel(`dm-call-in-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_calls", filter: `callee_id=eq.${userId}` },
        (payload: any) => handle(payload.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_calls", filter: `callee_id=eq.${userId}` },
        (payload: any) => {
          const row = payload.new;
          const inc = incomingRef.current;
          if (inc && row.id === inc.id && row.status !== "ringing") {
            setIncoming(null);
          }
        })
      .subscribe((status) => console.log("[dm-call] incoming sub status:", status));
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  useRingtone(!!incoming);

  useEffect(() => {
    if (!incoming) return;
    const ms = new Date(incoming.expires_at).getTime() - Date.now();
    if (ms <= 0) { setIncoming(null); return; }
    const t = setTimeout(() => setIncoming(null), ms);
    return () => clearTimeout(t);
  }, [incoming]);

  const acceptIncoming = async () => {
    if (!incoming) return;
    const inc = incoming;
    const kind: CallKind = (inc.kind === "video" ? "video" : "audio");
    const { error } = await supabase.from("dm_calls")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", inc.id).eq("status", "ringing");
    if (error) { toast.error(error.message); return; }
    setIncoming(null);
    const name = inc.fromProfile?.display_name || inc.fromProfile?.username || "صديق";
    setActive({ callId: inc.id, otherId: inc.caller_id, otherName: name, otherUsername: inc.fromProfile?.username ?? null, otherAvatar: inc.fromProfile?.avatar_url ?? null, iAmCaller: false, kind });
    try { await joinAgora(inc.id, kind); } catch (e: any) {
      toast.error(e?.message || "تعذر الاتصال");
      await leaveAgora();
      setActive(null);
      await supabase.from("dm_calls").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", inc.id);
    }
  };

  const declineIncoming = async () => {
    if (!incoming) return;
    await supabase.from("dm_calls").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", incoming.id);
    setIncoming(null);
  };

  const isVideoCall = active?.kind === "video";

  return (
    <DmCallContext.Provider value={{ active, connected, micOn, camOn, startCall, endCall, toggleMic, toggleCam }}>
      {children}

      {incoming && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-primary/30 shadow-elegant p-6 text-center animate-in zoom-in-95">
            <div className="size-20 rounded-full bg-gradient-gold mx-auto flex items-center justify-center text-primary-foreground font-bold text-2xl overflow-hidden mb-3">
              {incoming.fromProfile?.avatar_url
                ? <img src={incoming.fromProfile.avatar_url} alt="" className="size-full object-cover" />
                : (incoming.fromProfile?.display_name || incoming.fromProfile?.username || "؟").slice(0, 1)}
            </div>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1 justify-center">
              {incoming.kind === "video" ? <><Video className="size-3" /> مكالمة فيديو واردة</> : <><Phone className="size-3" /> مكالمة واردة</>}
            </p>
            <h3 className="text-xl font-bold mt-1 inline-flex items-center gap-1.5 justify-center">{incoming.fromProfile?.display_name || incoming.fromProfile?.username || "صديق"}<AdminBadge username={incoming.fromProfile?.username} size="sm" /></h3>
            <div className="flex gap-3 mt-6">
              <button onClick={declineIncoming} className="flex-1 h-12 rounded-full bg-destructive text-destructive-foreground font-bold flex items-center justify-center gap-2">
                <PhoneOff className="size-4" /> رفض
              </button>
              <button onClick={acceptIncoming} className="flex-1 h-12 rounded-full bg-green-600 text-white font-bold flex items-center justify-center gap-2">
                {incoming.kind === "video" ? <Video className="size-4" /> : <Phone className="size-4" />} قبول
              </button>
            </div>
          </div>
        </div>
      )}

      {outgoing && (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-primary/30 shadow-elegant p-6 text-center">
            <div className="size-20 rounded-full bg-gradient-gold mx-auto flex items-center justify-center text-primary-foreground font-bold text-2xl overflow-hidden mb-3">
              {outgoing.otherAvatar
                ? <img src={outgoing.otherAvatar} alt="" className="size-full object-cover" />
                : outgoing.otherName.slice(0, 1)}
            </div>
            <p className="text-xs text-muted-foreground animate-pulse inline-flex items-center gap-1 justify-center">
              {outgoing.kind === "video" ? <><Video className="size-3" /> جاري الاتصال بالفيديو...</> : "جاري الاتصال..."}
            </p>
            <h3 className="text-xl font-bold mt-1 inline-flex items-center gap-1.5 justify-center">{outgoing.otherName}<AdminBadge username={outgoing.otherUsername} size="sm" /></h3>
            <div className="flex justify-center mt-6">
              <button onClick={endCall} className="h-12 px-8 rounded-full bg-destructive text-destructive-foreground font-bold flex items-center justify-center gap-2">
                <PhoneOff className="size-4" /> إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {active && !minimized && isVideoCall && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col">
          {/* Remote video full screen */}
          <div className="absolute inset-0 bg-black">
            <div ref={remoteVideoRef} className="w-full h-full" />
            {!remoteHasVideo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4">
                <div className="size-32 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold text-5xl overflow-hidden shadow-elegant">
                  {active.otherAvatar ? <img src={active.otherAvatar} alt="" className="size-full object-cover" /> : active.otherName.slice(0, 1)}
                </div>
                <p className="text-sm opacity-80">{connected ? "بانتظار الفيديو من الطرف الآخر" : "جاري الاتصال..."}</p>
              </div>
            )}
          </div>

          {/* Local video PiP */}
          <div className="absolute top-4 right-4 w-28 h-40 sm:w-36 sm:h-52 rounded-xl overflow-hidden border-2 border-white/30 shadow-elegant bg-black z-10">
            <div ref={localVideoRef} className="w-full h-full" />
            {!camOn && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center text-white text-xs">
                الكاميرا مغلقة
              </div>
            )}
          </div>

          {/* Top bar */}
          <div className="relative z-10 p-4 flex items-center justify-between text-white">
            <button onClick={() => setMinimized(true)} className="size-10 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur flex items-center justify-center">
              <ChevronDown className="size-5" />
            </button>
            <div className="text-center">
              <h2 className="text-base font-bold inline-flex items-center gap-1.5 justify-center">{active.otherName}<AdminBadge username={active.otherUsername} size="xs" /></h2>
              <p className={`text-xs ${connected ? "text-green-400" : "opacity-80 animate-pulse"}`}>{connected ? "متصل" : "جاري الاتصال..."}</p>
            </div>
            <div className="size-10" />
          </div>

          {/* Bottom controls */}
          <div className="relative z-10 mt-auto p-6 pb-8 flex items-center justify-center gap-4">
            <button onClick={toggleMic} disabled={!connected}
              className={`size-14 rounded-full flex items-center justify-center transition backdrop-blur ${!connected ? "opacity-40 bg-white/10" : micOn ? "bg-white/20 hover:bg-white/30 text-white" : "bg-destructive text-destructive-foreground"}`}>
              {micOn ? <Mic className="size-6" /> : <MicOff className="size-6" />}
            </button>
            <button onClick={toggleCam} disabled={!connected}
              className={`size-14 rounded-full flex items-center justify-center transition backdrop-blur ${!connected ? "opacity-40 bg-white/10" : camOn ? "bg-white/20 hover:bg-white/30 text-white" : "bg-destructive text-destructive-foreground"}`}>
              {camOn ? <Video className="size-6" /> : <VideoOff className="size-6" />}
            </button>
            <button onClick={switchCamera} disabled={!connected || !camOn}
              className="size-14 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/30 text-white backdrop-blur disabled:opacity-40">
              <SwitchCamera className="size-6" />
            </button>
            <button onClick={endCall}
              className="size-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 shadow-elegant">
              <PhoneOff className="size-7" />
            </button>
          </div>
        </div>
      )}

      {active && !minimized && !isVideoCall && (
        <div className="fixed inset-0 z-[70] bg-gradient-to-b from-background via-background to-surface flex flex-col items-center justify-between p-6">
          <div className="w-full flex items-center justify-between">
            <button
              onClick={() => setMinimized(true)}
              className="size-10 rounded-full bg-surface/80 hover:bg-surface flex items-center justify-center"
              title="تصغير"
            >
              <ChevronDown className="size-5" />
            </button>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">{connected ? "مكالمة جارية" : "جاري الاتصال..."}</p>
            </div>
            <div className="size-10" />
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="size-32 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold text-5xl overflow-hidden shadow-elegant">
              {active.otherAvatar
                ? <img src={active.otherAvatar} alt="" className="size-full object-cover" />
                : active.otherName.slice(0, 1)}
            </div>
            <h2 className="text-2xl font-bold inline-flex items-center gap-2 justify-center">{active.otherName}<AdminBadge username={active.otherUsername} size="md" /></h2>
            <p className={`text-sm ${connected ? "text-green-500" : "text-muted-foreground animate-pulse"}`}>
              {connected ? "متصل" : "جاري الاتصال..."}
            </p>
          </div>

          <div className="flex items-center gap-6 mb-6">
            <button onClick={toggleMic} disabled={!connected}
              className={`size-14 rounded-full flex items-center justify-center transition ${!connected ? "opacity-40 bg-surface" : micOn ? "bg-surface hover:bg-surface/80" : "bg-destructive/20 text-destructive"}`}
              title={micOn ? "كتم" : "إلغاء الكتم"}>
              {micOn ? <Mic className="size-6" /> : <MicOff className="size-6" />}
            </button>
            <button onClick={endCall}
              className="size-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 shadow-elegant"
              title="إنهاء">
              <PhoneOff className="size-7" />
            </button>
          </div>
        </div>
      )}

      {active && minimized && (
        <div
          onClick={() => setMinimized(false)}
          className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 rounded-xl bg-surface/95 backdrop-blur border border-primary/30 shadow-elegant p-3 flex items-center gap-2 cursor-pointer hover:bg-surface"
        >
          <div className="size-9 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0 overflow-hidden">
            {active.otherAvatar
              ? <img src={active.otherAvatar} alt="" className="size-full object-cover" />
              : (isVideoCall ? <Video className="size-4" /> : <Volume2 className="size-4" />)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground">{connected ? (isVideoCall ? "مكالمة فيديو" : "متصل بـ") : "جاري الاتصال..."}</p>
            <p className="text-sm font-bold truncate inline-flex items-center gap-1.5">{active.otherName}<AdminBadge username={active.otherUsername} size="xs" /></p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); toggleMic(); }} disabled={!connected}
            className={`size-9 rounded-full flex items-center justify-center transition ${!connected ? "opacity-40 bg-surface" : micOn ? "bg-green-600 text-white" : "bg-surface hover:bg-surface/80"}`}>
            {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); endCall(); }}
            className="size-9 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90">
            <PhoneOff className="size-4" />
          </button>
        </div>
      )}
    </DmCallContext.Provider>
  );
}
