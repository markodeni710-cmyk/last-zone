import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Users, Ban, ShieldOff, Trash2, Search, UserPlus, Check, X, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfilePopover } from "@/components/ProfilePopover";
import { AdminBadge } from "@/components/AdminBadge";
import { ADMIN_USERNAMES, isAdminUsername } from "@/lib/admin-utils";
import { unblockUser, deleteDmThread, acceptFriendRequest, rejectFriendRequest, cancelFriendRequest } from "@/lib/friends";
import { useOnlineUsers } from "@/hooks/use-online-presence";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/app/friends")({
  component: FriendsPage,
});

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null; last_seen_at?: string | null };
type Tab = "friends" | "requests" | "messages" | "blocked";
type ReqSubTab = "incoming" | "sent";

function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return "غير متصل";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "نشط الآن";
  if (m < 60) return `آخر ظهور قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `آخر ظهور قبل ${h} س`;
  const d = Math.floor(h / 24);
  if (d === 1) return "آخر ظهور قبل يوم";
  if (d === 2) return "آخر ظهور قبل يومين";
  if (d <= 10) return `آخر ظهور قبل ${d} أيام`;
  return `آخر ظهور قبل ${d} يوم`;
}

function FriendsPage() {
  const qc = useQueryClient();
  const onlineUsers = useOnlineUsers();
  const [me, setMe] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("friends");
  const [reqSubTab, setReqSubTab] = useState<ReqSubTab>("incoming");
  const [search, setSearch] = useState("");
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)); }, []);

  const { data: friends } = useQuery({
    queryKey: ["my-friends", me],
    enabled: !!me,
    queryFn: async () => {
      const { data: fs } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
      const otherIds = (fs ?? []).map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id));
      const [friendsResult, adminResult] = await Promise.all([
        otherIds.length
          ? supabase.from("profiles").select("id, username, display_name, avatar_url, last_seen_at").in("id", otherIds)
          : Promise.resolve({ data: [] as Profile[] }),
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, last_seen_at")
          .ilike("username", ADMIN_USERNAMES[0])
          .neq("id", me!)
          .maybeSingle(),
      ]);
      const byId = new Map<string, Profile>();
      ([...(friendsResult.data ?? []), adminResult.data].filter(Boolean) as Profile[]).forEach((p) => byId.set(p.id, p));
      return Array.from(byId.values()).sort((a, b) => Number(isAdminUsername(b.username)) - Number(isAdminUsername(a.username)));
    },
  });

  const { data: requests } = useQuery({
    queryKey: ["my-friend-requests", me],
    enabled: !!me,
    queryFn: async () => {
      const { data: fs } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status, created_at")
        .eq("status", "pending")
        .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
      const ids = Array.from(new Set((fs ?? []).map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id))));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
        : { data: [] as Profile[] };
      const map = new Map((profs ?? []).map((p) => [p.id, p as Profile]));
      const incoming = (fs ?? []).filter((f) => f.addressee_id === me).map((f) => ({ id: f.id, profile: map.get(f.requester_id) }));
      const outgoing = (fs ?? []).filter((f) => f.requester_id === me).map((f) => ({ id: f.id, profile: map.get(f.addressee_id) }));
      return { incoming, outgoing };
    },
  });

  const { data: unreadByFriend } = useQuery({
    queryKey: ["dm-unread", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase
        .from("direct_messages")
        .select("sender_id")
        .neq("sender_id", me!)
        .is("read_at", null);
      const m = new Map<string, number>();
      (data ?? []).forEach((r) => m.set(r.sender_id, (m.get(r.sender_id) ?? 0) + 1));
      return m;
    },
  });

  useEffect(() => {
    if (!me) return;
    const ch = supabase
      .channel(`friends-unread-${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" },
        () => qc.invalidateQueries({ queryKey: ["dm-unread", me] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" },
        () => {
          qc.invalidateQueries({ queryKey: ["my-friends", me] });
          qc.invalidateQueries({ queryKey: ["my-friend-requests", me] });
          qc.invalidateQueries({ queryKey: ["my-dm-threads", me] });
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_blocks" },
        () => {
          qc.invalidateQueries({ queryKey: ["my-friends", me] });
          qc.invalidateQueries({ queryKey: ["my-blocks", me] });
          qc.invalidateQueries({ queryKey: ["my-dm-threads", me] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [me, qc]);


  const { data: threads } = useQuery({
    queryKey: ["my-dm-threads", me],
    enabled: !!me && tab === "messages",
    queryFn: async () => {
      const { data } = await supabase
        .from("dm_threads")
        .select("id, user_a, user_b, accepted, last_message_at, initiator_id")
        .or(`user_a.eq.${me},user_b.eq.${me}`)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      const list = data ?? [];
      const otherIds = list.map((t) => (t.user_a === me ? t.user_b : t.user_a));
      const { data: profs } = otherIds.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", otherIds)
        : { data: [] as Profile[] };
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return list.map((t) => ({
        ...t,
        other: map.get(t.user_a === me ? t.user_b : t.user_a) as Profile | undefined,
      }));
    },
  });

  const { data: blocked } = useQuery({
    queryKey: ["my-blocks", me],
    enabled: !!me && tab === "blocked",
    queryFn: async () => {
      const { data } = await supabase
        .from("user_blocks")
        .select("id, blocked_id, created_at")
        .eq("blocker_id", me!);
      const ids = (data ?? []).map((b) => b.blocked_id);
      if (!ids.length) return [] as Array<{ id: string; profile: Profile | undefined }>;
      const { data: profs } = await supabase
        .from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p as Profile]));
      return (data ?? []).map((b) => ({ id: b.id, profile: map.get(b.blocked_id) }));
    },
  });

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends ?? [];
    return (friends ?? []).filter((f) =>
      (f.display_name ?? "").toLowerCase().includes(q) ||
      (f.username ?? "").toLowerCase().includes(q)
    );
  }, [friends, search]);

  const reqCount = (requests?.incoming.length ?? 0) + (requests?.outgoing.length ?? 0);

  const TabBtn = ({ id, label, icon: Icon, badge }: { id: Tab; label: string; icon: typeof Users; badge?: number }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition relative ${
        tab === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface"
      }`}
    >
      <Icon className="size-4" /> {label}
      {!!badge && badge > 0 && (
        <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-3">
          <h1 className="display text-4xl flex items-center gap-3">
            <Users className="size-8 text-primary" /> <span>الأصدقاء</span>
          </h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="إعدادات الأصدقاء"
                className="relative size-10 rounded-full bg-surface/60 border border-border hover:bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground transition"
              >
                <Settings className="size-5" />
                {reqCount > 0 && (
                  <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1 border border-background">
                    {reqCount > 9 ? "9+" : reqCount}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>الإدارة</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setTab("requests")}>
                <UserPlus className="size-4 ml-2" />
                <span className="flex-1">طلبات الصداقة</span>
                {reqCount > 0 && (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                    {reqCount > 9 ? "9+" : reqCount}
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTab("blocked")}>
                <Ban className="size-4 ml-2" />
                <span className="flex-1">المحظورون</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap gap-2 p-1 rounded-xl bg-surface/40 border border-border mb-4">
          <TabBtn id="friends" label={`الأصدقاء (${friends?.length ?? 0})`} icon={Users} />
          <TabBtn id="messages" label="المحادثات" icon={MessageCircle} />
        </div>

        {(tab === "requests" || tab === "blocked") && (
          <div className="mb-4 flex items-center justify-between p-3 rounded-xl bg-surface/40 border border-border">
            <div className="flex items-center gap-2 text-sm font-bold">
              {tab === "requests" ? <UserPlus className="size-4 text-primary" /> : <Ban className="size-4 text-primary" />}
              <span>{tab === "requests" ? "طلبات الصداقة" : "المحظورون"}</span>
            </div>
            <button
              onClick={() => setTab("friends")}
              className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X className="size-3.5" /> إغلاق
            </button>
          </div>
        )}

        {tab === "friends" && (
          <>
            <div className="relative mb-4">
              <Search className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو المعرف (@username)..."
                className="w-full rounded-xl bg-input border border-border pr-10 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <section>
              <div className="grid sm:grid-cols-2 gap-3">
                {filteredFriends.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-2">
                    {search ? "لا توجد نتائج مطابقة." : "لا يوجد أصدقاء بعد. اضغط على اسم/صورة أي لاعب لإرسال طلب صداقة."}
                  </p>
                )}
                {filteredFriends.map((f) => {
                  const unread = unreadByFriend?.get(f.id) ?? 0;
                  const online = onlineUsers.has(f.id);
                  return (
                    <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface/60">
                      <ProfilePopover userId={f.id}>
                        <button className={"relative size-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold overflow-hidden " + (isAdminUsername(f.username) ? "ring-2 ring-primary shadow-[0_0_10px_rgba(212,170,80,0.5)]" : "")}>
                          {f.avatar_url ? <img src={f.avatar_url} alt="" className="size-full object-cover" /> : (f.display_name ?? "؟").slice(0, 1)}
                          <span className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface ${online ? "bg-green-500" : "bg-muted-foreground/50"}`} />
                        </button>
                      </ProfilePopover>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <ProfilePopover userId={f.id}>
                            <button className={"font-bold text-sm hover:text-primary truncate text-right flex items-center gap-1.5 " + (isAdminUsername(f.username) ? "text-primary" : "")}>
                              <span className="truncate">{f.display_name || f.username}</span>
                              <AdminBadge username={f.username} size="xs" />
                            </button>
                          </ProfilePopover>
                          {unread > 0 && (
                            <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                              {unread > 9 ? "9+" : unread}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">@{f.username}</div>
                        {!isAdminUsername(f.username) && (
                          <div className={`text-[10px] font-bold truncate ${online ? "text-green-500" : "text-muted-foreground"}`}>
                            {online ? "متصل الآن" : formatLastSeen(f.last_seen_at)}
                          </div>
                        )}
                      </div>
                      <Link to="/app/dm/$userId" params={{ userId: f.id }}
                        className="relative size-9 rounded-md bg-primary/15 text-primary hover:bg-primary/25 flex items-center justify-center">
                        <MessageCircle className="size-4" />
                        {unread > 0 && (
                          <span className="absolute -top-1 -left-1 min-w-[16px] h-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-1 border border-sidebar">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {tab === "requests" && (
          <section className="space-y-4">
            <div className="flex gap-2 p-1 rounded-xl bg-surface/40 border border-border">
              <button
                onClick={() => setReqSubTab("incoming")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition ${
                  reqSubTab === "incoming" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface"
                }`}
              >
                الطلبات الواردة
                {(requests?.incoming.length ?? 0) > 0 && (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                    {requests!.incoming.length > 9 ? "9+" : requests!.incoming.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setReqSubTab("sent")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition ${
                  reqSubTab === "sent" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface"
                }`}
              >
                الطلبات المُرسلة
                {(requests?.outgoing.length ?? 0) > 0 && (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                    {requests!.outgoing.length > 9 ? "9+" : requests!.outgoing.length}
                  </span>
                )}
              </button>
            </div>

            {reqSubTab === "incoming" && (
              <div className="space-y-2">
                {(requests?.incoming.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات واردة.</p>}
                {requests?.incoming.map((r) => r.profile && (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface/60">
                    <ProfilePopover userId={r.profile.id}>
                      <button className={"size-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold overflow-hidden " + (isAdminUsername(r.profile.username) ? "ring-2 ring-primary shadow-[0_0_10px_rgba(212,170,80,0.5)]" : "")}>
                        {r.profile.avatar_url ? <img src={r.profile.avatar_url} alt="" className="size-full object-cover" /> : (r.profile.display_name ?? "؟").slice(0, 1)}
                      </button>
                    </ProfilePopover>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate flex items-center gap-1.5">
                        <span className={isAdminUsername(r.profile.username) ? "text-primary" : ""}>{r.profile.display_name || r.profile.username}</span>
                        <AdminBadge username={r.profile.username} size="xs" />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">@{r.profile.username}</div>
                    </div>
                    <button
                      onClick={async () => {
                        try { await acceptFriendRequest(r.id); toast.success("تم قبول الطلب"); }
                        catch (e) { toast.error((e as Error).message); }
                      }}
                      className="size-9 rounded-md bg-primary/15 text-primary hover:bg-primary/25 flex items-center justify-center"
                      aria-label="قبول"
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      onClick={async () => {
                        try { await rejectFriendRequest(r.id); toast.success("تم الرفض"); }
                        catch (e) { toast.error((e as Error).message); }
                      }}
                      className="size-9 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center"
                      aria-label="رفض"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {reqSubTab === "sent" && (
              <div className="space-y-2">
                {(requests?.outgoing.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">لا توجد طلبات مُرسلة.</p>}
                {requests?.outgoing.map((r) => r.profile && (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface/60">
                    <ProfilePopover userId={r.profile.id}>
                      <button className={"size-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold overflow-hidden " + (isAdminUsername(r.profile.username) ? "ring-2 ring-primary shadow-[0_0_10px_rgba(212,170,80,0.5)]" : "")}>
                        {r.profile.avatar_url ? <img src={r.profile.avatar_url} alt="" className="size-full object-cover" /> : (r.profile.display_name ?? "؟").slice(0, 1)}
                      </button>
                    </ProfilePopover>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate flex items-center gap-1.5">
                        <span className={isAdminUsername(r.profile.username) ? "text-primary" : ""}>{r.profile.display_name || r.profile.username}</span>
                        <AdminBadge username={r.profile.username} size="xs" />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">@{r.profile.username} · بانتظار الرد</div>
                    </div>
                    <button
                      onClick={async () => {
                        try { await cancelFriendRequest(r.id); toast.success("تم الإلغاء"); }
                        catch (e) { toast.error((e as Error).message); }
                      }}
                      className="px-3 py-1.5 rounded-md bg-surface border border-border text-xs font-bold hover:bg-background"
                    >
                      إلغاء
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "messages" && (
          <section>
            <div className="space-y-2">
              {threads?.length === 0 && <p className="text-sm text-muted-foreground">لا توجد محادثات.</p>}
              {threads?.map((t) => t.other && (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface/60 hover:bg-surface transition">
                  <Link to="/app/dm/$userId" params={{ userId: t.other.id }} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={"size-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold overflow-hidden " + (isAdminUsername(t.other.username) ? "ring-2 ring-primary shadow-[0_0_10px_rgba(212,170,80,0.5)]" : "")}>
                      {t.other.avatar_url ? <img src={t.other.avatar_url} alt="" className="size-full object-cover" /> : (t.other.display_name ?? "؟").slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate flex items-center gap-1.5">
                        <span className={isAdminUsername(t.other.username) ? "text-primary" : ""}>{t.other.display_name || t.other.username}</span>
                        <AdminBadge username={t.other.username} size="xs" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.accepted ? "محادثة مفتوحة" : t.initiator_id === me ? "بانتظار القبول" : "طلب مراسلة جديد"}
                      </div>
                    </div>
                  </Link>
                  {!isAdminUsername(t.other.username) && (
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        if (!confirm("حذف هذه الدردشة؟")) return;
                        try {
                          await deleteDmThread(t.id);
                          toast.success("تم الحذف");
                          qc.invalidateQueries({ queryKey: ["my-dm-threads"] });
                        } catch (err) { toast.error((err as Error).message); }
                      }}
                      className="size-9 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center shrink-0"
                      aria-label="حذف الدردشة"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "blocked" && (
          <section>
            <div className="space-y-2">
              {blocked?.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد مستخدمون محظورون.</p>}
              {blocked?.map((b) => b.profile && (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface/60">
                  <div className="size-10 rounded-full bg-surface flex items-center justify-center text-muted-foreground overflow-hidden">
                    {b.profile.avatar_url ? <img src={b.profile.avatar_url} alt="" className="size-full object-cover opacity-50" /> : (b.profile.display_name ?? "؟").slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{b.profile.display_name || b.profile.username}</div>
                    <div className="text-xs text-muted-foreground truncate">@{b.profile.username}</div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await unblockUser(b.id);
                        toast.success("تم إلغاء الحظر");
                        qc.invalidateQueries({ queryKey: ["my-blocks"] });
                      } catch (e) { toast.error((e as Error).message); }
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-surface border border-border text-xs font-bold hover:bg-background"
                  >
                    <ShieldOff className="size-3.5" /> إلغاء الحظر
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
