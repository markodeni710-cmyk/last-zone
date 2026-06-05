import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Trophy, Search, ArrowLeft, Users, Ban, Trash2, UserCheck, Wallet, Check, X, ShoppingBag, Crown, Plus, Pencil, Eye, EyeOff, AlertTriangle, Fingerprint, Globe, Mic, Save } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getAgoraSettings, updateAgoraSetting } from "@/lib/agora-settings.functions";
import {
  setUserSuspension,
  deleteUserAccount,
  getUserOverview,
  adminDeleteServers,
  adminLeaveServers,
  adminDeleteClips,
  adminDeleteClipComments,
  adminDeleteSquads,
  adminDeleteSquadApplications,
  adminDeleteTournaments,
  adminDeleteTournamentRegistrations,
  adminRenameUser,
} from "@/lib/admin-users.functions";
import { getSuspiciousAccounts, getUserSessions } from "@/lib/session-tracker.functions";



export const Route = createFileRoute("/_authenticated/app/admin")({
  component: AdminPage,
});

type Section = "menu" | "grant-trophies" | "manage-users" | "withdrawals" | "shop-packages" | "security" | "agora-settings";


function AdminPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("menu");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setAllowed(false); return; }
      const { data: p } = await supabase.from("profiles").select("username").eq("id", data.user.id).maybeSingle();
      const ok = p?.username === "moniromran";
      setAllowed(ok);
      if (ok) setAdminId(data.user.id);
    })();
  }, []);

  if (allowed === null) {
    return <div className="p-6 text-sm text-muted-foreground">جاري التحقق...</div>;
  }
  if (!allowed) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <Shield className="size-12 mx-auto text-destructive mb-3" />
        <h2 className="display text-2xl mb-2">غير مصرّح</h2>
        <p className="text-sm text-muted-foreground mb-4">هذه الصفحة مخصصة للإدارة فقط.</p>
        <button onClick={() => navigate({ to: "/app" })} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm">رجوع</button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="size-7 text-primary" />
          <div>
            <h1 className="display text-3xl">الإدارة</h1>
            <p className="text-xs text-muted-foreground">لوحة تحكم خاصة بالمشرف</p>
          </div>
        </div>

        {section === "menu" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setSection("grant-trophies")}
              className="text-right rounded-2xl bg-surface border border-border p-5 hover:border-primary/40 hover:bg-surface/80 transition"
            >
              <Trophy className="size-7 text-primary mb-2" />
              <div className="font-bold text-lg">إضافة كؤوس</div>
              <div className="text-xs text-muted-foreground mt-1">منح كؤوس لأي مستخدم حسب اسمه</div>
            </button>
            <button
              onClick={() => setSection("manage-users")}
              className="text-right rounded-2xl bg-surface border border-border p-5 hover:border-primary/40 hover:bg-surface/80 transition"
            >
              <Users className="size-7 text-primary mb-2" />
              <div className="font-bold text-lg">إدارة المستخدمين</div>
              <div className="text-xs text-muted-foreground mt-1">تجميد أو حذف الحسابات نهائياً</div>
            </button>
            <button
              onClick={() => setSection("withdrawals")}
              className="text-right rounded-2xl bg-surface border border-border p-5 hover:border-primary/40 hover:bg-surface/80 transition"
            >
              <Wallet className="size-7 text-primary mb-2" />
              <div className="font-bold text-lg">طلبات سحب الشدات</div>
              <div className="text-xs text-muted-foreground mt-1">مراجعة وتنفيذ طلبات سحب UC</div>
            </button>
            <button
              onClick={() => setSection("shop-packages")}
              className="text-right rounded-2xl bg-surface border border-border p-5 hover:border-primary/40 hover:bg-surface/80 transition"
            >
              <ShoppingBag className="size-7 text-primary mb-2" />
              <div className="font-bold text-lg">إدارة المتجر</div>
              <div className="text-xs text-muted-foreground mt-1">حزم الكؤوس وسحب UC: إضافة، تعديل، إخفاء، عروض</div>
            </button>
            <button
              onClick={() => setSection("security")}
              className="text-right rounded-2xl bg-surface border border-border p-5 hover:border-primary/40 hover:bg-surface/80 transition"
            >
              <AlertTriangle className="size-7 text-primary mb-2" />
              <div className="font-bold text-lg">الحسابات المشبوهة</div>
              <div className="text-xs text-muted-foreground mt-1">كشف الحسابات المتعددة بنفس الجهاز أو الشبكة</div>
            </button>
            <button
              onClick={() => setSection("agora-settings")}
              className="text-right rounded-2xl bg-surface border border-border p-5 hover:border-primary/40 hover:bg-surface/80 transition"
            >
              <Mic className="size-7 text-primary mb-2" />
              <div className="font-bold text-lg">إعدادات Agora</div>
              <div className="text-xs text-muted-foreground mt-1">تعديل App ID و Primary Certificate للقنوات الصوتية</div>
            </button>
          </div>
        )}

        {section === "grant-trophies" && adminId && (
          <GrantTrophiesSection adminId={adminId} onBack={() => setSection("menu")} />
        )}

        {section === "manage-users" && adminId && (
          <ManageUsersSection adminId={adminId} onBack={() => setSection("menu")} />
        )}

        {section === "withdrawals" && (
          <WithdrawalsSection onBack={() => setSection("menu")} />
        )}

        {section === "shop-packages" && (
          <ShopPackagesSection onBack={() => setSection("menu")} />
        )}

       {section === "security" && adminId && (
         <SecuritySection adminId={adminId} onBack={() => setSection("menu")} />

        )}

        {section === "agora-settings" && (
          <AgoraSettingsSection onBack={() => setSection("menu")} />
        )}

      </div>
    </div>
  );
}

function AgoraSettingsSection({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getAgoraSettings);
  const updateSetting = useServerFn(updateAgoraSetting);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-agora-settings"],
    queryFn: () => fetchSettings({ data: {} as any }),
  });

  const [appId, setAppId] = useState("");
  const [appCert, setAppCert] = useState("");
  const [showId, setShowId] = useState(false);
  const [showCert, setShowCert] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const save = async (key: "AGORA_APP_ID" | "AGORA_APP_CERTIFICATE", value: string) => {
    const v = value.trim();
    if (!v) { toast.error("القيمة فارغة"); return; }
    setSaving(key);
    try {
      await updateSetting({ data: { key, value: v } });
      toast.success("تم الحفظ");
      if (key === "AGORA_APP_ID") setAppId("");
      else setAppCert("");
      qc.invalidateQueries({ queryKey: ["admin-agora-settings"] });
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(null);
    }
  };

  const renderRow = (
    label: string,
    key: "AGORA_APP_ID" | "AGORA_APP_CERTIFICATE",
    value: string,
    setValue: (v: string) => void,
    show: boolean,
    setShow: (b: boolean) => void,
  ) => {
    const info = data?.[key];
    return (
      <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold">{label}</div>
          {info?.hasValue ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              {info.fromEnv ? "من المتغيرات" : "مخصص"}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">غير معدّ</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground font-mono break-all">
          {info?.hasValue ? info.masked : "—"}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={show ? "text" : "password"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="أدخل القيمة الجديدة"
              className="w-full bg-background border border-border rounded-md px-3 py-2 pr-9 text-sm font-mono"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <button
            onClick={() => save(key, value)}
            disabled={saving === key || !value.trim()}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm flex items-center gap-1 disabled:opacity-50"
          >
            <Save className="size-4" />
            حفظ
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-4" /> رجوع
        </button>
      </div>
      <div className="flex items-center gap-3">
        <Mic className="size-6 text-primary" />
        <div>
          <h2 className="display text-2xl">إعدادات Agora</h2>
          <p className="text-xs text-muted-foreground">تُستخدم لتشغيل القنوات الصوتية والمكالمات. أي تغيير يُطبَّق فوراً.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">جاري التحميل...</div>
      ) : (
        <div className="grid gap-3">
          {renderRow("App ID", "AGORA_APP_ID", appId, setAppId, showId, setShowId)}
          {renderRow("Primary Certificate", "AGORA_APP_CERTIFICATE", appCert, setAppCert, showCert, setShowCert)}
        </div>
      )}

      <div className="text-xs text-muted-foreground rounded-lg bg-surface/60 border border-border p-3">
        احصل على القيم من لوحة تحكم Agora: Project Management → اختر المشروع → App ID و Primary Certificate.
      </div>
    </div>
  );
}

function GrantTrophiesSection({ adminId, onBack }: { adminId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; username: string; display_name: string | null } | null>(null);
  const [amount, setAmount] = useState<number>(10);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: results } = useQuery({
    queryKey: ["admin-user-search", query],
    enabled: query.trim().length >= 2 && !selected,
    queryFn: async () => {
      const q = query.trim();
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .ilike("username", `%${q}%`)
        .limit(8);
      return data ?? [];
    },
  });

  const { data: grants } = useQuery({
    queryKey: ["admin-recent-grants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_trophy_grants")
        .select("id, user_id, amount, note, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      if (!data || data.length === 0) return [];
      const ids = Array.from(new Set(data.map((g: any) => g.user_id)));
      const { data: profs } = await supabase
        .from("profiles").select("id, username, display_name").in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return data.map((g: any) => ({ ...g, profile: map.get(g.user_id) }));
    },
  });

  const submit = async () => {
    if (!selected) { toast.error("اختر مستخدماً أولاً"); return; }
    if (!amount || amount <= 0) { toast.error("أدخل عدد كؤوس صحيح"); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("admin_trophy_grants").insert({
        user_id: selected.id,
        amount,
        note: note.trim() || null,
        granted_by: adminId,
      } as any);
      if (error) { toast.error(error.message || "فشل المنح"); return; }
      toast.success(`تم منح ${amount} كأس إلى ${selected.username}`);
      setSelected(null); setQuery(""); setAmount(10); setNote("");
      qc.invalidateQueries({ queryKey: ["admin-recent-grants"] });
      qc.invalidateQueries({ queryKey: ["admin-grants-mine", selected.id] });
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> رجوع
      </button>

      <div className="rounded-2xl bg-surface border border-border p-5">
        <h2 className="display text-2xl mb-4 flex items-center gap-2"><Trophy className="size-6 text-primary" /> إضافة كؤوس</h2>

        <label className="block text-xs text-muted-foreground mb-1">المستخدم (ابحث باسم المستخدم)</label>
        {selected ? (
          <div className="flex items-center justify-between rounded-md bg-input border border-border px-3 py-2 mb-3">
            <div className="text-sm">
              <span className="font-bold">{selected.username}</span>
              {selected.display_name && <span className="text-muted-foreground mr-2">— {selected.display_name}</span>}
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-destructive">تغيير</button>
          </div>
        ) : (
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اكتب اسم المستخدم..."
              className="w-full rounded-md bg-input border border-border pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {query.trim().length >= 2 && results && results.length > 0 && (
              <div className="absolute z-10 right-0 left-0 mt-1 rounded-md bg-popover border border-border shadow-lg overflow-hidden">
                {results.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u); setQuery(""); }}
                    className="w-full text-right px-3 py-2 hover:bg-surface transition text-sm"
                  >
                    <span className="font-bold">{u.username}</span>
                    {u.display_name && <span className="text-muted-foreground mr-2 text-xs">— {u.display_name}</span>}
                  </button>
                ))}
              </div>
            )}
            {query.trim().length >= 2 && results && results.length === 0 && (
              <div className="text-xs text-muted-foreground mt-2">لا يوجد مستخدمون مطابقون.</div>
            )}
          </div>
        )}

        <label className="block text-xs text-muted-foreground mb-1">عدد الكؤوس</label>
        <input
          type="number" min={1}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value || "0", 10)))}
          className="w-full rounded-md bg-input border border-border px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        <label className="block text-xs text-muted-foreground mb-1">ملاحظة (اختياري)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="سبب المنح..."
          className="w-full rounded-md bg-input border border-border px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        <button
          onClick={submit}
          disabled={submitting || !selected}
          className="w-full px-5 py-2.5 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold disabled:opacity-50"
        >
          {submitting ? "جاري المنح..." : "منح الكؤوس"}
        </button>
      </div>

      <div className="rounded-2xl bg-surface border border-border p-5">
        <h3 className="font-bold mb-3 text-sm">آخر المنح</h3>
        {!grants || grants.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد منح بعد.</p>
        ) : (
          <div className="space-y-2">
            {grants.map((g: any) => (
              <div key={g.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                <div>
                  <div className="font-bold">{g.profile?.username ?? g.user_id.slice(0, 8)}</div>
                  {g.note && <div className="text-xs text-muted-foreground">{g.note}</div>}
                  <div className="text-[10px] text-muted-foreground">{new Date(g.created_at).toLocaleString("ar")}</div>
                </div>
                <div className="flex items-center gap-1 text-primary font-bold">
                  <Trophy className="size-4" /> {g.amount}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ManageUsersSection({ adminId, onBack }: { adminId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [durationHours, setDurationHours] = useState<number>(24);
  const [busy, setBusy] = useState(false);
  const suspendFn = useServerFn(setUserSuspension);
  const deleteFn = useServerFn(deleteUserAccount);

  const { data: results } = useQuery({
    queryKey: ["admin-user-manage-search", query],
    enabled: query.trim().length >= 2 && !selected,
    queryFn: async () => {
      const q = query.trim();
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, suspended_at, suspension_reason, suspended_until")
        .ilike("username", `%${q}%`)
        .limit(8);
      return data ?? [];
    },
  });

  const reloadSelected = async (id: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, suspended_at, suspension_reason, suspended_until")
      .eq("id", id)
      .maybeSingle();
    if (data) setSelected(data);
  };

  const doSuspend = async (mode: "temp" | "perm") => {
    if (!selected) return;
    if (selected.id === adminId) { toast.error("لا يمكنك تجميد حسابك"); return; }
    if (!reason.trim()) { toast.error("اكتب سبب التجميد"); return; }
    if (mode === "temp" && (!durationHours || durationHours <= 0)) {
      toast.error("أدخل عدد ساعات صحيح");
      return;
    }
    setBusy(true);
    try {
      await suspendFn({
        data: {
          userId: selected.id,
          suspend: true,
          reason: reason.trim(),
          durationHours: mode === "temp" ? durationHours : null,
        },
      });
      toast.success(mode === "temp" ? `تم تجميد ${selected.username} مؤقتاً` : `تم تجميد ${selected.username} نهائياً`);
      setReason("");
      await reloadSelected(selected.id);
      qc.invalidateQueries({ queryKey: ["admin-user-manage-search"] });
    } catch (e: any) {
      toast.error(e?.message || "فشل التنفيذ");
    } finally {
      setBusy(false);
    }
  };

  const doUnsuspend = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await suspendFn({ data: { userId: selected.id, suspend: false } });
      toast.success(`تم إلغاء التجميد عن ${selected.username}`);
      await reloadSelected(selected.id);
      qc.invalidateQueries({ queryKey: ["admin-user-manage-search"] });
    } catch (e: any) {
      toast.error(e?.message || "فشل التنفيذ");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!selected) return;
    if (selected.id === adminId) { toast.error("لا يمكنك حذف حسابك"); return; }
    if (!confirm(`هل أنت متأكد من حذف حساب "${selected.username}" نهائياً؟ لا يمكن التراجع.`)) return;
    setBusy(true);
    try {
      await deleteFn({ data: { userId: selected.id } });
      toast.success(`تم حذف ${selected.username} نهائياً`);
      setSelected(null);
      setQuery("");
    } catch (e: any) {
      toast.error(e?.message || "فشل الحذف");
    } finally {
      setBusy(false);
    }
  };

  const suspended = !!selected?.suspended_at;
  const untilTxt = selected?.suspended_until
    ? `حتى ${new Date(selected.suspended_until).toLocaleString("ar")}`
    : "نهائي";

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> رجوع
      </button>

      <div className="rounded-2xl bg-surface border border-border p-5">
        <h2 className="display text-2xl mb-4 flex items-center gap-2">
          <Users className="size-6 text-primary" /> إدارة المستخدمين
        </h2>

        <label className="block text-xs text-muted-foreground mb-1">المستخدم (ابحث باسم المستخدم)</label>
        {selected ? (
          <div className="rounded-md bg-input border border-border px-3 py-2.5 mb-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <div className="font-bold flex items-center gap-2">
                  {selected.username}
                  {suspended && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">مجمد</span>
                  )}
                </div>
                {selected.display_name && <div className="text-xs text-muted-foreground">{selected.display_name}</div>}
                {suspended && (
                  <div className="text-[11px] text-destructive mt-1">
                    {selected.suspension_reason || "بدون سبب"} — {untilTxt}
                  </div>
                )}
              </div>
              <button onClick={() => { setSelected(null); setReason(""); }} className="text-xs text-muted-foreground hover:text-destructive">
                تغيير
              </button>
            </div>
          </div>
        ) : (
          <div className="relative mb-4">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اكتب اسم المستخدم..."
              className="w-full rounded-md bg-input border border-border pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {query.trim().length >= 2 && results && results.length > 0 && (
              <div className="absolute z-10 right-0 left-0 mt-1 rounded-md bg-popover border border-border shadow-lg overflow-hidden">
                {results.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u); setQuery(""); }}
                    className="w-full text-right px-3 py-2 hover:bg-surface transition text-sm"
                  >
                    <span className="font-bold">{u.username}</span>
                    {u.display_name && <span className="text-muted-foreground mr-2 text-xs">— {u.display_name}</span>}
                    {u.suspended_at && <span className="mr-2 text-[10px] text-destructive">[مجمد]</span>}
                  </button>
                ))}
              </div>
            )}
            {query.trim().length >= 2 && results && results.length === 0 && (
              <div className="text-xs text-muted-foreground mt-2">لا يوجد مستخدمون مطابقون.</div>
            )}
          </div>
        )}

        {selected && (
          <>
            <label className="block text-xs text-muted-foreground mb-1">سبب التجميد / الحظر</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: مخالفة قوانين الموقع"
              className="w-full rounded-md bg-input border border-border px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />

            <label className="block text-xs text-muted-foreground mb-1">مدة التجميد المؤقت (بالساعات)</label>
            <input
              type="number" min={1}
              value={durationHours}
              onChange={(e) => setDurationHours(Math.max(1, parseInt(e.target.value || "0", 10)))}
              className="w-full rounded-md bg-input border border-border px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={busy}
                onClick={() => doSuspend("temp")}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-amber-600/20 text-amber-400 text-xs font-bold hover:bg-amber-600/30 disabled:opacity-50"
              >
                <Ban className="size-3.5" /> تجميد مؤقت
              </button>
              <button
                disabled={busy}
                onClick={() => doSuspend("perm")}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-orange-600/20 text-orange-400 text-xs font-bold hover:bg-orange-600/30 disabled:opacity-50"
              >
                <Ban className="size-3.5" /> تجميد دائم
              </button>
              <button
                disabled={busy || !suspended}
                onClick={doUnsuspend}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-emerald-600/20 text-emerald-400 text-xs font-bold hover:bg-emerald-600/30 disabled:opacity-50"
              >
                <UserCheck className="size-3.5" /> إلغاء التجميد
              </button>
              <button
                disabled={busy}
                onClick={doDelete}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-destructive/20 text-destructive text-xs font-bold hover:bg-destructive/30 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" /> حذف نهائي
              </button>
            </div>
          </>
        )}
      </div>

      {selected && <UserOverviewPanel userId={selected.id} />}
    </div>
  );
}

function UserOverviewPanel({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getUserOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-overview", userId],
    queryFn: () => overviewFn({ data: { userId } }),
  });

  if (isLoading) {
    return <div className="rounded-2xl bg-surface border border-border p-5 text-sm text-muted-foreground">جاري تحميل التفاصيل...</div>;
  }
  if (!data) return null;

  const p = data.profile as any;
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("ar") : "—");
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-user-overview", userId] });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-surface border border-border p-5">
        <div className="flex items-center gap-3 mb-3">
          {p?.avatar_url ? (
            <img src={p.avatar_url} alt="" className="size-14 rounded-full object-cover border border-border" />
          ) : (
            <div className="size-14 rounded-full bg-input flex items-center justify-center text-lg font-bold">{p?.username?.[0]?.toUpperCase() ?? "?"}</div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold">{p?.display_name || p?.username}</div>
            <div className="text-xs text-muted-foreground">@{p?.username}</div>
          </div>
        </div>
        {p?.bio && <div className="text-xs text-muted-foreground mb-2 whitespace-pre-wrap">{p.bio}</div>}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div><span className="text-muted-foreground">PUBG ID:</span> {p?.pubg_id || "—"}</div>
          <div><span className="text-muted-foreground">الرتبة:</span> {p?.rank || "—"}</div>
          <div><span className="text-muted-foreground">الدور:</span> {p?.role || "—"}</div>
          <div><span className="text-muted-foreground">K/D:</span> {p?.kd ?? "—"}</div>
          <div><span className="text-muted-foreground">الدولة:</span> {p?.country || "—"}</div>
          <div><span className="text-muted-foreground">انضم:</span> {fmt(p?.created_at)}</div>
          <div className="col-span-2"><span className="text-muted-foreground">آخر ظهور:</span> {fmt(p?.last_seen_at)}</div>
        </div>

        <div className="mt-3">
          <RenameUserCard userId={userId} currentUsername={p?.username ?? ""} currentDisplayName={p?.display_name ?? ""} onDone={refresh} />
        </div>
      </div>

      <Tabs defaultValue="servers" className="w-full">
        <TabsList className="grid grid-cols-4 w-full h-auto">
          <TabsTrigger value="servers" className="text-xs py-2">
            السيرفرات
            <span className="ms-1 text-[10px] opacity-70">({data.ownedServers.length + data.memberServers.length})</span>
          </TabsTrigger>
          <TabsTrigger value="clips" className="text-xs py-2">
            اللقطات
            <span className="ms-1 text-[10px] opacity-70">({data.clipsPosted.length + data.clipComments.length})</span>
          </TabsTrigger>
          <TabsTrigger value="squads" className="text-xs py-2">
            السكوادات
            <span className="ms-1 text-[10px] opacity-70">({data.squadsPosted.length + data.squadJoined.length})</span>
          </TabsTrigger>
          <TabsTrigger value="tournaments" className="text-xs py-2">
            البطولات
            <span className="ms-1 text-[10px] opacity-70">({data.tournamentsOrganized.length + data.tournamentsJoined.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="servers" className="space-y-3 mt-3">
          <DeletableSection
            title="سيرفرات أنشأها"
            items={data.ownedServers}
            deleteFn={adminDeleteServers}
            buildPayload={(ids) => ({ ids })}
            confirmText="حذف السيرفرات المحددة نهائياً؟"
            onDone={refresh}
            renderItem={(s: any) => (
              <>
                <span className="font-bold truncate">{s.name}</span>
                <span className="text-muted-foreground">{s.member_count} عضو · {fmt(s.created_at)}</span>
              </>
            )}
          />
          <DeletableSection
            title="سيرفرات منضم لها"
            items={data.memberServers.map((m: any) => ({ id: m.servers?.id, name: m.servers?.name, role: m.role, joined_at: m.joined_at }))}
            deleteFn={adminLeaveServers}
            buildPayload={(ids) => ({ userId, serverIds: ids })}
            confirmText="إخراج المستخدم من السيرفرات المحددة؟"
            onDone={refresh}
            deleteLabel="إخراج"
            renderItem={(m: any) => (
              <>
                <span className="font-bold truncate">{m.name}</span>
                <span className="text-muted-foreground">{m.role} · {fmt(m.joined_at)}</span>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="clips" className="space-y-3 mt-3">
          <DeletableSection
            title="لقطات نشرها"
            items={data.clipsPosted}
            deleteFn={adminDeleteClips}
            buildPayload={(ids) => ({ ids })}
            confirmText="حذف اللقطات المحددة نهائياً؟"
            onDone={refresh}
            renderItem={(c: any) => (
              <>
                <span className="truncate flex-1">{c.caption || "(بدون عنوان)"}</span>
                <span className="text-muted-foreground">❤ {c.likes_count} · {fmt(c.created_at)}</span>
              </>
            )}
          />
          <DeletableSection
            title="تعليقات على لقطات"
            items={data.clipComments}
            deleteFn={adminDeleteClipComments}
            buildPayload={(ids) => ({ ids })}
            confirmText="حذف التعليقات المحددة؟"
            onDone={refresh}
            renderItem={(c: any) => (
              <>
                <span className="truncate flex-1">{c.content}</span>
                <span className="text-muted-foreground">{fmt(c.created_at)}</span>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="squads" className="space-y-3 mt-3">
          <DeletableSection
            title="سكوادات نشرها"
            items={data.squadsPosted}
            deleteFn={adminDeleteSquads}
            buildPayload={(ids) => ({ ids })}
            confirmText="حذف السكوادات المحددة؟"
            onDone={refresh}
            renderItem={(s: any) => (
              <>
                <span className="font-bold truncate">{s.title}</span>
                <span className="text-muted-foreground">{s.mode || "—"} · {s.status} · {fmt(s.created_at)}</span>
              </>
            )}
          />
          <DeletableSection
            title="سكوادات انضم/قدّم لها"
            items={data.squadJoined}
            deleteFn={adminDeleteSquadApplications}
            buildPayload={(ids) => ({ ids })}
            confirmText="حذف طلبات السكواد المحددة؟"
            onDone={refresh}
            renderItem={(a: any) => (
              <>
                <span className="font-bold truncate">{a.squad_listings?.title || "—"}</span>
                <span className="text-muted-foreground">{a.status} · {fmt(a.created_at)}</span>
              </>
            )}
          />
        </TabsContent>

        <TabsContent value="tournaments" className="space-y-3 mt-3">
          <DeletableSection
            title="بطولات نظّمها"
            items={data.tournamentsOrganized}
            deleteFn={adminDeleteTournaments}
            buildPayload={(ids) => ({ ids })}
            confirmText="حذف البطولات المحددة؟ (لا يمكن حذف بطولة منتهية أو فيها نتائج)"
            onDone={refresh}
            renderItem={(t: any) => (
              <>
                <span className="font-bold truncate">{t.name}</span>
                <span className="text-muted-foreground">{t.status} · {fmt(t.starts_at || t.created_at)}</span>
              </>
            )}
          />
          <DeletableSection
            title="بطولات شارك فيها"
            items={data.tournamentsJoined}
            deleteFn={adminDeleteTournamentRegistrations}
            buildPayload={(ids) => ({ ids })}
            confirmText="إزالة تسجيلات الفِرَق المحددة؟"
            onDone={refresh}
            deleteLabel="إزالة"
            renderItem={(r: any) => (
              <>
                <span className="font-bold truncate">{r.tournaments?.name || "—"}</span>
                <span className="text-muted-foreground">{r.team_name} · {r.status}</span>
              </>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DeletableSection({
  title,
  items,
  deleteFn,
  buildPayload,
  renderItem,
  confirmText,
  onDone,
  deleteLabel = "حذف",
}: {
  title: string;
  items: any[];
  deleteFn: any;
  buildPayload: (ids: string[]) => any;
  renderItem: (item: any) => React.ReactNode;
  confirmText: string;
  onDone: () => void;
  deleteLabel?: string;
}) {
  const fn = useServerFn(deleteFn);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const validItems = items.filter((i: any) => !!i?.id);
  const count = validItems.length;
  const allSelected = count > 0 && selected.size === count;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(validItems.map((i: any) => i.id)));

  const doDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(confirmText)) return;
    setBusy(true);
    try {
      await fn({ data: buildPayload(ids) });
      toast.success(`تم ${deleteLabel} ${ids.length} عنصر`);
      setSelected(new Set());
      onDone();
    } catch (e: any) {
      toast.error(e?.message || `فشل ${deleteLabel}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-xl bg-surface border border-border overflow-hidden" open={count > 0 && count <= 5}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold flex items-center justify-between hover:bg-input/30">
        <span>{title}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">{count}</span>
      </summary>
      <div className="px-4 pb-3 pt-1">
        {count === 0 ? (
          <div className="text-xs text-muted-foreground py-2">لا يوجد.</div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 py-2 border-b border-border/40">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-primary" />
                تحديد الكل
              </label>
              <button
                disabled={busy || selected.size === 0}
                onClick={() => doDelete([...selected])}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-destructive/20 text-destructive text-[11px] font-bold hover:bg-destructive/30 disabled:opacity-40"
              >
                <Trash2 className="size-3" /> {deleteLabel} المحدد ({selected.size})
              </button>
            </div>
            {validItems.map((item: any) => (
              <div key={item.id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0 text-xs">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="accent-primary shrink-0"
                />
                <div className="flex items-center justify-between gap-2 flex-1 min-w-0">{renderItem(item)}</div>
                <button
                  disabled={busy}
                  onClick={() => doDelete([item.id])}
                  title={deleteLabel}
                  className="p-1 rounded hover:bg-destructive/20 text-destructive disabled:opacity-40 shrink-0"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </details>
  );
}

function RenameUserCard({
  userId,
  currentUsername,
  currentDisplayName,
  onDone,
}: {
  userId: string;
  currentUsername: string;
  currentDisplayName: string;
  onDone: () => void;
}) {
  const [username, setUsername] = useState(currentUsername);
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const renameFn = useServerFn(adminRenameUser);

  const usernameChanged = username.trim() !== currentUsername;
  const displayChanged = displayName.trim() !== currentDisplayName;
  const canSubmit = (usernameChanged || displayChanged) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await renameFn({
        data: {
          userId,
          username: usernameChanged ? username.trim() : undefined,
          displayName: displayChanged ? displayName.trim() : undefined,
          reason: reason.trim(),
        },
      });
      toast.success("تم تعديل الاسم وإرسال تنبيه للمستخدم");
      setReason("");
      onDone();
    } catch (e: any) {
      const msg = e?.message || "حدث خطأ";
      if (msg.includes("username_taken")) toast.error("هذا المعرف مستخدم بالفعل");
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-surface border border-border p-4">
      <div className="text-sm font-bold mb-2 flex items-center gap-2">
        <UserCheck className="size-4" /> تعديل الاسم لمخالفة الشروط
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-[11px] text-muted-foreground">المعرف (@username)</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border text-sm"
            placeholder="username"
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">الاسم الظاهر</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border text-sm"
            placeholder="الاسم"
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">سبب المخالفة (اختياري — سيصل في التنبيه)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-input border border-border text-sm resize-none"
            placeholder="مثال: الاسم يحتوي على ألفاظ مسيئة"
          />
        </div>
        <button
          disabled={!canSubmit}
          onClick={submit}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40"
        >
          {busy ? "جاري الحفظ..." : "حفظ وإرسال تنبيه"}
        </button>
      </div>
    </div>
  );
}

type WithdrawalTab = "pending" | "approved" | "rejected" | "log";

function WithdrawalsSection({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<WithdrawalTab>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  const { data: requests } = useQuery({
    queryKey: ["admin-uc-withdrawals"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase
        .from("uc_withdrawal_requests")
        .select("id, user_id, package_key, uc_amount, trophies_cost, usd_value, pubg_id, status, note, created_at, processed_at")
        .order("created_at", { ascending: false })
        .limit(200);
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
        return rows.map((r: any) => ({ ...r, profile: map.get(r.user_id) ?? null }));
      }
      return rows;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-withdrawals-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "uc_withdrawal_requests" },
        () => qc.invalidateQueries({ queryKey: ["admin-uc-withdrawals"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const process = async (id: string, approve: boolean) => {
    setBusyId(id);
    const { error } = await supabase.rpc("process_uc_withdrawal", {
      _id: id,
      _approve: approve,
      _note: noteMap[id]?.trim() || undefined,
    });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(approve ? "تم تنفيذ الطلب وإشعار اللاعب" : "تم رفض الطلب");
    qc.invalidateQueries({ queryKey: ["admin-uc-withdrawals"] });
  };

  const pending = (requests ?? []).filter((r: any) => r.status === "pending");
  const approved = (requests ?? []).filter((r: any) => r.status === "approved");
  const rejected = (requests ?? []).filter((r: any) => r.status === "rejected");

  const tabs: { key: WithdrawalTab; label: string; count: number }[] = [
    { key: "pending", label: "قيد المعالجة", count: pending.length },
    { key: "approved", label: "المكتملة", count: approved.length },
    { key: "rejected", label: "المرفوضة", count: rejected.length },
    { key: "log", label: "السجل", count: (requests ?? []).length },
  ];

  const badgeClass = (count: number, active: boolean) =>
    `text-[10px] px-1.5 py-0.5 rounded-full font-bold transition ${
      active
        ? "bg-primary-foreground/20 text-primary-foreground"
        : "bg-muted text-muted-foreground"
    }`;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> رجوع
      </button>

      <div className="rounded-2xl bg-surface border border-border p-5">
        <h2 className="display text-2xl mb-1 flex items-center gap-2">
          <Wallet className="size-6 text-primary" /> طلبات سحب الشدات
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          راجع الطلبات وحوّل الشدات على معرّف PUBG ثم اضغط "تنفيذ".
        </p>

        <Tabs value={tab} onValueChange={(v) => setTab(v as WithdrawalTab)}>
          <TabsList className="w-full grid grid-cols-4 mb-4">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="flex items-center justify-center gap-1.5 text-xs">
                <span>{t.label}</span>
                <span className={badgeClass(t.count, tab === t.key)}>{t.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="pending">
            {pending.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">لا توجد طلبات قيد المعالجة</div>
            ) : (
              <div className="space-y-3">
                {pending.map((r: any) => (
                  <div key={r.id} className="rounded-xl border border-primary/30 bg-background p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <div className="font-bold text-sm">
                          {r.profile?.display_name || r.profile?.username || "لاعب"}
                          <span className="text-muted-foreground font-normal"> @{r.profile?.username}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("ar")}
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-primary font-bold">{r.uc_amount} UC</div>
                        <div className="text-[11px] text-muted-foreground">${Number(r.usd_value)} • {r.trophies_cost} كأس</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="bg-surface rounded-md px-2 py-1.5">
                        <span className="text-muted-foreground">معرّف PUBG: </span>
                        <span dir="ltr" className="font-mono font-bold">{r.pubg_id}</span>
                      </div>
                      <div className="bg-surface rounded-md px-2 py-1.5">
                        <span className="text-muted-foreground">الباقة: </span>
                        <span className="font-mono">{r.package_key}</span>
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="ملاحظة (اختياري) — سيتم إرسالها للاعب"
                      value={noteMap[r.id] ?? ""}
                      onChange={(e) => setNoteMap((m) => ({ ...m, [r.id]: e.target.value }))}
                      className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-xs mb-2 focus:outline-none focus:border-primary"
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={() => process(r.id, true)}
                        disabled={busyId === r.id}
                        className="flex-1 flex items-center justify-center gap-1 bg-primary text-primary-foreground rounded-md py-2 text-xs font-bold disabled:opacity-50"
                      >
                        <Check className="size-4" /> تنفيذ
                      </button>
                      <button
                        onClick={() => process(r.id, false)}
                        disabled={busyId === r.id}
                        className="flex-1 flex items-center justify-center gap-1 bg-destructive text-destructive-foreground rounded-md py-2 text-xs font-bold disabled:opacity-50"
                      >
                        <X className="size-4" /> رفض
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="approved">
            {approved.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">لا توجد طلبات مكتملة</div>
            ) : (
              <div className="space-y-2">
                {approved.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-xs bg-background rounded-md px-3 py-2 border border-border">
                    <div>
                      <span className="font-bold">{r.profile?.username || "لاعب"}</span>
                      <span className="text-muted-foreground"> • {r.uc_amount} UC • </span>
                      <span dir="ltr" className="font-mono">{r.pubg_id}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full font-bold bg-primary/15 text-primary">تم</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rejected">
            {rejected.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">لا توجد طلبات مرفوضة</div>
            ) : (
              <div className="space-y-2">
                {rejected.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-xs bg-background rounded-md px-3 py-2 border border-border">
                    <div>
                      <span className="font-bold">{r.profile?.username || "لاعب"}</span>
                      <span className="text-muted-foreground"> • {r.uc_amount} UC • </span>
                      <span dir="ltr" className="font-mono">{r.pubg_id}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full font-bold bg-destructive/15 text-destructive">مرفوض</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="log">
            {(requests ?? []).length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">لا يوجد سجل</div>
            ) : (
              <div className="space-y-2">
                {(requests ?? []).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-xs bg-background rounded-md px-3 py-2 border border-border">
                    <div>
                      <span className="font-bold">{r.profile?.username || "لاعب"}</span>
                      <span className="text-muted-foreground"> • {r.uc_amount} UC • </span>
                      <span dir="ltr" className="font-mono">{r.pubg_id}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full font-bold ${
                      r.status === "approved"
                        ? "bg-primary/15 text-primary"
                        : r.status === "rejected"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {r.status === "approved" ? "تم" : r.status === "rejected" ? "مرفوض" : "قيد المعالجة"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}


// ============================================================
// Shop Packages Management (Trophy & UC packages)
// ============================================================
type TrophyPackage = {
  id: string;
  key: string;
  trophies: number;
  price_usd: number;
  price_label: string | null;
  badge: string | null;
  popular: boolean;
  perks: string[];
  visible: boolean;
  sort_order: number;
};

type UcPackage = {
  id: string;
  key: string;
  uc_amount: number;
  trophies_cost: number;
  usd_value: number;
  badge: string | null;
  popular: boolean;
  visible: boolean;
  sort_order: number;
};

function ShopPackagesSection({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"trophy" | "uc">("trophy");

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> رجوع
      </button>

      <div className="rounded-2xl bg-surface border border-border p-5">
        <h2 className="display text-2xl mb-4 flex items-center gap-2">
          <ShoppingBag className="size-6 text-primary" /> إدارة المتجر
        </h2>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "trophy" | "uc")}>
          <TabsList className="mb-4">
            <TabsTrigger value="trophy" className="flex items-center gap-2">
              <Trophy className="size-4" /> حزم شراء الكؤوس
            </TabsTrigger>
            <TabsTrigger value="uc" className="flex items-center gap-2">
              <Crown className="size-4" /> حزم سحب الشدات (UC)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trophy"><TrophyPackagesEditor /></TabsContent>
          <TabsContent value="uc"><UcPackagesEditor /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function TrophyPackagesEditor() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<TrophyPackage> | null>(null);

  const { data: pkgs, isLoading } = useQuery({
    queryKey: ["admin-trophy-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trophy_packages")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TrophyPackage[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-trophy-packages"] });
    qc.invalidateQueries({ queryKey: ["shop-trophy-packages"] });
  };

  const toggleVisible = async (p: TrophyPackage) => {
    const { error } = await supabase.from("trophy_packages").update({ visible: !p.visible } as any).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(p.visible ? "تم إخفاء الحزمة" : "تم إظهار الحزمة");
    refresh();
  };

  const remove = async (p: TrophyPackage) => {
    if (!confirm(`حذف حزمة ${p.key} نهائياً؟`)) return;
    const { error } = await supabase.from("trophy_packages").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("تم حذف الحزمة");
    refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ key: "", trophies: 100, price_usd: 1, price_label: "", badge: "", popular: false, perks: [], visible: true, sort_order: ((pkgs?.length ?? 0) + 1) * 10 })}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
        >
          <Plus className="size-4" /> إضافة حزمة جديدة
        </button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">جاري التحميل…</div>}

      <div className="grid gap-2">
        {(pkgs ?? []).map((p) => (
          <div key={p.id} className={`rounded-xl border p-3 flex flex-wrap items-center gap-3 ${p.visible ? "bg-background border-border" : "bg-muted/40 border-dashed border-border opacity-70"}`}>
            <div className="flex-1 min-w-[180px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                {p.popular && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">شائعة</span>}
                {p.badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground text-background">{p.badge}</span>}
              </div>
              <div className="text-sm mt-1">
                <span className="font-bold">{p.trophies.toLocaleString()}</span> كأس
                <span className="text-muted-foreground"> — </span>
                <span className="text-primary font-bold">{p.price_label || `$${p.price_usd}`}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggleVisible(p)} className="p-2 rounded-md hover:bg-muted" title={p.visible ? "إخفاء" : "إظهار"}>
                {p.visible ? <Eye className="size-4" /> : <EyeOff className="size-4 text-muted-foreground" />}
              </button>
              <button onClick={() => setEditing(p)} className="p-2 rounded-md hover:bg-muted" title="تعديل">
                <Pencil className="size-4" />
              </button>
              <button onClick={() => remove(p)} className="p-2 rounded-md hover:bg-destructive/10 text-destructive" title="حذف">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <TrophyPackageDialog
          pkg={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function TrophyPackageDialog({ pkg, onClose, onSaved }: { pkg: Partial<TrophyPackage>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<TrophyPackage>>(pkg);
  const [perksText, setPerksText] = useState((pkg.perks ?? []).join("\n"));
  const [saving, setSaving] = useState(false);
  const isNew = !pkg.id;

  const save = async () => {
    if (!form.key || !form.key.trim()) return toast.error("المعرّف مطلوب");
    if (!form.trophies || form.trophies <= 0) return toast.error("عدد الكؤوس غير صحيح");
    if (form.price_usd === undefined || form.price_usd === null || form.price_usd < 0) return toast.error("السعر غير صحيح");

    const payload = {
      key: form.key.trim(),
      trophies: Number(form.trophies),
      price_usd: Number(form.price_usd),
      price_label: form.price_label?.trim() || null,
      badge: form.badge?.trim() || null,
      popular: !!form.popular,
      perks: perksText.split("\n").map((s) => s.trim()).filter(Boolean),
      visible: form.visible ?? true,
      sort_order: Number(form.sort_order ?? 0),
    };

    setSaving(true);
    const { error } = isNew
      ? await supabase.from("trophy_packages").insert(payload as any)
      : await supabase.from("trophy_packages").update(payload as any).eq("id", pkg.id!);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isNew ? "تمت إضافة الحزمة" : "تم حفظ التغييرات");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="display text-xl mb-4">{isNew ? "حزمة كؤوس جديدة" : "تعديل حزمة كؤوس"}</h3>

        <div className="space-y-3 text-sm">
          <Field label="المعرّف (مثل silver_1000)">
            <input dir="ltr" value={form.key ?? ""} onChange={(e) => setForm({ ...form, key: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="عدد الكؤوس">
              <input type="number" value={form.trophies ?? 0} onChange={(e) => setForm({ ...form, trophies: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </Field>
            <Field label="السعر بالدولار">
              <input type="number" step="0.01" value={form.price_usd ?? 0} onChange={(e) => setForm({ ...form, price_usd: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </Field>
          </div>
          <Field label="نص السعر (اختياري — مثل $7 أو 25 ر.س)">
            <input value={form.price_label ?? ""} onChange={(e) => setForm({ ...form, price_label: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </Field>
          <Field label="شارة العرض (مثل وفّر 20% أو الأكثر مبيعاً)">
            <input value={form.badge ?? ""} onChange={(e) => setForm({ ...form, badge: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </Field>
          <Field label="الميزات (سطر لكل ميزة)">
            <textarea rows={3} value={perksText} onChange={(e) => setPerksText(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الترتيب">
              <input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </Field>
            <div className="flex flex-col gap-2 pt-5">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!form.popular} onChange={(e) => setForm({ ...form, popular: e.target.checked })} />
                مميزة (Popular)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.visible ?? true} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
                ظاهرة للمستخدمين
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">إلغاء</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md text-sm font-bold bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UcPackagesEditor() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<UcPackage> | null>(null);

  const { data: pkgs, isLoading } = useQuery({
    queryKey: ["admin-uc-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("uc_packages")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as UcPackage[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-uc-packages"] });
    qc.invalidateQueries({ queryKey: ["shop-uc-packages"] });
  };

  const toggleVisible = async (p: UcPackage) => {
    const { error } = await supabase.from("uc_packages").update({ visible: !p.visible } as any).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(p.visible ? "تم إخفاء الحزمة" : "تم إظهار الحزمة");
    refresh();
  };

  const remove = async (p: UcPackage) => {
    if (!confirm(`حذف حزمة ${p.key} نهائياً؟`)) return;
    const { error } = await supabase.from("uc_packages").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("تم حذف الحزمة");
    refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ key: "", uc_amount: 100, trophies_cost: 100, usd_value: 1, badge: "", popular: false, visible: true, sort_order: ((pkgs?.length ?? 0) + 1) * 10 })}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
        >
          <Plus className="size-4" /> إضافة حزمة UC جديدة
        </button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">جاري التحميل…</div>}

      <div className="grid gap-2">
        {(pkgs ?? []).map((p) => (
          <div key={p.id} className={`rounded-xl border p-3 flex flex-wrap items-center gap-3 ${p.visible ? "bg-background border-border" : "bg-muted/40 border-dashed border-border opacity-70"}`}>
            <div className="flex-1 min-w-[180px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                {p.popular && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground">شائعة</span>}
                {p.badge && <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground text-background">{p.badge}</span>}
              </div>
              <div className="text-sm mt-1">
                <span className="font-bold">{p.uc_amount.toLocaleString()} UC</span>
                <span className="text-muted-foreground"> — يكلّف </span>
                <span className="text-primary font-bold">{p.trophies_cost.toLocaleString()}</span> كأس
                <span className="text-muted-foreground"> (≈ ${p.usd_value})</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggleVisible(p)} className="p-2 rounded-md hover:bg-muted" title={p.visible ? "إخفاء" : "إظهار"}>
                {p.visible ? <Eye className="size-4" /> : <EyeOff className="size-4 text-muted-foreground" />}
              </button>
              <button onClick={() => setEditing(p)} className="p-2 rounded-md hover:bg-muted" title="تعديل">
                <Pencil className="size-4" />
              </button>
              <button onClick={() => remove(p)} className="p-2 rounded-md hover:bg-destructive/10 text-destructive" title="حذف">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <UcPackageDialog
          pkg={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function UcPackageDialog({ pkg, onClose, onSaved }: { pkg: Partial<UcPackage>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<UcPackage>>(pkg);
  const [saving, setSaving] = useState(false);
  const isNew = !pkg.id;

  const save = async () => {
    if (!form.key || !form.key.trim()) return toast.error("المعرّف مطلوب");
    if (!form.uc_amount || form.uc_amount <= 0) return toast.error("كمية UC غير صحيحة");
    if (!form.trophies_cost || form.trophies_cost <= 0) return toast.error("تكلفة الكؤوس غير صحيحة");

    const payload = {
      key: form.key.trim(),
      uc_amount: Number(form.uc_amount),
      trophies_cost: Number(form.trophies_cost),
      usd_value: Number(form.usd_value ?? 0),
      badge: form.badge?.trim() || null,
      popular: !!form.popular,
      visible: form.visible ?? true,
      sort_order: Number(form.sort_order ?? 0),
    };

    setSaving(true);
    const { error } = isNew
      ? await supabase.from("uc_packages").insert(payload as any)
      : await supabase.from("uc_packages").update(payload as any).eq("id", pkg.id!);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isNew ? "تمت إضافة حزمة UC" : "تم حفظ التغييرات");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="display text-xl mb-4">{isNew ? "حزمة UC جديدة" : "تعديل حزمة UC"}</h3>

        <div className="space-y-3 text-sm">
          <Field label="المعرّف (مثل uc_660)">
            <input dir="ltr" value={form.key ?? ""} onChange={(e) => setForm({ ...form, key: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="كمية UC">
              <input type="number" value={form.uc_amount ?? 0} onChange={(e) => setForm({ ...form, uc_amount: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </Field>
            <Field label="تكلفة (كأس)">
              <input type="number" value={form.trophies_cost ?? 0} onChange={(e) => setForm({ ...form, trophies_cost: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </Field>
            <Field label="قيمة $">
              <input type="number" step="0.01" value={form.usd_value ?? 0} onChange={(e) => setForm({ ...form, usd_value: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </Field>
          </div>
          <Field label="شارة العرض (اختياري)">
            <input value={form.badge ?? ""} onChange={(e) => setForm({ ...form, badge: e.target.value })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الترتيب">
              <input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </Field>
            <div className="flex flex-col gap-2 pt-5">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={!!form.popular} onChange={(e) => setForm({ ...form, popular: e.target.checked })} />
                مميزة (Popular)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.visible ?? true} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
                ظاهرة للمستخدمين
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted">إلغاء</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-md text-sm font-bold bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

function SecuritySection({ adminId, onBack }: { adminId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const fetchSuspicious = useServerFn(getSuspiciousAccounts);
  const fetchSessions = useServerFn(getUserSessions);
  const suspendFn = useServerFn(setUserSuspension);
  const deleteFn = useServerFn(deleteUserAccount);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "suspicious">("suspicious");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-suspicious-accounts"],
    queryFn: () => fetchSuspicious(),
  });

  const { data: sessionsData } = useQuery({
    queryKey: ["admin-user-sessions", expandedUser],
    enabled: !!expandedUser,
    queryFn: () => fetchSessions({ data: { userId: expandedUser! } }),
  });

  const groups = (data?.groups ?? []) as Array<{
    match_type: string;
    match_value: string;
    user_ids: string[];
    usernames: (string | null)[];
    account_count: number;
    last_seen_at: string;
  }>;

  // Suspicious user IDs
  const suspiciousUserIds = Array.from(new Set(groups.flatMap((g) => g.user_ids)));

  // All accounts: fetch all profiles with their latest detected country
  const { data: allAccounts } = useQuery({
    queryKey: ["admin-all-accounts-with-country"],
    queryFn: async () => {
      const [{ data: profs }, { data: sessions }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, country, suspended_at, suspended_until, created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("account_sessions")
          .select("user_id, country_code, last_seen_at")
          .not("country_code", "is", null)
          .order("last_seen_at", { ascending: false })
          .limit(5000),
      ]);
      const countryMap = new Map<string, string>();
      (sessions ?? []).forEach((s: any) => {
        if (s.country_code && !countryMap.has(s.user_id)) countryMap.set(s.user_id, s.country_code);
      });
      return (profs ?? []).map((p: any) => ({
        ...p,
        detected_country: countryMap.get(p.id) ?? null,
        is_suspicious: suspiciousUserIds.includes(p.id),
      }));
    },
  });

  // Country list (from detected) for filter dropdown
  const availableCountries = Array.from(
    new Set((allAccounts ?? []).map((a: any) => a.detected_country).filter(Boolean)),
  ).sort();

  // Apply filters for "all" tab
  const filteredAll = (allAccounts ?? []).filter((a: any) => {
    if (countryFilter !== "all" && a.detected_country !== countryFilter) return false;
    return true;
  });

  // Detected countries map (for suspicious view)
  const detectedCountries = new Map<string, string>(
    (allAccounts ?? [])
      .filter((a: any) => a.detected_country)
      .map((a: any) => [a.id, a.detected_country as string]),
  );
  const profileMap = new Map<string, any>((allAccounts ?? []).map((a: any) => [a.id, a]));

  const bulkSuspend = async (group: { match_value: string; user_ids: string[] }) => {
    const targets = group.user_ids.filter((id) => id !== adminId);
    if (targets.length === 0) {
      toast.error("لا يوجد حسابات قابلة للتجميد");
      return;
    }
    if (!confirm(`سيتم تجميد ${targets.length} حساب نهائياً. متأكد؟`)) return;
    setBulkBusy(group.match_value);
    let ok = 0;
    let fail = 0;
    for (const uid of targets) {
      try {
        await suspendFn({
          data: { userId: uid, suspend: true, reason: "تجميد جماعي - حسابات مرتبطة مشبوهة", durationHours: null },
        });
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkBusy(null);
    toast.success(`تم تجميد ${ok}${fail ? ` (فشل ${fail})` : ""}`);
    qc.invalidateQueries({ queryKey: ["admin-all-accounts-with-country"] });
    refetch();
  };

  const singleSuspend = async (uid: string, currentlySuspended: boolean) => {
    if (uid === adminId) { toast.error("لا يمكنك تجميد حسابك"); return; }
    setRowBusy(uid);
    try {
      if (currentlySuspended) {
        await suspendFn({ data: { userId: uid, suspend: false } });
        toast.success("تم إلغاء التجميد");
      } else {
        await suspendFn({
          data: { userId: uid, suspend: true, reason: "حساب مكرر أو محاولة غش", durationHours: null },
        });
        toast.success("تم تجميد الحساب");
      }
      qc.invalidateQueries({ queryKey: ["admin-all-accounts-with-country"] });
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "فشل التنفيذ");
    } finally {
      setRowBusy(null);
    }
  };

  const singleDelete = async (uid: string, username?: string) => {
    if (uid === adminId) { toast.error("لا يمكنك حذف حسابك"); return; }
    if (!confirm(`حذف نهائي لحساب "${username ?? uid.slice(0, 8)}"؟ سيتم إلغاء التجميد تلقائياً عن الحسابات الباقية إن لم يبقَ تكرار.`)) return;
    setRowBusy(uid);
    try {
      const res: any = await deleteFn({ data: { userId: uid } });
      const n = res?.reactivated_count ?? 0;
      toast.success(n > 0 ? `تم الحذف وتفعيل ${n} حساب` : "تم حذف الحساب");
      qc.invalidateQueries({ queryKey: ["admin-all-accounts-with-country"] });
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "فشل الحذف");
    } finally {
      setRowBusy(null);
    }
  };


  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> رجوع
      </button>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="display text-2xl flex items-center gap-2">
          <Shield className="size-6 text-primary" />
          الأمان والحسابات
        </h2>
        <button
          onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ["admin-all-accounts-with-country"] }); }}
          className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface"
        >
          تحديث
        </button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "suspicious")} className="mb-4">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="all">كل الحسابات ({allAccounts?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="suspicious" className="gap-1">
            <AlertTriangle className="size-3.5" />
            المشبوهة ({groups.length})
          </TabsTrigger>
        </TabsList>

        {/* === All Accounts === */}
        <TabsContent value="all" className="mt-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Globe className="size-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">فلتر الدولة:</span>
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="text-xs bg-input border border-border rounded-md px-2 py-1"
            >
              <option value="all">الكل</option>
              {availableCountries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__none__">بدون دولة</option>
            </select>
            <span className="text-xs text-muted-foreground mr-auto">{filteredAll.length} حساب</span>
          </div>

          <div className="space-y-1.5">
            {filteredAll
              .filter((a: any) => countryFilter !== "__none__" || !a.detected_country)
              .map((p: any) => (
                <div key={p.id} className="rounded-md bg-surface border border-border/50 p-2 flex items-center gap-2">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="size-7 rounded-full object-cover" />
                  ) : (
                    <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                      {(p.username ?? "?")[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate flex items-center gap-1.5">
                      {p.display_name ?? p.username}
                      {p.is_suspicious && (
                        <AlertTriangle className="size-3 text-amber-400" />
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      @{p.username} · {p.detected_country ?? "بدون دولة"}
                      {p.suspended_at && <span className="text-destructive"> · موقوف</span>}
                    </div>
                  </div>
                </div>
              ))}
            {filteredAll.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">لا توجد نتائج</div>
            )}
          </div>
        </TabsContent>

        {/* === Suspicious === */}
        <TabsContent value="suspicious" className="mt-4">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 mb-4 text-xs text-amber-200">
            ⚠️ تطابق IP أو بصمة لا يعني الغش بشكل قطعي. شركات الموبايل (CGNAT) وشبكات WiFi العائلية قد تعطي نفس IP لعدة أشخاص. استخدم هذه البيانات كمؤشر فقط.
          </div>

          {isLoading && <div className="text-sm text-muted-foreground">جاري التحميل...</div>}

          {!isLoading && groups.length === 0 && (
            <div className="rounded-lg bg-surface border border-border p-8 text-center">
              <Shield className="size-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">لا توجد حسابات مشبوهة حالياً</p>
            </div>
          )}

          <div className="space-y-3">
            {groups.map((g, i) => (
              <div key={`${g.match_type}-${g.match_value}-${i}`} className="rounded-xl bg-surface border border-border p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {g.match_type === "ip" ? (
                      <Globe className="size-4 text-primary" />
                    ) : (
                      <Fingerprint className="size-4 text-primary" />
                    )}
                    <span className="text-xs font-bold">
                      {g.match_type === "ip" ? "تطابق IP" : "تطابق بصمة الجهاز"}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {g.match_value.slice(0, 12)}…
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
                      {g.account_count} حسابات
                    </span>
                    <button
                      onClick={() => bulkSuspend(g)}
                      disabled={bulkBusy === g.match_value}
                      className="text-[11px] px-2 py-1 rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30 disabled:opacity-50 inline-flex items-center gap-1"
                    >
                      <Ban className="size-3" />
                      {bulkBusy === g.match_value ? "جارٍ..." : "تجميد الكل"}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {g.user_ids.map((uid) => {
                    const p = profileMap.get(uid);
                    const isExpanded = expandedUser === uid;
                    return (
                      <div key={uid} className="rounded-md bg-background/40 border border-border/50">
                        <button
                          onClick={() => setExpandedUser(isExpanded ? null : uid)}
                          className="w-full flex items-center gap-2 p-2 text-right hover:bg-surface/50"
                        >
                          {p?.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="size-7 rounded-full object-cover" />
                          ) : (
                            <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                              {(p?.username ?? "?")[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold truncate">
                              {p?.display_name ?? p?.username ?? uid.slice(0, 8)}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              @{p?.username ?? "—"} · {detectedCountries.get(uid) ?? "بدون دولة"}
                              {p?.suspended_at && <span className="text-destructive"> · موقوف</span>}
                            </div>
                          </div>
                          <ArrowLeft
                            className={`size-3.5 text-muted-foreground transition ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-border/50">
                            <div className="text-[10px] text-muted-foreground mb-1">آخر الجلسات:</div>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {(sessionsData?.sessions ?? []).map((s: any) => (
                                <div key={s.id} className="text-[10px] font-mono bg-background/60 rounded p-1.5">
                                  <div className="flex justify-between gap-2">
                                    <span>{s.country_code ?? "??"} · {s.ip_prefix ?? "—"}</span>
                                    <span className="text-muted-foreground">
                                      {new Date(s.last_seen_at).toLocaleDateString("ar")}
                                    </span>
                                  </div>
                                  <div className="text-muted-foreground truncate">
                                    {s.user_agent?.slice(0, 80) ?? "—"}
                                  </div>
                                </div>
                              ))}
                              {(!sessionsData?.sessions || sessionsData.sessions.length === 0) && (
                                <div className="text-[10px] text-muted-foreground">لا توجد جلسات مسجّلة</div>
                              )}
                            </div>
                            <div className="flex gap-2 mt-3 pt-3 border-t border-border/40">
                              <button
                                onClick={() => singleSuspend(uid, !!p?.suspended_at)}
                                disabled={rowBusy === uid || uid === adminId}
                                className={`flex-1 text-[11px] px-2 py-1.5 rounded-md inline-flex items-center justify-center gap-1 disabled:opacity-50 ${
                                  p?.suspended_at
                                    ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                                    : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                                }`}
                              >
                                {p?.suspended_at ? <UserCheck className="size-3" /> : <Ban className="size-3" />}
                                {rowBusy === uid ? "جارٍ..." : p?.suspended_at ? "إلغاء التجميد" : "تجميد"}
                              </button>
                              <button
                                onClick={() => singleDelete(uid, p?.username)}
                                disabled={rowBusy === uid || uid === adminId}
                                className="flex-1 text-[11px] px-2 py-1.5 rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30 disabled:opacity-50 inline-flex items-center justify-center gap-1"
                              >
                                <Trash2 className="size-3" />
                                حذف الحساب
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

