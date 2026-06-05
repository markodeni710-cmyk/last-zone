import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Sparkles, Check, Zap, ArrowDownToLine, Crown, ShoppingCart, Crosshair } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/shop")({
  component: ShopPage,
});

type Pkg = { key: string; trophies: number; price: string; badge?: string | null; popular?: boolean; perks: string[] };
type UcPkg = { key: string; uc: number; cost: number; usd: number; badge?: string | null; popular?: boolean };

function ShopPage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("shop-packages-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "trophy_packages" }, () => {
        qc.invalidateQueries({ queryKey: ["shop-trophy-packages"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "uc_packages" }, () => {
        qc.invalidateQueries({ queryKey: ["shop-uc-packages"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const { data: trophies } = useQuery({
    queryKey: ["my-trophies-balance", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("available_trophies", { _user: userId! });
      return (data as number) ?? 0;
    },
  });

  const { data: packages } = useQuery({
    queryKey: ["shop-trophy-packages"],
    queryFn: async (): Promise<Pkg[]> => {
      const { data } = await supabase
        .from("trophy_packages")
        .select("key, trophies, price_usd, price_label, badge, popular, perks")
        .eq("visible", true)
        .order("sort_order", { ascending: true });
      return (data ?? []).map((r: any) => ({
        key: r.key,
        trophies: r.trophies,
        price: r.price_label || `$${r.price_usd}`,
        badge: r.badge,
        popular: r.popular,
        perks: r.perks ?? [],
      }));
    },
  });

  const { data: ucPackages } = useQuery({
    queryKey: ["shop-uc-packages"],
    queryFn: async (): Promise<UcPkg[]> => {
      const { data } = await supabase
        .from("uc_packages")
        .select("key, uc_amount, trophies_cost, usd_value, badge, popular")
        .eq("visible", true)
        .order("sort_order", { ascending: true });
      return (data ?? []).map((r: any) => ({
        key: r.key,
        uc: r.uc_amount,
        cost: r.trophies_cost,
        usd: Number(r.usd_value),
        badge: r.badge,
        popular: r.popular,
      }));
    },
  });

  const buy = async (p: Pkg) => {
    setBusy(p.key);
    const { error } = await supabase.rpc("purchase_trophy_package", { _package_key: p.key });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`مبروك! حصلت على ${p.trophies} كأس`);
    qc.invalidateQueries({ queryKey: ["my-trophies-balance"] });
  };

  const [pubgId, setPubgId] = useState("");
  const [editingPubg, setEditingPubg] = useState(false);
  const [savingPubg, setSavingPubg] = useState(false);

  const { data: profilePubg } = useQuery({
    queryKey: ["my-profile-pubg", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("pubg_id")
        .eq("id", userId!)
        .maybeSingle();
      return (data?.pubg_id as string | null) ?? "";
    },
  });

  useEffect(() => {
    if (profilePubg !== undefined) setPubgId(profilePubg);
  }, [profilePubg]);

  const savePubgId = async () => {
    if (!userId) return;
    const trimmed = pubgId.trim();
    if (trimmed.length < 4) {
      toast.error("الرجاء إدخال معرّف PUBG صحيح (4 أرقام على الأقل)");
      return;
    }
    setSavingPubg(true);
    const { error } = await supabase.from("profiles").update({ pubg_id: trimmed }).eq("id", userId);
    setSavingPubg(false);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ معرّف PUBG في ملفك الشخصي");
    setEditingPubg(false);
    qc.invalidateQueries({ queryKey: ["my-profile-pubg", userId] });
    qc.invalidateQueries({ queryKey: ["my-profile", userId] });
  };

  const withdraw = async (p: UcPkg) => {
    const trimmed = pubgId.trim();
    if (!trimmed || trimmed.length < 4) {
      return toast.error("الرجاء إدخال معرّف PUBG صحيح (4 أرقام على الأقل)");
    }
    if ((trophies ?? 0) < p.cost) {
      return toast.error(`رصيدك غير كافٍ — تحتاج ${p.cost} كأس`);
    }
    setBusy(p.key);
    // Persist PUBG ID to profile if it changed, so future withdrawals use the new one
    if (userId && trimmed !== (profilePubg ?? "")) {
      const { error: upErr } = await supabase
        .from("profiles")
        .update({ pubg_id: trimmed })
        .eq("id", userId);
      if (upErr) {
        setBusy(null);
        return toast.error("تعذّر حفظ معرّف PUBG: " + upErr.message);
      }
      qc.invalidateQueries({ queryKey: ["my-profile-pubg", userId] });
      qc.invalidateQueries({ queryKey: ["my-profile", userId] });
    }
    const { error } = await supabase.rpc("request_uc_withdrawal", {
      _package_key: p.key,
      _pubg_id: trimmed,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    setEditingPubg(false);
    toast.success(`تم إرسال طلب سحب ${p.uc} UC — سيتم التحويل قريباً`);
    qc.invalidateQueries({ queryKey: ["my-trophies-balance"] });
    qc.invalidateQueries({ queryKey: ["my-uc-withdrawals"] });
  };

  return (
    <div className="min-h-screen relative">
      {/* Ambient gold glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -left-32 size-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative p-4 md:p-8 max-w-6xl mx-auto">
        {/* Hero header */}
        <header className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 mb-4">
            <Sparkles className="size-3.5 text-primary" />
            <span className="text-[11px] text-primary tracking-wide">نظام تجريبي — قريباً دفع حقيقي</span>
          </div>
          <h1 className="display text-4xl md:text-5xl mb-2 bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
            متجر الكؤوس
          </h1>
          <p className="text-sm text-muted-foreground">اختَر الحزمة المناسبة وتُضاف لرصيدك فوراً</p>
        </header>

        {/* Balance card */}
        <div className="mb-8 relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-surface to-surface-2 px-5 py-3">
          <div className="absolute top-0 right-0 size-24 bg-primary/10 blur-2xl rounded-full" />
          <div className="relative flex items-center gap-4">
            <div className="size-11 rounded-xl bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center shadow-lg shadow-primary/20">
              <Trophy className="size-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">رصيدك الحالي</div>
              <div className="display text-3xl leading-none mt-0.5">{(trophies ?? 0).toLocaleString()} <span className="text-sm text-muted-foreground font-normal font-sans">كأس</span></div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="buy" className="mt-8">
          <div className="flex justify-center mb-6">
            <TabsList className="h-11 rounded-full p-1.5 bg-muted/80 border border-border">
              <TabsTrigger value="buy" className="rounded-full px-5 py-2 text-sm flex items-center gap-2 data-[state=active]:shadow-md">
                <ShoppingCart className="size-4" />
                شراء كؤوس
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="rounded-full px-5 py-2 text-sm flex items-center gap-2 data-[state=active]:shadow-md">
                <Crosshair className="size-4" />
                سحب شدات PUBG
              </TabsTrigger>
            </TabsList>
          </div>

          {/* BUY TAB */}
          <TabsContent value="buy" className="mt-0">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="size-4 text-primary" />
              <h2 className="display text-lg">اختر حزمتك</h2>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(packages ?? []).map((p: Pkg) => (
                <div
                  key={p.key}
                  className={`group relative rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1 ${
                    p.popular
                      ? "border-primary/50 bg-gradient-to-b from-primary/10 to-surface shadow-xl shadow-primary/10"
                      : "border-border bg-surface hover:border-primary/30"
                  }`}
                >
                  {p.badge && (
                    <span
                      className={`absolute -top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        p.popular
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                          : "bg-foreground text-background"
                      }`}
                    >
                      {p.badge}
                    </span>
                  )}

                  <div className="flex items-center justify-center mb-3">
                    <div
                      className={`size-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                        p.popular
                          ? "bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/30"
                          : "bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20"
                      }`}
                    >
                      <Trophy className={`size-6 ${p.popular ? "text-primary-foreground" : "text-primary"}`} />
                    </div>
                  </div>

                  <div className="text-center mb-2">
                    <div className="display text-2xl">{p.trophies.toLocaleString()}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">كأس</div>
                  </div>

                  <div className="text-center mb-2 pb-2 border-b border-border/50">
                    <div className="display text-xl text-primary">{p.price}</div>
                  </div>

                  <ul className="space-y-1 mb-3">
                    {p.perks.map((perk: string, i: number) => (
                      <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Check className="size-3 text-primary shrink-0" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    disabled={busy === p.key}
                    onClick={() => buy(p)}
                    className={`w-full px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                      p.popular
                        ? "bg-primary text-primary-foreground hover:brightness-110 shadow-md shadow-primary/20"
                        : "bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
                    }`}
                  >
                    {busy === p.key ? "جارٍ الشراء..." : "شراء الآن"}
                  </button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* WITHDRAW TAB */}
          <TabsContent value="withdraw" className="mt-0">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownToLine className="size-4 text-primary" />
              <h2 className="display text-lg">سحب الكؤوس — شدات ببجي</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              حوّل كؤوسك إلى شدات PUBG حقيقية. كل 100 كأس = 1$ من الشدات
            </p>

            <div className="mb-4 rounded-xl border border-border bg-surface p-4">
              <label className="block text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
                معرّف PUBG (Player ID)
              </label>
              {profilePubg && !editingPubg ? (
                <div className="flex items-center justify-between gap-2 bg-background border border-border rounded-lg px-3 py-2">
                  <span dir="ltr" className="text-sm font-mono">{pubgId || profilePubg}</span>
                  <button
                    type="button"
                    onClick={() => setEditingPubg(true)}
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    تغيير
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    value={pubgId}
                    onChange={(e) => setPubgId(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="5xxxxxxxxx"
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    disabled={savingPubg || pubgId.trim().length < 4}
                    onClick={savePubgId}
                    className="text-xs font-bold text-primary hover:text-primary/80 shrink-0 disabled:opacity-50"
                  >
                    {savingPubg ? "جارٍ الحفظ..." : "حفظ"}
                  </button>
                  {profilePubg && (
                    <button
                      type="button"
                      onClick={() => { setPubgId(profilePubg); setEditingPubg(false); }}
                      className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                    >
                      إلغاء
                    </button>
                  )}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1.5">
                يُحفظ المعرف في ملفك الشخصي — تأكد من صحته قبل السحب
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {(ucPackages ?? []).map((p: UcPkg) => {
                const canAfford = (trophies ?? 0) >= p.cost;
                return (
                  <div
                    key={p.key}
                    className={`group relative rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1 ${
                      p.popular
                        ? "border-primary/50 bg-gradient-to-b from-primary/10 to-surface shadow-xl shadow-primary/10"
                        : "border-border bg-surface hover:border-primary/30"
                    }`}
                  >
                    {p.badge && (
                      <span
                        className={`absolute -top-2.5 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          p.popular
                            ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                            : "bg-foreground text-background"
                        }`}
                      >
                        {p.badge}
                      </span>
                    )}

                    <div className="flex items-center justify-center mb-3">
                      <div
                        className={`size-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                          p.popular
                            ? "bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/30"
                            : "bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20"
                        }`}
                      >
                        <Crown className={`size-6 ${p.popular ? "text-primary-foreground" : "text-primary"}`} />
                      </div>
                    </div>

                    <div className="text-center mb-2">
                      <div className="display text-2xl">{p.uc.toLocaleString()}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">UC</div>
                    </div>

                    <div className="text-center mb-3 pb-2 border-b border-border/50">
                      <div className="text-xs text-muted-foreground">يكلّف</div>
                      <div className="display text-lg text-primary">{p.cost.toLocaleString()} <span className="text-[11px] font-sans">كأس</span></div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">≈ ${p.usd}</div>
                    </div>

                    <button
                      disabled={busy === p.key || !canAfford}
                      onClick={() => withdraw(p)}
                      className={`w-full px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        p.popular
                          ? "bg-primary text-primary-foreground hover:brightness-110 shadow-md shadow-primary/20"
                          : "bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
                      }`}
                    >
                      {busy === p.key ? "جارٍ الإرسال..." : canAfford ? "اسحب الآن" : "رصيد غير كافٍ"}
                    </button>
                  </div>
                );
              })}
            </div>

          </TabsContent>
        </Tabs>

        <p className="text-center text-[11px] text-muted-foreground mt-8">
          المشتريات حالياً وهمية لأغراض التجربة — طلبات السحب تُراجع يدوياً
        </p>
      </div>
    </div>
  );
}
