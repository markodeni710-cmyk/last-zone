import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Plus, Compass, Trophy, Users, LogOut, Hash, Flame, UserCircle2, Menu, UserPlus, Shield, ShoppingCart, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { VoiceCallProvider, useVoiceCall } from "@/components/VoiceCallProvider";
import { DmCallProvider } from "@/components/DmCallProvider";
import { useTrackOnlinePresence } from "@/hooks/use-online-presence";
import { NotificationsBell } from "@/components/NotificationsBell";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShellWithProvider,
});

function AppShellWithProvider() {
  return (
    <VoiceCallProvider>
      <DmCallProvider>
        <AppShell />
      </DmCallProvider>
    </VoiceCallProvider>
  );
}

type ServerRow = { id: string; name: string; icon_url: string | null; owner_id: string };

const navItems = [
  { to: "/app", icon: Compass, label: "اكتشف", short: "اكتشف" },
  { to: "/app/feed", icon: Flame, label: "اللقطات", short: "اللقطات" },
  { to: "/app/friends", icon: UserPlus, label: "الأصدقاء", short: "أصدقاء" },
  { to: "/app/squads", icon: Users, label: "سكواد", short: "سكواد" },
  { to: "/app/tournaments", icon: Trophy, label: "بطولات", short: "بطولات" },
  { to: "/app/profile", icon: UserCircle2, label: "بروفايلي", short: "أنا" },
];

function playSoftBeep() {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "triangle";
    o.frequency.setValueAtTime(660, ctx.currentTime);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    o.start();
    o.stop(ctx.currentTime + 0.22);
    setTimeout(() => ctx.close(), 400);
  } catch { /* ignore */ }
}

function AppShell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const [serverSheetOpen, setServerSheetOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const currentPathRef = useRef(currentPath);
  const globalMsgChannelIdRef = useRef<string>(`global-msg-watch-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null)).catch(() => setUserId(null));
  }, []);

  const { data: meProfile } = useQuery({
    queryKey: ["my-username", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("username").eq("id", userId!).maybeSingle();
      return data;
    },
  });
  const isAdmin = meProfile?.username === "moniromran";

  useTrackOnlinePresence(userId);

  // Heartbeat: update last_seen_at periodically while user is active
  useEffect(() => {
    if (!userId) return;
    const beat = () => { supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId).then(() => {}); };
    beat();
    const t = window.setInterval(beat, 60_000);
    const onHide = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onHide); };
  }, [userId]);

  const { data: myServers } = useQuery({
    queryKey: ["my-servers", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: memberRows }, { data: ownedRows }] = await Promise.all([
        supabase
          .from("server_members")
          .select("server:servers(id, name, icon_url, owner_id)")
          .eq("user_id", userId!),
        supabase
          .from("servers")
          .select("id, name, icon_url, owner_id")
          .eq("owner_id", userId!),
      ]);
      const map = new Map<string, ServerRow>();
      (memberRows ?? []).forEach((r) => {
        const server = r.server as unknown as ServerRow | null;
        if (server) map.set(server.id, server);
      });
      (ownedRows ?? []).forEach((server) => map.set(server.id, server as ServerRow));
      return Array.from(map.values());
    },
  });

  // Server ids where current user is owner or moderator (for join requests bell)
  const { data: staffServerIds } = useQuery({
    queryKey: ["staff-server-ids", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: staffRows }, { data: ownedRows }] = await Promise.all([
        supabase
          .from("server_members")
          .select("server_id, role")
          .eq("user_id", userId!)
          .in("role", ["owner", "admin", "moderator"]),
        supabase
          .from("servers")
          .select("id")
          .eq("owner_id", userId!),
      ]);
      return Array.from(new Set([
        ...(staffRows ?? []).map((r) => r.server_id),
        ...(ownedRows ?? []).map((r) => r.id),
      ]));
    },
  });

  // Map: serverId -> text channel ids (for unread counts)
  const { data: serverChannels } = useQuery({
    queryKey: ["my-server-channels", (myServers ?? []).map((s) => s.id).join(",")],
    enabled: !!myServers && myServers.length > 0,
    queryFn: async () => {
      const ids = (myServers ?? []).map((s) => s.id);
      const { data } = await supabase
        .from("channels").select("id, server_id, type").in("server_id", ids).eq("type", "text");
      const map: Record<string, string[]> = {};
      (data ?? []).forEach((c) => {
        if (!map[c.server_id]) map[c.server_id] = [];
        map[c.server_id].push(c.id);
      });
      return map;
    },
  });

  // Unread message counts per server
  const { data: unreadByServer } = useQuery({
    queryKey: ["unread-by-server", userId, Object.keys(serverChannels ?? {}).join(",")],
    enabled: !!userId && !!serverChannels,
    queryFn: async () => {
      const allChannelIds = Object.values(serverChannels ?? {}).flat();
      if (!allChannelIds.length) return {} as Record<string, number>;
      const [{ data: reads }, { data: msgs }] = await Promise.all([
        supabase.from("channel_reads").select("channel_id, last_read_at").eq("user_id", userId!),
        supabase.from("messages").select("channel_id, created_at, user_id")
          .in("channel_id", allChannelIds)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      const readMap = new Map((reads ?? []).map((r) => [r.channel_id, new Date(r.last_read_at).getTime()]));
      const perChannel: Record<string, number> = {};
      (msgs ?? []).forEach((m) => {
        if (m.user_id === userId) return;
        const t = new Date(m.created_at).getTime();
        const lr = readMap.get(m.channel_id) ?? 0;
        if (t > lr) perChannel[m.channel_id] = (perChannel[m.channel_id] ?? 0) + 1;
      });
      const result: Record<string, number> = {};
      Object.entries(serverChannels ?? {}).forEach(([sid, chIds]) => {
        result[sid] = chIds.reduce((a, c) => a + (perChannel[c] ?? 0), 0);
      });
      return result;
    },
  });

  // Realtime: invalidate unread when new messages arrive in user's channels; play sound
  const watchedChannelsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    watchedChannelsRef.current = new Set(Object.values(serverChannels ?? {}).flat());
  }, [serverChannels]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(globalMsgChannelIdRef.current)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as { channel_id: string; user_id: string };
        if (!watchedChannelsRef.current.has(row.channel_id)) return;
        if (row.user_id === userId) return;
        // Don't beep if currently viewing this channel's server
        if (!currentPathRef.current.startsWith("/app/servers/")) playSoftBeep();
        qc.invalidateQueries({ queryKey: ["unread-by-server"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "server_members" },
        () => {
          qc.invalidateQueries({ queryKey: ["my-servers"] });
          qc.invalidateQueries({ queryKey: ["staff-server-ids"] });
          qc.invalidateQueries({ queryKey: ["my-server-channels"] });
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_reads", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["unread-by-server"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, userId]);

  const [creating, setCreating] = useState(false);
  const [serverName, setServerName] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("servers")
      .insert({ name: serverName.trim(), owner_id: user.id, is_public: true } as any)
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setServerName(""); setCreating(false);
    toast.success("تم إنشاء السيرفر!");
    navigate({ to: "/app/servers/$serverId", params: { serverId: data.id } });
  };

  const { leave, activeCall } = useVoiceCall();

  const handleLogout = async () => {
    try {
      if (activeCall) await leave();
    } catch (e) { console.error(e); }
    try { await supabase.auth.signOut(); } catch (e) { console.error(e); }
    window.location.href = "/";
  };

  const isActive = (path: string) => currentPath === path || (path !== "/app" && currentPath.startsWith(path));

  const ownedIds = staffServerIds ?? [];

  return (
    <div className="flex h-dvh bg-background overflow-hidden">
      {/* Desktop: Server rail */}
      <aside className="hidden md:flex w-[72px] flex-col items-center gap-2 py-3 bg-sidebar border-l border-sidebar-border">
        <Link to="/app" className="size-12 rounded-xl bg-gradient-gold flex items-center justify-center hover:rounded-lg transition-all">
          <Crosshair className="size-6 text-primary-foreground" />
        </Link>
        <div className="w-8 h-px bg-sidebar-border my-1" />
        <NotificationsBell userId={userId} ownedServerIds={ownedIds} />
        <div className="w-8 h-px bg-sidebar-border my-1" />
        {myServers?.map((s) => {
          const unread = unreadByServer?.[s.id] ?? 0;
          return (
          <Link
            key={s.id}
            to="/app/servers/$serverId"
            params={{ serverId: s.id }}
            className="relative size-12 rounded-2xl bg-surface hover:bg-primary hover:text-primary-foreground hover:rounded-xl transition-all flex items-center justify-center text-sm font-bold overflow-hidden"
            title={s.name + (unread ? ` — ${unread} رسالة جديدة` : "")}
          >
            {s.icon_url ? <img src={s.icon_url} alt={s.name} className="size-full object-cover" /> : <img src="/default-server-icon.png" alt={s.name} className="size-full object-cover" />}
            {unread > 0 && (
              <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1 border-2 border-sidebar">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          );
        })}
        <button
          onClick={() => setCreating(true)}
          className="size-12 rounded-2xl bg-surface hover:bg-primary hover:text-primary-foreground hover:rounded-xl transition-all flex items-center justify-center text-primary"
          title="إنشاء سيرفر"
        >
          <Plus className="size-5" />
        </button>
        <Link
          to="/app/shop"
          className="size-12 rounded-2xl bg-surface hover:bg-amber-500 hover:text-background hover:rounded-xl transition-all flex items-center justify-center text-amber-400"
          title="متجر الكؤوس"
        >
          <ShoppingCart className="size-5" />
        </Link>
        <div className="mt-auto flex flex-col gap-2">
          <button onClick={handleLogout} className="size-12 rounded-2xl bg-surface hover:bg-destructive transition flex items-center justify-center" title="خروج">
            <LogOut className="size-5" />
          </button>
        </div>
      </aside>

      {/* Desktop: Secondary nav */}
      <aside className="hidden md:flex w-60 bg-sidebar/60 backdrop-blur border-l border-sidebar-border flex-col">
        <div className="p-4 border-b border-sidebar-border">
          <h2 className="display text-2xl tracking-wider">LAST ZØNE</h2>
          <p className="text-xs text-muted-foreground mt-0.5">مجتمع لاعبي ببجي</p>
        </div>
        <nav className="flex-1 p-3 space-y-1 text-sm">
          {navItems.map((it) => (
            <Link
              key={it.to}
              to={it.to}
              activeOptions={{ exact: it.to === "/app" }}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-surface hover:text-foreground transition"
              activeProps={{ className: "flex items-center gap-3 px-3 py-2 rounded-md bg-primary/10 text-primary border border-primary/20" }}
            >
              <it.icon className="size-4" />
              {it.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              to="/app/admin"
              className="flex items-center gap-3 px-3 py-2 rounded-md text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 transition mt-2"
            >
              <Shield className="size-4" />
              <span className="font-bold">ADMIN — الإدارة</span>
            </Link>
          )}
          <Link
            to="/app/shop"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-amber-400 border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition mt-2"
          >
            <ShoppingCart className="size-4" />
            <span className="font-bold">متجر الكؤوس</span>
          </Link>
          <Link
            to="/app/history"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-surface hover:text-foreground transition"
            activeProps={{ className: "flex items-center gap-3 px-3 py-2 rounded-md bg-primary/10 text-primary border border-primary/20" }}
          >
            <ScrollText className="size-4" />
            <span>السجل</span>
          </Link>

          <div className="pt-4 pb-2 px-3 text-[10px] uppercase tracking-widest text-muted-foreground">سيرفراتك</div>
          {myServers?.length === 0 && (
            <p className="px-3 text-xs text-muted-foreground">ما عندك سيرفرات بعد. أنشئ واحد!</p>
          )}
          {myServers?.map((s) => {
            const unread = unreadByServer?.[s.id] ?? 0;
            return (
            <Link
              key={s.id}
              to="/app/servers/$serverId"
              params={{ serverId: s.id }}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-surface hover:text-foreground transition"
              activeProps={{ className: "flex items-center gap-3 px-3 py-2 rounded-md bg-primary/10 text-primary border border-primary/20" }}
            >
              <Hash className="size-4" />
              <span className="truncate flex-1">{s.name}</span>
              {unread > 0 && (
                <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile: top bar */}
      <div className="md:hidden fixed top-0 right-0 left-0 z-40 h-14 bg-sidebar/90 backdrop-blur border-b border-sidebar-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Crosshair className="size-5 text-primary" />
          <span className="display text-lg tracking-wide">LAST ZØNE</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell userId={userId} ownedServerIds={ownedIds} />
          <Sheet open={serverSheetOpen} onOpenChange={setServerSheetOpen}>
            <SheetTrigger asChild>
              <button className="relative size-9 rounded-lg bg-surface flex items-center justify-center">
                <Menu className="size-5 text-muted-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] bg-sidebar border-sidebar-border p-0">
              <SheetHeader className="p-4 border-b border-sidebar-border text-right">
                <SheetTitle className="display text-xl">سيرفراتك</SheetTitle>
              </SheetHeader>
              <div className="p-3 space-y-1">
                {myServers?.length === 0 && (
                  <p className="px-3 text-xs text-muted-foreground">ما عندك سيرفرات بعد. أنشئ واحد!</p>
                )}
                {myServers?.map((s) => {
                  const unread = unreadByServer?.[s.id] ?? 0;
                  return (
                  <Link
                    key={s.id}
                    to="/app/servers/$serverId"
                    params={{ serverId: s.id }}
                    onClick={() => setServerSheetOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-surface hover:text-foreground transition"
                  >
                    <div className="relative size-8 rounded-lg bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold text-xs overflow-hidden">
                      {s.icon_url ? <img src={s.icon_url} alt={s.name} className="size-full object-cover" /> : <img src="/default-server-icon.png" alt={s.name} className="size-full object-cover" />}
                    </div>
                    <span className="truncate text-sm flex-1">{s.name}</span>
                    {unread > 0 && (
                      <span className="min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </Link>
                  );
                })}
                <button
                  onClick={() => { setServerSheetOpen(false); setCreating(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-primary hover:bg-surface transition"
                >
                  <Plus className="size-4" />
                  <span className="text-sm font-bold">إنشاء سيرفر</span>
                </button>
                <Link
                  to="/app/shop"
                  onClick={() => setServerSheetOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-amber-400 hover:bg-surface transition border border-amber-500/30 bg-amber-500/5"
                >
                  <ShoppingCart className="size-4" />
                  <span className="text-sm font-bold">متجر الكؤوس</span>
                </Link>
                <Link
                  to="/app/history"
                  onClick={() => setServerSheetOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-surface transition"
                >
                  <ScrollText className="size-4" />
                  <span className="text-sm">السجل</span>
                </Link>

                {isAdmin && (
                  <Link
                    to="/app/admin"
                    onClick={() => setServerSheetOpen(false)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-primary hover:bg-surface transition border border-primary/30 bg-primary/5"
                  >
                    <Shield className="size-4" />
                    <span className="text-sm font-bold">ADMIN — الإدارة</span>
                  </Link>
                )}
                <div className="pt-4 border-t border-sidebar-border">
                  <button
                    onClick={() => { setServerSheetOpen(false); handleLogout(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                  >
                    <LogOut className="size-4" />
                    <span className="text-sm">خروج</span>
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto flex flex-col md:pt-0 pt-14 md:pb-0 pb-[72px]">
        <Outlet />
      </main>

      {/* Mobile: bottom nav */}
      <nav className="md:hidden fixed bottom-0 right-0 left-0 z-40 h-[72px] bg-sidebar/95 backdrop-blur border-t border-sidebar-border flex items-center justify-around px-2">
        {navItems.map((it) => {
          const active = isActive(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`flex flex-col items-center justify-center gap-0.5 w-16 h-full rounded-xl transition ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <div className={`size-9 flex items-center justify-center rounded-xl transition ${active ? "bg-primary/15" : ""}`}>
                <it.icon className="size-5" />
              </div>
              <span className="text-[10px] font-medium">{it.short}</span>
            </Link>
          );
        })}
      </nav>

      {creating && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={handleCreate} className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-elegant">
            <h3 className="display text-3xl mb-2">سيرفر جديد</h3>
            <p className="text-sm text-muted-foreground mb-4">أنشئ سيرفر لكلانك أو لجمع صحابك.</p>
            <input
              autoFocus required
              value={serverName} onChange={(e) => setServerName(e.target.value)}
              placeholder="اسم السيرفر (مثلاً: ALPHA SQUAD)"
              className="w-full rounded-md bg-input border border-border px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">إلغاء</button>
              <button type="submit" className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold">إنشاء</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
