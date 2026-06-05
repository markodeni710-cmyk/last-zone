import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Hash, Volume2, Send, Trash2, Clock, Trash, ChevronRight, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VoiceRoom } from "@/components/VoiceRoom";
import { ServerSettingsDialog } from "@/components/ServerSettingsDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ProfilePopover } from "@/components/ProfilePopover";
import { AdminBadge } from "@/components/AdminBadge";
import { isAdminUsername } from "@/lib/admin-utils";
import { ServerRoleBadge } from "@/components/ServerRoleBadge";

export const Route = createFileRoute("/_authenticated/app/servers/$serverId")({
  component: ServerView,
});

type Channel = { id: string; name: string; type: string; position: number; message_ttl_seconds?: number | null };
type Message = {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function ttlLabel(s: number): string {
  if (s < 3600) return `${Math.round(s / 60)} د`;
  if (s < 86400) return `${Math.round(s / 3600)} س`;
  return `${Math.round(s / 86400)} ي`;
}

function ServerView() {
  const { serverId } = Route.useParams();
  const qc = useQueryClient();
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [text, setText] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageChannelIdRef = useRef<string>(`server-messages-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null)).catch(() => setUserId(null));
  }, []);

  const { data: server } = useQuery({
    queryKey: ["server", serverId],
    queryFn: async () => {
      const { data } = await supabase.from("servers").select("*").eq("id", serverId).single();
      return data;
    },
  });

  const { data: myRole } = useQuery({
    queryKey: ["my-role", serverId, userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("server_members")
        .select("role")
        .eq("server_id", serverId)
        .eq("user_id", userId!)
        .maybeSingle();
      return (data?.role ?? "member") as "owner" | "admin" | "moderator" | "member";
    },
  });

  const isStaff = !!server && !!userId && (server.owner_id === userId || myRole === "admin" || myRole === "moderator");

  // Roles map for this server (used to show owner/admin/moderator badges next to message authors)
  const { data: rolesMap } = useQuery({
    queryKey: ["server-roles-map", serverId],
    queryFn: async () => {
      const { data } = await supabase
        .from("server_members")
        .select("user_id, role")
        .eq("server_id", serverId);
      const map: Record<string, "owner" | "admin" | "moderator" | "member"> = {};
      for (const r of data ?? []) map[(r as any).user_id] = (r as any).role;
      return map;
    },
  });
  const roleFor = (uid: string): "owner" | "admin" | "moderator" | "member" | undefined => {
    if (server?.owner_id === uid) return "owner";
    return rolesMap?.[uid];
  };

  // Current user's text mute in this server (if any)
  const { data: myMute } = useQuery({
    queryKey: ["my-mute", serverId, userId],
    enabled: !!userId,
    refetchInterval: 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("server_text_mutes")
        .select("expires_at, created_at")
        .eq("server_id", serverId)
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;
      return data as { expires_at: string | null; created_at: string };
    },
  });

  // Tick every second for live countdown
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!myMute) return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [myMute]);

  // Realtime: refresh mute state instantly when staff mute/unmute the current user
  useEffect(() => {
    if (!userId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`mute-${serverId}-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "server_text_mutes", filter: `server_id=eq.${serverId}` },
          (payload) => {
            const row = (payload.new ?? payload.old) as { user_id?: string; expires_at?: string | null } | null;
            if (row?.user_id === userId) {
              const eventType = (payload as { eventType?: string }).eventType;
              const inactive = eventType === "DELETE" || (!!row.expires_at && new Date(row.expires_at).getTime() <= Date.now());
              if (inactive) qc.setQueryData(["my-mute", serverId, userId], null);
              qc.invalidateQueries({ queryKey: ["my-mute", serverId, userId] });
            }
          },
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [serverId, userId, qc]);

  const muteRemainingLabel = (() => {
    if (!myMute) return null;
    if (!myMute.expires_at) return "بشكل دائم";
    const ms = new Date(myMute.expires_at).getTime() - Date.now();
    if (ms <= 0) return null;
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    if (d > 0) return `${d} ي ${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  })();

  const { data: channels } = useQuery({
    queryKey: ["channels", serverId, userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("channels").select("*").eq("server_id", serverId).order("position");
      const list = (data ?? []) as Channel[];
      if (list.length && !activeChannel) {
        // Check if user is currently a participant in any voice channel of this server
        let activeVoice: Channel | null = null;
        if (userId) {
          const voiceChannels = list.filter((c) => c.type === "voice");
          if (voiceChannels.length) {
            const { data: parts } = await supabase
              .from("voice_room_participants")
              .select("channel_id")
              .eq("user_id", userId)
              .in("channel_id", voiceChannels.map((c) => c.id));
            if (parts && parts.length) {
              activeVoice = voiceChannels.find((c) => c.id === parts[0].channel_id) ?? null;
            }
          }
        }

        // Always default to "عام" text channel unless user is actively in a voice call
        const chosen = activeVoice
          ?? list.find((c) => c.type === "text" && c.name === "عام")
          ?? list.find((c) => c.type === "text")
          ?? list[0];
        setActiveChannel(chosen);
      }

      return list;
    },
  });


  const selectChannel = (c: Channel) => {
    setActiveChannel(c);
    setSidebarCollapsed(c.type === "voice");
    if (typeof window !== "undefined") localStorage.setItem(`lastChannel:${serverId}`, c.id);
  };

  const { data: messages } = useQuery({
    queryKey: ["messages", activeChannel?.id],
    enabled: !!activeChannel,
    queryFn: async () => {
      const { data } = await supabase
        .from("messages")
        .select("*, profile:profiles!messages_profile_fkey(username, display_name, avatar_url)")
        .eq("channel_id", activeChannel!.id)
        .order("created_at", { ascending: true })
        .limit(100);
      return (data ?? []) as Message[];
    },
  });

  // Mark channel as read when user opens it / when new messages arrive while viewing
  useEffect(() => {
    if (!activeChannel || !userId) return;
    supabase.from("channel_reads").upsert(
      { user_id: userId, channel_id: activeChannel.id, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,channel_id" },
    ).then(() => qc.invalidateQueries({ queryKey: ["unread-by-server"] }));
  }, [activeChannel, userId, qc, messages?.length]);

  useEffect(() => {
    if (!activeChannel) return;
    const channel = supabase
      .channel(`${messageChannelIdRef.current}-${activeChannel.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannel.id}` },
        () => qc.invalidateQueries({ queryKey: ["messages", activeChannel.id] }),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages", filter: `channel_id=eq.${activeChannel.id}` },
        () => qc.invalidateQueries({ queryKey: ["messages", activeChannel.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeChannel, qc]);

  // Listen for being kicked from the server — leave immediately.
  // Also refresh roles map on any membership change so badges (owner/mod) update live.
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`members-${serverId}-${userId}`)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "server_members", filter: `server_id=eq.${serverId}` },
        (payload) => {
          if ((payload.old as any)?.user_id === userId) {
            toast.error("تم طردك من السيرفر");
            qc.invalidateQueries({ queryKey: ["my-servers"] });
            window.location.href = "/app";
            return;
          }
          qc.invalidateQueries({ queryKey: ["server-roles-map", serverId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "server_members", filter: `server_id=eq.${serverId}` },
        () => qc.invalidateQueries({ queryKey: ["server-roles-map", serverId] }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "server_members", filter: `server_id=eq.${serverId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["server-roles-map", serverId] });
          qc.invalidateQueries({ queryKey: ["my-role", serverId, userId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [serverId, userId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeChannel) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const content = text.trim();
    setText("");
    const { data, error } = await supabase.from("messages").insert({
      channel_id: activeChannel.id, user_id: user.id, content,
    }).select("*, profile:profiles!messages_profile_fkey(username, display_name, avatar_url)").single();
    if (error) {
      if (/row-level security/i.test(error.message)) {
        const { data: mute } = await supabase
          .from("server_text_mutes")
          .select("expires_at")
          .eq("server_id", serverId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        let msg = "أنت ممنوع حالياً من إرسال الرسائل في هذا السيرفر";
        if (mute?.expires_at) {
          const ms = new Date(mute.expires_at).getTime() - Date.now();
          if (ms > 0) {
            const m = Math.floor(ms / 60000);
            const h = Math.floor(m / 60);
            const d = Math.floor(h / 24);
            const remaining = d > 0 ? `${d} يوم${h % 24 ? ` و ${h % 24} ساعة` : ""}`
              : h > 0 ? `${h} ساعة${m % 60 ? ` و ${m % 60} دقيقة` : ""}`
              : `${Math.max(1, m)} دقيقة`;
            msg = `أنت ممنوع من الإرسال — يتبقى ${remaining}`;
          }
        } else if (mute) {
          msg = "أنت ممنوع من إرسال الرسائل بشكل دائم في هذا السيرفر";
        }
        toast.error(msg);
      } else {
        toast.error(error.message);
      }
      setText(content);
    }
    else if (data) {
      qc.setQueryData<Message[]>(["messages", activeChannel.id], (old = []) => {
        if (old.some((m) => m.id === data.id)) return old;
        return [...old, data as Message];
      });
      qc.invalidateQueries({ queryKey: ["unread-by-server"] });
    }
  };

  const collapsed = sidebarCollapsed;

  return (
    <>
      {/* Channels sidebar */}
      <div className="flex flex-1 overflow-hidden relative">
        <aside className={`flex flex-col bg-sidebar/40 backdrop-blur border-l border-sidebar-border transition-all duration-300 ${collapsed ? "w-0 border-l-0 overflow-hidden" : "w-60"}`}>
          <div className="border-b border-sidebar-border p-4 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="display text-xl truncate">{server?.name ?? "..."}</h2>
              <p className="text-xs text-muted-foreground">{server?.member_count ?? 0} عضو</p>
            </div>
            {!collapsed && (
              <button
                onClick={() => setSidebarCollapsed(true)}
                title="طي القائمة"
                className="p-1.5 rounded-lg hover:bg-surface text-muted-foreground hover:text-foreground transition shrink-0"
              >
                <ChevronRight className="size-4" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">القنوات النصية</div>
            {channels?.filter((c) => c.type === "text").map((c) => (
              <button
                key={c.id} onClick={() => selectChannel(c)}
                title={c.name}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition ${
                  activeChannel?.id === c.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface hover:text-foreground"
                }`}
              >
                <Hash className="size-4 shrink-0" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            <div className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">القنوات الصوتية</div>
            {channels?.filter((c) => c.type === "voice").map((c) => (
              <button
                key={c.id} onClick={() => selectChannel(c)}
                title={c.name}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition ${
                  activeChannel?.id === c.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface hover:text-foreground"
                }`}
              >
                <Volume2 className="size-4 shrink-0" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </aside>

        {collapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="فتح القائمة"
            className="absolute top-3 right-2 z-20 p-1.5 rounded-lg bg-surface/80 backdrop-blur border border-border hover:bg-surface text-muted-foreground hover:text-foreground transition"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}

        {activeChannel?.type === "voice" && userId && server ? (
          <VoiceRoom
            key={activeChannel.id}
            channelId={activeChannel.id}
            channelName={activeChannel.name}
            serverId={serverId}
            ownerId={server.owner_id}
            currentUserId={userId}
          />
        ) : (
        /* Chat */
        <div className="flex-1 flex flex-col bg-background">
          <header className="h-14 border-b border-border flex items-center justify-between px-5 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Hash className="size-5 text-muted-foreground shrink-0" />
              <h3 className="font-bold truncate">{activeChannel?.name ?? "—"}</h3>
              {activeChannel?.message_ttl_seconds ? (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <Clock className="size-3" />
                  {ttlLabel(activeChannel.message_ttl_seconds)}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isStaff && activeChannel && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button title="مدة الرسائل المؤقتة" className="p-2 rounded-lg hover:bg-surface text-muted-foreground hover:text-foreground transition">
                        <Clock className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>الرسائل المؤقتة</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {[
                        { label: "إيقاف (دائمة)", value: null },
                        { label: "ساعة واحدة", value: 3600 },
                        { label: "6 ساعات", value: 6 * 3600 },
                        { label: "24 ساعة", value: 24 * 3600 },
                        { label: "7 أيام", value: 7 * 24 * 3600 },
                      ].map((opt) => (
                        <DropdownMenuItem
                          key={String(opt.value)}
                          onClick={async () => {
                            const { error } = await supabase
                              .from("channels")
                              .update({ message_ttl_seconds: opt.value })
                              .eq("id", activeChannel.id);
                            if (error) return toast.error(error.message);
                            toast.success(opt.value ? `تم ضبط الحذف التلقائي: ${opt.label}` : "تم إيقاف الحذف التلقائي");
                            qc.invalidateQueries({ queryKey: ["channels", serverId, userId] });
                            setActiveChannel({ ...activeChannel, message_ttl_seconds: opt.value });
                          }}
                          className={activeChannel.message_ttl_seconds === opt.value ? "bg-surface" : ""}
                        >
                          {opt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    title="حذف كل الرسائل"
                    onClick={async () => {
                      if (!confirm(`حذف كل الرسائل في #${activeChannel.name}؟ لا يمكن التراجع.`)) return;
                      const { error } = await supabase.from("messages").delete().eq("channel_id", activeChannel.id);
                      if (error) return toast.error(error.message);
                      toast.success("تم حذف كل الرسائل");
                      qc.invalidateQueries({ queryKey: ["messages", activeChannel.id] });
                    }}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition"
                  >
                    <Trash className="size-4" />
                  </button>
                </>
              )}
              {server && userId && (
                <ServerSettingsDialog
                  serverId={serverId}
                  serverName={server.name}
                  ownerId={server.owner_id}
                  currentUserId={userId}
                />
              )}
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages?.length === 0 && (
              <div className="text-center text-muted-foreground py-20">
                <Hash className="size-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">بداية #{activeChannel?.name}. اكتب أول رسالة!</p>
              </div>
            )}
            {messages?.map((m) => {
              const canDelete = userId && (m.user_id === userId || isStaff);
              const memberRole = roleFor(m.user_id);
              const isOwnerMsg = memberRole === "owner";
              const isAdminMsg = memberRole === "admin";
              const isModMsg = memberRole === "moderator";
              const isPrivileged = isAdminUsername(m.profile?.username) || isOwnerMsg || isAdminMsg;
              const highlight = isPrivileged
                ? "bg-primary/5 border-r-2 border-primary/60"
                : isModMsg
                ? "bg-blue-500/5 border-r-2 border-blue-400/50"
                : "";
              const avatarRing = isPrivileged
                ? "ring-2 ring-primary shadow-[0_0_12px_rgba(212,170,80,0.55)]"
                : isModMsg
                ? "ring-2 ring-blue-400/70"
                : "";
              const nameColor = isPrivileged
                ? "text-primary"
                : isModMsg
                ? "text-blue-300"
                : "hover:text-primary";
              return (
              <div key={m.id} className={"flex gap-3 group hover:bg-surface/40 -mx-2 px-2 py-1 rounded " + highlight}>
                <ProfilePopover userId={m.user_id}>
                  <button className={"size-10 rounded-full bg-gradient-gold flex items-center justify-center font-bold text-primary-foreground shrink-0 overflow-hidden " + avatarRing}>
                    {m.profile?.avatar_url ? <img src={m.profile.avatar_url} alt="" className="size-full object-cover" /> : (m.profile?.display_name ?? "؟").slice(0, 1)}
                  </button>
                </ProfilePopover>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <ProfilePopover userId={m.user_id}>
                      <button className={"font-bold text-sm hover:underline " + nameColor}>{m.profile?.display_name || m.profile?.username || "لاعب"}</button>
                    </ProfilePopover>
                    <AdminBadge username={m.profile?.username} size="xs" />
                    <ServerRoleBadge role={memberRole} size="xs" />
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("ar", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm break-words whitespace-pre-wrap">{m.content}</p>
                </div>
                {canDelete && (
                  <button
                    onClick={async () => {
                      if (!confirm("حذف هذه الرسالة؟")) return;
                      const { error } = await supabase.from("messages").delete().eq("id", m.id);
                      if (error) toast.error(error.message);
                      else qc.invalidateQueries({ queryKey: ["messages", activeChannel?.id] });
                    }}
                    className="md:opacity-0 md:group-hover:opacity-100 transition text-muted-foreground hover:text-destructive shrink-0"
                    title="حذف الرسالة"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              );
            })}
          </div>

          <form onSubmit={send} className="p-4 border-t border-border">
            <div className={`flex items-center gap-2 rounded-xl bg-surface border px-4 py-2.5 transition ${muteRemainingLabel ? "border-destructive/40 opacity-70" : "border-border focus-within:border-primary/50"}`}>
              <input
                value={text} onChange={(e) => setText(e.target.value)}
                placeholder={muteRemainingLabel ? "أنت ممنوع من الإرسال حالياً" : `اكتب رسالة في #${activeChannel?.name ?? ""}`}
                className="flex-1 bg-transparent outline-none text-sm disabled:cursor-not-allowed"
                disabled={!activeChannel || !!muteRemainingLabel}
              />
              <button type="submit" disabled={!text.trim() || !!muteRemainingLabel} className="text-primary disabled:opacity-30">
                <Send className="size-4" />
              </button>
            </div>
            {muteRemainingLabel && (
              <p className="mt-2 text-xs text-destructive flex items-center gap-1.5">
                <Clock className="size-3" />
                ممنوع من إرسال الرسائل — يتبقى {muteRemainingLabel}
              </p>
            )}
          </form>
        </div>
        )}
      </div>
    </>
  );
}
