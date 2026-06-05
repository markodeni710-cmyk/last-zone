import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Save, Trophy, Target, Mic, Upload, Loader2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isReservedUsername } from "@/lib/admin-utils";

const USERNAME_COOLDOWN_DAYS = 3;
const USERNAME_RE = /^[a-zA-Z0-9_]{4,20}$/;

export const Route = createFileRoute("/_authenticated/app/profile")({
  component: ProfilePage,
});

const RANKS = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Crown", "Ace", "Ace Master", "Ace Dominator", "Conqueror"];
const ROLES = ["IGL", "Entry Fragger", "Assaulter", "Support", "Sniper", "Scout", "Flanker", "Medic"];
const REGIONS = ["Asia", "Middle East", "Europe", "North America", "South America", "KRJP"];
const LANGUAGES = ["عربي", "إنجليزي", "كلاهما"];
const COUNTRIES = [
  "السعودية", "الإمارات", "الكويت", "قطر", "البحرين", "عُمان",
  "اليمن", "العراق", "سوريا", "لبنان", "الأردن", "فلسطين",
  "مصر", "السودان", "ليبيا", "تونس", "الجزائر", "المغرب",
  "موريتانيا", "الصومال", "جيبوتي", "جزر القمر",
];
const AVAILABILITY = [
  "صباحاً (6-12)", "ظهراً (12-4)", "عصراً (4-7)",
  "مساءً (7-10)", "ليلاً (10-2)", "بعد منتصف الليل (2-6)",
  "عطلة نهاية الأسبوع", "طوال اليوم", "مرن / حسب الاتفاق",
];

function ProfilePage() {
  const qc = useQueryClient();
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setMe(data.session?.user?.id ?? null)).catch(() => setMe(null)); }, []);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", me!).maybeSingle();
      return data;
    },
  });

  const { data: ratings } = useQuery({
    queryKey: ["my-ratings", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("player_ratings").select("*").eq("rated_id", me!);
      return data ?? [];
    },
  });

  const [form, setForm] = useState<any>({});
  const [uploading, setUploading] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  useEffect(() => { if (profile) { setForm(profile); setUsernameInput(profile.username ?? ""); } }, [profile]);

  // Cooldown calculation
  const cooldown = useMemo(() => {
    if (!profile?.username_changed_at) return { locked: false, remainingMs: 0 };
    const last = new Date(profile.username_changed_at as string).getTime();
    const elapsed = Date.now() - last;
    const total = USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    return { locked: elapsed < total, remainingMs: Math.max(0, total - elapsed) };
  }, [profile?.username_changed_at]);
  const formatRemaining = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return d > 0 ? `${d} يوم و ${rh} ساعة` : `${h} ساعة`;
  };

  // Live username availability check (debounced)
  useEffect(() => {
    if (!me) return;
    const trimmed = usernameInput.trim();
    if (trimmed === (profile?.username ?? "")) { setUsernameAvailable(null); return; }
    if (!USERNAME_RE.test(trimmed)) { setUsernameAvailable(null); return; }
    if (isReservedUsername(trimmed)) { setUsernameAvailable(false); return; }
    setCheckingUsername(true);
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", trimmed)
        .neq("id", me)
        .maybeSingle();
      setUsernameAvailable(!data);
      setCheckingUsername(false);
    }, 350);
    return () => { clearTimeout(handle); setCheckingUsername(false); };
  }, [usernameInput, me, profile?.username]);

  const saveUsername = async () => {
    if (!me) return;
    const trimmed = usernameInput.trim();
    if (trimmed === profile?.username) return;
    if (!USERNAME_RE.test(trimmed)) { toast.error("المعرف 4-20 حرفًا: حروف إنجليزية، أرقام، _"); return; }
    if (isReservedUsername(trimmed)) { toast.error("هذا المعرف محجوز ولا يمكن استخدامه (يشبه حسابات الإدارة)"); return; }
    if (cooldown.locked) { toast.error(`لا يمكنك تغيير المعرف الآن. حاول بعد ${formatRemaining(cooldown.remainingMs)}`); return; }
    if (usernameAvailable === false) { toast.error("هذا المعرف مستخدم بالفعل"); return; }
    const { error } = await supabase.from("profiles")
      .update({ username: trimmed, username_changed_at: new Date().toISOString() })
      .eq("id", me);
    if (error) {
      if (error.code === "23505") toast.error("هذا المعرف مستخدم بالفعل");
      else toast.error(error.message);
      return;
    }
    toast.success("تم تحديث المعرف!");
    qc.invalidateQueries({ queryKey: ["my-profile", me] });
  };

  const uploadAvatar = async (file: File) => {
    if (!me) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("الحجم الأقصى 5 ميجا"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${me}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data.publicUrl;
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", me);
      if (updErr) throw updErr;
      setForm((f: any) => ({ ...f, avatar_url: publicUrl }));
      qc.invalidateQueries({ queryKey: ["my-profile", me] });
      toast.success("تم تحديث الصورة!");
    } catch (e: any) {
      toast.error(e.message ?? "فشل رفع الصورة");
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    const sensitivity = {
      tpp: form.sensitivity?.tpp ?? "",
      fpp: form.sensitivity?.fpp ?? "",
      ads: form.sensitivity?.ads ?? "",
      gyro: form.sensitivity?.gyro ?? "",
    };
    const { error } = await supabase.from("profiles").update({
      display_name: form.display_name,
      bio: form.bio,
      pubg_id: form.pubg_id,
      rank: form.rank,
      role: form.role,
      kd: form.kd ? Number(form.kd) : null,
      preferred_server: form.preferred_server,
      language: form.language,
      country: form.country,
      mic_available: form.mic_available ?? true,
      availability: form.availability,
      avatar_url: form.avatar_url,
      sensitivity,
    }).eq("id", me);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حفظ البروفايل!");
    qc.invalidateQueries({ queryKey: ["my-profile", me] });
  };

  const ratingStats = ratings ? {
    count: ratings.length,
    respectful: ratings.filter((r) => r.respectful).length,
    mic: ratings.filter((r) => r.has_mic).length,
    skilled: ratings.filter((r) => r.skilled).length,
    punctual: ratings.filter((r) => r.punctual).length,
    no_toxic: ratings.filter((r) => r.no_toxic).length,
    tournament: ratings.filter((r) => r.tournament_ready).length,
  } : null;

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="display text-5xl mb-6">بروفايل <span className="text-gradient-gold">اللاعب</span></h1>

        <form onSubmit={save} className="grid md:grid-cols-3 gap-6">
          {/* Sidebar card */}
          <div className="rounded-2xl border border-border bg-surface/60 p-6 text-center">
            <div className="size-24 rounded-full bg-gradient-gold mx-auto flex items-center justify-center text-3xl font-bold text-primary-foreground overflow-hidden mb-3">
              {form.avatar_url ? <img src={form.avatar_url} alt="" className="size-full object-cover" /> : (form.display_name ?? "؟").slice(0, 1)}
            </div>
            <label className="inline-flex items-center justify-center gap-2 w-full cursor-pointer rounded-md bg-input border border-border px-3 py-2 text-xs mb-2 hover:bg-surface transition">
              {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
              {uploading ? "جاري الرفع..." : "ارفع صورة"}
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }} />
            </label>
            <input placeholder="أو رابط صورة" value={form.avatar_url ?? ""} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} className="w-full text-xs rounded-md bg-input border border-border px-2 py-1.5 mb-4" />
            <div className="text-xl display">{form.display_name}</div>
            <div className="text-xs text-muted-foreground">@{profile?.username}</div>

            {ratingStats && ratingStats.count > 0 && (
              <div className="mt-5 pt-5 border-t border-border text-right space-y-1.5 text-xs">
                <div className="text-center text-[10px] uppercase text-muted-foreground mb-2 tracking-widest">{ratingStats.count} تقييم</div>
                {[
                  ["محترم", ratingStats.respectful],
                  ["معه مايك", ratingStats.mic],
                  ["لاعب قوي", ratingStats.skilled],
                  ["ملتزم بالوقت", ratingStats.punctual],
                  ["ما يسب", ratingStats.no_toxic],
                  ["جاهز للبطولات", ratingStats.tournament],
                ].map(([label, n]) => (
                  <div key={label as string} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-primary font-bold">{n}/{ratingStats.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Main form */}
          <div className="md:col-span-2 space-y-4">
            <div className="rounded-2xl border border-border bg-surface/60 p-6 space-y-3">
              <h3 className="display text-2xl mb-2">المعلومات الأساسية</h3>

              <Field label="المعرف (Username)">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <input
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value.replace(/\s/g, ""))}
                      disabled={cooldown.locked}
                      maxLength={20}
                      className={inputCls + " pr-7 pl-9 disabled:opacity-60"}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2">
                      {checkingUsername && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                      {!checkingUsername && usernameAvailable === true && <Check className="size-4 text-primary" />}
                      {!checkingUsername && usernameAvailable === false && <X className="size-4 text-destructive" />}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={saveUsername}
                    disabled={
                      cooldown.locked || checkingUsername ||
                      usernameInput.trim() === (profile?.username ?? "") ||
                      !USERNAME_RE.test(usernameInput.trim()) ||
                      usernameAvailable === false
                    }
                    className="px-3 rounded-md bg-primary/15 text-primary text-xs font-bold hover:bg-primary/25 disabled:opacity-50"
                  >
                    حفظ المعرف
                  </button>
                </div>
                <div className="text-[11px] mt-1">
                  {cooldown.locked ? (
                    <span className="text-destructive">يمكنك تغيير المعرف بعد {formatRemaining(cooldown.remainingMs)}</span>
                  ) : usernameInput.trim() === (profile?.username ?? "") ? (
                    <span className="text-muted-foreground">يمكنك تغيير المعرف مرة كل {USERNAME_COOLDOWN_DAYS} أيام</span>
                  ) : !USERNAME_RE.test(usernameInput.trim()) ? (
                    <span className="text-destructive">4-20 حرف: إنجليزي وأرقام و _ فقط</span>
                  ) : isReservedUsername(usernameInput.trim()) ? (
                    <span className="text-destructive">هذا المعرف محجوز (يشبه حسابات الإدارة)</span>
                  ) : checkingUsername ? (
                    <span className="text-muted-foreground">يتم التحقق...</span>
                  ) : usernameAvailable === false ? (
                    <span className="text-destructive">المعرف مستخدم بالفعل</span>
                  ) : usernameAvailable === true ? (
                    <span className="text-primary">المعرف متاح ✓</span>
                  ) : null}
                </div>
              </Field>

              <Field label="الاسم"><input value={form.display_name ?? ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className={inputCls} /></Field>
              <Field label="نبذة"><textarea rows={2} value={form.bio ?? ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} className={inputCls + " resize-none"} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="PUBG ID"><input value={form.pubg_id ?? ""} onChange={(e) => setForm({ ...form, pubg_id: e.target.value })} className={inputCls} /></Field>
                <Field label="الدولة"><select value={form.country ?? ""} onChange={(e) => setForm({ ...form, country: e.target.value })} className={inputCls}><option value="">—</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface/60 p-6 space-y-3">
              <h3 className="display text-2xl mb-2 flex items-center gap-2"><Target className="size-5 text-primary" /> أسلوب اللعب</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="الرانك"><select value={form.rank ?? ""} onChange={(e) => setForm({ ...form, rank: e.target.value })} className={inputCls}><option value="">—</option>{RANKS.map((r) => <option key={r}>{r}</option>)}</select></Field>
                <Field label="الرول"><select value={form.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inputCls}><option value="">—</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
                <Field label="السيرفر المفضل"><select value={form.preferred_server ?? ""} onChange={(e) => setForm({ ...form, preferred_server: e.target.value })} className={inputCls}><option value="">—</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
                <Field label="اللغة"><select value={form.language ?? ""} onChange={(e) => setForm({ ...form, language: e.target.value })} className={inputCls}><option value="">—</option>{LANGUAGES.map((r) => <option key={r}>{r}</option>)}</select></Field>
                <Field label="KD"><input type="number" step="0.01" value={form.kd ?? ""} onChange={(e) => setForm({ ...form, kd: e.target.value })} className={inputCls} /></Field>
                <Field label="الأوقات المتاحة"><select value={form.availability ?? ""} onChange={(e) => setForm({ ...form, availability: e.target.value })} className={inputCls}><option value="">—</option>{AVAILABILITY.map((a) => <option key={a}>{a}</option>)}</select></Field>
              </div>
              <label className="flex items-center gap-2 text-sm pt-1">
                <input type="checkbox" checked={form.mic_available ?? true} onChange={(e) => setForm({ ...form, mic_available: e.target.checked })} className="accent-primary" />
                <Mic className="size-4 text-primary" /> المايك متاح
              </label>
            </div>

            <div className="rounded-2xl border border-border bg-surface/60 p-6 space-y-3">
              <h3 className="display text-2xl mb-2 flex items-center gap-2"><Trophy className="size-5 text-primary" /> الحساسية / Sensitivity</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["tpp", "TPP بدون سكوب"],
                  ["fpp", "FPP بدون سكوب"],
                  ["ads", "ADS"],
                  ["gyro", "الجايرو"],
                ].map(([k, lbl]) => (
                  <Field key={k} label={lbl}>
                    <input value={form.sensitivity?.[k] ?? ""} onChange={(e) => setForm({ ...form, sensitivity: { ...(form.sensitivity ?? {}), [k]: e.target.value } })} className={inputCls} />
                  </Field>
                ))}
              </div>
            </div>

            <button type="submit" className="w-full flex items-center justify-center gap-2 rounded-md bg-gradient-gold py-3 text-base font-bold text-primary-foreground">
              <Save className="size-4" /> حفظ التغييرات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-md bg-input border border-border px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-muted-foreground mb-1">{label}</span>{children}</label>;
}
