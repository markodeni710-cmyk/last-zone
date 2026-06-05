import { Mic, MicOff, PhoneOff, Volume2, Hand, Crown, Check, X, LogIn, VolumeX, UserPlus, Ban } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useVoiceCall, type Participant } from "./VoiceCallProvider";
import { useOnlineUsers } from "@/hooks/use-online-presence";
import { ProfilePopover } from "@/components/ProfilePopover";
import { ServerRoleBadge } from "@/components/ServerRoleBadge";
import { AdminBadge } from "@/components/AdminBadge";
import { isAdminUsername } from "@/lib/admin-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const KICK_DURATIONS: { label: string; minutes: number }[] = [
  { label: "5 دقائق", minutes: 5 },
  { label: "15 دقيقة", minutes: 15 },
  { label: "30 دقيقة", minutes: 30 },
  { label: "ساعة", minutes: 60 },
  { label: "6 ساعات", minutes: 360 },
  { label: "24 ساعة", minutes: 1440 },
];

type Props = {
  channelId: string;
  channelName: string;
  serverId: string;
  ownerId: string;
  currentUserId: string;
};

export function VoiceRoom({ channelId, channelName, serverId, ownerId, currentUserId }: Props) {
  const {
    activeCall, joined, joining, canPublish, micOn, speakingUids,
    participants: liveParticipants, isOwner: liveIsOwner, myRow,
    join, leave, toggleMic, toggleHand,
    setSpeakPermission, forceMute, kick, uidFor,
    muteAllActive, toggleMuteAll,
  } = useVoiceCall();

  const isThisCallActive = activeCall?.channelId === channelId && joined;

  // Preview query — shows participants without joining
  const qc = useQueryClient();
  const { data: previewParticipants } = useQuery({
    queryKey: ["voice-participants-preview", channelId],
    enabled: !isThisCallActive,
    queryFn: async () => {
      const { data } = await supabase
        .from("voice_room_participants")
        .select("*")
        .eq("channel_id", channelId)
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

  // Realtime for preview
  useEffect(() => {
    if (isThisCallActive) return;
    const ch = supabase
      .channel(`voice-preview-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_room_participants", filter: `channel_id=eq.${channelId}` },
        () => qc.invalidateQueries({ queryKey: ["voice-participants-preview", channelId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelId, isThisCallActive, qc]);

  const participants = isThisCallActive ? liveParticipants : previewParticipants;
  const isOwner = isThisCallActive ? liveIsOwner : currentUserId === ownerId;

  // Roles map for this server (used to show owner/admin/moderator badges next to participants)
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
    if (ownerId === uid) return "owner";
    return rolesMap?.[uid];
  };

  const handleJoin = () => join({ channelId, channelName, serverId, ownerId, currentUserId });

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0 overflow-x-hidden">
      <header className="min-h-14 border-b border-border flex items-center justify-between gap-2 px-3 sm:px-5 py-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Volume2 className="size-5 text-primary shrink-0" />
          <h3 className="font-bold truncate">{channelName}</h3>
          <span className="text-xs text-muted-foreground hidden sm:inline">• غرفة صوتية</span>
        </div>
        {isThisCallActive ? (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <InviteButton serverId={serverId} channelId={channelId} currentUserId={currentUserId} participants={participants ?? []} />
            {liveIsOwner && (
              <BansButton channelId={channelId} serverId={serverId} />
            )}
            {liveIsOwner && (
              <button
                onClick={toggleMuteAll}
                className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold transition ${
                  muteAllActive ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-surface/80"
                }`}
                title={muteAllActive ? "استعادة الأذونات" : "كتم الجميع"}
              >
                <VolumeX className="size-4" /> <span className="hidden sm:inline">{muteAllActive ? "استعادة" : "كتم الجميع"}</span>
              </button>
            )}
            <button
              onClick={toggleHand}
              className={`size-9 shrink-0 rounded-full flex items-center justify-center transition ${myRow?.hand_raised ? "bg-primary text-primary-foreground" : "bg-surface hover:bg-surface/80"}`}
              title="رفع اليد"
            >
              <Hand className="size-4" />
            </button>
            <button
              onClick={toggleMic}
              disabled={!canPublish}
              className={`size-9 shrink-0 rounded-full flex items-center justify-center transition ${
                !canPublish ? "bg-surface opacity-40 cursor-not-allowed" : micOn ? "bg-green-600 text-white" : "bg-surface hover:bg-surface/80"
              }`}
              title={canPublish ? (micOn ? "كتم" : "تشغيل المايك") : "بدون إذن"}
            >
              {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            </button>
            <button
              onClick={leave}
              className="h-9 px-3 sm:px-4 rounded-full bg-destructive text-destructive-foreground flex items-center gap-2 text-sm font-bold hover:bg-destructive/90"
            >
              <PhoneOff className="size-4" /> <span className="hidden sm:inline">مغادرة</span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleJoin}
            disabled={joining}
            className="h-9 px-4 rounded-full bg-gradient-gold text-primary-foreground flex items-center gap-2 text-sm font-bold disabled:opacity-50"
          >
            <LogIn className="size-4" /> {joining ? "جاري الانضمام..." : activeCall && activeCall.channelId !== channelId ? "الانتقال" : "انضم"}
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {(participants?.length ?? 0) === 0 ? (
          <div className="text-center text-muted-foreground py-20">
            <Volume2 className="size-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{isThisCallActive ? "لا أحد في الغرفة بعد." : "لا أحد في الغرفة حالياً. كن أول من ينضم!"}</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
              في الغرفة — {participants?.length}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {participants?.map((p) => {
                const isP = p.user_id === ownerId;
                const speaking = isThisCallActive && speakingUids.has(uidFor(p.user_id));
                const allowed = isP || p.can_speak;
                const pRole = roleFor(p.user_id);
                const pIsSiteAdmin = isAdminUsername(p.profile?.username ?? undefined);
                return (
                  <div
                    key={p.id}
                    className={`relative rounded-xl bg-surface border p-4 flex flex-col items-center gap-2 transition ${
                      speaking
                        ? "border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                        : pIsSiteAdmin
                          ? "border-primary/60 shadow-[0_0_14px_rgba(212,170,80,0.4)]"
                          : "border-border"
                    }`}
                  >
                    <div className="relative">
                      <ProfilePopover userId={p.user_id}>
                        <button type="button" className={"size-16 rounded-full bg-gradient-gold flex items-center justify-center font-bold text-primary-foreground text-xl overflow-hidden " + (pIsSiteAdmin ? "ring-2 ring-primary shadow-[0_0_10px_rgba(212,170,80,0.55)]" : "")}>
                          {p.profile?.avatar_url ? (
                            <img src={p.profile.avatar_url} alt="" className="size-full object-cover" />
                          ) : (
                            (p.profile?.display_name ?? p.profile?.username ?? "؟").slice(0, 1)
                          )}
                        </button>
                      </ProfilePopover>
                      {isP && <Crown className="absolute -top-1 -right-1 size-4 text-primary fill-primary" />}
                      {p.hand_raised && (
                        <div className="absolute -bottom-1 -right-1 size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                          <Hand className="size-3" />
                        </div>
                      )}
                    </div>
                    <ProfilePopover userId={p.user_id}>
                      <button type="button" className={"text-sm font-bold truncate w-full text-center hover:text-primary " + (pIsSiteAdmin ? "text-primary" : "")}>
                        {p.profile?.display_name || p.profile?.username || "لاعب"}
                      </button>
                    </ProfilePopover>
                    <div className="flex items-center gap-1 flex-wrap justify-center">
                      <AdminBadge username={p.profile?.username ?? undefined} size="xs" />
                      <ServerRoleBadge role={pRole} size="xs" />
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      {allowed ? (
                        p.is_muted ? (
                          <span className="flex items-center gap-1 text-muted-foreground"><MicOff className="size-3" /> مكتوم</span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-500"><Mic className="size-3" /> يتحدث</span>
                        )
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">مستمع</span>
                      )}
                    </div>
                    {isThisCallActive && isOwner && !isP && (
                      <div className="flex gap-1 mt-1 flex-wrap justify-center">
                        {p.can_speak ? (
                          <button
                            onClick={() => setSpeakPermission(p.id, false)}
                            className="px-2 py-1 rounded text-[10px] bg-destructive/15 text-destructive hover:bg-destructive/25 flex items-center gap-1"
                          >
                            <X className="size-3" /> سحب الإذن
                          </button>
                        ) : (
                          <button
                            onClick={() => setSpeakPermission(p.id, true)}
                            className="px-2 py-1 rounded text-[10px] bg-primary/15 text-primary hover:bg-primary/25 flex items-center gap-1"
                          >
                            <Check className="size-3" /> السماح بالتحدث
                          </button>
                        )}
                        {p.can_speak && !p.is_muted && (
                          <button
                            onClick={() => forceMute(p.id)}
                            className="px-2 py-1 rounded text-[10px] bg-surface hover:bg-surface/80 flex items-center gap-1"
                            title="كتم"
                          >
                            <MicOff className="size-3" /> كتم
                          </button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="px-2 py-1 rounded text-[10px] bg-surface hover:bg-destructive/15 hover:text-destructive"
                              title="طرد"
                            >
                              طرد
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>مدة الطرد</DropdownMenuLabel>
                            {KICK_DURATIONS.map((d) => (
                              <DropdownMenuItem
                                key={d.minutes}
                                onClick={() => kick(p.id, d.minutes)}
                              >
                                {d.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type MemberProfile = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

function InviteButton({
  serverId,
  channelId,
  currentUserId,
  participants,
}: {
  serverId: string;
  channelId: string;
  currentUserId: string;
  participants: Participant[];
}) {
  const { inviteUser } = useVoiceCall();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const onlineUsers = useOnlineUsers();

  const { data: members } = useQuery({
    queryKey: ["server-members-for-invite", serverId],
    enabled: open,
    queryFn: async () => {
      const { data: memberRows, error: membersError } = await supabase
        .from("server_members")
        .select("user_id")
        .eq("server_id", serverId);
      if (membersError) throw membersError;

      const userIds = (memberRows ?? []).map((r) => r.user_id);
      if (userIds.length === 0) return [] as MemberProfile[];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);
      if (profilesError) throw profilesError;

      const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
      return userIds.map((user_id) => {
        const profile = profileById.get(user_id);
        return {
          user_id,
          username: profile?.username ?? "",
          display_name: profile?.display_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
        };
      }) as MemberProfile[];
    },
  });

  const inRoom = new Set(participants.map((p) => p.user_id));
  const available = (members ?? [])
    .filter((m) => m.user_id !== currentUserId && !inRoom.has(m.user_id))
    .sort((a, b) => Number(onlineUsers.has(b.user_id)) - Number(onlineUsers.has(a.user_id)));

  const handleInvite = async (uid: string) => {
    await inviteUser(uid);
    setSent((s) => new Set(s).add(uid));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold bg-surface hover:bg-surface/80 transition"
          title="دعوة عضو"
        >
          <UserPlus className="size-4" /> دعوة
        </button>
      </DialogTrigger>
      <DialogContent className="bg-surface border-border">
        <DialogHeader>
          <DialogTitle>دعوة عضو إلى الغرفة</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto -mx-2">
          {available.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">لا يوجد أعضاء متاحون للدعوة</p>
          ) : (
            <ul className="space-y-1">
              {available.map((m) => {
                const isSent = sent.has(m.user_id);
                const isOnline = onlineUsers.has(m.user_id);
                return (
                  <li key={m.user_id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-background">
                    <div className="relative size-10 shrink-0">
                      <div className="size-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold overflow-hidden">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt="" className="size-full object-cover" />
                        ) : (
                          (m.display_name || m.username || "؟").slice(0, 1)
                        )}
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface ${
                          isOnline ? "bg-emerald-500" : "bg-muted-foreground/50"
                        }`}
                        title={isOnline ? "متصل الآن" : "غير متصل"}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{m.display_name || m.username}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        @{m.username} · {isOnline ? <span className="text-emerald-500">متصل الآن</span> : "غير متصل"}
                      </p>
                    </div>
                    <button
                      disabled={isSent || !isOnline}
                      onClick={() => handleInvite(m.user_id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                        isSent || !isOnline
                          ? "bg-surface text-muted-foreground cursor-not-allowed"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      }`}
                      title={!isOnline ? "العضو غير متصل" : ""}
                    >
                      {isSent ? "تم الإرسال" : !isOnline ? "غير متصل" : "دعوة"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type BanRow = {
  id: string;
  user_id: string;
  expires_at: string;
  profile?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function BansButton({ channelId, serverId }: { channelId: string; serverId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: bans } = useQuery({
    queryKey: ["voice-bans", channelId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("voice_room_bans")
        .select("*")
        .eq("channel_id", channelId)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: true });
      if (!data || data.length === 0) return [] as BanRow[];
      const ids = data.map((b) => b.user_id);
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return data.map((b) => ({
        ...b,
        profile: map.get(b.user_id)
          ? {
              username: map.get(b.user_id)!.username,
              display_name: map.get(b.user_id)!.display_name,
              avatar_url: map.get(b.user_id)!.avatar_url,
            }
          : null,
      })) as BanRow[];
    },
  });

  const unban = async (id: string) => {
    const { error } = await supabase.from("voice_room_bans").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إلغاء الطرد");
    qc.invalidateQueries({ queryKey: ["voice-bans", channelId] });
  };

  const remaining = (iso: string) => {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "انتهى";
    const mins = Math.ceil(ms / 60000);
    if (mins < 60) return `${mins} د`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `${hrs}س ${rem}د` : `${hrs}س`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold bg-surface hover:bg-surface/80 transition"
          title="المطرودون"
        >
          <Ban className="size-4" /> المطرودون
        </button>
      </DialogTrigger>
      <DialogContent className="bg-surface border-border">
        <DialogHeader>
          <DialogTitle>قائمة المطرودين</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto -mx-2">
          {(bans?.length ?? 0) === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">لا يوجد مطرودون حالياً</p>
          ) : (
            <ul className="space-y-1">
              {bans!.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-background">
                  <div className="size-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold overflow-hidden shrink-0">
                    {b.profile?.avatar_url ? (
                      <img src={b.profile.avatar_url} alt="" className="size-full object-cover" />
                    ) : (
                      (b.profile?.display_name || b.profile?.username || "؟").slice(0, 1)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{b.profile?.display_name || b.profile?.username || "لاعب"}</p>
                    <p className="text-[10px] text-muted-foreground">متبقي: {remaining(b.expires_at)}</p>
                  </div>
                  <button
                    onClick={() => unban(b.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    إلغاء الطرد
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
