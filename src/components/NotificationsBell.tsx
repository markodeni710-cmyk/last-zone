import { useEffect, useRef, useState } from "react";
import { Bell, Check, X, UserPlus, Info, MessageCircle, Ban, Heart, Users, Trophy, Wallet } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { acceptFriendRequest, rejectFriendRequest } from "@/lib/friends";
import { toast } from "sonner";

type JoinRequest = {
  id: string;
  server_id: string;
  user_id: string;
  message: string | null;
  created_at: string;
  server?: { name: string; owner_id: string } | null;
  profile?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function playBeep() {
  try {
    const AC =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.start();
    o.stop(ctx.currentTime + 0.32);
    setTimeout(() => ctx.close(), 500);
  } catch {
    /* ignore */
  }
}

export function NotificationsBell({
  userId,
  ownedServerIds,
}: {
  userId: string | null;
  ownedServerIds: string[];
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("bell-dismissed-requests");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem("bell-dismissed-requests", JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const knownIds = useRef<Set<string>>(new Set());
  const hydrated = useRef(false);
  const ownedServerIdsRef = useRef<string[]>(ownedServerIds);
  const ownedServerIdsKey = ownedServerIds.join(",");

  useEffect(() => {
    ownedServerIdsRef.current = ownedServerIds;
  }, [ownedServerIds]);

  const { data: requests } = useQuery({
    queryKey: ["bell-join-requests", ownedServerIdsKey],
    enabled: !!userId && ownedServerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_join_requests")
        .select("id, server_id, user_id, message, created_at")
        .in("server_id", ownedServerIds)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as JoinRequest[];

      const serverIds = Array.from(new Set(rows.map((r) => r.server_id)));
      if (serverIds.length) {
        const { data: servers } = await supabase
          .from("servers")
          .select("id, name, owner_id")
          .in("id", serverIds);
        const serverMap = new Map((servers ?? []).map((s) => [s.id, s]));
        rows.forEach((r) => {
          r.server = (serverMap.get(r.server_id) as JoinRequest["server"]) ?? null;
        });
      }

      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", userIds);
        const map = new Map((profs ?? []).map((p) => [p.id, p]));
        rows.forEach((r) => {
          r.profile = (map.get(r.user_id) as JoinRequest["profile"]) ?? null;
        });
      }
      return rows;
    },
  });

  // Track new requests and play sound
  useEffect(() => {
    if (!requests) return;
    if (!hydrated.current) {
      requests.forEach((r) => knownIds.current.add(r.id));
      hydrated.current = true;
      return;
    }
    const fresh = requests.filter((r) => !knownIds.current.has(r.id));
    if (fresh.length > 0) {
      fresh.forEach((r) => knownIds.current.add(r.id));
      playBeep();
      toast.info(`طلب انضمام جديد: ${fresh[0].server?.name ?? ""}`);
    }
  }, [requests]);

  // Realtime: any change to join requests => refetch
  const channelIdRef = useRef<string>(`bell-requests-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    if (!userId || ownedServerIds.length === 0) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`${channelIdRef.current}-${ownedServerIdsKey}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "server_join_requests" },
          (payload) => {
            const row = (payload.new ?? payload.old) as { server_id?: string } | null;
            if (row?.server_id && ownedServerIdsRef.current.includes(row.server_id)) {
              qc.invalidateQueries({ queryKey: ["bell-join-requests"] });
            }
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [ownedServerIds.length, ownedServerIdsKey, qc, userId]);

  const approve = async (req: JoinRequest) => {
    const { error: insErr } = await supabase.from("server_members").insert({
      server_id: req.server_id,
      user_id: req.user_id,
      role: "member",
    });
    if (insErr) {
      toast.error(insErr.message);
      return;
    }
    await supabase
      .from("server_join_requests")
      .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: userId })
      .eq("id", req.id);
    toast.success("تمت الموافقة");
    qc.invalidateQueries({ queryKey: ["bell-join-requests"] });
  };

  const reject = async (req: JoinRequest) => {
    if (!userId) return;
    await supabase.from("server_bans").insert({
      server_id: req.server_id,
      user_id: req.user_id,
      banned_by: userId,
      reason: "تم رفض الطلب",
    });
    await supabase.from("server_join_requests").delete().eq("id", req.id);
    toast.success("تم رفض الطلب");
    qc.invalidateQueries({ queryKey: ["bell-join-requests"] });
  };

  const visibleRequests = requests?.filter((r) => !dismissed.has(r.id)) ?? [];

  // Friend requests (incoming pending)
  const { data: friendReqs } = useQuery({
    queryKey: ["friend-requests", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("friendships")
        .select("id, requester_id, created_at")
        .eq("addressee_id", userId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      const ids = (rows ?? []).map((r) => r.requester_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
        : { data: [] as { id: string; username: string; display_name: string | null; avatar_url: string | null }[] };
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return (rows ?? []).map((r) => ({ ...r, profile: map.get(r.requester_id) ?? null }));
    },
  });

  // DM message requests (threads where I'm recipient, not accepted)
  const { data: dmReqs } = useQuery({
    queryKey: ["dm-requests", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("dm_threads")
        .select("id, user_a, user_b, initiator_id, accepted")
        .eq("accepted", false)
        .or(`user_a.eq.${userId},user_b.eq.${userId}`);
      const filtered = (rows ?? []).filter((t) => t.initiator_id !== userId);
      const ids = filtered.map((t) => t.initiator_id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
        : { data: [] as { id: string; username: string; display_name: string | null; avatar_url: string | null }[] };
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return filtered.map((t) => ({ ...t, profile: map.get(t.initiator_id) ?? null }));
    },
  });

  // Unread DM messages (grouped by sender)
  const { data: unreadDms } = useQuery({
    queryKey: ["dm-unread-by-sender", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: msgs } = await supabase
        .from("direct_messages")
        .select("id, thread_id, sender_id, content, created_at")
        .neq("sender_id", userId!)
        .is("read_at", null)
        .order("created_at", { ascending: false });
      const rows = msgs ?? [];
      if (rows.length === 0) return [] as Array<{ sender_id: string; count: number; last: string; created_at: string; profile: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null }>;
      const bySender = new Map<string, { sender_id: string; count: number; last: string; created_at: string }>();
      for (const m of rows) {
        const e = bySender.get(m.sender_id);
        if (e) e.count++;
        else bySender.set(m.sender_id, { sender_id: m.sender_id, count: 1, last: m.content, created_at: m.created_at });
      }
      const ids = [...bySender.keys()];
      const { data: profs } = await supabase
        .from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return [...bySender.values()].map((e) => ({ ...e, profile: map.get(e.sender_id) ?? null }));
    },
  });

  // Realtime invalidation for friend + dm requests + dm messages
  const extraChannelIdRef = useRef(`bell-extra-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`${extraChannelIdRef.current}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships", filter: `addressee_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["friend-requests"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "dm_threads" },
        () => qc.invalidateQueries({ queryKey: ["dm-requests"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" },
        () => {
          qc.invalidateQueries({ queryKey: ["dm-unread-by-sender"] });
          qc.invalidateQueries({ queryKey: ["dm-unread"] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  // Beep on new friend request
  const knownFriendIds = useRef<Set<string>>(new Set());
  const friendHydrated = useRef(false);
  useEffect(() => {
    if (!friendReqs) return;
    if (!friendHydrated.current) {
      friendReqs.forEach((r) => knownFriendIds.current.add(r.id));
      friendHydrated.current = true;
      return;
    }
    const fresh = friendReqs.filter((r) => !knownFriendIds.current.has(r.id));
    if (fresh.length) {
      fresh.forEach((r) => knownFriendIds.current.add(r.id));
      playBeep();
      toast.info(`طلب صداقة جديد من ${fresh[0].profile?.display_name ?? "لاعب"}`);
    }
  }, [friendReqs]);

  // Beep on new unread DM
  const knownDmSenders = useRef<Map<string, number>>(new Map());
  const dmHydrated = useRef(false);
  useEffect(() => {
    if (!unreadDms) return;
    if (!dmHydrated.current) {
      unreadDms.forEach((d) => knownDmSenders.current.set(d.sender_id, d.count));
      dmHydrated.current = true;
      return;
    }
    for (const d of unreadDms) {
      const prev = knownDmSenders.current.get(d.sender_id) ?? 0;
      if (d.count > prev) {
        playBeep();
        toast.info(`رسالة جديدة من ${d.profile?.display_name ?? d.profile?.username ?? "لاعب"}`);
      }
      knownDmSenders.current.set(d.sender_id, d.count);
    }
  }, [unreadDms]);

  // Active text mutes for current user (live)
  const { data: myMutes } = useQuery({
    queryKey: ["my-mutes-bell", userId],
    enabled: !!userId,
    refetchInterval: 1000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("server_text_mutes")
        .select("id, server_id, expires_at, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      const active = (rows ?? []).filter(
        (r) => !r.expires_at || new Date(r.expires_at).getTime() > Date.now(),
      );
      if (!active.length) return [] as Array<{ id: string; server_id: string; expires_at: string | null; created_at: string; server: { name: string } | null }>;
      const ids = Array.from(new Set(active.map((r) => r.server_id)));
      const { data: servers } = await supabase.from("servers").select("id, name").in("id", ids);
      const map = new Map((servers ?? []).map((s) => [s.id, s]));
      return active.map((r) => ({ ...r, server: (map.get(r.server_id) as { name: string } | null) ?? null }));
    },
  });

  // Dismissed mute notifications (so clicking removes the bell entry)
  const [dismissedMutes, setDismissedMutes] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("bell-dismissed-mutes");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const dismissMute = (id: string) => {
    setDismissedMutes((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("bell-dismissed-mutes", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const [muteStatusNotices, setMuteStatusNotices] = useState<Array<{ id: string; type: "unmute"; server_id: string; server_name: string; created_at: number }>>([]);
  const addUnmuteNotice = (serverId: string, serverName: string) => {
    setMuteStatusNotices((prev) => {
      const now = Date.now();
      if (prev.some((n) => n.server_id === serverId && now - n.created_at < 5000)) return prev;
      const notice = { id: `unmute-${serverId}-${now}`, type: "unmute" as const, server_id: serverId, server_name: serverName, created_at: now };
      return [notice, ...prev].slice(0, 5);
    });
  };
  const dismissMuteStatusNotice = (id: string) => {
    setMuteStatusNotices((prev) => prev.filter((n) => n.id !== id));
  };

  // Realtime: mute INSERT/DELETE for me → toast + refresh bell
  const muteChanRef = useRef(`bell-mutes-${Math.random().toString(36).slice(2)}`);
  const muteHydrated = useRef(false);
  const knownMuteIds = useRef<Set<string>>(new Set());
  const activeMuteServers = useRef<Map<string, string>>(new Map());
  const recentMuteNotices = useRef<Map<string, number>>(new Map());
  const clearDismissedMute = (id?: string) => {
    if (!id) return;
    setDismissedMutes((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      try { localStorage.setItem("bell-dismissed-mutes", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const notifyMuteChange = async (kind: "mute" | "unmute", serverId?: string) => {
    const key = `${kind}:${serverId ?? "unknown"}`;
    const now = Date.now();
    const last = recentMuteNotices.current.get(key) ?? 0;
    recentMuteNotices.current.set(key, now);
    const { data: s } = serverId
      ? await supabase.from("servers").select("name").eq("id", serverId).maybeSingle()
      : { data: null };
    if (now - last > 2500) {
      playBeep();
      if (kind === "mute") toast.error(`تم تقييدك من الكتابة في ${s?.name ?? "السيرفر"}`);
      else toast.success(`تم رفع التقييد عنك في ${s?.name ?? "السيرفر"}`);
    }
    if (kind === "unmute" && serverId) addUnmuteNotice(serverId, s?.name ?? "السيرفر");
    qc.invalidateQueries({ queryKey: ["my-mutes-bell"] });
    qc.invalidateQueries({ queryKey: ["my-mute"] });
  };
  useEffect(() => {
    if (!userId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`${muteChanRef.current}-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "server_text_mutes" },
          async (payload) => {
            const row = payload.new as { id?: string; user_id?: string; server_id?: string } | null;
            if (row?.user_id !== userId) return;
            clearDismissedMute(row.id);
            await notifyMuteChange("mute", row.server_id);
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "server_text_mutes" },
          async (payload) => {
            const row = payload.old as { user_id?: string; server_id?: string } | null;
            if (row?.user_id !== userId) return;
            await notifyMuteChange("unmute", row.server_id);
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "server_text_mutes" },
          async (payload) => {
            const row = payload.new as { id?: string; user_id?: string; server_id?: string; expires_at?: string | null } | null;
            if (row?.user_id !== userId) return;
            const active = !row.expires_at || new Date(row.expires_at).getTime() > Date.now();
            if (active) clearDismissedMute(row.id);
            await notifyMuteChange(active ? "mute" : "unmute", row.server_id);
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  // Hydrate known mute ids to avoid duplicate first-load noise (no toast here)
  useEffect(() => {
    if (!myMutes) return;
    const next = new Map(myMutes.map((m) => [m.server_id, m.server?.name ?? "السيرفر"]));
    if (!muteHydrated.current) {
      myMutes.forEach((m) => knownMuteIds.current.add(m.id));
      activeMuteServers.current = next;
      muteHydrated.current = true;
      return;
    }

    for (const [serverId, serverName] of activeMuteServers.current.entries()) {
      if (!next.has(serverId)) void notifyMuteChange("unmute", serverId || undefined).catch(() => addUnmuteNotice(serverId, serverName));
    }
    activeMuteServers.current = next;
  }, [myMutes]);

  // Dedicated ticker: fires the unmute notification the moment expires_at passes,
  // independent of react-query refetch timing or realtime DELETE events.
  const expiredFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!userId) return;
    const tick = () => {
      const mutes = qc.getQueryData<Array<{ id: string; server_id: string; expires_at: string | null; server: { name: string } | null }>>(
        ["my-mutes-bell", userId],
      );
      if (!mutes || mutes.length === 0) return;
      const now = Date.now();
      for (const m of mutes) {
        if (!m.expires_at) continue;
        const t = new Date(m.expires_at).getTime();
        if (t <= now && !expiredFiredRef.current.has(m.id)) {
          expiredFiredRef.current.add(m.id);
          void notifyMuteChange("unmute", m.server_id).catch(() =>
            addUnmuteNotice(m.server_id, m.server?.name ?? "السيرفر"),
          );
          // Drop from local cache so the active-mute row disappears from the bell instantly
          qc.setQueryData(["my-mutes-bell", userId], (old: typeof mutes | undefined) =>
            (old ?? []).filter((x) => x.id !== m.id),
          );
          qc.setQueryData(["my-mute"], null);
        }
      }
    };
    const iv = setInterval(tick, 1000);
    tick();
    return () => clearInterval(iv);
  }, [userId, qc]);

  // === Clip likes received on my clips ===
  type ClipLikeNotif = {
    key: string;
    clip_id: string;
    count: number;
    last_liker_id: string;
    last_at: string;
    profile: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
    clip: { id: string; caption: string | null; thumbnail_url: string | null } | null;
  };

  const [dismissedLikes, setDismissedLikes] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("bell-dismissed-clip-likes");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  const dismissLike = (key: string) => {
    setDismissedLikes((prev) => {
      const next = new Set(prev);
      next.add(key);
      try { localStorage.setItem("bell-dismissed-clip-likes", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const { data: myClipIds } = useQuery({
    queryKey: ["my-clip-ids", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("clips").select("id").eq("user_id", userId!);
      return (data ?? []).map((c) => c.id);
    },
  });

  const { data: clipLikes } = useQuery({
    queryKey: ["clip-likes-received", userId, (myClipIds ?? []).join(",")],
    enabled: !!userId && !!myClipIds && myClipIds.length > 0,
    queryFn: async () => {
      const { data: likes } = await supabase
        .from("clip_likes")
        .select("clip_id, user_id, created_at")
        .in("clip_id", myClipIds!)
        .neq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(100);
      const rows = likes ?? [];
      if (!rows.length) return [] as ClipLikeNotif[];
      const byClip = new Map<string, { clip_id: string; count: number; last_liker_id: string; last_at: string }>();
      for (const l of rows) {
        const e = byClip.get(l.clip_id);
        if (e) e.count++;
        else byClip.set(l.clip_id, { clip_id: l.clip_id, count: 1, last_liker_id: l.user_id, last_at: l.created_at });
      }
      const clipIds = [...byClip.keys()];
      const likerIds = [...new Set([...byClip.values()].map((e) => e.last_liker_id))];
      const [{ data: profs }, { data: clips }] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", likerIds),
        supabase.from("clips").select("id, caption, thumbnail_url").in("id", clipIds),
      ]);
      const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
      const cmap = new Map((clips ?? []).map((c) => [c.id, c]));
      return [...byClip.values()].map((e) => ({
        key: `${e.clip_id}:${e.last_liker_id}:${e.last_at}`,
        clip_id: e.clip_id,
        count: e.count,
        last_liker_id: e.last_liker_id,
        last_at: e.last_at,
        profile: (pmap.get(e.last_liker_id) as ClipLikeNotif["profile"]) ?? null,
        clip: (cmap.get(e.clip_id) as ClipLikeNotif["clip"]) ?? null,
      })) as ClipLikeNotif[];
    },
  });

  // Realtime: invalidate + beep when someone likes my clip
  const likesChanRef = useRef(`bell-clip-likes-${Math.random().toString(36).slice(2)}`);
  const myClipIdsRef = useRef<Set<string>>(new Set());
  const likesHydrated = useRef(false);
  const knownLikeKeys = useRef<Set<string>>(new Set());
  useEffect(() => { myClipIdsRef.current = new Set(myClipIds ?? []); }, [myClipIds]);
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`${likesChanRef.current}-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clip_likes" }, (payload) => {
        const row = payload.new as { clip_id?: string; user_id?: string } | null;
        if (!row?.clip_id || !myClipIdsRef.current.has(row.clip_id)) return;
        if (row.user_id === userId) return;
        qc.invalidateQueries({ queryKey: ["clip-likes-received"] });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "clip_likes" }, () => {
        qc.invalidateQueries({ queryKey: ["clip-likes-received"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  useEffect(() => {
    if (!clipLikes) return;
    if (!likesHydrated.current) {
      clipLikes.forEach((l) => knownLikeKeys.current.add(l.key));
      likesHydrated.current = true;
      return;
    }
    const fresh = clipLikes.filter((l) => !knownLikeKeys.current.has(l.key) && !dismissedLikes.has(l.key));
    if (fresh.length) {
      fresh.forEach((l) => knownLikeKeys.current.add(l.key));
      playBeep();
      const first = fresh[0];
      toast.info(`${first.profile?.display_name || first.profile?.username || "لاعب"} أعجب بلقطتك`);
    }
  }, [clipLikes, dismissedLikes]);

  const visibleClipLikes = clipLikes?.filter((l) => !dismissedLikes.has(l.key)) ?? [];

  // === Squad applications: incoming (I'm the listing owner) ===
  const { data: squadIncoming } = useQuery({
    queryKey: ["squad-apps-incoming", userId],
    enabled: !!userId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data: apps } = await supabase
        .from("squad_applications")
        .select("id, listing_id, applicant_id, pubg_id, message, contact, status, expires_at, created_at")
        .eq("listing_owner_id", userId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      const rows = apps ?? [];
      if (!rows.length) return [] as any[];
      const ids = [...new Set(rows.map((r: any) => r.applicant_id))];
      const lids = [...new Set(rows.map((r: any) => r.listing_id))];
      const [{ data: profs }, { data: lists }] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids),
        supabase.from("squad_listings").select("id, title").in("id", lids),
      ]);
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const lmap = new Map((lists ?? []).map((l: any) => [l.id, l]));
      return rows.map((r: any) => ({ ...r, profile: pmap.get(r.applicant_id) ?? null, listing: lmap.get(r.listing_id) ?? null }));
    },
  });

  // === Squad applications: my outgoing rejected/expired (for the applicant) ===
  const [dismissedSquadOutcomes, setDismissedSquadOutcomes] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("bell-dismissed-squad-outcomes");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });
  const dismissSquadOutcome = (id: string) => {
    setDismissedSquadOutcomes((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem("bell-dismissed-squad-outcomes", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const { data: squadOutcomes } = useQuery({
    queryKey: ["squad-apps-outcomes", userId],
    enabled: !!userId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data: apps } = await supabase
        .from("squad_applications")
        .select("id, listing_id, listing_owner_id, status, created_at")
        .eq("applicant_id", userId!)
        .in("status", ["rejected", "expired"])
        .order("created_at", { ascending: false })
        .limit(20);
      const rows = apps ?? [];
      if (!rows.length) return [] as any[];
      const oids = [...new Set(rows.map((r: any) => r.listing_owner_id))];
      const lids = [...new Set(rows.map((r: any) => r.listing_id))];
      const [{ data: profs }, { data: lists }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", oids),
        supabase.from("squad_listings").select("id, title").in("id", lids),
      ]);
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const lmap = new Map((lists ?? []).map((l: any) => [l.id, l]));
      return rows.map((r: any) => ({ ...r, owner: pmap.get(r.listing_owner_id) ?? null, listing: lmap.get(r.listing_id) ?? null }));
    },
  });

  // Realtime + beep for incoming squad apps
  const squadChanRef = useRef(`bell-squad-${Math.random().toString(36).slice(2)}`);
  const knownSquadIncoming = useRef<Set<string>>(new Set());
  const squadIncomingHydrated = useRef(false);
  useEffect(() => {
    if (!userId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`${squadChanRef.current}-${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "squad_applications", filter: `listing_owner_id=eq.${userId}` },
          () => {
            qc.invalidateQueries({ queryKey: ["squad-apps-incoming"] });
            qc.invalidateQueries({ queryKey: ["squad-apps-inbox"] });
            qc.invalidateQueries({ queryKey: ["squad-taken-counts"] });
          })
        .on("postgres_changes", { event: "*", schema: "public", table: "squad_applications", filter: `applicant_id=eq.${userId}` },
          () => {
            qc.invalidateQueries({ queryKey: ["squad-apps-outcomes"] });
            qc.invalidateQueries({ queryKey: ["my-squad-apps"] });
            qc.invalidateQueries({ queryKey: ["squad-taken-counts"] });
          })
        .subscribe();
    });
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [userId, qc]);


  useEffect(() => {
    if (!squadIncoming) return;
    if (!squadIncomingHydrated.current) {
      squadIncoming.forEach((r: any) => knownSquadIncoming.current.add(r.id));
      squadIncomingHydrated.current = true;
      return;
    }
    const fresh = squadIncoming.filter((r: any) => !knownSquadIncoming.current.has(r.id));
    if (fresh.length) {
      fresh.forEach((r: any) => knownSquadIncoming.current.add(r.id));
      playBeep();
      toast.info(`طلب انضمام جديد للسكواد من ${fresh[0].profile?.display_name ?? "لاعب"}`);
    }
  }, [squadIncoming]);

  const acceptSquad = async (a: any) => {
    const { error } = await supabase.from("squad_applications").update({ status: "accepted" }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم قبول الطلب");
    qc.invalidateQueries({ queryKey: ["squad-apps-incoming"] });
    qc.invalidateQueries({ queryKey: ["squad-accepted-counts"] });
  };
  const rejectSquad = async (a: any) => {
    const { error } = await supabase.from("squad_applications").update({ status: "rejected" }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم رفض الطلب");
    qc.invalidateQueries({ queryKey: ["squad-apps-incoming"] });
  };

  const visibleSquadIncoming = squadIncoming ?? [];
  const visibleSquadOutcomes = (squadOutcomes ?? []).filter((o: any) => !dismissedSquadOutcomes.has(o.id));

  const onAcceptFriend = async (id: string) => {
    try { await acceptFriendRequest(id); toast.success("أصبحتما أصدقاء!"); qc.invalidateQueries({ queryKey: ["friend-requests"] }); qc.invalidateQueries({ queryKey: ["my-friends"] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onRejectFriend = async (id: string) => {
    try { await rejectFriendRequest(id); qc.invalidateQueries({ queryKey: ["friend-requests"] }); }
    catch (e) { toast.error((e as Error).message); }
  };

  const visibleMutes = myMutes?.filter((m) => !dismissedMutes.has(m.id)) ?? [];

  // === Tournament team invites (I'm invited) ===
  const { data: tournamentInvites } = useQuery({
    queryKey: ["tournament-invites", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: invs } = await supabase
        .from("tournament_team_invites")
        .select("id, registration_id, tournament_id, captain_id, status, created_at")
        .eq("invitee_id", userId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      const rows = invs ?? [];
      if (!rows.length) return [] as any[];
      const capIds = [...new Set(rows.map((r: any) => r.captain_id))];
      const regIds = [...new Set(rows.map((r: any) => r.registration_id))];
      const tIds = [...new Set(rows.map((r: any) => r.tournament_id))];
      const [{ data: profs }, { data: regs }, { data: ts }] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", capIds),
        supabase.from("tournament_registrations").select("id, team_name").in("id", regIds),
        supabase.from("tournaments").select("id, name").in("id", tIds),
      ]);
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const rmap = new Map((regs ?? []).map((r: any) => [r.id, r]));
      const tmap = new Map((ts ?? []).map((t: any) => [t.id, t]));
      return rows.map((r: any) => ({
        ...r,
        captain: pmap.get(r.captain_id) ?? null,
        registration: rmap.get(r.registration_id) ?? null,
        tournament: tmap.get(r.tournament_id) ?? null,
      }));
    },
  });

  const tiChanRef = useRef(`bell-ti-${Math.random().toString(36).slice(2)}`);
  const knownTi = useRef<Set<string>>(new Set());
  const tiHydrated = useRef(false);
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`${tiChanRef.current}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_team_invites", filter: `invitee_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["tournament-invites"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  useEffect(() => {
    if (!tournamentInvites) return;
    if (!tiHydrated.current) {
      tournamentInvites.forEach((r: any) => knownTi.current.add(r.id));
      tiHydrated.current = true;
      return;
    }
    const fresh = tournamentInvites.filter((r: any) => !knownTi.current.has(r.id));
    if (fresh.length) {
      fresh.forEach((r: any) => knownTi.current.add(r.id));
      playBeep();
      toast.info(`دعوة للانضمام إلى فريق ${fresh[0].registration?.team_name ?? ""}`);
    }
  }, [tournamentInvites]);

  const acceptTI = async (inv: any) => {
    const { error } = await supabase.rpc("accept_tournament_invite", { _invite_id: inv.id });
    if (error) { toast.error(error.message); return; }
    toast.success("انضممت إلى الفريق!");
    qc.invalidateQueries({ queryKey: ["tournament-invites"] });
  };
  const rejectTI = async (inv: any) => {
    const { error } = await supabase.from("tournament_team_invites").update({ status: "rejected", responded_at: new Date().toISOString() }).eq("id", inv.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم رفض الدعوة");
    qc.invalidateQueries({ queryKey: ["tournament-invites"] });
  };

  const visibleTI = tournamentInvites ?? [];

  // === Tournament team registrations (I'm the organizer) ===
  const { data: tournamentRegs } = useQuery({
    queryKey: ["tournament-regs-organizer", userId],
    enabled: !!userId,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,

    queryFn: async () => {
      const { data: regs } = await supabase
        .from("tournament_registrations")
        .select("id, tournament_id, captain_id, team_name, status, created_at")
        .eq("organizer_id", userId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      const rows = regs ?? [];
      if (!rows.length) return [] as any[];
      const tIds = [...new Set(rows.map((r: any) => r.tournament_id))];
      const cIds = [...new Set(rows.map((r: any) => r.captain_id))];
      const [{ data: ts }, { data: profs }] = await Promise.all([
        supabase.from("tournaments").select("id, name").in("id", tIds),
        supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", cIds),
      ]);
      const tmap = new Map((ts ?? []).map((t: any) => [t.id, t]));
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return rows.map((r: any) => ({
        ...r,
        tournament: tmap.get(r.tournament_id) ?? null,
        captain: pmap.get(r.captain_id) ?? null,
      }));
    },
  });

  const tregChanRef = useRef(`bell-treg-${Math.random().toString(36).slice(2)}`);
  const knownTreg = useRef<Set<string>>(new Set());
  const tregHydrated = useRef(false);
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`${tregChanRef.current}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_registrations", filter: `organizer_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["tournament-regs-organizer"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  useEffect(() => {
    if (!tournamentRegs) return;
    if (!tregHydrated.current) {
      tournamentRegs.forEach((r: any) => knownTreg.current.add(r.id));
      tregHydrated.current = true;
      return;
    }
    const fresh = tournamentRegs.filter((r: any) => !knownTreg.current.has(r.id));
    if (fresh.length) {
      fresh.forEach((r: any) => knownTreg.current.add(r.id));
      playBeep();
      toast.info(`طلب تسجيل جديد: فريق ${fresh[0].team_name}`);
    }
  }, [tournamentRegs]);

  const [dismissedTregs, setDismissedTregs] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("bell-dismissed-tregs");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });
  const dismissTreg = (id: string) => {
    setDismissedTregs((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem("bell-dismissed-tregs", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };
  const visibleTreg = (tournamentRegs ?? []).filter((r: any) => !dismissedTregs.has(r.id));




  // === Trophy awards (I'm in recipient_ids) ===
  const [dismissedTrophies, setDismissedTrophies] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("bell-dismissed-trophies");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });
  const dismissTrophy = (id: string) => {
    setDismissedTrophies((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem("bell-dismissed-trophies", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const { data: trophyAwards } = useQuery({
    queryKey: ["trophy-awards", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: res } = await supabase
        .from("tournament_results")
        .select("id, position, prize_note, trophies_awarded, recipient_ids, tournament_id, registration_id, created_at")
        .contains("recipient_ids", [userId!])
        .order("created_at", { ascending: false })
        .limit(20);
      const rows = (res ?? []) as any[];
      if (!rows.length) return [] as any[];
      const tIds = [...new Set(rows.map((r) => r.tournament_id))];
      const rIds = [...new Set(rows.map((r) => r.registration_id))];
      const [{ data: ts }, { data: regs }] = await Promise.all([
        supabase.from("tournaments").select("id, name").in("id", tIds),
        supabase.from("tournament_registrations").select("id, team_name, captain_id").in("id", rIds),
      ]);
      const capIds = [...new Set((regs ?? []).map((r: any) => r.captain_id))];
      const { data: profs } = capIds.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", capIds)
        : { data: [] as any[] };
      const tmap = new Map((ts ?? []).map((t: any) => [t.id, t]));
      const rmap = new Map((regs ?? []).map((r: any) => [r.id, r]));
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return rows.map((r) => {
        const reg: any = rmap.get(r.registration_id);
        const myShare = r.recipient_ids?.length
          ? Math.floor((r.trophies_awarded || 0) / r.recipient_ids.length)
          : (r.trophies_awarded || 0);
        return {
          ...r,
          my_share: myShare,
          tournament: tmap.get(r.tournament_id) ?? null,
          registration: reg ?? null,
          captain: reg ? pmap.get(reg.captain_id) ?? null : null,
        };
      });
    },
  });

  const trophyChanRef = useRef(`bell-trophy-${Math.random().toString(36).slice(2)}`);
  const knownTrophyIds = useRef<Set<string>>(new Set());
  const trophyHydrated = useRef(false);
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`${trophyChanRef.current}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_results" },
        () => qc.invalidateQueries({ queryKey: ["trophy-awards"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  useEffect(() => {
    if (!trophyAwards) return;
    if (!trophyHydrated.current) {
      trophyAwards.forEach((r: any) => knownTrophyIds.current.add(r.id));
      trophyHydrated.current = true;
      return;
    }
    const fresh = trophyAwards.filter((r: any) => !knownTrophyIds.current.has(r.id) && !dismissedTrophies.has(r.id));
    if (fresh.length) {
      fresh.forEach((r: any) => knownTrophyIds.current.add(r.id));
      playBeep();
      toast.success(`🏆 حصلت على ${fresh[0].my_share} كؤوس من ${fresh[0].tournament?.name ?? "بطولة"}`);
    }
  }, [trophyAwards, dismissedTrophies]);

  const visibleTrophies = (trophyAwards ?? []).filter((r: any) => !dismissedTrophies.has(r.id));

  // === Admin trophy grants (received by me) ===
  const [dismissedGrants, setDismissedGrants] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("bell-dismissed-admin-grants");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });
  const dismissGrant = (id: string) => {
    setDismissedGrants((prev) => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem("bell-dismissed-admin-grants", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const { data: adminGrants } = useQuery({
    queryKey: ["admin-grants-mine", userId],
    enabled: !!userId,
    refetchInterval: 10000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_trophy_grants")
        .select("id, amount, note, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const grantsChanRef = useRef(`bell-admin-grants-${Math.random().toString(36).slice(2)}`);
  const knownGrantIds = useRef<Set<string>>(new Set());
  const grantsHydrated = useRef(false);
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`${grantsChanRef.current}-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_trophy_grants", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["admin-grants-mine"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  useEffect(() => {
    if (!adminGrants) return;
    if (!grantsHydrated.current) {
      adminGrants.forEach((g: any) => knownGrantIds.current.add(g.id));
      grantsHydrated.current = true;
      return;
    }
    const fresh = adminGrants.filter((g: any) => !knownGrantIds.current.has(g.id) && !dismissedGrants.has(g.id));
    if (fresh.length) {
      fresh.forEach((g: any) => knownGrantIds.current.add(g.id));
      playBeep();
      toast.success(`🏆 منحتك الإدارة ${fresh[0].amount} كؤوس`);
    }
  }, [adminGrants, dismissedGrants]);

  // Mark admin grants as seen only after the popover is closed.
  // This keeps them visible while the user is actually looking at the bell.
  const prevGrantsOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevGrantsOpenRef.current;
    if (!open && wasOpen) {
      const snapshot = (adminGrants ?? []).map((g: any) => g.id);
      if (snapshot.length > 0) {
        setDismissedGrants((prev) => {
          const next = new Set(prev);
          snapshot.forEach((id: string) => next.add(id));
          try {
            localStorage.setItem("bell-dismissed-admin-grants", JSON.stringify([...next]));
          } catch { /* ignore */ }
          return next;
        });
      }
    }
    prevGrantsOpenRef.current = open;
  }, [open, adminGrants]);

  const visibleGrants = (adminGrants ?? []).filter((g: any) => !dismissedGrants.has(g.id));

  // Admin/system notifications (e.g. name violation notices)
  const { data: adminNotices } = useQuery({
    queryKey: ["admin-notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, created_at, read_at")
        .eq("user_id", userId!)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
  const noticesChanRef = useRef(`bell-notices-${Math.random().toString(36).slice(2)}`);
  const prevNoticeIds = useRef<Set<string>>(new Set());
  const noticesHydrated = useRef(false);
  useEffect(() => {
    if (!adminNotices) return;
    if (!noticesHydrated.current) {
      adminNotices.forEach((n) => prevNoticeIds.current.add(n.id));
      noticesHydrated.current = true;
      return;
    }
    const fresh = adminNotices.filter((n) => !prevNoticeIds.current.has(n.id));
    if (fresh.length) {
      fresh.forEach((n) => prevNoticeIds.current.add(n.id));
      playBeep();
      toast.warning(fresh[0].title);
    }
  }, [adminNotices]);
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`${noticesChanRef.current}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);
  const prevNoticesOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevNoticesOpenRef.current;
    if (!open && wasOpen) {
      const snapshot = (adminNotices ?? []).map((n: any) => n.id);
      if (snapshot.length > 0) {
        supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .in("id", snapshot)
          .then(() => qc.invalidateQueries({ queryKey: ["admin-notifications"] }));
      }
    }
    prevNoticesOpenRef.current = open;
  }, [open, adminNotices, qc]);
  // Admin notices stay visible while the bell is open, then clear after closing it.

  // === Admin: pending UC withdrawal requests ===
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("username").eq("id", userId!).maybeSingle();
      return data?.username === "moniromran";
    },
  });

  const { data: pendingWithdrawals } = useQuery({
    queryKey: ["admin-pending-withdrawals"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("uc_withdrawal_requests")
        .select("id, user_id, uc_amount, pubg_id, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (!ids.length) return rows.map((r) => ({ ...r, profile: null as { username: string; display_name: string | null } | null }));
      const { data: profs } = await supabase
        .from("profiles").select("id, username, display_name").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: (map.get(r.user_id) as { username: string; display_name: string | null }) ?? null }));
    },
  });

  const knownWithdrawIds = useRef<Set<string>>(new Set());
  const withdrawHydrated = useRef(false);
  useEffect(() => {
    if (!pendingWithdrawals) return;
    if (!withdrawHydrated.current) {
      pendingWithdrawals.forEach((w) => knownWithdrawIds.current.add(w.id));
      withdrawHydrated.current = true;
      return;
    }
    const fresh = pendingWithdrawals.filter((w) => !knownWithdrawIds.current.has(w.id));
    if (fresh.length) {
      fresh.forEach((w) => knownWithdrawIds.current.add(w.id));
      playBeep();
      toast.info(`طلب سحب جديد: ${fresh[0].uc_amount} UC`);
    }
  }, [pendingWithdrawals]);

  const withdrawChanRef = useRef(`bell-withdraw-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    if (!isAdmin) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(withdrawChanRef.current)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "uc_withdrawal_requests" },
          () => qc.invalidateQueries({ queryKey: ["admin-pending-withdrawals"] }),
        )
        .subscribe();
    });
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [isAdmin, qc]);


  const count = (adminNotices?.length ?? 0) + visibleRequests.length + (friendReqs?.length ?? 0) + (dmReqs?.length ?? 0) + (unreadDms?.length ?? 0) + visibleMutes.length + muteStatusNotices.length + visibleClipLikes.length + visibleSquadIncoming.length + visibleSquadOutcomes.length + visibleTI.length + visibleTreg.length + visibleTrophies.length + visibleGrants.length + (pendingWithdrawals?.length ?? 0);




  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative size-9 md:size-10 rounded-lg md:rounded-2xl bg-surface hover:bg-primary hover:text-primary-foreground transition flex items-center justify-center"
          title="الإشعارات"
        >
          <Bell className="size-5" />
          {count > 0 && (
            <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1 border-2 border-sidebar">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="w-80 p-0 bg-surface border-border"
        dir="rtl"
      >
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Bell className="size-4 text-primary" />
          <h3 className="font-bold text-sm">الإشعارات</h3>
          {count > 0 && (
            <span className="ms-auto text-[10px] bg-destructive/15 text-destructive px-2 py-0.5 rounded-full font-bold">
              {count}
            </span>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {count === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Bell className="size-8 mx-auto mb-2 opacity-30" />
              لا توجد إشعارات
            </div>
          )}
          {(adminNotices ?? []).map((n: any) => (
            <div key={n.id} className="p-3 border-b border-border/60 hover:bg-background/40 transition">
              <div className="flex items-start gap-2">
                <div className="size-8 rounded-full bg-destructive/20 text-destructive flex items-center justify-center shrink-0">
                  <Ban className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-destructive">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{n.body}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleString("ar")}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {(pendingWithdrawals ?? []).map((w) => (
            <button
              key={w.id}
              onClick={() => { setOpen(false); navigate({ to: "/app/admin" }); }}
              className="w-full text-right p-3 border-b border-border/60 hover:bg-background/40 transition"
            >
              <div className="flex items-start gap-2">
                <div className="size-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                  <Wallet className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">طلب سحب جديد — {w.uc_amount} UC</div>
                  <div className="text-xs text-muted-foreground truncate">
                    من {w.profile?.display_name || w.profile?.username || "لاعب"} • <span dir="ltr" className="font-mono">{w.pubg_id}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {new Date(w.created_at).toLocaleString("ar")}
                  </div>
                </div>
              </div>
            </button>
          ))}



          {visibleRequests.map((r) => (
            <div
              key={r.id}
              className="p-3 border-b border-border/60 hover:bg-background/40 transition"
            >
              <div className="flex items-start gap-2">
                <div className="size-8 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0 overflow-hidden">
                  {r.profile?.avatar_url ? (
                    <img src={r.profile.avatar_url} alt="" className="size-full object-cover" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-bold">
                      {r.profile?.display_name || r.profile?.username || "لاعب"}
                    </span>
                    {" يطلب الانضمام إلى "}
                    <span className="font-bold text-primary">{r.server?.name}</span>
                  </p>
                  {r.message && (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                      {r.message}
                    </p>
                  )}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <button
                      onClick={() => approve(r)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-primary/15 text-primary text-[11px] font-bold hover:bg-primary/25 transition"
                    >
                      <Check className="size-3" /> قبول
                    </button>
                    <button
                      onClick={() => reject(r)}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-destructive/15 text-destructive text-[11px] font-bold hover:bg-destructive/25 transition"
                    >
                      <X className="size-3" /> رفض
                    </button>
                    <button
                      onClick={() => {
                        dismiss(r.id);
                        setOpen(false);
                        navigate({
                          to: "/app/servers/$serverId",
                          params: { serverId: r.server_id },
                          search: { settings: "open" } as never,
                        });
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-surface text-foreground text-[11px] font-bold hover:bg-background transition border border-border"
                    >
                      <Info className="size-3" /> تفاصيل
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {friendReqs?.map((r) => (
            <div key={r.id} className="p-3 border-b border-border/60 hover:bg-background/40 transition">
              <div className="flex items-start gap-2">
                <div className="size-8 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0 overflow-hidden">
                  {r.profile?.avatar_url ? <img src={r.profile.avatar_url} alt="" className="size-full object-cover" /> : <UserPlus className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-bold">{r.profile?.display_name || r.profile?.username || "لاعب"}</span>
                    {" أرسل لك طلب صداقة"}
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => onAcceptFriend(r.id)} className="flex items-center gap-1 px-2 py-1 rounded bg-primary/15 text-primary text-[11px] font-bold hover:bg-primary/25 transition">
                      <Check className="size-3" /> قبول
                    </button>
                    <button onClick={() => onRejectFriend(r.id)} className="flex items-center gap-1 px-2 py-1 rounded bg-destructive/15 text-destructive text-[11px] font-bold hover:bg-destructive/25 transition">
                      <X className="size-3" /> رفض
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {dmReqs?.map((r) => (
            <button key={r.id} onClick={() => { setOpen(false); navigate({ to: "/app/dm/$userId", params: { userId: r.initiator_id } }); }}
              className="w-full text-right p-3 border-b border-border/60 hover:bg-background/40 transition">
              <div className="flex items-start gap-2">
                <div className="size-8 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0 overflow-hidden">
                  {r.profile?.avatar_url ? <img src={r.profile.avatar_url} alt="" className="size-full object-cover" /> : <MessageCircle className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-bold">{r.profile?.display_name || r.profile?.username || "لاعب"}</span>
                    {" أرسل لك طلب مراسلة"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">اضغط للفتح والرد</p>
                </div>
              </div>
            </button>
          ))}

          {unreadDms?.map((d) => (
            <button key={d.sender_id} onClick={() => { setOpen(false); navigate({ to: "/app/dm/$userId", params: { userId: d.sender_id } }); }}
              className="w-full text-right p-3 border-b border-border/60 hover:bg-background/40 transition">
              <div className="flex items-start gap-2">
                <div className="size-8 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0 overflow-hidden">
                  {d.profile?.avatar_url ? <img src={d.profile.avatar_url} alt="" className="size-full object-cover" /> : <MessageCircle className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-bold">وصلتك رسالة من {d.profile?.display_name || d.profile?.username || "لاعب"}</span>
                    {d.count > 1 && <span className="text-muted-foreground"> ({d.count})</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{d.last}</p>
                </div>
              </div>
            </button>
          ))}

          {visibleClipLikes.map((l) => (
            <div key={l.key} className="p-3 border-b border-border/60 hover:bg-background/40 transition flex items-start gap-2">
              <button
                onClick={() => { dismissLike(l.key); setOpen(false); navigate({ to: "/app/clip/$clipId", params: { clipId: l.clip_id } }); }}
                className="flex-1 text-right flex items-start gap-2 min-w-0"
              >
                <div className="size-8 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0 overflow-hidden">
                  {l.profile?.avatar_url ? <img src={l.profile.avatar_url} alt="" className="size-full object-cover" /> : <Heart className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-bold">{l.profile?.display_name || l.profile?.username || "لاعب"}</span>
                    {l.count > 1 ? ` و${l.count - 1} آخرون أعجبوا بلقطتك` : " أعجب بلقطتك"}
                  </p>
                  {l.clip?.caption && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{l.clip.caption}</p>
                  )}
                </div>
                {l.clip?.thumbnail_url && (
                  <img src={l.clip.thumbnail_url} alt="" className="size-10 rounded object-cover shrink-0" />
                )}
              </button>
              <button
                onClick={() => dismissLike(l.key)}
                className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                title="إخفاء"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}

          {visibleTI.map((inv: any) => (
            <div key={inv.id} className="p-3 border-b border-border/60 hover:bg-background/40 transition">
              <div className="flex items-start gap-2">
                <div className="size-8 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground shrink-0 overflow-hidden">
                  {inv.captain?.avatar_url ? <img src={inv.captain.avatar_url} alt="" className="size-full object-cover" /> : <Trophy className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-bold">{inv.captain?.display_name || inv.captain?.username || "لاعب"}</span>
                    {" دعاك للانضمام إلى فريق "}
                    <span className="font-bold text-primary">{inv.registration?.team_name ?? "—"}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">🏆 {inv.tournament?.name ?? ""}</p>
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => acceptTI(inv)} className="flex items-center gap-1 px-2 py-1 rounded bg-primary/15 text-primary text-[11px] font-bold hover:bg-primary/25 transition">
                      <Check className="size-3" /> قبول
                    </button>
                    <button onClick={() => rejectTI(inv)} className="flex items-center gap-1 px-2 py-1 rounded bg-destructive/15 text-destructive text-[11px] font-bold hover:bg-destructive/25 transition">
                      <X className="size-3" /> رفض
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {visibleTreg.map((r: any) => (
            <button
              key={r.id}
              onClick={() => {
                dismissTreg(r.id);
                try {
                  sessionStorage.setItem("open-tournament-inbox", r.tournament_id);
                  window.dispatchEvent(new CustomEvent("open-tournament-inbox", { detail: { tournamentId: r.tournament_id } }));
                } catch {
                  /* ignore */
                }
                setOpen(false);
                navigate({ to: "/app/tournaments" });
              }}

              className="w-full text-right p-3 border-b border-border/60 hover:bg-background/40 transition"
            >
              <div className="flex items-start gap-2">
                <div className="size-8 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground shrink-0 overflow-hidden">
                  {r.captain?.avatar_url ? <img src={r.captain.avatar_url} alt="" className="size-full object-cover" /> : <Trophy className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-bold">{r.captain?.display_name || r.captain?.username || "لاعب"}</span>
                    {" طلب تسجيل فريق "}
                    <span className="font-bold text-primary">{r.team_name}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">🏆 {r.tournament?.name ?? ""}</p>
                </div>
              </div>
            </button>
          ))}



          {visibleTrophies.map((r: any) => {
            const medals = ["🥇", "🥈", "🥉"];
            const medal = medals[r.position - 1] ?? `#${r.position}`;
            return (
              <div key={r.id} className="p-3 border-b border-border/60 hover:bg-background/40 transition flex items-start gap-2">
                <div className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Trophy className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-bold text-primary">🏆 حصلت على {r.my_share} كؤوس</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {medal} {r.tournament?.name ?? "بطولة"} — {r.registration?.team_name ?? ""}
                  </p>
                  {r.captain && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      بقيادة <b className="text-foreground">{r.captain.display_name || r.captain.username || "—"}</b>
                      {r.prize_note ? ` · ${r.prize_note}` : ""}
                    </p>
                  )}
                </div>
                <button onClick={() => dismissTrophy(r.id)} className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground" title="إخفاء">
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}



          {visibleGrants.map((g: any) => (
            <button
              key={g.id}
              onClick={() => { dismissGrant(g.id); setOpen(false); }}
              className="w-full text-right p-3 border-b border-border/60 hover:bg-background/40 transition flex items-start gap-2"
            >
              <div className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Trophy className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs">
                  <span className="font-bold text-primary">🏆 منحتك الإدارة {g.amount} كؤوس</span>
                </p>
                {g.note && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 break-words">السبب: {g.note}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(g.created_at).toLocaleString("ar")}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); dismissGrant(g.id); }}
                className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                title="إخفاء"
              >
                <X className="size-3.5" />
              </button>
            </button>
          ))}


          {visibleSquadIncoming.map((a: any) => (
            <button
              key={a.id}
              onClick={() => {
                setOpen(false);
                navigate({ to: "/app/squads", search: { inbox: a.listing_id } as never });
              }}
              className="w-full text-right p-3 border-b border-border/60 hover:bg-background/40 transition"
            >
              <div className="flex items-start gap-2">
                <div className="size-8 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0 overflow-hidden">
                  {a.profile?.avatar_url ? <img src={a.profile.avatar_url} alt="" className="size-full object-cover" /> : <Users className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-bold">{a.profile?.display_name || a.profile?.username || "لاعب"}</span>
                    {" يطلب الانضمام إلى "}
                    <span className="font-bold text-primary">{a.listing?.title ?? "السكواد"}</span>
                  </p>
                  {a.expires_at && <p className="text-[11px] text-yellow-500 mt-0.5 font-bold">⏱ يتبقى: <SquadCountdown until={a.expires_at} /></p>}
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/15 text-primary text-[11px] font-bold">
                      <Info className="size-3" /> عرض التفاصيل
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}


          {visibleSquadOutcomes.map((o: any) => (
            <div key={o.id} className="p-3 border-b border-border/60 hover:bg-background/40 transition flex items-start gap-2">
              <div className="size-8 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                <X className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold">
                  {o.status === "rejected"
                    ? `تم رفض طلبك من القائد ${o.owner?.display_name || o.owner?.username || "—"}`
                    : "تم رفض طلبك لعدم توفر استجابة"}
                </p>
                {o.listing?.title && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{o.listing.title}</p>}
              </div>
              <button onClick={() => dismissSquadOutcome(o.id)} className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground" title="إخفاء">
                <X className="size-3.5" />
              </button>
            </div>
          ))}


          {muteStatusNotices.map((n) => (
            <button key={n.id} onClick={() => { dismissMuteStatusNotice(n.id); setOpen(false); navigate({ to: "/app/servers/$serverId", params: { serverId: n.server_id } }); }}
              className="w-full text-right p-3 border-b border-border/60 hover:bg-background/40 transition">
              <div className="flex items-start gap-2">
                <div className="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Check className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-bold">تم رفع تقييد الكتابة عنك في </span>
                    <span className="font-bold text-primary">{n.server_name}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">يمكنك الإرسال الآن</p>
                </div>
              </div>
            </button>
          ))}

          {myMutes?.filter((m) => !dismissedMutes.has(m.id)).map((m) => {
            const ms = m.expires_at ? new Date(m.expires_at).getTime() - Date.now() : null;
            let remaining = "بشكل دائم";
            if (ms !== null && ms > 0) {
              const min = Math.floor(ms / 60000);
              const h = Math.floor(min / 60);
              const d = Math.floor(h / 24);
              remaining = d > 0 ? `${d} يوم${h % 24 ? ` و ${h % 24} ساعة` : ""}`
                : h > 0 ? `${h} ساعة${min % 60 ? ` و ${min % 60} دقيقة` : ""}`
                : `${Math.max(1, min)} دقيقة`;
            }
            return (
              <button key={m.id} onClick={() => { dismissMute(m.id); setOpen(false); navigate({ to: "/app/servers/$serverId", params: { serverId: m.server_id } }); }}
                className="w-full text-right p-3 border-b border-border/60 hover:bg-background/40 transition">
                <div className="flex items-start gap-2">
                  <div className="size-8 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                    <Ban className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">
                      <span className="font-bold">تم تقييدك من الكتابة في </span>
                      <span className="font-bold text-primary">{m.server?.name ?? "سيرفر"}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">يتبقى: {remaining}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

      </PopoverContent>
    </Popover>
  );
}

function SquadCountdown({ until }: { until: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return <span className="text-red-500">انتهى</span>;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return <span>{m}:{s.toString().padStart(2, "0")}</span>;
}
