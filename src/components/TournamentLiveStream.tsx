import { useEffect, useRef, useState } from "react";
import { X, Radio, MonitorUp, StopCircle, Eye, Loader2, Smartphone } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getTournamentStreamToken } from "@/lib/tournament-stream.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GameBroadcast, isNativeAndroidBroadcast } from "@/lib/game-broadcast";

type Props = {
  tournament: { id: string; name: string; organizer_id: string };
  mode: "host" | "viewer";
  onClose: () => void;
};

export function TournamentLiveStream({ tournament, mode, onClose }: Props) {
  const getToken = useServerFn(getTournamentStreamToken);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [viewers, setViewers] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const clientRef = useRef<any>(null);
  const screenTrackRef = useRef<any>(null);
  const screenAudioTrackRef = useRef<any>(null);
  const remoteUserRef = useRef<any>(null);

  const cleanup = async () => {
    try {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current.close();
        screenTrackRef.current = null;
      }
      if (screenAudioTrackRef.current) {
        screenAudioTrackRef.current.stop();
        screenAudioTrackRef.current.close();
        screenAudioTrackRef.current = null;
      }
      if (clientRef.current) {
        await clientRef.current.leave();
        clientRef.current = null;
      }
    } catch {
      /* ignore */
    }
  };

  const stopBroadcast = async () => {
    await cleanup();
    if (isNativeAndroidBroadcast() && mode === "host") {
      try {
        await GameBroadcast.stopBroadcast();
      } catch {
        /* ignore */
      }
    }
    await supabase
      .from("tournaments")
      .update({ live_stream_active: false, live_stream_started_at: null })
      .eq("id", tournament.id);
    setStatus("ended");
    onClose();
  };

  const isScreenShareSupported = () => {
    if (isNativeAndroidBroadcast()) return true; // التطبيق الأصلي يدعم البث
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    const isAndroid = /Android/i.test(ua);
    const hasApi = !!(navigator.mediaDevices && (navigator.mediaDevices as any).getDisplayMedia);
    if (isIOS) return false;
    if (isAndroid && !hasApi) return false;
    return hasApi;
  };

  // مسار البث الأصلي على Android (شاشة اللعبة + فقاعة عائمة)
  const startHostNativeAndroid = async () => {
    setStatus("connecting");
    try {
      // تأكد من صلاحية النافذة العائمة
      const { granted } = await GameBroadcast.hasOverlayPermission();
      if (!granted) {
        toast.info("يرجى السماح بظهور النافذة العائمة فوق التطبيقات");
        const req = await GameBroadcast.requestOverlayPermission();
        if (!req.granted) {
          toast.error("لا يمكن بدء البث بدون صلاحية النافذة العائمة");
          setStatus("idle");
          onClose();
          return;
        }
      }

      const { token, appId, uid, channelName } = await getToken({
        data: { tournamentId: tournament.id },
      });

      await GameBroadcast.startBroadcast({
        appId,
        channel: channelName,
        token,
        uid,
        tournamentName: tournament.name,
      });

      await supabase
        .from("tournaments")
        .update({ live_stream_active: true, live_stream_started_at: new Date().toISOString() })
        .eq("id", tournament.id);

      setStatus("live");
      toast.success("بدأ البث! افتح اللعبة الآن، الفقاعة العائمة ستظهر فوقها");
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "تعذّر بدء البث";
      if (msg.includes("OVERLAY")) {
        toast.error("صلاحية النافذة العائمة مطلوبة");
      } else if (msg.includes("PERMISSION_DENIED")) {
        toast.error("تم رفض صلاحية تسجيل الشاشة");
      } else {
        toast.error(msg);
      }
      setStatus("idle");
      onClose();
    }
  };

  const startHost = async () => {
    if (!isScreenShareSupported()) {
      toast.error("مشاركة الشاشة غير مدعومة على هذا المتصفح. استخدم متصفح Chrome أو Edge على الكمبيوتر.");
      setStatus("idle");
      onClose();
      return;
    }
    setStatus("connecting");
    try {
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const { token, appId, uid, channelName } = await getToken({
        data: { tournamentId: tournament.id },
      });

      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      await client.setClientRole("host");
      clientRef.current = client;

      client.on("user-joined", () => setViewers(client.remoteUsers.length));
      client.on("user-left", () => setViewers(client.remoteUsers.length));

      await client.join(appId, channelName, token, uid);

      // Screen / window / tab capture
      const captured: any = await AgoraRTC.createScreenVideoTrack(
        { encoderConfig: "1080p_1", optimizationMode: "detail" },
        "auto",
      );

      let videoTrack: any;
      if (Array.isArray(captured)) {
        videoTrack = captured[0];
        screenAudioTrackRef.current = captured[1];
      } else {
        videoTrack = captured;
      }
      screenTrackRef.current = videoTrack;

      // Stop broadcast if user clicks "stop sharing" in the browser UI
      videoTrack.on("track-ended", () => {
        stopBroadcast();
      });

      if (containerRef.current) {
        videoTrack.play(containerRef.current);
      }

      const tracksToPublish = screenAudioTrackRef.current
        ? [videoTrack, screenAudioTrackRef.current]
        : [videoTrack];
      await client.publish(tracksToPublish);

      await supabase
        .from("tournaments")
        .update({ live_stream_active: true, live_stream_started_at: new Date().toISOString() })
        .eq("id", tournament.id);

      setStatus("live");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "تعذّر بدء البث");
      await cleanup();
      setStatus("idle");
    }
  };

  const startViewer = async () => {
    setStatus("connecting");
    try {
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const { token, appId, uid, channelName } = await getToken({
        data: { tournamentId: tournament.id },
      });

      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      await client.setClientRole("audience");
      clientRef.current = client;

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        remoteUserRef.current = user;
        if (mediaType === "video" && containerRef.current) {
          user.videoTrack?.play(containerRef.current);
        }
        if (mediaType === "audio") {
          user.audioTrack?.play();
        }
        setStatus("live");
      });
      client.on("user-unpublished", () => {
        // host stopped
      });
      client.on("user-left", () => {
        toast.info("انتهى البث المباشر");
        setStatus("ended");
        onClose();
      });

      await client.join(appId, channelName, token, uid);

      // If already published, subscribe
      for (const user of client.remoteUsers) {
        if (user.hasVideo) {
          await client.subscribe(user, "video");
          user.videoTrack?.play(containerRef.current!);
        }
        if (user.hasAudio) {
          await client.subscribe(user, "audio");
          user.audioTrack?.play();
        }
        remoteUserRef.current = user;
        setStatus("live");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "تعذّر الاتصال بالبث");
      await cleanup();
      setStatus("idle");
    }
  };

  useEffect(() => {
    if (mode === "host") {
      if (isNativeAndroidBroadcast()) {
        startHostNativeAndroid();
      } else {
        startHost();
      }
    } else {
      startViewer();
    }
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // الاستماع لإيقاف البث من الفقاعة العائمة (Android Native)
  useEffect(() => {
    if (mode !== "host" || !isNativeAndroidBroadcast()) return;
    let handle: any;
    GameBroadcast.addListener("broadcastEvent", async (evt) => {
      if (evt.type === "stopped") {
        await supabase
          .from("tournaments")
          .update({ live_stream_active: false, live_stream_started_at: null })
          .eq("id", tournament.id);
        setStatus("ended");
        toast.info("تم إيقاف البث");
        onClose();
      } else if (evt.type === "error" || evt.type === "permission_denied") {
        toast.error(evt.message || "حدث خطأ في البث");
        setStatus("idle");
        onClose();
      }
    }).then((h) => (handle = h));
    return () => {
      handle?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tournament.id]);


  // مزامنة عدد المشاهدين مع الفقاعة العائمة على Android
  useEffect(() => {
    if (mode === "host" && isNativeAndroidBroadcast() && status === "live") {
      GameBroadcast.updateViewerCount({ count: viewers }).catch(() => {});
    }
  }, [viewers, status, mode]);

  // على Android Native، نتابع المشاهدين عبر Realtime presence بدل client.remoteUsers
  useEffect(() => {
    if (mode !== "host" || !isNativeAndroidBroadcast() || status !== "live") return;
    const channel = supabase.channel(`tournament_live_${tournament.id}_presence`, {
      config: { presence: { key: String(Date.now()) } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        setViewers(Math.max(0, count - 1)); // ناقص المضيف
      })
      .subscribe(async (s) => {
        if (s === "SUBSCRIBED") await channel.track({ role: "host" });
      });
    return () => {
      channel.unsubscribe();
    };
  }, [status, mode, tournament.id]);

  const handleClose = async () => {
    if (mode === "host" && status === "live") {
      if (!confirm("هل تريد إنهاء البث المباشر؟")) return;
      await stopBroadcast();
    } else {
      await cleanup();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3 text-white">
          <Radio className="size-5 text-red-500 animate-pulse" />
          <div>
            <div className="text-sm font-bold">
              {mode === "host" ? "أنت تبث الآن" : "بث مباشر"} · {tournament.name}
            </div>
            {mode === "host" && status === "live" && (
              <div className="text-xs text-white/60 flex items-center gap-1">
                <Eye className="size-3" /> {viewers} مشاهد
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleClose}
          className="size-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center">
        <div ref={containerRef} className="w-full h-full" />
        {status === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Loader2 className="size-10 animate-spin" />
            <p className="text-sm opacity-70">
              {mode === "host" ? "جارٍ تجهيز البث..." : "جارٍ الاتصال بالبث..."}
            </p>
          </div>
        )}
        {mode === "host" && isNativeAndroidBroadcast() && status === "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white text-center px-6">
            <Smartphone className="size-16 text-green-400" />
            <h3 className="text-xl font-bold">البث شغّال الآن 🔴</h3>
            <p className="text-sm opacity-80 max-w-xs">
              اضغط زر الـ Home وافتح ببجي.
              <br />
              الفقاعة العائمة ستظهر فوق اللعبة وتعرض عدد المشاهدين.
            </p>
            <div className="text-xs text-white/60 flex items-center gap-1 mt-2">
              <Eye className="size-3" /> {viewers} مشاهد متصل
            </div>
          </div>
        )}
        {status === "ended" && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70">
            انتهى البث
          </div>
        )}
      </div>

      {mode === "host" && status === "live" && (
        <div className="p-4 border-t border-white/10 flex justify-center">
          <button
            onClick={stopBroadcast}
            className="px-6 py-3 rounded-full bg-red-500 hover:bg-red-600 text-white font-bold flex items-center gap-2"
          >
            <StopCircle className="size-5" /> إنهاء البث
          </button>
        </div>
      )}
      {mode === "host" && status === "idle" && (
        <div className="p-4 border-t border-white/10 flex justify-center">
          <button
            onClick={() => (isNativeAndroidBroadcast() ? startHostNativeAndroid() : startHost())}
            className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-bold flex items-center gap-2"
          >
            {isNativeAndroidBroadcast() ? (
              <>
                <Smartphone className="size-5" /> ابدأ بث شاشة اللعبة
              </>
            ) : (
              <>
                <MonitorUp className="size-5" /> اختر النافذة / الشاشة وابدأ
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
