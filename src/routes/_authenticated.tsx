import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { initOneSignal } from "@/lib/onesignal-native";
import { AlertOctagon, LogOut, Trash2, Loader2 } from "lucide-react";
import { getMyLinkedAccounts, deleteMyAccount } from "@/lib/admin-users.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

type SuspensionInfo = { reason: string | null; until: string | null } | null;
type LinkedAccount = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  suspended_at: string | null;
};
type CurrentInfo = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
} | null;

function AccountRow({
  acc,
  isCurrent,
}: {
  acc: { username: string | null; display_name: string | null; avatar_url: string | null };
  isCurrent?: boolean;
}) {
  const name = acc.display_name || acc.username || "حساب";
  return (
    <div className="flex items-center gap-3 rounded-lg bg-destructive/10 border border-destructive/30 p-2.5">
      {acc.avatar_url ? (
        <img src={acc.avatar_url} alt="" className="size-9 rounded-full object-cover" />
      ) : (
        <div className="size-9 rounded-full bg-destructive/25 flex items-center justify-center text-destructive font-bold text-sm">
          {name.slice(0, 1)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">{name}</div>
        {acc.username && (
          <div className="text-[11px] text-muted-foreground truncate">@{acc.username}</div>
        )}
      </div>
      {isCurrent && (
        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-destructive text-destructive-foreground">
          الحالي
        </span>
      )}
    </div>
  );
}

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [suspension, setSuspension] = useState<SuspensionInfo>(null);
  const [current, setCurrent] = useState<CurrentInfo>(null);
  const [linked, setLinked] = useState<LinkedAccount[]>([]);
  const [loadingLinked, setLoadingLinked] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchLinked = useServerFn(getMyLinkedAccounts);
  const delMe = useServerFn(deleteMyAccount);

  useEffect(() => {
    let cancelled = false;
    let cleanupChannel: (() => void) | null = null;

    supabase.auth.getUser()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data.user) {
          navigate({ to: "/login", replace: true });
          return;
        }
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, suspended_at, suspension_reason, suspended_until")
          .eq("id", data.user.id)
          .maybeSingle();
        const stillSuspended =
          prof?.suspended_at &&
          (!prof.suspended_until || new Date(prof.suspended_until) > new Date());
        if (stillSuspended) {
          setCurrent({
            id: prof!.id,
            username: prof!.username,
            display_name: prof!.display_name,
            avatar_url: prof!.avatar_url,
          });
          setSuspension({
            reason: prof?.suspension_reason ?? null,
            until: prof?.suspended_until ?? null,
          });
          setLoadingLinked(true);
          fetchLinked()
            .then((r: any) => { if (!cancelled) setLinked(r?.accounts ?? []); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoadingLinked(false); });
          setReady(true);
          return;
        }
        if (prof?.suspended_at && prof.suspended_until && new Date(prof.suspended_until) <= new Date()) {
          await supabase.from("profiles").update({
            suspended_at: null,
            suspension_reason: null,
            suspended_until: null,
          }).eq("id", data.user.id);
        }

        setReady(true);
        initOneSignal(data.user.id).catch(() => {});

        const channel = supabase
          .channel(`profile-suspension-${data.user.id}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "profiles",
              filter: `id=eq.${data.user.id}`,
            },
            (payload) => {
              const np: any = payload.new;
              if (!np?.suspended_at) {
                setSuspension(null);
                return;
              }
              if (np.suspended_until && new Date(np.suspended_until) <= new Date()) return;
              setSuspension({
                reason: np.suspension_reason ?? null,
                until: np.suspended_until ?? null,
              });
            }
          )
          .subscribe();
        cleanupChannel = () => { supabase.removeChannel(channel); };
      })
      .catch(() => {
        if (!cancelled) navigate({ to: "/login", replace: true });
      });

    return () => {
      cancelled = true;
      if (cleanupChannel) cleanupChannel();
    };
  }, [navigate, fetchLinked]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        جاري التحميل...
      </div>
    );
  }

  if (suspension) {
    const untilTxt = suspension.until
      ? `حتى ${new Date(suspension.until).toLocaleString("ar")}`
      : "نهائي";
    const isDuplicate = (suspension.reason || "").includes("مكرر") ||
      (suspension.reason || "").includes("تكرار") ||
      linked.length > 0;

    const handleDelete = async () => {
      setDeleting(true);
      try {
        await delMe();
        toast.success("تم حذف حسابك");
        await supabase.auth.signOut();
        navigate({ to: "/login", replace: true });
      } catch (e: any) {
        toast.error(e?.message || "فشل حذف الحساب");
        setDeleting(false);
      }
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md w-full rounded-2xl bg-surface border-2 border-destructive/50 shadow-2xl overflow-hidden">
          <div className="bg-destructive/15 border-b-2 border-destructive/40 p-5 flex items-center gap-3">
            <div className="size-12 rounded-full bg-destructive/25 flex items-center justify-center shrink-0">
              <AlertOctagon className="size-7 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-black text-destructive">حسابك مجمّد</h1>
              <p className="text-xs text-destructive/80 mt-0.5">تم رصد مخالفة على هذا الحساب</p>
            </div>
          </div>
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3">
              <p className="text-xs font-bold text-destructive mb-1">⚠️ نوع المخالفة</p>
              <p className="text-sm leading-relaxed">
                {suspension.reason || "حساب مكرر أو محاولة غش"}
              </p>
            </div>

            {isDuplicate && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-destructive">
                  الحسابات المرتبطة بك ({linked.length + (current ? 1 : 0)})
                </p>
                {loadingLinked ? (
                  <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin ml-2" /> جاري التحميل...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {current && <AccountRow acc={current} isCurrent />}
                    {linked.map((a) => (
                      <AccountRow key={a.id} acc={a} />
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  لفك التجميد عن حسابك الآخر، احذف هذا الحساب. سيتم تفعيل الحساب المتبقي تلقائياً.
                </p>
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-1">
              <p>• استخدام حسابات متعددة من نفس الجهاز/الشبكة ممنوع.</p>
              <p>• محاولات الغش في البطولات أو سحب الشدات تؤدي للتجميد الفوري.</p>
              <p>• إذا تعتقد أن هذا خطأ، تواصل مع الإدارة.</p>
            </div>
            <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
              مدة التجميد: <span className="font-bold text-foreground">{untilTxt}</span>
            </div>

            {confirmDel ? (
              <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-3 space-y-2">
                <p className="text-sm font-bold text-destructive">
                  تأكيد حذف الحساب نهائياً؟
                </p>
                <p className="text-[11px] text-muted-foreground">
                  لا يمكن التراجع. سيتم حذف كل بياناتك من هذا الحساب.
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={deleting}
                    onClick={handleDelete}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground font-bold text-xs hover:bg-destructive/90 transition disabled:opacity-60"
                  >
                    {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    نعم، احذف
                  </button>
                  <button
                    disabled={deleting}
                    onClick={() => setConfirmDel(false)}
                    className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border font-bold text-xs hover:bg-muted transition"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDel(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-destructive text-destructive font-bold text-sm hover:bg-destructive/10 transition"
              >
                <Trash2 className="size-4" />
                حذف الحساب
              </button>
            )}

            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/login", replace: true });
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm hover:bg-destructive/90 transition"
            >
              <LogOut className="size-4" />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
