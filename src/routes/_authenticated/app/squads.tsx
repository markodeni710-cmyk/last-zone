import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Mic, MicOff, Users, Plus, Check, X, UserPlus, Inbox, Pencil, Trash2, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProfilePopover } from "@/components/ProfilePopover";
import { AdminBadge } from "@/components/AdminBadge";
import { isAdminUsername } from "@/lib/admin-utils";

export const Route = createFileRoute("/_authenticated/app/squads")({
  component: SquadsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    inbox: typeof search.inbox === "string" ? search.inbox : undefined,
  }),
});


const RANKS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Crown", "Ace", "Ace Master", "Ace Dominator", "Conqueror"];
const REGIONS = ["Asia", "Middle East", "Europe", "North America", "South America", "KRJP"];
const MODES = ["Classic", "Arcade", "TDM", "Metro Royale", "WOW", "Unranked", "Ultimate Royale"];
const MAPS = ["Erangel", "Livik", "Miramar", "Sanhok", "Vikendi", "Karakin"];
const MAP_MODES = new Set(["Classic", "Unranked"]);

function SquadsPage() {
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const [me, setMe] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [applyFor, setApplyFor] = useState<any | null>(null);
  const [inboxFor, setInboxFor] = useState<any | null>(null);
  const [filters, setFilters] = useState<{ rank?: string; region?: string; mode?: string; mic?: boolean }>({});
  const emptyForm = {
    title: "", description: "", rank: "Diamond", server_region: "Middle East", mode: "Classic",
    map: "Erangel", slots_needed: 1, mic_required: true, contact: "", expires_at: "",
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setMe(data.session?.user?.id ?? null)).catch(() => setMe(null)); }, []);

  // Realtime: instant updates for applications affecting this user
  useEffect(() => {
    if (!me) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`squads-page-${me}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "squad_applications", filter: `applicant_id=eq.${me}` },
          () => {
            qc.invalidateQueries({ queryKey: ["my-squad-apps"] });
            qc.invalidateQueries({ queryKey: ["squad-taken-counts"] });
          })
        .on("postgres_changes", { event: "*", schema: "public", table: "squad_applications", filter: `listing_owner_id=eq.${me}` },
          () => {
            qc.invalidateQueries({ queryKey: ["squad-apps-inbox"] });
            qc.invalidateQueries({ queryKey: ["squad-taken-counts"] });
          })
        .on("postgres_changes", { event: "*", schema: "public", table: "squad_listings" },
          () => {
            qc.invalidateQueries({ queryKey: ["squads"] });
            qc.invalidateQueries({ queryKey: ["squad-taken-counts"] });
          })
        .subscribe();
    });
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [me, qc]);



  const { data: myProfile } = useQuery({
    queryKey: ["me-rank", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("rank").eq("id", me!).maybeSingle();
      return data;
    },
  });

  const { data: listings } = useQuery({
    queryKey: ["squads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("squad_listings")
        .select("id, user_id, title, description, rank, server_region, slots_needed, mode, mic_required, status, created_at, expires_at, completed_at, profile:profiles!squad_listings_profile_fkey(username, display_name, avatar_url, role, language)")
        .order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  // Auto-open inbox when navigated from the bell with ?inbox=<listing_id>
  useEffect(() => {
    if (!search.inbox || !listings || !me) return;
    const l = (listings as any[]).find((x) => x.id === search.inbox && x.user_id === me);
    if (l) {
      setInboxFor(l);
      navigate({ search: {} as never, replace: true });
    }
  }, [search.inbox, listings, me, navigate]);



  const listingIdsKey = (listings ?? []).map((l: any) => l.id).join(",");
  const { data: countsData } = useQuery({
    queryKey: ["squad-taken-counts", listingIdsKey],
    enabled: (listings ?? []).length > 0,
    refetchInterval: 30000,
    queryFn: async () => {
      const ids = (listings ?? []).map((l: any) => l.id);
      const { data } = await supabase
        .from("squad_applications")
        .select("listing_id, status")
        .in("listing_id", ids)
        .in("status", ["pending", "accepted"]);
      const accepted = new Map<string, number>();
      const reserved = new Map<string, number>();
      (data ?? []).forEach((a: any) => {
        reserved.set(a.listing_id, (reserved.get(a.listing_id) ?? 0) + 1);
        if (a.status === "accepted") accepted.set(a.listing_id, (accepted.get(a.listing_id) ?? 0) + 1);
      });
      return { accepted, reserved };
    },
  });
  const takenCounts = countsData?.accepted;
  const reservedCounts = countsData?.reserved;

  const { data: myApps } = useQuery({
    queryKey: ["my-squad-apps", me],
    enabled: !!me,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase
        .from("squad_applications")
        .select("id, listing_id, status, expires_at")
        .eq("applicant_id", me!);
      return data ?? [];
    },
  });

  const cancelMyApp = async (appId: string) => {
    if (!confirm("هل تريد إلغاء طلب الانضمام؟")) return;
    const { error } = await supabase.from("squad_applications").delete().eq("id", appId);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إلغاء طلبك");
    qc.invalidateQueries({ queryKey: ["my-squad-apps", me] });
    qc.invalidateQueries({ queryKey: ["squad-taken-counts"] });
  };

  const filtered = useMemo(() => (listings ?? []).filter((l: any) =>
    (!filters.rank || l.rank === filters.rank)
    && (!filters.region || l.server_region === filters.region)
    && (!filters.mode || l.mode === filters.mode)
    && (filters.mic === undefined || l.mic_required === filters.mic)
  ), [listings, filters]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    const { map, mode, ...rest } = form;
    const composedMode = MAP_MODES.has(mode) ? `${mode} (${map})` : mode;
    const payload = { ...rest, mode: composedMode, user_id: me, expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null };
    const { error } = editing
      ? await supabase.from("squad_listings").update(payload).eq("id", editing.id)
      : await supabase.from("squad_listings").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "تم تعديل الإعلان!" : "تم نشر الإعلان!");
    setOpen(false); setEditing(null); setForm(emptyForm);
    qc.invalidateQueries({ queryKey: ["squads"] });
  };

  const openEdit = async (l: any) => {
    setEditing(l);
    let contact = "";
    try {
      const { data } = await supabase.rpc("get_my_squad_contact" as any, { _id: l.id });
      contact = (data as string | null) ?? "";
    } catch { /* ignore */ }
    const rawMode = l.mode ?? "Classic";
    const mapMatch = rawMode.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    const baseMode = mapMatch ? mapMatch[1] : rawMode;
    const mapVal = mapMatch && MAPS.includes(mapMatch[2]) ? mapMatch[2] : "Erangel";
    setForm({
      title: l.title ?? "", description: l.description ?? "", rank: l.rank ?? "Diamond",
      server_region: l.server_region ?? "Middle East", mode: MODES.includes(baseMode) ? baseMode : "Classic",
      map: mapVal,
      slots_needed: l.slots_needed ?? 1, mic_required: !!l.mic_required, contact,
      expires_at: l.expires_at ? new Date(l.expires_at).toISOString().slice(0, 16) : "",
    });
    setOpen(true);
  };

  const removeListing = async (l: any) => {
    if (!confirm(`حذف إعلان "${l.title}"؟`)) return;
    const { error } = await supabase.from("squad_listings").delete().eq("id", l.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["squads"] });
  };

  const toggleStatus = async (l: any) => {
    const status = l.status === "closed" ? "open" : "closed";
    const { error } = await supabase.from("squad_listings").update({ status }).eq("id", l.id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "closed" ? "تم إغلاق الطلب" : "تم فتح الطلب");
    qc.invalidateQueries({ queryKey: ["squads"] });
  };

  const now = Date.now();

  // Auto-delete completed listings 3 min after completion. Any signed-in viewer
  // can trigger the cleanup RPC, then realtime removes the row for everyone.
  useEffect(() => {
    if (!me || !listings) return;
    const iv = setInterval(() => {
      const t = Date.now();
      let cleanupNeeded = false;
      (listings as any[]).forEach((l) => {
        if (!l.completed_at) return;
        const deleteAt = new Date(l.completed_at).getTime() + 3 * 60 * 1000;
        if (t >= deleteAt) {
          cleanupNeeded = true;
        }
      });
      if (cleanupNeeded) {
        supabase.rpc("cleanup_completed_squad_listings" as any).then(() => {
          qc.invalidateQueries({ queryKey: ["squads"] });
          qc.invalidateQueries({ queryKey: ["squad-taken-counts"] });
        });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [listings, me, qc]);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 className="display text-5xl mb-2">ابحث عن <span className="text-gradient-gold">سكواد</span></h1>
            <p className="text-muted-foreground">انضم لتيم في ثوانٍ. حسب رانكك وسيرفرك ومودك المفضل.</p>
          </div>
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-md bg-gradient-gold px-5 py-2.5 text-sm font-bold text-primary-foreground">
            <Plus className="size-4" /> تشكيل فريق
          </button>

        </div>

        <div className="rounded-xl border border-border bg-surface/40 p-4 mb-5 flex flex-nowrap gap-2 items-center overflow-x-auto">
          <FilterSelect label="الرانك" value={filters.rank} options={RANKS} onChange={(v) => setFilters({ ...filters, rank: v })} />
          <FilterSelect label="السيرفر" value={filters.region} options={REGIONS} onChange={(v) => setFilters({ ...filters, region: v })} />
          <FilterSelect label="المود" value={filters.mode} options={MODES} onChange={(v) => setFilters({ ...filters, mode: v })} />
          <label className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border">
            <input type="checkbox" checked={filters.mic === true} onChange={(e) => setFilters({ ...filters, mic: e.target.checked ? true : undefined })} className="accent-primary" />
            مايك فقط
          </label>
          {(filters.rank || filters.region || filters.mode || filters.mic) && (
            <button onClick={() => setFilters({})} className="text-xs text-muted-foreground hover:text-foreground mr-auto">مسح الفلاتر</button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {filtered.length === 0 && (
            <div className="col-span-2 rounded-2xl border border-dashed border-border bg-surface/40 p-12 text-center">
              <Users className="size-12 text-primary mx-auto mb-3" />
              <p className="text-muted-foreground">ما في نتائج بهذه الفلاتر.</p>
            </div>
          )}
          {filtered.map((l: any) => {
            const isOwner = l.user_id === me;
            const myApp = myApps?.find((a) => a.listing_id === l.id);
            const expired = l.expires_at && new Date(l.expires_at).getTime() < now;
            const acceptedCount = takenCounts?.get(l.id) ?? 0;
            const reservedCount = reservedCounts?.get(l.id) ?? 0;
            const full = acceptedCount >= l.slots_needed;
            const reservedFull = reservedCount >= l.slots_needed;
            const closed = l.status === "closed" || expired || full;
            const rankMismatch = !!myProfile?.rank && myProfile.rank !== l.rank;
            return (
              <div key={l.id} className={`rounded-xl border bg-surface/60 backdrop-blur overflow-hidden transition ${closed ? "border-border/50 opacity-90" : "border-border hover:border-primary/40"}`}>
                {full && !expired && l.status !== "closed" && l.completed_at && (
                  <div className="bg-gradient-to-r from-green-500/20 via-green-500/10 to-green-500/20 border-b border-green-500/40 px-4 py-2.5 flex items-center justify-center gap-2 text-green-400 font-bold text-sm">
                    <span className="size-2 rounded-full bg-green-400 animate-pulse" />
                    مكتمل · يُحذف خلال <Countdown until={new Date(new Date(l.completed_at).getTime() + 3 * 60 * 1000).toISOString()} />
                  </div>
                )}
                <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <ProfilePopover userId={l.user_id}>
                    <button className="flex items-center gap-3 hover:opacity-80 transition">
                      <div className={"size-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold overflow-hidden " + (isAdminUsername(l.profile?.username) ? "ring-2 ring-primary shadow-[0_0_10px_rgba(212,170,80,0.5)]" : "")}>
                        {l.profile?.avatar_url ? <img src={l.profile.avatar_url} alt="" className="size-full object-cover" /> : (l.profile?.display_name ?? "؟").slice(0, 1)}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm flex items-center gap-1.5">
                          <span className={isAdminUsername(l.profile?.username) ? "text-primary" : ""}>{l.profile?.display_name || l.profile?.username}</span>
                          <AdminBadge username={l.profile?.username} size="xs" />
                        </div>
                        <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString("ar")}</div>
                      </div>
                    </button>
                  </ProfilePopover>
                  {l.mic_required ? <Mic className="size-4 text-primary" /> : <MicOff className="size-4 text-muted-foreground" />}
                </div>
                <h3 className="display text-xl mb-1">{l.title}</h3>
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{l.description}</p>
                <div className="flex flex-wrap gap-2 text-xs mb-4">
                  <span className="px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">{l.rank}</span>
                  <span className="px-2 py-1 rounded bg-surface-2 border border-border">{l.server_region}</span>
                  <span className="px-2 py-1 rounded bg-surface-2 border border-border">{l.mode}</span>
                  <span className="px-2 py-1 rounded bg-surface-2 border border-border">{acceptedCount}/{l.slots_needed}</span>
                  {full && !expired && l.status !== "closed" && !l.completed_at && (
                    <span className="px-2 py-1 rounded bg-green-500/10 text-green-500 border border-green-500/30">مكتمل</span>
                  )}
                  {(l.status === "closed" || expired) && <span className="px-2 py-1 rounded bg-red-500/10 text-red-500 border border-red-500/30">{expired ? "منتهي" : "مغلق"}</span>}
                  {l.expires_at && !expired && <span className="px-2 py-1 rounded bg-surface-2 border border-border">ينتهي {new Date(l.expires_at).toLocaleDateString("ar")}</span>}
                </div>

                {isOwner ? (
                  <div className="space-y-2">
                    <button onClick={() => setInboxFor(l)} className="w-full py-2 rounded-md border border-primary/40 text-primary text-sm font-bold hover:bg-primary/10 transition flex items-center justify-center gap-2">
                      <Inbox className="size-4" /> الطلبات الواردة
                    </button>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => openEdit(l)} className="py-1.5 rounded-md border border-border text-xs flex items-center justify-center gap-1 hover:bg-surface-2"><Pencil className="size-3" /> تعديل</button>
                      <button onClick={() => toggleStatus(l)} disabled={!!expired} className="py-1.5 rounded-md border border-border text-xs flex items-center justify-center gap-1 hover:bg-surface-2 disabled:opacity-40">
                        {l.status === "closed" ? <><Unlock className="size-3" /> فتح</> : <><Lock className="size-3" /> إغلاق</>}
                      </button>
                      <button onClick={() => removeListing(l)} className="py-1.5 rounded-md border border-red-500/40 text-red-500 text-xs flex items-center justify-center gap-1 hover:bg-red-500/10"><Trash2 className="size-3" /> حذف</button>
                    </div>
                  </div>
                ) : myApp && myApp.status === "pending" ? (
                  <div className="space-y-2">
                    <div className="w-full py-2 rounded-md border border-primary/40 bg-primary/5 text-primary text-xs font-bold text-center">
                      طلبك قيد المراجعة · <Countdown until={myApp.expires_at} />
                    </div>
                    <button onClick={() => cancelMyApp(myApp.id)} className="w-full py-1.5 rounded-md border border-red-500/40 text-red-500 text-xs font-bold hover:bg-red-500/10 transition flex items-center justify-center gap-1">
                      <X className="size-3" /> إلغاء الطلب
                    </button>
                  </div>
                ) : full ? (
                  <button disabled className="w-full py-2 rounded-md border border-green-500/30 text-green-500 text-sm font-bold">مكتمل</button>
                ) : closed ? (
                  <button disabled className="w-full py-2 rounded-md border border-border text-muted-foreground text-sm font-bold">{expired ? "انتهى الطلب" : "الطلب مغلق"}</button>
                ) : myApp ? (
                  <button disabled className="w-full py-2 rounded-md border border-border text-muted-foreground text-sm font-bold">
                    {myApp.status === "accepted" && "تم قبولك ✓"}
                    {myApp.status === "rejected" && "تم رفض طلبك"}
                    {myApp.status === "expired" && "انتهت مدة الطلب"}
                  </button>
                ) : reservedFull ? (
                  <button disabled className="w-full py-2 rounded-md border border-border text-muted-foreground text-sm font-bold">لا توجد أماكن متاحة حالياً</button>
                ) : rankMismatch ? (
                  <button disabled title={`هذا الإعلان لرانك ${l.rank}`} className="w-full py-2 rounded-md border border-border text-muted-foreground text-sm font-bold">
                    رانكك لا يطابق ({l.rank})
                  </button>
                ) : (
                  <button onClick={() => setApplyFor(l)} className="w-full py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold flex items-center justify-center gap-2">
                    <UserPlus className="size-4" /> اطلب الانضمام
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
            <h3 className="display text-3xl mb-4">{editing ? "تعديل الإعلان" : "تشكيل فريق"}</h3>
            <div className="space-y-3">
              <input required placeholder="عنوان (مثلاً: بحث عن سنايبر للرانكد)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
              <textarea placeholder="تفاصيل (الجدول، اللغة، الخبرة...)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm resize-none" />
              <div className="grid grid-cols-3 gap-2">
                <select value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} className="rounded-md bg-input border border-border px-2 py-2 text-sm">
                  {RANKS.map((r) => <option key={r}>{r}</option>)}
                </select>
                <select value={form.server_region} onChange={(e) => setForm({ ...form, server_region: e.target.value })} className="rounded-md bg-input border border-border px-2 py-2 text-sm">
                  {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
                <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className="rounded-md bg-input border border-border px-2 py-2 text-sm">
                  {MODES.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              {MAP_MODES.has(form.mode) && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">الخريطة</label>
                  <select value={form.map} onChange={(e) => setForm({ ...form, map: e.target.value })} className="w-full rounded-md bg-input border border-border px-2 py-2 text-sm">
                    {MAPS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min={1} max={3} value={form.slots_needed} onChange={(e) => setForm({ ...form, slots_needed: Math.min(3, Math.max(1, +e.target.value)) })} className="rounded-md bg-input border border-border px-3 py-2 text-sm" />
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">عدد الأشخاص المطلوب (1–3 كحد أقصى)</p>
              <input placeholder="وسيلة التواصل (Discord, IGN)" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
              <div>
                <label className="text-xs text-muted-foreground block mb-1">تاريخ انتهاء الطلب (اختياري)</label>
                <input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.mic_required} onChange={(e) => setForm({ ...form, mic_required: e.target.checked })} className="accent-primary" />
                مايك مطلوب
              </label>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button type="button" onClick={() => { setOpen(false); setEditing(null); setForm(emptyForm); }} className="px-4 py-2 text-sm text-muted-foreground">إلغاء</button>
              <button type="submit" className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold">{editing ? "حفظ" : "نشر"}</button>
            </div>
          </form>
        </Modal>
      )}

      {applyFor && me && (
        <ApplyDialog listing={applyFor} me={me} onClose={() => setApplyFor(null)} onDone={() => {
          setApplyFor(null);
          qc.invalidateQueries({ queryKey: ["my-squad-apps", me] });
        }} />
      )}

      {inboxFor && <ApplicationsInbox listing={inboxFor} onClose={() => setInboxFor(null)} />}
    </div>
  );
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

function ApplyDialog({ listing, me, onClose, onDone }: { listing: any; me: string; onClose: () => void; onDone: () => void }) {
  const [pubgId, setPubgId] = useState("");
  const [editingId, setEditingId] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("pubg_id").eq("id", me).maybeSingle();
      if (data?.pubg_id) setPubgId(data.pubg_id);
      else setEditingId(true);
      setLoadingProfile(false);
    })();
  }, [me]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pubgId.trim()) { toast.error("يرجى إدخال ID اللعبة"); return; }
    const { error } = await supabase.from("squad_applications").insert({
      listing_id: listing.id, applicant_id: me, listing_owner_id: listing.user_id,
      message, contact, pubg_id: pubgId.trim(),
    } as any);
    if (error) { toast.error(error.message.includes("duplicate") ? "أرسلت طلب لهذا المنشور مسبقًا" : error.message); return; }
    toast.success("تم إرسال الطلب! ستحصل على رد خلال 15 دقيقة");
    onDone();
  };

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <h3 className="display text-2xl mb-1">طلب انضمام</h3>
        <p className="text-sm text-muted-foreground mb-1">{listing.title}</p>
        <p className="text-[11px] text-primary mb-4">⏱ ينتهي الطلب تلقائيًا بعد 15 دقيقة إن لم يقبله القائد</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">ID اللعبة (PUBG Mobile) *</label>
            {loadingProfile ? (
              <div className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm text-muted-foreground">جاري الجلب...</div>
            ) : !editingId ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md bg-input border border-border px-3 py-2 text-sm font-mono font-bold">{pubgId}</div>
                <button type="button" onClick={() => setEditingId(true)} className="px-3 py-2 rounded-md border border-border text-xs hover:bg-muted whitespace-nowrap">تغيير</button>
              </div>
            ) : (
              <input required autoFocus placeholder="مثال: 5123456789" value={pubgId} onChange={(e) => setPubgId(e.target.value)} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
            )}
          </div>
          <textarea placeholder="عرّف بنفسك (التايم زون، الدور...)" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm resize-none" />
          <input placeholder="وسيلة التواصل (Discord / IGN)" value={contact} onChange={(e) => setContact(e.target.value)} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
        </div>
        <div className="flex gap-2 justify-end mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">إلغاء</button>
          <button type="submit" className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold">إرسال الطلب</button>
        </div>
      </form>
    </Modal>
  );
}

function ApplicationsInbox({ listing, onClose }: { listing: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: apps } = useQuery({
    queryKey: ["squad-apps-inbox", listing.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("squad_applications")
        .select("*, profile:profiles!squad_applications_applicant_id_fkey(display_name, username, avatar_url, rank, role)")
        .eq("listing_id", listing.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Realtime: instant inbox updates
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`squad-inbox-${listing.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "squad_applications", filter: `listing_id=eq.${listing.id}` },
          () => {
            qc.invalidateQueries({ queryKey: ["squad-apps-inbox", listing.id] });
            qc.invalidateQueries({ queryKey: ["squad-taken-counts"] });
          })
        .subscribe();
    });
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [listing.id, qc]);

  // Auto-reject expired pending applications on the admin side (instant, no cron wait)
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      (apps ?? []).forEach((a: any) => {
        if (a.status === "pending" && a.expires_at && new Date(a.expires_at).getTime() <= now) {
          supabase.from("squad_applications").update({ status: "expired" }).eq("id", a.id).then(() => {
            qc.invalidateQueries({ queryKey: ["squad-apps-inbox", listing.id] });
            qc.invalidateQueries({ queryKey: ["squad-taken-counts"] });
          });
        }
      });
    }, 2000);
    return () => clearInterval(iv);
  }, [apps, listing.id, qc]);

  const updateStatus = async (id: string, status: "accepted" | "rejected") => {
    const { error } = await supabase.from("squad_applications").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "accepted" ? "تم قبول اللاعب" : "تم رفض الطلب");

    // If this acceptance completes the squad, mark completed_at to trigger 3-min auto-delete
    if (status === "accepted" && !listing.completed_at) {
      const { count } = await supabase
        .from("squad_applications")
        .select("id", { count: "exact", head: true })
        .eq("listing_id", listing.id)
        .eq("status", "accepted");
      if ((count ?? 0) >= (listing.slots_needed ?? 1)) {
        await supabase.from("squad_listings").update({ completed_at: new Date().toISOString() } as any).eq("id", listing.id);
      }
    }

    qc.invalidateQueries({ queryKey: ["squad-apps-inbox", listing.id] });
    qc.invalidateQueries({ queryKey: ["squad-taken-counts"] });
    qc.invalidateQueries({ queryKey: ["squads"] });
  };


  return (
    <Modal onClose={onClose}>
      <h3 className="display text-2xl mb-1">الطلبات</h3>
      <p className="text-sm text-muted-foreground mb-4">{listing.title}</p>
      <div className="space-y-3 max-h-[60vh] overflow-y-auto">
        {apps?.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">لا توجد طلبات بعد.</p>}
        {apps?.map((a: any) => (
          <div key={a.id} className="rounded-xl border border-border bg-surface-2/50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={"size-9 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold text-xs overflow-hidden " + (isAdminUsername(a.profile?.username) ? "ring-2 ring-primary shadow-[0_0_8px_rgba(212,170,80,0.5)]" : "")}>
                {a.profile?.avatar_url ? <img src={a.profile.avatar_url} alt="" className="size-full object-cover" /> : (a.profile?.display_name ?? "؟").slice(0, 1)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold flex items-center gap-1.5">
                  <span className={isAdminUsername(a.profile?.username) ? "text-primary" : ""}>{a.profile?.display_name || a.profile?.username}</span>
                  <AdminBadge username={a.profile?.username} size="xs" />
                </div>
                <div className="text-[10px] text-muted-foreground">{a.profile?.rank ?? "—"} · {a.profile?.role ?? "—"}</div>
              </div>
              <StatusBadge status={a.status} />
            </div>
            {a.pubg_id && <p className="text-xs mb-1"><span className="text-muted-foreground">ID اللعبة:</span> <span className="font-mono font-bold">{a.pubg_id}</span></p>}
            {a.message && <p className="text-sm mb-2">{a.message}</p>}
            {a.contact && <p className="text-xs text-muted-foreground mb-2">للتواصل: <span className="text-foreground">{a.contact}</span></p>}
            {a.expires_at && a.status === "pending" && (
              <p className="text-[11px] text-yellow-500 mb-2 font-bold">⏱ يتبقى: <Countdown until={a.expires_at} /></p>
            )}
            {a.status === "pending" && (
              <div className="flex gap-2 justify-end">
                <button onClick={() => updateStatus(a.id, "rejected")} className="px-3 py-1.5 rounded-md border border-border text-xs flex items-center gap-1 hover:bg-surface-2"><X className="size-3" /> رفض</button>
                <button onClick={() => updateStatus(a.id, "accepted")} className="px-3 py-1.5 rounded-md bg-gradient-gold text-primary-foreground text-xs font-bold flex items-center gap-1"><Check className="size-3" /> قبول</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    accepted: "bg-green-500/10 text-green-500 border-green-500/30",
    rejected: "bg-red-500/10 text-red-500 border-red-500/30",
    expired: "bg-muted text-muted-foreground border-border",
  };
  const labels: Record<string, string> = { pending: "قيد المراجعة", accepted: "مقبول", rejected: "مرفوض", expired: "منتهي" };
  return <span className={`text-[10px] px-2 py-1 rounded border ${map[status] ?? map.expired}`}>{labels[status] ?? status}</span>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (v: string | undefined) => void }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className="rounded-md bg-input border border-border px-3 py-1.5 text-xs">
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Countdown({ until }: { until: string | null | undefined }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  if (!until) return <span>—</span>;
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return <span className="text-red-500">انتهى</span>;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return <span>{m}:{s.toString().padStart(2, "0")}</span>;
}
