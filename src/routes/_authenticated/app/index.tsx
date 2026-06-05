import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Users, Plus, Shield, Check, Lock, Globe, Search, Hash, KeyRound, UserSearch, X, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProfilePopover } from "@/components/ProfilePopover";
import { AdminBadge } from "@/components/AdminBadge";
import { isAdminUsername } from "@/lib/admin-utils";
import { sendFriendRequest, getFriendStatus, cancelFriendRequest } from "@/lib/friends";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Discover,
});

function Discover() {
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", region: "KSA", is_public: true, join_requirements: "", join_password: "" });
  const [search, setSearch] = useState("");
  const [codeResult, setCodeResult] = useState<any>(null);
  const [searchingCode, setSearchingCode] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<any>(null);
  const [pwInput, setPwInput] = useState("");
  const [findFriendOpen, setFindFriendOpen] = useState(false);

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setMe(data.session?.user?.id ?? null)).catch(() => setMe(null)); }, []);

  const { data: myBans } = useQuery({
    queryKey: ["my-bans", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("server_bans" as any).select("server_id").eq("user_id", me!);
      return new Set(((data ?? []) as any[]).map((r) => r.server_id));
    },
  });

  const { data: servers, refetch } = useQuery({
    queryKey: ["public-servers", me, myBans ? Array.from(myBans).join(",") : ""],
    enabled: myBans !== undefined,
    queryFn: async () => {
      const { data: publicData } = await supabase
        .from("servers")
        .select("*")
        .eq("is_public", true)
        .order("member_count", { ascending: false })
        .limit(50);
      let combined: any[] = publicData ?? [];
      if (me) {
        const { data: ownedData } = await supabase.from("servers").select("*").eq("owner_id", me);
        const { data: memberRows } = await supabase
          .from("server_members").select("server:servers(*)").eq("user_id", me);
        const memberServers = (memberRows ?? []).map((r: any) => r.server).filter(Boolean);
        const map = new Map<string, any>();
        [...combined, ...(ownedData ?? []), ...memberServers].forEach((s) => { if (s?.id) map.set(s.id, s); });
        combined = Array.from(map.values()).sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0));
      }
      return combined.filter((s) => !myBans?.has(s.id));
    },
  });

  const { data: myMemberships, refetch: refetchMembers } = useQuery({
    queryKey: ["my-memberships", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("server_members").select("server_id").eq("user_id", me!);
      return new Set((data ?? []).map((r) => r.server_id));
    },
  });

  const filteredByName = (servers ?? []).filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.code && String(s.code).includes(q))
    );
  });

  const doSearch = async () => {
    const q = search.trim();
    if (!q) return;
    // إذا كان رقماً من 8 خانات وما طلع بالقائمة، ابحث في قاعدة البيانات
    if (/^\d{8}$/.test(q) && filteredByName.length === 0) {
      setSearchingCode(true);
      const { data, error } = await supabase.rpc("find_server_by_code" as any, { _code: q });
      setSearchingCode(false);
      if (error) { toast.error(error.message); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) { toast.error("لم يتم العثور على سيرفر"); return; }
      setCodeResult(row);
    }
  };

  const join = async (server: any) => {
    if (!me) { toast.error("سجّل دخولك أولاً"); return; }
    if (myMemberships?.has(server.id)) {
      navigate({ to: "/app/servers/$serverId", params: { serverId: server.id } });
      return;
    }
    if (server.is_public === false) {
      // فتح نافذة كلمة المرور
      setPasswordPrompt(server);
      setPwInput("");
      return;
    }
    const { error } = await supabase.from("server_members").insert({ server_id: server.id, user_id: me });
    if (error) {
      if (error.code === "23505") { navigate({ to: "/app/servers/$serverId", params: { serverId: server.id } }); return; }
      toast.error(error.message); return;
    }
    toast.success("انضممت للسيرفر!");
    refetch(); refetchMembers();
    navigate({ to: "/app/servers/$serverId", params: { serverId: server.id } });
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordPrompt) return;
    const { data, error } = await supabase.rpc("join_server_with_password" as any, {
      _server_id: passwordPrompt.id,
      _password: pwInput,
    });
    if (error) {
      if (error.message.includes("wrong_password")) toast.error("كلمة المرور غير صحيحة");
      else if (error.message.includes("password_not_set")) toast.error("هذا السيرفر لا يقبل الانضمام حالياً");
      else if (error.message.includes("banned")) toast.error("أنت محظور من هذا السيرفر");
      else toast.error(error.message);
      return;
    }
    toast.success(data === "already_member" ? "أنت عضو بالفعل" : "انضممت للسيرفر!");
    const sid = passwordPrompt.id;
    setPasswordPrompt(null); setCodeResult(null); setSearch("");
    refetch(); refetchMembers();
    navigate({ to: "/app/servers/$serverId", params: { serverId: sid } });
  };

  const createServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    const payload: any = {
      name: form.name,
      description: form.description,
      region: form.region,
      is_public: form.is_public,
      join_requirements: form.join_requirements || null,
      join_password: !form.is_public && form.join_password ? form.join_password : null,
      owner_id: me,
    };
    const { data, error } = await supabase.from("servers").insert(payload).select().single();
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء السيرفر!");
    setCreating(false);
    setForm({ name: "", description: "", region: "KSA", is_public: true, join_requirements: "", join_password: "" });
    refetch();
    if (data) navigate({ to: "/app/servers/$serverId", params: { serverId: data.id } });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-8 pb-8 pt-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="display text-4xl md:text-5xl mb-2">اكتشف <span className="text-gradient-gold">السيرفرات</span></h1>
            <p className="text-muted-foreground text-sm md:text-base">انضم لكلانات وأقسام نشطة من مجتمع ببجي العربي.</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-md bg-gradient-gold px-5 py-2.5 text-sm font-bold text-primary-foreground">
              <Plus className="size-4" /> أنشئ سيرفر
            </button>
          </div>
          <button onClick={() => setFindFriendOpen(true)} className="flex items-center gap-2 rounded-md border border-border bg-surface/60 px-5 py-2.5 text-sm font-bold text-foreground hover:bg-surface">
            <UserSearch className="size-4" /> ابحث عن صديق
          </button>
        </div>

        {/* شريط البحث - ثابت */}
        <div className="sticky top-0 z-30 -mx-8 px-8 py-3 mb-6 bg-background/85 backdrop-blur-md border-b border-border/50 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } }}
              placeholder="ابحث بالاسم أو الرقم المعرّف (8 أرقام)"
              className="w-full rounded-md bg-input border border-border pr-10 pl-3 py-2.5 text-sm"
            />
          </div>
          <button
            onClick={doSearch}
            disabled={searchingCode}
            className="rounded-md bg-gradient-gold text-primary-foreground px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2"
          >
            <Search className="size-4" /> بحث
          </button>
        </div>

        <div>


        {/* نتيجة البحث بالرقم */}
        {codeResult && (
          <div className="mb-6 rounded-xl border border-primary/40 bg-primary/5 p-4 flex items-center gap-4">
            <div className="size-12 rounded-lg bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold display overflow-hidden">
              <img src={codeResult.icon_url || "/default-server-icon.png"} alt={codeResult.name} className="size-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="display text-lg truncate">{codeResult.name}</h4>
                {codeResult.is_public
                  ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center gap-1"><Globe className="size-2.5" /> عام · #{codeResult.code}</span>
                  : <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/20 text-destructive border border-destructive/30 flex items-center gap-1"><Lock className="size-2.5" /> خاص</span>
                }
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">{codeResult.description || "بدون وصف"}</p>
            </div>
            <button onClick={() => join(codeResult)} className="text-xs px-4 py-2 rounded-md bg-gradient-gold text-primary-foreground font-bold whitespace-nowrap">انضمام</button>
            <button onClick={() => setCodeResult(null)} className="text-xs px-3 py-2 rounded-md text-muted-foreground">إغلاق</button>
          </div>
        )}

        {filteredByName.length === 0 && !codeResult && (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-12 text-center">
            <Shield className="size-12 text-primary mx-auto mb-3" />
            <h3 className="display text-2xl mb-1">لا توجد نتائج</h3>
            <p className="text-muted-foreground text-sm mb-4">جرّب البحث برقم السيرفر أو أنشئ سيرفراً جديداً.</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredByName.map((s) => {
            const joined = myMemberships?.has(s.id);
            const isPrivate = s.is_public === false;
            const isOwner = me && s.owner_id === me;
            const canSeeCode = !isPrivate || isOwner || joined;
            return (
              <div key={s.id} className="group rounded-xl border border-border bg-surface/60 backdrop-blur overflow-hidden hover:border-primary/40 transition">
                <div className="h-24 bg-gradient-to-br from-primary/20 to-background relative">
                  {s.banner_url && <img src={s.banner_url} alt="" className="size-full object-cover" />}
                  <div className="absolute -bottom-6 right-4 size-14 rounded-xl bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold display text-xl border-4 border-surface">
                    <img src={s.icon_url || "/default-server-icon.png"} alt={s.name} className="size-full rounded-lg object-cover" />
                  </div>
                  <div className="absolute top-2 left-2 flex flex-col items-stretch gap-1 w-20">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center justify-center gap-1 ${isPrivate ? "bg-destructive/20 text-destructive border border-destructive/30" : "bg-primary/20 text-primary border border-primary/30"}`}>
                      {isPrivate ? <><Lock className="size-2.5" /> خاص</> : <><Globe className="size-2.5" /> عام</>}
                    </span>
                    {canSeeCode && s.code && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-background/80 text-foreground border border-border flex items-center justify-center gap-1">
                        <Hash className="size-2.5" />{s.code}
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-4 pt-8">
                  <h3 className="display text-xl mb-1 truncate">{s.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 h-8 mb-3">{s.description || "بدون وصف"}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="size-3" /> {s.member_count}
                    </span>
                    <div className="flex gap-2">
                      {joined ? (
                        <>
                          <Link to="/app/servers/$serverId" params={{ serverId: s.id }} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-surface-2">دخول</Link>
                          <span className="text-xs px-3 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-bold flex items-center gap-1">
                            <Check className="size-3" /> منضم
                          </span>
                        </>
                      ) : (
                        <button onClick={() => join(s)} className="text-xs px-3 py-1.5 rounded-md bg-gradient-gold text-primary-foreground font-bold flex items-center gap-1">
                          {isPrivate ? <><KeyRound className="size-3" /> دخول بكلمة المرور</> : <><Plus className="size-3" /> انضمام</>}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>


      {creating && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={createServer} className="w-full max-w-lg rounded-2xl bg-surface border border-border p-6 shadow-elegant max-h-[90vh] overflow-y-auto">
            <h3 className="display text-3xl mb-4">أنشئ سيرفر</h3>
            <div className="space-y-3">
              <input required placeholder="اسم السيرفر / الكلان" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
              <textarea placeholder="وصف مختصر" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm resize-none" />
              <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm">
                {["KSA", "MENA", "Asia", "Europe", "NA"].map((r) => <option key={r}>{r}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm({ ...form, is_public: true })} className={`rounded-md border px-3 py-2 text-sm flex items-center justify-center gap-2 transition ${form.is_public ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                  <Globe className="size-4" /> عام
                </button>
                <button type="button" onClick={() => setForm({ ...form, is_public: false })} className={`rounded-md border px-3 py-2 text-sm flex items-center justify-center gap-2 transition ${!form.is_public ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground"}`}>
                  <Lock className="size-4" /> خاص
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {form.is_public ? "أي شخص يقدر ينضم مباشرة. الرقم المعرّف هيكون ظاهر للجميع." : "الانضمام يحتاج كلمة مرور تحددها أنت. الرقم المعرّف لن يظهر إلا لمن تشاركه."}
              </p>
              {!form.is_public && (
                <>
                  <div className="relative">
                    <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="كلمة المرور للانضمام (مطلوبة)"
                      required
                      minLength={4}
                      value={form.join_password}
                      onChange={(e) => setForm({ ...form, join_password: e.target.value })}
                      className="w-full rounded-md bg-input border border-border pr-10 pl-3 py-2 text-sm"
                    />
                  </div>
                  <textarea
                    placeholder="شروط القبول (اختياري — تظهر للمستخدم)"
                    rows={2}
                    value={form.join_requirements}
                    onChange={(e) => setForm({ ...form, join_requirements: e.target.value })}
                    className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm resize-none"
                  />
                </>
              )}
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 text-sm text-muted-foreground">إلغاء</button>
              <button type="submit" className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold">إنشاء</button>
            </div>
          </form>
        </div>
      )}

      {passwordPrompt && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPasswordPrompt(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submitPassword} className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-elegant">
            <h3 className="display text-2xl mb-1 flex items-center gap-2"><Lock className="size-5 text-destructive" /> سيرفر خاص</h3>
            <p className="text-sm text-muted-foreground mb-4">{passwordPrompt.name}</p>
            {passwordPrompt.join_requirements && (
              <div className="rounded-md bg-background/60 border border-border p-3 mb-3">
                <p className="text-[11px] font-bold text-primary mb-1">شروط القبول</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{passwordPrompt.join_requirements}</p>
              </div>
            )}
            <div className="relative">
              <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="password"
                required
                autoFocus
                placeholder="كلمة المرور"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                className="w-full rounded-md bg-input border border-border pr-10 pl-3 py-2.5 text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" onClick={() => setPasswordPrompt(null)} className="px-4 py-2 text-sm text-muted-foreground">إلغاء</button>
              <button type="submit" className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold">دخول</button>
            </div>
          </form>
        </div>
      )}

      {findFriendOpen && <FindFriendDialog onClose={() => setFindFriendOpen(false)} meId={me} />}
    </div>
  );
}

function FindFriendDialog({ onClose, meId }: { onClose: () => void; meId: string | null }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [pendingOut, setPendingOut] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data: results, isFetching } = useQuery({
    queryKey: ["user-search", debounced, meId],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const term = debounced.replace(/^@/, "");
      const like = `%${term}%`;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .limit(25);
      if (error) throw error;
      return (data ?? []).filter((p) => p.id !== meId);
    },
  });

  const addFriend = async (userId: string) => {
    if (!meId || meId === userId) return;
    setActionId(userId);
    try {
      const status = await getFriendStatus(userId);
      if (status.kind === "friends") {
        toast.info("هذا الشخص صديقك بالفعل");
      } else if (status.kind === "pending_outgoing") {
        toast.info("تم إرسال الطلب مسبقاً");
        setPendingOut((prev) => new Map(prev).set(userId, status.id));
      } else if (status.kind === "pending_incoming") {
        toast.info("لديك طلب صداقة وارد من هذا الشخص");
      } else {
        await sendFriendRequest(userId);
        const newStatus = await getFriendStatus(userId);
        if (newStatus.kind === "pending_outgoing") {
          setPendingOut((prev) => new Map(prev).set(userId, newStatus.id));
        }
        toast.success("تم إرسال طلب الصداقة");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionId(null);
    }
  };

  const cancelFriend = async (userId: string) => {
    if (!meId) return;
    setActionId(userId);
    try {
      let friendshipId = pendingOut.get(userId);
      if (!friendshipId) {
        const status = await getFriendStatus(userId);
        if (status.kind === "pending_outgoing") {
          friendshipId = status.id;
        }
      }
      if (!friendshipId) {
        toast.info("لا يوجد طلب صداقة مرسل لإلغائه");
        return;
      }
      await cancelFriendRequest(friendshipId);
      setPendingOut((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
      toast.success("تم إلغاء طلب الصداقة");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-surface border border-border p-6 shadow-elegant max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="display text-2xl flex items-center gap-2"><UserSearch className="size-5 text-primary" /> ابحث عن صديق</h3>
          <button onClick={onClose} className="size-8 rounded-md hover:bg-surface-2 flex items-center justify-center text-muted-foreground"><X className="size-4" /></button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="اكتب الاسم أو المعرّف (@username)"
            className="w-full rounded-md bg-input border border-border pr-10 pl-3 py-2.5 text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {debounced.length < 2 && (
            <p className="text-center text-xs text-muted-foreground py-8">اكتب حرفين على الأقل للبدء بالبحث.</p>
          )}
          {debounced.length >= 2 && isFetching && (
            <p className="text-center text-xs text-muted-foreground py-8">جاري البحث…</p>
          )}
          {debounced.length >= 2 && !isFetching && (results?.length ?? 0) === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">لا توجد نتائج مطابقة.</p>
          )}
          <div className="space-y-2">
            {(results ?? []).map((p) => {
              const isAdmin = isAdminUsername(p.username);
              return (
              <div key={p.id} className="flex items-center gap-2">
                <ProfilePopover userId={p.id}>
                  <button className={"flex-1 flex items-center gap-3 p-2.5 rounded-lg border bg-background/40 hover:bg-surface-2 transition text-right " + (isAdmin ? "border-primary/50 bg-primary/5" : "border-border")}>
                    <div className={"size-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold overflow-hidden shrink-0 " + (isAdmin ? "ring-2 ring-primary shadow-[0_0_10px_rgba(212,170,80,0.55)]" : "")}>
                      {p.avatar_url
                        ? <img src={p.avatar_url} alt={p.username} className="size-full object-cover" />
                        : <span>{(p.display_name || p.username || "?").charAt(0)}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm truncate flex items-center gap-1.5">
                        <span className={isAdmin ? "text-primary" : ""}>{p.display_name || p.username}</span>
                        <AdminBadge username={p.username} size="xs" />
                      </div>
                      <div className="text-xs text-muted-foreground truncate">@{p.username}</div>
                    </div>
                  </button>
                </ProfilePopover>
                {meId && meId !== p.id && (
                  pendingOut.has(p.id) ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); cancelFriend(p.id); }}
                      disabled={actionId === p.id}
                      className="shrink-0 rounded-lg border border-border bg-background/40 hover:bg-destructive/15 hover:text-destructive hover:border-destructive/30 text-muted-foreground px-3 py-1.5 text-xs font-bold transition disabled:opacity-50"
                    >
                      إلغاء
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); addFriend(p.id); }}
                      disabled={actionId === p.id}
                      title="إضافة صديق"
                      className="shrink-0 size-9 rounded-lg border border-border bg-background/40 hover:bg-primary/15 hover:text-primary hover:border-primary/30 text-muted-foreground flex items-center justify-center transition disabled:opacity-50"
                    >
                      <UserPlus className="size-4" />
                    </button>
                  )
                )}
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
