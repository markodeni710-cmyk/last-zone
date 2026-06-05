import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, UserMinus, ShieldPlus, ShieldMinus, VolumeX, Volume2, LogOut, Crown, Shield, User as UserIcon, Check, X, Trash2, Ban, RotateCcw, KeyRound, Eye, EyeOff, Users, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ProfilePopover } from "@/components/ProfilePopover";

type Props = {
  serverId: string;
  serverName: string;
  ownerId: string;
  currentUserId: string;
};

type MemberRow = {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "moderator" | "member";
  joined_at: string;
  profile: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

const MUTE_DURATIONS = [
  { label: "دقيقة", minutes: 1 },
  { label: "10 دقائق", minutes: 10 },
  { label: "ساعة", minutes: 60 },
  { label: "24 ساعة", minutes: 1440 },
  { label: "دائم", minutes: 0 },
];

export function ServerSettingsDialog({ serverId, serverName, ownerId, currentUserId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("settings") === "open") {
      setOpen(true);
      params.delete("settings");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
      );
    }
  }, []);

  const isOwner = currentUserId === ownerId;

  const { data: myRole } = useQuery({
    queryKey: ["my-role", serverId, currentUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from("server_members")
        .select("role")
        .eq("server_id", serverId)
        .eq("user_id", currentUserId)
        .maybeSingle();
      return (data?.role ?? "member") as MemberRow["role"];
    },
  });

  const isStaff = isOwner || myRole === "admin" || myRole === "moderator";
  const isAdmin = isOwner || myRole === "admin";

  const { data: members } = useQuery({
    queryKey: ["server-members", serverId],
    enabled: open,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("server_members")
        .select("id, user_id, role, joined_at")
        .eq("server_id", serverId)
        .order("joined_at", { ascending: true });
      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profiles } = ids.length
        ? await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (rows ?? []).map((r) => ({
        ...r,
        role: r.role as MemberRow["role"],
        profile: map.get(r.user_id) ?? null,
      })) as MemberRow[];
    },
  });

  const { data: mutes } = useQuery({
    queryKey: ["server-mutes", serverId],
    enabled: open && isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("server_text_mutes")
        .select("user_id, expires_at")
        .eq("server_id", serverId);
      return data ?? [];
    },
  });

  const { data: joinRequests } = useQuery({
    queryKey: ["server-join-requests", serverId],
    enabled: open && isStaff,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("server_join_requests")
        .select("id, user_id, message, status, created_at")
        .eq("server_id", serverId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      const ids = (rows ?? []).map((r) => r.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (rows ?? []).map((r) => ({ ...r, profile: map.get(r.user_id) ?? null }));
    },
  });

  const { data: bans } = useQuery({
    queryKey: ["server-bans", serverId],
    enabled: open && isStaff,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("server_bans" as any)
        .select("id, user_id, reason, created_at")
        .eq("server_id", serverId)
        .order("created_at", { ascending: false });
      const ids = ((rows ?? []) as any[]).map((r) => r.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return ((rows ?? []) as any[]).map((r) => ({ ...r, profile: map.get(r.user_id) ?? null }));
    },
  });

  const { data: serverInfo, refetch: refetchServerInfo } = useQuery({
    queryKey: ["server-info-settings", serverId],
    enabled: open && isOwner,
    queryFn: async () => {
      const { data } = await supabase.from("servers").select("is_public, join_password").eq("id", serverId).maybeSingle();
      return data;
    },
  });

  const [showPw, setShowPw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [tab, setTab] = useState<"members" | "settings">("members");

  const updatePassword = async () => {
    if (!newPw || newPw.length < 4) { toast.error("كلمة المرور 4 خانات على الأقل"); return; }
    setSavingPw(true);
    const { error } = await supabase.from("servers").update({ join_password: newPw }).eq("id", serverId);
    setSavingPw(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تحديث كلمة المرور");
    setNewPw("");
    refetchServerInfo();
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["server-members", serverId] });
    qc.invalidateQueries({ queryKey: ["server-mutes", serverId] });
    qc.invalidateQueries({ queryKey: ["server-join-requests", serverId] });
    qc.invalidateQueries({ queryKey: ["server-bans", serverId] });
    qc.invalidateQueries({ queryKey: ["pending-requests-count"] });
  };

  const approveRequest = async (r: any) => {
    const { error: insErr } = await supabase
      .from("server_members")
      .insert({ server_id: serverId, user_id: r.user_id });
    if (insErr && insErr.code !== "23505") return toast.error(insErr.message);
    await supabase.from("server_join_requests").delete().eq("id", r.id);
    toast.success("تم قبول الطلب");
    refresh();
  };

  const rejectRequest = async (r: any) => {
    // Ban the user so the server disappears from their discovery until lifted
    const { error: banErr } = await supabase
      .from("server_bans" as any)
      .insert({ server_id: serverId, user_id: r.user_id, banned_by: currentUserId, reason: "رفض طلب الانضمام" });
    if (banErr && banErr.code !== "23505") return toast.error(banErr.message);
    const { error } = await supabase.from("server_join_requests").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("تم رفض الطلب وحظر المستخدم");
    refresh();
  };

  const unban = async (b: any) => {
    const { error } = await supabase.from("server_bans" as any).delete().eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success("تم رفع الحظر");
    refresh();
  };

  const deleteServer = async () => {
    if (!confirm(`هل أنت متأكد من حذف ${serverName} نهائياً؟ لا يمكن التراجع.`)) return;
    if (!confirm("تأكيد أخير: سيتم حذف جميع القنوات والرسائل.")) return;
    const { error } = await supabase.from("servers").delete().eq("id", serverId);
    if (error) return toast.error(error.message);
    toast.success("تم حذف السيرفر");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["my-servers"] });
    window.location.href = "/app";
  };

  const promote = async (m: MemberRow, role: "admin" | "moderator" | "member") => {
    const { error } = await supabase
      .from("server_members")
      .update({ role })
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    const label = role === "admin" ? "تمت الترقية إلى مدير مساعد" : role === "moderator" ? "تمت الترقية إلى مشرف" : "تم إلغاء الدور";
    toast.success(label);
    refresh();
  };

  const kick = async (m: MemberRow) => {
    if (!confirm(`طرد وحظر ${m.profile?.display_name || m.profile?.username || "العضو"}؟`)) return;
    // Ban first so they can't immediately rejoin
    const { error: banErr } = await supabase
      .from("server_bans" as any)
      .insert({ server_id: serverId, user_id: m.user_id, banned_by: currentUserId, reason: "طرد من السيرفر" });
    if (banErr && banErr.code !== "23505") return toast.error(banErr.message);
    const { error } = await supabase.from("server_members").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("تم الطرد والحظر");
    refresh();
  };

  const mute = async (m: MemberRow, minutes: number) => {
    const expires_at = minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
    const { error } = await supabase
      .from("server_text_mutes")
      .upsert(
        { server_id: serverId, user_id: m.user_id, muted_by: currentUserId, expires_at },
        { onConflict: "server_id,user_id" },
      );
    if (error) return toast.error(error.message);
    toast.success("تم تقييد العضو");
    refresh();
  };

  const unmute = async (m: MemberRow) => {
    const { error } = await supabase
      .from("server_text_mutes")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("server_id", serverId)
      .eq("user_id", m.user_id);
    if (error) return toast.error(error.message);
    toast.success("تم إلغاء التقييد");
    refresh();
  };

  const leaveServer = async () => {
    if (!confirm(`هل تريد فعلاً مغادرة ${serverName}؟`)) return;
    const { error } = await supabase
      .from("server_members")
      .delete()
      .eq("server_id", serverId)
      .eq("user_id", currentUserId);
    if (error) return toast.error(error.message);
    toast.success("غادرت السيرفر");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["my-servers"] });
    window.location.href = "/app";
  };

  const isMuted = (userId: string) => {
    const m = mutes?.find((x) => x.user_id === userId);
    if (!m) return false;
    if (!m.expires_at) return true;
    return new Date(m.expires_at).getTime() > Date.now();
  };

  const tabBase = "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-bold rounded-md transition";
  const tabActive = "bg-primary/20 text-primary";
  const tabInactive = "text-muted-foreground hover:text-foreground hover:bg-background/50";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button title="إعدادات السيرفر" className="text-muted-foreground hover:text-foreground transition">
          <Settings className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-surface border-border max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="display text-2xl text-right">{serverName}</DialogTitle>
          <p className="text-xs text-muted-foreground text-right">
            {members?.length ?? 0} عضو
          </p>
        </DialogHeader>

        <div className="flex gap-2 border-b border-border pb-2 -mx-2 px-2">
          <button
            onClick={() => setTab("members")}
            className={`${tabBase} ${tab === "members" ? tabActive : tabInactive}`}
          >
            <Users className="size-4" />
            الأعضاء
          </button>
          <button
            onClick={() => setTab("settings")}
            className={`${tabBase} ${tab === "settings" ? tabActive : tabInactive}`}
          >
            <Lock className="size-4" />
            الإعدادات
          </button>
        </div>

        {tab === "members" && (
          <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2">
            {isStaff && joinRequests && joinRequests.length > 0 && (
              <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-bold text-primary mb-2">طلبات الانضمام ({joinRequests.length})</p>
                <div className="space-y-2">
                  {joinRequests.map((r: any) => (
                    <div key={r.id} className="flex items-start gap-2 p-2 rounded-md bg-background/60">
                      <ProfilePopover userId={r.user_id}>
                        <button type="button" className="size-8 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground text-xs font-bold overflow-hidden shrink-0">
                          {r.profile?.avatar_url
                            ? <img src={r.profile.avatar_url} alt="" className="size-full object-cover" />
                            : (r.profile?.display_name ?? r.profile?.username ?? "؟").slice(0, 1)}
                        </button>
                      </ProfilePopover>
                      <div className="flex-1 min-w-0">
                        <ProfilePopover userId={r.user_id}>
                          <button type="button" className="text-xs font-bold truncate hover:text-primary text-right block max-w-full">{r.profile?.display_name || r.profile?.username || "لاعب"}</button>
                        </ProfilePopover>
                        {r.message && <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap">{r.message}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => approveRequest(r)} title="قبول" className="size-7 rounded-md bg-primary/20 text-primary hover:bg-primary/30 flex items-center justify-center">
                          <Check className="size-3.5" />
                        </button>
                        <button onClick={() => rejectRequest(r)} title="رفض" className="size-7 rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30 flex items-center justify-center">
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {members?.map((m) => {
              const isSelf = m.user_id === currentUserId;
              const isMemberOwner = m.role === "owner";
              const isMemberAdmin = m.role === "admin";
              // Owner can manage anyone (except themselves & other owners).
              // Admin can manage only non-owner / non-admin members.
              const canManage =
                !isSelf &&
                !isMemberOwner &&
                (isOwner || (isAdmin && !isMemberAdmin));
              const muted = isMuted(m.user_id);
              return (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-background/50">
                  <ProfilePopover userId={m.user_id}>
                    <button type="button" className="size-10 rounded-full bg-gradient-gold flex items-center justify-center font-bold text-primary-foreground overflow-hidden shrink-0">
                      {m.profile?.avatar_url
                        ? <img src={m.profile.avatar_url} alt="" className="size-full object-cover" />
                        : (m.profile?.display_name ?? m.profile?.username ?? "؟").slice(0, 1)}
                    </button>
                  </ProfilePopover>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <ProfilePopover userId={m.user_id}>
                        <button type="button" className="font-bold text-sm truncate hover:text-primary text-right">
                          {m.profile?.display_name || m.profile?.username || "لاعب"}
                        </button>
                      </ProfilePopover>
                      {m.role === "owner" && <Crown className="size-3.5 text-primary shrink-0" />}
                      {m.role === "admin" && <Shield className="size-3.5 text-amber-400 shrink-0" />}
                      {m.role === "moderator" && <Shield className="size-3.5 text-blue-400 shrink-0" />}
                      {muted && <VolumeX className="size-3.5 text-destructive shrink-0" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {m.role === "owner" ? "المالك" : m.role === "admin" ? "مدير مساعد" : m.role === "moderator" ? "مشرف" : "عضو"}
                    </p>
                  </div>

                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="px-2 py-1.5 rounded-md bg-background/60 hover:bg-background text-xs">
                          إدارة
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-surface border-border">
                        {isOwner && m.role !== "admin" && (
                          <DropdownMenuItem onClick={() => promote(m, "admin")}>
                            <Crown className="size-4 ml-2" /> ترقية إلى مدير مساعد
                          </DropdownMenuItem>
                        )}
                        {isOwner && m.role === "admin" && (
                          <DropdownMenuItem onClick={() => promote(m, "member")}>
                            <ShieldMinus className="size-4 ml-2" /> إلغاء المدير المساعد
                          </DropdownMenuItem>
                        )}
                        {m.role !== "admin" && m.role !== "moderator" && (
                          <DropdownMenuItem onClick={() => promote(m, "moderator")}>
                            <ShieldPlus className="size-4 ml-2" /> ترقية إلى مشرف
                          </DropdownMenuItem>
                        )}
                        {m.role === "moderator" && (
                          <DropdownMenuItem onClick={() => promote(m, "member")}>
                            <ShieldMinus className="size-4 ml-2" /> إلغاء الإشراف
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {muted ? (
                          <DropdownMenuItem onClick={() => unmute(m)}>
                            <Volume2 className="size-4 ml-2" /> إلغاء التقييد
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuLabel className="text-[10px]">تقييد الإرسال</DropdownMenuLabel>
                            {MUTE_DURATIONS.map((d) => (
                              <DropdownMenuItem key={d.label} onClick={() => mute(m, d.minutes)}>
                                <VolumeX className="size-4 ml-2" /> {d.label}
                              </DropdownMenuItem>
                            ))}
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => kick(m)} className="text-destructive focus:text-destructive">
                          <UserMinus className="size-4 ml-2" /> طرد من السيرفر
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}

            {isStaff && bans && bans.length > 0 && (
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-bold text-destructive mb-2 flex items-center gap-1">
                  <Ban className="size-3" /> المحظورون ({bans.length})
                </p>
                <div className="space-y-2">
                  {bans.map((b: any) => (
                    <div key={b.id} className="flex items-center gap-2 p-2 rounded-md bg-background/60">
                      <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
                        {b.profile?.avatar_url
                          ? <img src={b.profile.avatar_url} alt="" className="size-full object-cover" />
                          : (b.profile?.display_name ?? b.profile?.username ?? "؟").slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{b.profile?.display_name || b.profile?.username || "مستخدم"}</p>
                        {b.reason && <p className="text-[10px] text-muted-foreground truncate">{b.reason}</p>}
                      </div>
                      {isOwner && (
                        <button onClick={() => unban(b)} title="رفع الحظر" className="px-2 py-1 rounded-md bg-primary/20 text-primary hover:bg-primary/30 text-[10px] font-bold flex items-center gap-1">
                          <RotateCcw className="size-3" /> رفع الحظر
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="flex-1 overflow-y-auto space-y-3 -mx-2 px-2">
            {!isOwner && (
              <button
                onClick={leaveServer}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition text-sm font-bold"
              >
                <LogOut className="size-4" />
                مغادرة السيرفر
              </button>
            )}
            {isOwner && serverInfo && serverInfo.is_public === false && (
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-xs font-bold mb-2 flex items-center gap-1.5"><KeyRound className="size-3.5 text-primary" /> كلمة مرور الانضمام</p>
                <div className="flex items-center gap-2 mb-2 rounded-md bg-background/60 border border-border px-3 py-2">
                  <span className="text-[10px] text-muted-foreground">الحالية:</span>
                  <span className="text-sm font-mono flex-1 truncate">
                    {showPw ? (serverInfo.join_password || "—") : "••••••••"}
                  </span>
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="كلمة مرور جديدة (4 خانات على الأقل)"
                    className="flex-1 rounded-md bg-input border border-border px-3 py-2 text-sm"
                  />
                  <button
                    onClick={updatePassword}
                    disabled={savingPw}
                    className="px-4 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold whitespace-nowrap"
                  >
                    {savingPw ? "..." : "تغيير"}
                  </button>
                </div>
              </div>
            )}
            {isOwner && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <button
                  onClick={deleteServer}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition text-sm font-bold"
                >
                  <Trash2 className="size-4" />
                  حذف السيرفر نهائياً
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
