import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Trophy, Plus, Calendar, Users, Check, X, Inbox, Pencil, Trash2,
  Info, KeyRound, Ban, Medal, Radio, Clock, ListChecks, MonitorPlay, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminBadge } from "@/components/AdminBadge";
import { isAdminUsername } from "@/lib/admin-utils";
import { TournamentLiveStream } from "@/components/TournamentLiveStream";

export const Route = createFileRoute("/_authenticated/app/tournaments")({
  component: TournamentsPage,
});

const MAPS = ["Erangel", "Miramar", "Sanhok", "Vikendi", "Livik", "Karakin", "Rondo"];
const REGIONS = ["Middle East", "Asia", "Europe", "North America", "South America", "KRJP"];
const SYSTEMS = ["Solo", "Duo", "Squad", "TDM"];
const RANKS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Crown", "Ace", "Conqueror"];
const TEAM_SIZE: Record<string, number> = { Solo: 1, Duo: 2, Squad: 4, TDM: 4 };

type Tab = "open" | "upcoming" | "live" | "results" | "mine";

function TournamentsPage() {
  const qc = useQueryClient();
  const [me, setMe] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("open");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [registerFor, setRegisterFor] = useState<any | null>(null);
  const [inboxFor, setInboxFor] = useState<any | null>(null);
  const [rulesFor, setRulesFor] = useState<any | null>(null);
  const [roomFor, setRoomFor] = useState<any | null>(null);
  const [resultsFor, setResultsFor] = useState<any | null>(null);
  const [streamFor, setStreamFor] = useState<{ t: any; mode: "host" | "viewer" } | null>(null);

  const emptyForm = {
    name: "", description: "", prize_pool: "", system: "Squad",
    map_mode: "Erangel", region: "Middle East", min_rank: "",
    max_teams: 16, starts_at: "", expires_at: "",
    rules: "", trophies_count: 10,
  };
  const [form, setForm] = useState(emptyForm);

  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMe(data.session?.user?.id ?? null)).catch(() => setMe(null));
  }, []);

  // Tick every 20s so tournaments auto-promote to "live" once start time passes
  useEffect(() => {
    const i = setInterval(() => setNowTick(Date.now()), 20000);
    return () => clearInterval(i);
  }, []);

  // Realtime: refresh tournaments + registrations instantly
  useEffect(() => {
    const ch = supabase
      .channel(`tournaments-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, () => {
        qc.invalidateQueries({ queryKey: ["tournaments"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_registrations" }, () => {
        qc.invalidateQueries({ queryKey: ["t-accepted-counts"] });
        qc.invalidateQueries({ queryKey: ["my-tournament-regs"] });
        qc.invalidateQueries({ queryKey: ["t-regs-inbox"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { data: items } = useQuery({
    queryKey: ["tournaments"],
    queryFn: async () => {
      const { data } = await supabase.from("tournaments").select("*").order("starts_at", { ascending: true });
      return data ?? [];
    },
  });

  const { data: acceptedCounts } = useQuery({
    queryKey: ["t-accepted-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("tournament_registrations").select("tournament_id, status").eq("status", "accepted");
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { map[r.tournament_id] = (map[r.tournament_id] ?? 0) + 1; });
      return map;
    },
  });

  const { data: myRegs } = useQuery({
    queryKey: ["my-tournament-regs", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("tournament_registrations").select("tournament_id, status, banned").eq("captain_id", me!);
      return data ?? [];
    },
  });

  const { data: myTrophiesByT } = useQuery({
    queryKey: ["my-trophies-map", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_my_trophies");
      const map: Record<string, { pos: number; trophies: number; team_name: string | null }> = {};
      (data ?? []).forEach((r: any) => {
        map[r.tournament_id] = { pos: r.pos, trophies: r.trophies_awarded, team_name: r.team_name };
      });
      return map;
    },
  });

  // Available trophies = total trophies I own - trophies locked in my still-active tournaments
  const { data: availableTrophies = 0 } = useQuery({
    queryKey: ["my-available-trophies", me, items?.length],
    enabled: !!me,
    queryFn: async () => {
      const { data: trophies } = await supabase.rpc("get_my_trophies");
      const total = (trophies ?? []).reduce((s: number, r: any) => s + (r.trophies_awarded ?? 0), 0);
      const locked = (items ?? [])
        .filter((t: any) => t.organizer_id === me && t.status !== "finished")
        .reduce((s: number, t: any) => s + (t.trophies_count ?? 0), 0);
      return Math.max(0, total - locked);
    },
  });


  // Auto-promote my tournaments to "live" once starts_at passes (organizer-side)
  useEffect(() => {
    if (!me || !items) return;
    const due = (items as any[]).filter(
      (t) => t.organizer_id === me
        && t.status !== "live"
        && t.status !== "finished"
        && t.starts_at && new Date(t.starts_at).getTime() <= nowTick,
    );
    if (due.length === 0) return;
    (async () => {
      for (const t of due) {
        await supabase.from("tournaments").update({ status: "live" }).eq("id", t.id);
      }
      qc.invalidateQueries({ queryKey: ["tournaments"] });
    })();
  }, [me, items, nowTick, qc]);

  // Open inbox only from an explicit bell notification click.
  useEffect(() => {
    if (typeof window === "undefined" || !items) return;

    const openInbox = (id: string | null) => {
      if (!id) return;
      const t = (items as any[]).find((x) => x.id === id);
      if (t) setInboxFor(t);
    };

    const stored = sessionStorage.getItem("open-tournament-inbox");
    if (stored) {
      sessionStorage.removeItem("open-tournament-inbox");
      openInbox(stored);
    }

    const onOpenInbox = (event: Event) => {
      const id = (event as CustomEvent<{ tournamentId?: string }>).detail?.tournamentId ?? null;
      openInbox(id);
    };

    window.addEventListener("open-tournament-inbox", onOpenInbox);
    return () => window.removeEventListener("open-tournament-inbox", onOpenInbox);
  }, [items]);


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    const team_size = TEAM_SIZE[form.system] ?? 4;
    const payload: any = {
      name: form.name, description: form.description, prize_pool: form.prize_pool,
      mode: form.system, system: form.system, map_mode: form.map_mode, region: form.region,
      min_rank: form.min_rank || null, max_teams: form.max_teams, team_size,
      rules: form.rules, trophies_count: form.trophies_count,
      organizer_id: me,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };
    // Validate trophy budget — only on create / when raising the count on edit
    const prev = editing?.trophies_count ?? 0;
    const delta = Math.max(0, (form.trophies_count ?? 0) - prev);
    if (delta > availableTrophies) {
      toast.error(`لا تملك كؤوس كافية. متاح: ${availableTrophies} 🏆`);
      return;
    }
    const { error } = editing
      ? await supabase.from("tournaments").update(payload).eq("id", editing.id)
      : await supabase.from("tournaments").insert(payload);
    if (error) {
      if (error.message.includes("insufficient_trophies")) {
        toast.error("ليس لديك كؤوس كافية لإنشاء هذه البطولة.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success(editing ? "تم التعديل!" : "تم نشر البطولة!");
    setOpen(false); setEditing(null); setForm(emptyForm);
    qc.invalidateQueries({ queryKey: ["tournaments"] });
    qc.invalidateQueries({ queryKey: ["my-available-trophies"] }); qc.invalidateQueries({ queryKey: ["my-trophies-balance"] });
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      name: t.name ?? "", description: t.description ?? "", prize_pool: t.prize_pool ?? "",
      system: t.system ?? t.mode ?? "Squad",
      map_mode: t.map_mode ?? "Erangel", region: t.region ?? "Middle East",
      min_rank: t.min_rank ?? "",
      max_teams: t.max_teams ?? 16,
      starts_at: t.starts_at ? toLocal(t.starts_at) : "",
      expires_at: t.expires_at ? toLocal(t.expires_at) : "",
      rules: t.rules ?? "", trophies_count: t.trophies_count ?? 10,
    });
    setOpen(true);
  };

  const removeTournament = async (t: any) => {
    if (t.status === "finished") {
      toast.error("لا يمكن إلغاء بطولة تم توزيع كؤوسها.");
      return;
    }
    if (!confirm(`إلغاء بطولة "${t.name}"؟ سيتم استرجاع الكؤوس إلى رصيدك وحذف جميع التسجيلات.`)) return;
    await supabase.from("tournament_registrations").delete().eq("tournament_id", t.id);
    const { error } = await supabase.from("tournaments").delete().eq("id", t.id);
    if (error) {
      if (error.message.includes("cannot_delete_finished_tournament") || error.message.includes("cannot_delete_tournament_with_results")) {
        toast.error("لا يمكن إلغاء بطولة تم توزيع كؤوسها.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("تم إلغاء البطولة واسترجاع الكؤوس");
    qc.invalidateQueries({ queryKey: ["tournaments"] });
    qc.invalidateQueries({ queryKey: ["my-available-trophies"] }); qc.invalidateQueries({ queryKey: ["my-trophies-balance"] });
  };





  const now = nowTick;
  const categorized = useMemo(() => {
    const open: any[] = [], upcoming: any[] = [], live: any[] = [], results: any[] = [], mine: any[] = [];
    (items ?? []).forEach((t: any) => {
      const accepted = acceptedCounts?.[t.id] ?? 0;
      const full = accepted >= (t.max_teams ?? 0);
      const expired = t.expires_at && new Date(t.expires_at).getTime() < now;
      const started = t.starts_at && new Date(t.starts_at).getTime() <= now;
      const closed = t.status === "closed" || expired || full;
      const isMine = t.organizer_id === me || myRegs?.some((r) => r.tournament_id === t.id);
      if (isMine) mine.push(t);

      if (t.status === "finished") { results.push(t); return; }
      if (t.status === "live" || (started && t.status !== "finished")) { live.push(t); return; }
      if (!started && !closed) { open.push(t); return; }
      if (!started && closed) { upcoming.push(t); return; }
    });
    results.sort((a, b) => new Date(b.starts_at ?? 0).getTime() - new Date(a.starts_at ?? 0).getTime());
    return { open, upcoming, live, results, mine };
  }, [items, acceptedCounts, myRegs, me, now]);

  const list = categorized[tab];

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="display text-5xl mb-2">البطولات <span className="text-gradient-gold">والكؤوس</span></h1>
            <p className="text-muted-foreground">سجّل فريقك أو نظّم بطولتك الخاصة.</p>
          </div>
          <div className="flex items-center justify-between flex-1 min-w-[280px]">
            <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-md bg-gradient-gold px-5 py-2.5 text-sm font-bold text-primary-foreground">
              <Plus className="size-4" /> نظّم بطولة
            </button>
            {me && <TrophiesPill me={me} />}
          </div>
        </div>


        <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-2">
          {([
            ["open", "مفتوحة", ListChecks],
            ["upcoming", "قادمة", Clock],
            ["live", "مباشرة", Radio],
            ["results", "النتائج", Medal],
            ["mine", "بطولاتي", Trophy],
          ] as [Tab, string, any][]).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold transition ${
                tab === k ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:bg-surface-2"
              }`}>
              <Icon className="size-3.5" /> {label}
              <span className="text-[10px] opacity-60">({categorized[k].length})</span>
            </button>
          ))}
        </div>

        {list.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-12 text-center">
            <Trophy className="size-12 text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">لا توجد بطولات في هذا القسم.</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          {list.map((t: any) => {
            const isOrganizer = t.organizer_id === me;
            const myReg = myRegs?.find((r) => r.tournament_id === t.id);
            const accepted = acceptedCounts?.[t.id] ?? 0;
            const full = accepted >= (t.max_teams ?? 0);
            const expired = t.expires_at && new Date(t.expires_at).getTime() < now;
            const started = t.starts_at && new Date(t.starts_at).getTime() <= now;
            const closed = t.status === "closed" || expired || full || started;

            return (
              <div key={t.id} className="group rounded-xl border border-border bg-surface/60 backdrop-blur overflow-hidden hover:border-primary/40 transition">
                <div className="h-32 bg-gradient-to-br from-primary/30 via-primary/10 to-background relative flex items-end p-4">
                  <Trophy className="absolute top-4 left-4 size-8 text-primary opacity-50" />
                  {t.rules && (
                    <button onClick={() => setRulesFor(t)} title="القوانين"
                      className="absolute top-3 right-3 size-8 rounded-full bg-background/70 backdrop-blur border border-border flex items-center justify-center hover:bg-primary/20">
                      <Info className="size-4 text-primary" />
                    </button>
                  )}
                  <h3 className="display text-3xl relative">{t.name}</h3>
                </div>
                <div className="p-5">
                  {t.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{t.description}</p>}
                  <div className="flex flex-wrap gap-2 text-xs mb-4">
                    {t.prize_pool && <span className="px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 font-bold">🏆 {t.prize_pool}</span>}
                    <span className="px-2 py-1 rounded bg-surface-2 border border-border">{t.system ?? t.mode}</span>
                    {t.map_mode && <span className="px-2 py-1 rounded bg-surface-2 border border-border">🗺️ {t.map_mode}</span>}
                    {t.region && <span className="px-2 py-1 rounded bg-surface-2 border border-border">🌐 {t.region}</span>}
                    {t.min_rank && <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">≥ {t.min_rank}</span>}
                    <span className="px-2 py-1 rounded bg-surface-2 border border-border flex items-center gap-1"><Users className="size-3" />{accepted}/{t.max_teams}</span>
                    {t.starts_at && <span className="px-2 py-1 rounded bg-surface-2 border border-border flex items-center gap-1"><Calendar className="size-3" />{new Date(t.starts_at).toLocaleString("ar")}</span>}
                    {t.status === "live" && <span className="px-2 py-1 rounded bg-red-500/15 text-red-500 border border-red-500/40 animate-pulse">● مباشر</span>}
                    {t.live_stream_active && <span className="px-2 py-1 rounded bg-red-500/15 text-red-500 border border-red-500/40 animate-pulse flex items-center gap-1"><Radio className="size-3" /> بث مباشر</span>}
                    {t.status === "finished" && <span className="px-2 py-1 rounded bg-green-500/10 text-green-500 border border-green-500/30">منتهية</span>}
                  </div>

                  {t.status === "finished" && <ResultsView tournamentId={t.id} />}

                  {isOrganizer ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setInboxFor(t)} className="py-2 rounded-md border border-primary/40 text-primary text-xs font-bold hover:bg-primary/10 flex items-center justify-center gap-1">
                          <Inbox className="size-3.5" /> الفرق ({accepted})
                        </button>
                        <button onClick={() => setRoomFor(t)} className="py-2 rounded-md border border-border text-xs font-bold flex items-center justify-center gap-1 hover:bg-surface-2">
                          <KeyRound className="size-3.5" /> Room ID / Pass
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {t.status === "live" && (
                          <button onClick={() => setResultsFor(t)} className="py-1.5 rounded-md border border-green-500/40 text-green-500 text-xs flex items-center justify-center gap-1 hover:bg-green-500/10"><Medal className="size-3" /> النتائج</button>
                        )}
                        {t.status === "finished" && (
                          <button onClick={() => setResultsFor(t)} className="py-1.5 rounded-md border border-border text-xs flex items-center justify-center gap-1 hover:bg-surface-2"><Medal className="size-3" /> تعديل</button>
                        )}
                        <button onClick={() => openEdit(t)} className="py-1.5 rounded-md border border-border text-xs flex items-center justify-center gap-1 hover:bg-surface-2"><Pencil className="size-3" /> تعديل</button>
                      </div>
                      {t.status !== "finished" && (
                        t.live_stream_active ? (
                          <button onClick={() => setStreamFor({ t, mode: "host" })} className="w-full py-2 rounded-md bg-red-500/20 border border-red-500/50 text-red-500 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-red-500/30 animate-pulse">
                            <Radio className="size-3.5" /> أنت تبث الآن · افتح للإدارة
                          </button>
                        ) : (
                          <button onClick={() => setStreamFor({ t, mode: "host" })} className="w-full py-2 rounded-md border border-red-500/40 text-red-500 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-red-500/10">
                            <MonitorPlay className="size-3.5" /> ابدأ البث المباشر للروم
                          </button>
                        )
                      )}
                      {t.status !== "finished" && (
                        <button onClick={() => removeTournament(t)} className="w-full py-2 rounded-md border border-red-500/40 text-red-500 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-red-500/10">
                          <Trash2 className="size-3.5" /> إلغاء البطولة
                        </button>
                      )}
                      {t.starts_at && t.status !== "live" && t.status !== "finished" && (
                        <div className="text-[11px] text-muted-foreground text-center rounded-md border border-dashed border-border py-1.5">
                          ⏱ ستبدأ البطولة ويُغلق التسجيل تلقائياً في {new Date(t.starts_at).toLocaleString("ar")}
                        </div>
                      )}

                    </div>

                  ) : myReg ? (
                    <div className="space-y-2">
                      {t.status === "finished" ? (
                        myTrophiesByT?.[t.id] ? (
                          <div className="w-full py-2.5 rounded-md bg-primary/10 border border-primary/30 text-primary text-sm font-bold text-center">
                            {(["🥇","🥈","🥉"][myTrophiesByT[t.id].pos - 1]) ?? `#${myTrophiesByT[t.id].pos}`} مركزك في البطولة · {myTrophiesByT[t.id].trophies} 🏆
                          </div>
                        ) : (
                          <button disabled className="w-full py-2 rounded-md border border-border text-muted-foreground text-xs font-bold">انتهت البطولة</button>
                        )
                      ) : (
                        <>
                          <button disabled className="w-full py-2 rounded-md border border-border text-muted-foreground text-xs font-bold">
                            {myReg.banned ? "🚫 تم حظر فريقك" :
                             myReg.status === "pending" ? "تسجيلك قيد المراجعة" :
                             myReg.status === "accepted" ? "تم قبول فريقك ✓" : "تم رفض التسجيل"}
                          </button>
                          {myReg.status === "accepted" && !myReg.banned && (
                            <button onClick={() => setRoomFor(t)} className="w-full py-2 rounded-md bg-gradient-gold text-primary-foreground text-xs font-bold flex items-center justify-center gap-1">
                              <KeyRound className="size-3.5" /> Room ID / Password
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ) : t.status === "finished" && myTrophiesByT?.[t.id] ? (
                    <div className="w-full py-2.5 rounded-md bg-primary/10 border border-primary/30 text-primary text-sm font-bold text-center">
                      {(["🥇","🥈","🥉"][myTrophiesByT[t.id].pos - 1]) ?? `#${myTrophiesByT[t.id].pos}`} مركزك في البطولة · {myTrophiesByT[t.id].trophies} 🏆
                    </div>
                  ) : closed || t.status === "finished" ? (
                    <button disabled className="w-full py-2 rounded-md border border-border text-muted-foreground text-xs font-bold">
                      {t.status === "finished" ? "انتهت البطولة" : started ? "بدأت البطولة" : expired ? "انتهى التسجيل" : full ? "اكتمل العدد" : "التسجيل مغلق"}
                    </button>
                  ) : (
                    <button onClick={() => setRegisterFor(t)} className="w-full py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold">سجّل فريقك</button>
                  )}

                  {!isOrganizer && t.live_stream_active && (
                    <button onClick={() => setStreamFor({ t, mode: "viewer" })} className="mt-2 w-full py-2 rounded-md bg-red-500/15 border border-red-500/40 text-red-500 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-red-500/25 animate-pulse">
                      <Eye className="size-3.5" /> شاهد البث المباشر الآن
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {open && (
        <Modal onClose={() => { setOpen(false); setEditing(null); setForm(emptyForm); }}>
          <form onSubmit={submit}>
            <h3 className="display text-3xl mb-4">{editing ? "تعديل البطولة" : "نظّم بطولة"}</h3>
            {availableTrophies < 10 && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 mb-3 text-sm text-red-500 text-center font-bold">
                ⚠️ لا تملك كؤوس كافية لإنشاء بطولة. أنت بحاجة لـ 10 كؤوس على الأقل.
              </div>
            )}
            {availableTrophies >= 10 && availableTrophies < (form.trophies_count ?? 10) && !editing && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 mb-3 text-sm text-amber-500 text-center font-bold">
                ⚠️ لديك {availableTrophies} 🏆 فقط. لا يمكنك استخدام {form.trophies_count} 🏆.
              </div>
            )}
            <div className="space-y-3">
              <input required placeholder="اسم البطولة" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
              <textarea placeholder="الوصف" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm resize-none" />
              <select value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm">
                {SYSTEMS.map((s) => <option key={s}>{s}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.map_mode} onChange={(e) => setForm({ ...form, map_mode: e.target.value })} className="rounded-md bg-input border border-border px-3 py-2 text-sm">
                  {MAPS.map((m) => <option key={m}>{m}</option>)}
                </select>
                <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="rounded-md bg-input border border-border px-3 py-2 text-sm">
                  {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">الرتبة الدنيا (اختياري)</label>
                  <select value={form.min_rank} onChange={(e) => setForm({ ...form, min_rank: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm">
                    <option value="">بدون شرط</option>
                    {RANKS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">عدد الفرق</label>
                  <input type="number" min={2} max={64} value={form.max_teams} onChange={(e) => setForm({ ...form, max_teams: +e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">تاريخ بدء البطولة</label>
                  <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">إغلاق التسجيل (اختياري)</label>
                  <input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  مجموع الكؤوس للتوزيع 🏆 <span className="text-primary">(متاح لديك: {availableTrophies})</span>
                </label>
                <input type="number" min={10} max={Math.max(availableTrophies + (editing?.trophies_count ?? 0), 10)} value={form.trophies_count} onChange={(e) => setForm({ ...form, trophies_count: +e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
                <p className="text-[10px] text-muted-foreground mt-1">سيتم خصمها من رصيدك مؤقتاً حتى توزّعها في النتائج. لا يمكن تجاوز رصيدك المتاح.</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">القوانين / العقوبات</label>
                <textarea placeholder="مثال: ممنوع استخدام الإيموت، الغش = حظر دائم..." rows={3} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button type="button" onClick={() => { setOpen(false); setEditing(null); setForm(emptyForm); }} className="px-4 py-2 text-sm text-muted-foreground">إلغاء</button>
              <button type="submit" className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold">{editing ? "حفظ" : "نشر"}</button>
            </div>
          </form>
        </Modal>
      )}

      {registerFor && me && (
        <RegisterDialog tournament={registerFor} me={me} onClose={() => setRegisterFor(null)} onDone={() => {
          setRegisterFor(null);
          qc.invalidateQueries({ queryKey: ["my-tournament-regs", me] });
        }} />
      )}

      {inboxFor && <RegistrationsInbox tournament={inboxFor} onClose={() => setInboxFor(null)} />}
      {rulesFor && <RulesDialog tournament={rulesFor} onClose={() => setRulesFor(null)} />}
      {roomFor && <RoomDialog tournament={roomFor} isOrganizer={roomFor.organizer_id === me} onClose={() => setRoomFor(null)} />}
      {resultsFor && <ResultsDialog tournament={resultsFor} onClose={() => setResultsFor(null)} />}
      {streamFor && <TournamentLiveStream tournament={streamFor.t} mode={streamFor.mode} onClose={() => setStreamFor(null)} />}
    </div>
  );
}

function toLocal(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-surface border border-border p-6 shadow-elegant max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function RegisterDialog({ tournament, me, onClose, onDone }: { tournament: any; me: string; onClose: () => void; onDone: () => void }) {
  const teamSize = tournament.team_size ?? TEAM_SIZE[tournament.system ?? tournament.mode] ?? 4;
  const invitesNeeded = Math.max(teamSize - 1, 0);
  const [teamName, setTeamName] = useState("");
  const [contact, setContact] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Captain's PUBG ID (mandatory) — pulled from profile
  const { data: myProfile } = useQuery({
    queryKey: ["my-profile-pubgid", me],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("pubg_id").eq("id", me).single();
      return data;
    },
  });
  const myPubgId = myProfile?.pubg_id?.trim() ?? "";

  // Load my friends
  const { data: friends } = useQuery({
    queryKey: ["my-friends-for-invite", me],
    queryFn: async () => {
      const { data: fs } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
      const ids = (fs ?? []).map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id));
      if (!ids.length) return [] as { id: string; username: string; display_name: string | null; avatar_url: string | null }[];
      const { data: profs } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      return profs ?? [];
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= invitesNeeded) { toast.error(`الحد الأقصى ${invitesNeeded} أعضاء`); return prev; }
      return [...prev, id];
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!myPubgId) {
      toast.error("أضف PUBG ID في بروفايلك أولاً (إلزامي للتسجيل)");
      return;
    }
    if (invitesNeeded > 0 && selected.length !== invitesNeeded) {
      toast.error(`لازم تختار ${invitesNeeded} من أصدقائك`);
      return;
    }
    setSubmitting(true);
    const { data: reg, error } = await supabase.from("tournament_registrations").insert({
      tournament_id: tournament.id, captain_id: me, organizer_id: tournament.organizer_id,
      team_name: teamName, contact, members_ids: [me],
    }).select("id").single();
    if (error) {
      setSubmitting(false);
      if (error.message.includes("rank_too_low")) toast.error(`رتبتك أقل من المطلوب (${tournament.min_rank})`);
      else if (error.message.includes("registration_closed")) toast.error("التسجيل مغلق — البطولة بدأت أو انتهت");
      else if (error.message.includes("duplicate")) toast.error("سجّلت فريقك مسبقًا");
      else toast.error(error.message);
      return;
    }
    if (selected.length > 0 && reg) {
      const { error: ie } = await supabase.from("tournament_team_invites").insert(
        selected.map((invitee_id) => ({
          registration_id: reg.id, tournament_id: tournament.id, captain_id: me, invitee_id,
        }))
      );
      if (ie) { toast.error("تم تسجيل الفريق لكن فشل إرسال بعض الدعوات: " + ie.message); }
    }
    toast.success(selected.length ? "تم إرسال الدعوات لأصدقائك!" : "تم إرسال التسجيل!");
    onDone();
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <h3 className="display text-2xl mb-1">تسجيل فريق</h3>
        <p className="text-sm text-muted-foreground mb-1">{tournament.name}</p>
        <p className="text-xs text-muted-foreground mb-4">النظام: <b>{tournament.system ?? tournament.mode}</b> · حجم الفريق: <b>{teamSize}</b>{tournament.min_rank && <> · الرتبة الدنيا: <b>{tournament.min_rank}</b></>}</p>
        <div className="space-y-3">
          {myPubgId ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <span className="text-muted-foreground">PUBG ID الخاص بك (القائد): </span>
              <b className="text-primary">{myPubgId}</b>
            </div>
          ) : (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              ⚠️ PUBG ID غير موجود في بروفايلك. أضفه من <b>بروفايلي</b> قبل التسجيل (إلزامي).
            </div>
          )}
          <input required placeholder="اسم الفريق" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
          {invitesNeeded > 0 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-2">
                ادعُ {invitesNeeded} من أصدقائك ({selected.length}/{invitesNeeded})
              </label>
              {friends && friends.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-surface-2/30 p-4 text-center text-xs text-muted-foreground">
                  ليس لديك أصدقاء بعد. أضف أصدقاء من قسم الأصدقاء أولاً.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1 rounded-md border border-border bg-surface-2/20 p-2">
                  {(friends ?? []).map((f) => {
                    const on = selected.includes(f.id);
                    return (
                      <button type="button" key={f.id} onClick={() => toggle(f.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition text-right ${on ? "bg-primary/15 border border-primary/40" : "hover:bg-surface-2 border border-transparent"}`}>
                        <div className="size-8 rounded-full bg-gradient-gold overflow-hidden shrink-0 flex items-center justify-center text-xs">
                          {f.avatar_url ? <img src={f.avatar_url} alt="" className="size-full object-cover" /> : (f.display_name ?? f.username ?? "?")[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold truncate">{f.display_name ?? f.username}</div>
                          <div className="text-[10px] text-muted-foreground truncate">@{f.username}</div>
                        </div>
                        {on && <Check className="size-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2">سيصلهم إشعار في الجرس لقبول أو رفض الدعوة.</p>
            </div>
          )}
          <input placeholder="وسيلة التواصل (Discord / WhatsApp)" value={contact} onChange={(e) => setContact(e.target.value)} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">إلغاء</button>
          <button type="submit" disabled={submitting || !myPubgId} className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold disabled:opacity-50">{submitting ? "..." : "سجّل الفريق"}</button>
        </div>
      </form>
    </Modal>
  );
}

function RegistrationsInbox({ tournament, onClose }: { tournament: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: regs } = useQuery({
    queryKey: ["t-regs-inbox", tournament.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("tournament_registrations")
        .select("*, profile:profiles!tournament_registrations_captain_id_fkey(display_name, username, avatar_url, rank)")
        .eq("tournament_id", tournament.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const updateStatus = async (id: string, status: "accepted" | "rejected") => {
    const { error } = await supabase.from("tournament_registrations").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "accepted" ? "تم القبول" : "تم الرفض");
    qc.invalidateQueries({ queryKey: ["t-regs-inbox", tournament.id] });
    qc.invalidateQueries({ queryKey: ["t-accepted-counts"] });
  };

  const toggleBan = async (r: any) => {
    const { error } = await supabase.from("tournament_registrations").update({ banned: !r.banned }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(!r.banned ? "تم حظر الفريق" : "تم رفع الحظر");
    qc.invalidateQueries({ queryKey: ["t-regs-inbox", tournament.id] });
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="display text-2xl mb-1">الفرق المسجّلة</h3>
      <p className="text-sm text-muted-foreground mb-4">{tournament.name}</p>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {regs?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">لا توجد تسجيلات بعد.</p>}
        {regs?.map((r: any) => (
          <div key={r.id} className={`rounded-xl border p-3 ${r.banned ? "border-red-500/40 bg-red-500/5" : "border-border bg-surface-2/50"}`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-bold">{r.team_name} {r.banned && <span className="text-red-500 text-xs">(محظور)</span>}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <span>القائد:</span>
                  <span className={isAdminUsername(r.profile?.username) ? "text-primary font-bold" : ""}>{r.profile?.display_name || r.profile?.username}</span>
                  <AdminBadge username={r.profile?.username} size="xs" />
                  <span>· {r.profile?.rank ?? "—"}</span>
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            {r.members && <pre className="text-xs whitespace-pre-wrap font-sans bg-background/40 p-2 rounded mb-2">{r.members}</pre>}
            {r.contact && <p className="text-xs text-muted-foreground mb-2">للتواصل: <span className="text-foreground">{r.contact}</span></p>}
            <div className="flex gap-2 justify-end flex-wrap">
              {r.status === "pending" && (
                <>
                  <button onClick={() => updateStatus(r.id, "rejected")} className="px-3 py-1.5 rounded-md border border-border text-xs flex items-center gap-1 hover:bg-surface-2"><X className="size-3" /> رفض</button>
                  <button onClick={() => updateStatus(r.id, "accepted")} className="px-3 py-1.5 rounded-md bg-gradient-gold text-primary-foreground text-xs font-bold flex items-center gap-1"><Check className="size-3" /> قبول</button>
                </>
              )}
              {r.status === "accepted" && (
                <button onClick={() => toggleBan(r)} className={`px-3 py-1.5 rounded-md border text-xs flex items-center gap-1 ${r.banned ? "border-border hover:bg-surface-2" : "border-red-500/40 text-red-500 hover:bg-red-500/10"}`}>
                  <Ban className="size-3" /> {r.banned ? "رفع الحظر" : "حظر"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function RulesDialog({ tournament, onClose }: { tournament: any; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <h3 className="display text-2xl mb-1 flex items-center gap-2"><Info className="size-5 text-primary" /> القوانين والعقوبات</h3>
      <p className="text-sm text-muted-foreground mb-4">{tournament.name}</p>
      <pre className="whitespace-pre-wrap font-sans text-sm bg-surface-2/40 border border-border rounded-md p-4">{tournament.rules || "لا توجد قوانين منشورة."}</pre>
      <div className="flex justify-end mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold">فهمت</button>
      </div>
    </Modal>
  );
}

function RoomDialog({ tournament, isOrganizer, onClose }: { tournament: any; isOrganizer: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [roomId, setRoomId] = useState(tournament.room_id ?? "");
  const [roomPass, setRoomPass] = useState(tournament.room_password ?? "");
  const [creds, setCreds] = useState<{ room_id: string | null; room_password: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isOrganizer) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_tournament_room_credentials", { _id: tournament.id });
      if (error) {
        if (error.message.includes("too early")) setErr("⏳ ستظهر معلومات الغرفة قبل 10 دقائق من بدء البطولة.");
        else if (error.message.includes("not a participant")) setErr("لست ضمن الفرق المقبولة.");
        else setErr(error.message);
      } else if (data && data[0]) setCreds(data[0]);
    })();
  }, [isOrganizer, tournament.id]);

  const save = async () => {
    const { error } = await supabase.from("tournaments").update({ room_id: roomId, room_password: roomPass }).eq("id", tournament.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحفظ — سيظهر للمقبولين قبل 10 دقائق من البدء.");
    qc.invalidateQueries({ queryKey: ["tournaments"] });
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="display text-2xl mb-1 flex items-center gap-2"><KeyRound className="size-5 text-primary" /> Room ID / Password</h3>
      <p className="text-sm text-muted-foreground mb-4">{tournament.name}</p>
      {isOrganizer ? (
        <div className="space-y-3">
          <input placeholder="Room ID" value={roomId} onChange={(e) => setRoomId(e.target.value)} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
          <input placeholder="Password" value={roomPass} onChange={(e) => setRoomPass(e.target.value)} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
          <p className="text-xs text-muted-foreground">لن يراها المسجّلون إلا قبل 10 دقائق من بدء البطولة.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">إلغاء</button>
            <button onClick={save} className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold">حفظ</button>
          </div>
        </div>
      ) : err ? (
        <div className="rounded-md border border-border bg-surface-2/40 p-4 text-sm text-muted-foreground text-center">{err}</div>
      ) : creds ? (
        <div className="space-y-3">
          <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
            <div className="text-xs text-muted-foreground mb-1">Room ID</div>
            <div className="font-mono text-xl font-bold">{creds.room_id || "—"}</div>
          </div>
          <div className="rounded-md border border-primary/40 bg-primary/5 p-4">
            <div className="text-xs text-muted-foreground mb-1">Password</div>
            <div className="font-mono text-xl font-bold">{creds.room_password || "—"}</div>
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground text-center py-4">جاري التحميل...</p>}
    </Modal>
  );
}

function ResultsView({ tournamentId }: { tournamentId: string }) {
  const { data } = useQuery({
    queryKey: ["t-results", tournamentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tournament_results")
        .select("position, registration:tournament_registrations(team_name)")
        .eq("tournament_id", tournamentId)
        .order("position");
      return data ?? [];
    },
  });
  if (!data || data.length === 0) return null;
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="mb-4 space-y-1">
      {data.map((r: any, idx: number) => (
        <div key={idx} className="flex items-center justify-between text-sm rounded bg-surface-2/40 border border-border px-3 py-1.5">
          <span className="font-bold">{medals[r.position - 1] ?? `#${r.position}`} {(r.registration as any)?.team_name ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

function ResultsDialog({ tournament, onClose }: { tournament: any; onClose: () => void }) {
  const qc = useQueryClient();
  const trophies = tournament.trophies_count ?? 10;
  const { data: accepted } = useQuery({
    queryKey: ["t-accepted-teams-full", tournament.id],
    queryFn: async () => {
      const { data } = await supabase.from("tournament_registrations")
        .select("id, team_name, captain_id, members_ids")
        .eq("tournament_id", tournament.id).eq("status", "accepted").eq("banned", false);
      return (data ?? []) as { id: string; team_name: string; captain_id: string; members_ids: string[] }[];
    },
  });

  const allUserIds = Array.from(new Set(
    (accepted ?? []).flatMap((t) => [t.captain_id, ...(t.members_ids ?? [])])
  ));
  const { data: profiles } = useQuery({
    queryKey: ["t-team-profiles", tournament.id, allUserIds.join(",")],
    enabled: allUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("id, username, display_name, avatar_url, pubg_id").in("id", allUserIds);
      const map: Record<string, { id: string; username: string; display_name: string | null; avatar_url: string | null; pubg_id: string | null }> = {};
      (data ?? []).forEach((p) => { map[p.id] = p as any; });
      return map;
    },
  });

  const [rows, setRows] = useState<{ position: number; registration_id: string; trophies_awarded: number; recipient_ids: string[] }[]>([]);
  const [totalPool, setTotalPool] = useState<number>(trophies);
  useEffect(() => {
    const init = Array.from({ length: trophies }, (_, i) => ({
      position: i + 1,
      registration_id: "",
      trophies_awarded: 0,
      recipient_ids: [] as string[],
    }));
    setRows(init);
    setTotalPool(trophies);
  }, [trophies]);

  const selectTeam = (idx: number, regId: string) => {
    const n = [...rows];
    n[idx].registration_id = regId;
    const team = accepted?.find((a) => a.id === regId);
    if (team) {
      n[idx].recipient_ids = Array.from(new Set([team.captain_id, ...(team.members_ids ?? [])]));
    } else {
      n[idx].recipient_ids = [];
    }
    setRows(n);
  };

  const toggleRecipient = (idx: number, uid: string) => {
    const n = [...rows];
    const set = new Set(n[idx].recipient_ids);
    if (set.has(uid)) set.delete(uid); else set.add(uid);
    n[idx].recipient_ids = Array.from(set);
    setRows(n);
  };

  const splitEqually = () => {
    const selected = rows.filter((r) => r.registration_id);
    if (selected.length === 0) { toast.error("اختر الفرق أولاً"); return; }
    const base = Math.floor(totalPool / selected.length);
    const rem = totalPool - base * selected.length;
    let idx = 0;
    setRows(rows.map((r) => {
      if (!r.registration_id) return { ...r, trophies_awarded: 0 };
      const extra = idx < rem ? 1 : 0;
      idx++;
      return { ...r, trophies_awarded: base + extra };
    }));
  };

  const save = async () => {
    const valid = rows.filter((r) => r.registration_id);
    if (valid.length === 0) { toast.error("اختر فريقاً واحداً على الأقل"); return; }
    if (valid.some((r) => r.recipient_ids.length === 0)) {
      toast.error("اختر مستلمي الكؤوس لكل مركز"); return;
    }
    const sum = valid.reduce((s, r) => s + (r.trophies_awarded || 0), 0);
    if (sum !== totalPool) {
      toast.error(`المجموع يجب أن يساوي ${totalPool} 🏆 (حالياً ${sum})`); return;
    }
    const { error } = await supabase.from("tournament_results").upsert(
      valid.map((r) => ({
        tournament_id: tournament.id,
        position: r.position,
        registration_id: r.registration_id,
        trophies_awarded: Math.max(0, r.trophies_awarded || 0),
        recipient_ids: r.recipient_ids,
      })) as any,
      { onConflict: "tournament_id,position" }
    );
    if (error) { toast.error(error.message); return; }
    // Auto-finish the tournament — no need for a separate "إنهاء" button
    await supabase.from("tournaments").update({ status: "finished" }).eq("id", tournament.id);
    toast.success("تم حفظ النتائج وتوزيع الكؤوس وإنهاء البطولة.");

    qc.invalidateQueries({ queryKey: ["tournaments"] });
    qc.invalidateQueries({ queryKey: ["t-results", tournament.id] });
    qc.invalidateQueries({ queryKey: ["my-trophies"] });
    qc.invalidateQueries({ queryKey: ["my-trophies-map"] });
    qc.invalidateQueries({ queryKey: ["my-available-trophies"] }); qc.invalidateQueries({ queryKey: ["my-trophies-balance"] });
    qc.invalidateQueries({ queryKey: ["trophy-awards"] });
    onClose();
  };

  const medals = ["🥇", "🥈", "🥉"];
  const totalAssigned = rows.reduce((s, r) => s + (r.registration_id ? (r.trophies_awarded || 0) : 0), 0);
  const remaining = totalPool - totalAssigned;
  return (
    <Modal onClose={onClose}>
      <h3 className="display text-2xl mb-1 flex items-center gap-2"><Medal className="size-5 text-primary" /> إعلان النتائج</h3>
      <p className="text-sm text-muted-foreground mb-4">{tournament.name} — {trophies} مراكز</p>

      <div className="flex items-center gap-3 mb-4 rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="flex-1">
          <div className="text-xs text-muted-foreground mb-1">مجموع كؤوس البطولة (محدّد مسبقاً)</div>
          <div className="text-lg font-bold text-primary">{totalPool} 🏆</div>
        </div>
        <div className="text-xs">
          <div className="text-muted-foreground">موزّع: <span className="font-bold text-foreground">{totalAssigned}</span></div>
          <div className={remaining === 0 ? "text-green-500 font-bold" : "text-red-500 font-bold"}>متبقي: {remaining}</div>
        </div>
        <button type="button" onClick={splitEqually} className="px-3 py-2 rounded-md border border-primary/40 text-primary text-xs font-bold hover:bg-primary/10">
          تقسيم بالتساوي
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row, i) => {
          const team = accepted?.find((a) => a.id === row.registration_id);
          const teamMemberIds = team ? Array.from(new Set([team.captain_id, ...(team.members_ids ?? [])])) : [];
          const perRecipient = row.recipient_ids.length > 0
            ? Math.floor((row.trophies_awarded || 0) / row.recipient_ids.length)
            : 0;
          const capProfile = team ? profiles?.[team.captain_id] : null;
          return (
            <div key={row.position} className="rounded-md border border-border bg-surface-2/30 p-3 space-y-2">
              <div className="text-sm font-bold">{medals[i] ?? `المركز #${row.position}`}</div>
              <select value={row.registration_id} onChange={(e) => selectTeam(i, e.target.value)}
                className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm">
                <option value="">— اختر الفريق —</option>
                {accepted?.map((a: any) => <option key={a.id} value={a.id}>{a.team_name}</option>)}
              </select>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">مجموع الكؤوس 🏆</label>
                <input type="number" min={0} value={row.trophies_awarded}
                  onChange={(e) => { const n = [...rows]; n[i].trophies_awarded = Math.max(0, parseInt(e.target.value) || 0); setRows(n); }}
                  className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
              </div>

              {team && (
                <div className="rounded-md border border-border bg-background/40 p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      مستلمو الكؤوس — بقيادة <b className={isAdminUsername(capProfile?.username) ? "text-primary" : "text-foreground"}>{capProfile?.display_name ?? capProfile?.username ?? "—"}</b>
                      <AdminBadge username={capProfile?.username} size="xs" className="mr-1 ml-0" />
                    </span>
                    <span className="text-primary font-bold">{perRecipient} 🏆 لكل لاعب</span>
                  </div>
                  {teamMemberIds.map((uid) => {
                    const p = profiles?.[uid];
                    const isCap = uid === team.captain_id;
                    const checked = row.recipient_ids.includes(uid);
                    return (
                      <label key={uid} className="flex items-center gap-2 text-xs cursor-pointer rounded px-1.5 py-1 hover:bg-surface-2/60">
                        <input type="checkbox" checked={checked} onChange={() => toggleRecipient(i, uid)} className="accent-primary" />
                        <div className="size-6 rounded-full bg-surface-2 overflow-hidden flex-shrink-0">
                          {p?.avatar_url && <img src={p.avatar_url} alt="" className="size-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="truncate flex items-center gap-1.5">
                            <span className={isAdminUsername(p?.username) ? "text-primary font-bold" : ""}>{p?.display_name ?? p?.username ?? "لاعب"}</span>
                            <AdminBadge username={p?.username} size="xs" />
                          </div>
                          {p?.pubg_id && <div className="text-[9px] text-muted-foreground truncate font-mono">PUBG ID: {p.pubg_id}</div>}
                        </div>
                        {isCap && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">قائد</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-muted-foreground text-center">
        مجموع الكؤوس الموزّعة: <b className="text-primary">{totalAssigned}</b>
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">إلغاء</button>
        <button onClick={save} className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold">إعلان النتائج</button>
      </div>
    </Modal>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    accepted: "bg-green-500/10 text-green-500 border-green-500/30",
    rejected: "bg-red-500/10 text-red-500 border-red-500/30",
  };
  const labels: Record<string, string> = { pending: "قيد المراجعة", accepted: "مقبول", rejected: "مرفوض" };
  return <span className={`text-[10px] px-2 py-1 rounded border ${map[status]}`}>{labels[status]}</span>;
}

function TrophiesPill({ me }: { me: string }) {
  const qc = useQueryClient();
  const { data: total } = useQuery({
    queryKey: ["my-trophies-balance", me],
    queryFn: async () => {
      const { data } = await supabase.rpc("available_trophies", { _user: me });
      return (data as number) ?? 0;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`my-trophies-${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_results" }, () => {
        qc.invalidateQueries({ queryKey: ["my-trophies-balance", me] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "uc_withdrawal_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["my-trophies-balance", me] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `organizer_id=eq.${me}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-trophies-balance", me] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_trophy_grants", filter: `user_id=eq.${me}` }, () => {
        qc.invalidateQueries({ queryKey: ["my-trophies-balance", me] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };

  }, [me, qc]);

  return (
    <div title="كؤوسي" className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm font-bold text-primary">
      <span className="text-base leading-none">🏆</span>
      <span>{(total ?? 0).toLocaleString()}</span>
    </div>
  );
}

