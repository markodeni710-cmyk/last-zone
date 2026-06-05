import { ReactNode, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MessageCircle, UserPlus, UserMinus, UserX, Check, Loader2, Ban, ShieldOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { AdminBadge } from "@/components/AdminBadge";
import { isAdminUsername } from "@/lib/admin-utils";
import {
  getFriendStatus,
  sendFriendRequest,
  cancelFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  unfriend,
  getOrCreateDmThread,
  getBlockStatus,
  blockUser,
  unblockUser,
} from "@/lib/friends";
import { toast } from "sonner";

export function ProfilePopover({
  userId,
  children,
  asChild = true,
}: {
  userId: string;
  children: ReactNode;
  asChild?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [me, setMe] = useState<string | null>(null);

  const { data: block } = useQuery({
    queryKey: ["block-status", userId],
    enabled: open,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      setMe(u.user?.id ?? null);
      return getBlockStatus(userId);
    },
  });

  const isBlocked = !!(block?.blockedByMe || block?.blockedMe);

  const { data: profile } = useQuery({
    queryKey: ["popover-profile", userId],
    enabled: open && !isBlocked,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, rank, role, kd, country, pubg_id")
        .eq("id", userId)
        .maybeSingle();
      return data;
    },
  });

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["friend-status", userId],
    enabled: open && !!me && me !== userId && !isBlocked,
    queryFn: () => getFriendStatus(userId),
  });

  const [busy, setBusy] = useState(false);
  const action = async (fn: () => Promise<void>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
      await refetchStatus();
      qc.invalidateQueries({ queryKey: ["friend-requests"] });
      qc.invalidateQueries({ queryKey: ["my-friends"] });
      qc.invalidateQueries({ queryKey: ["block-status", userId] });
      qc.invalidateQueries({ queryKey: ["my-blocks"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openDm = async () => {
    try {
      await getOrCreateDmThread(userId);
      setOpen(false);
      navigate({ to: "/app/dm/$userId", params: { userId } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const isSelf = me === userId;

  // Fetch viewer's own username to know if they are the site admin
  const { data: myProfile } = useQuery({
    queryKey: ["my-username", me],
    enabled: open && !!me,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("username").eq("id", me!).maybeSingle();
      return data;
    },
  });

  const targetIsAdmin = isAdminUsername(profile?.username);
  const viewerIsAdmin = isAdminUsername(myProfile?.username);
  // Non-admin viewers cannot block, friend-request, or DM the official admin.
  const adminLocked = targetIsAdmin && !isSelf && !viewerIsAdmin;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild={asChild}>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-surface border-border" dir="rtl">
        {isBlocked ? (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-destructive font-bold">
              <Ban className="size-5" />
              {block?.blockedByMe ? "هذا المستخدم محظور" : "لا يمكنك رؤية هذا الملف"}
            </div>
            <p className="text-xs text-muted-foreground">
              {block?.blockedByMe
                ? "قمت بحظر هذا المستخدم. لا يمكنه مراسلتك ولا يمكنك رؤية ملفه."
                : "تم تقييد التفاعل مع هذا المستخدم."}
            </p>
            {block?.blockedByMe && block?.myBlockId && (
              <button
                disabled={busy}
                onClick={() => action(() => unblockUser(block.myBlockId!), "تم إلغاء الحظر")}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-surface border border-border text-sm font-bold hover:bg-background transition disabled:opacity-50"
              >
                <ShieldOff className="size-4" /> إلغاء الحظر
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="p-4 bg-gradient-to-b from-primary/15 to-transparent">
              <div className="flex items-center gap-3">
                <div className={"size-14 rounded-full flex items-center justify-center text-primary-foreground font-bold overflow-hidden shrink-0 " + (isAdminUsername(profile?.username) ? "bg-gradient-gold ring-2 ring-primary shadow-[0_0_18px_rgba(212,170,80,0.55)]" : "bg-gradient-gold")}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="size-full object-cover" />
                  ) : (
                    (profile?.display_name ?? "؟").slice(0, 1)
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-bold truncate flex items-center gap-1.5">
                    <span className={isAdminUsername(profile?.username) ? "text-primary" : ""}>{profile?.display_name || profile?.username || "لاعب"}</span>
                    <AdminBadge username={profile?.username} size="sm" />
                  </div>
                  {profile?.username && <div className="text-xs text-muted-foreground">@{profile.username}</div>}
                </div>
              </div>
              {profile?.bio && <p className="text-xs text-muted-foreground mt-3 line-clamp-3">{profile.bio}</p>}
              <div className="flex gap-2 mt-3 text-[11px] flex-wrap">
                {profile?.rank && <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-bold">{profile.rank}</span>}
                {profile?.role && <span className="px-2 py-0.5 rounded bg-surface border border-border">{profile.role}</span>}
                {profile?.kd != null && <span className="px-2 py-0.5 rounded bg-surface border border-border">KD {profile.kd}</span>}
                {profile?.country && <span className="px-2 py-0.5 rounded bg-surface border border-border">{profile.country}</span>}
              </div>
              {profile?.pubg_id && (
                <div className="mt-3 flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-surface border border-border">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">PUBG ID</span>
                  <span className="text-xs font-mono font-bold text-primary">{profile.pubg_id}</span>
                </div>
              )}
            </div>


            {!isSelf && !adminLocked && (
              <div className="p-3 border-t border-border space-y-2">
                {status?.kind === "none" && (
                  <button
                    disabled={busy}
                    onClick={() => action(() => sendFriendRequest(userId), "تم إرسال طلب الصداقة")}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-primary/15 text-primary text-sm font-bold hover:bg-primary/25 transition disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                    إرسال طلب صداقة
                  </button>
                )}
                {status?.kind === "pending_outgoing" && (
                  <button
                    disabled={busy}
                    onClick={() => action(() => cancelFriendRequest(status.id), "تم إلغاء الطلب")}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-surface border border-border text-sm font-bold hover:bg-background transition disabled:opacity-50"
                  >
                    <UserX className="size-4" /> إلغاء الطلب
                  </button>
                )}
                {status?.kind === "pending_incoming" && (
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => action(() => acceptFriendRequest(status.id), "أصبحتما أصدقاء!")}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md bg-primary/15 text-primary text-sm font-bold hover:bg-primary/25 transition disabled:opacity-50"
                    >
                      <Check className="size-4" /> قبول
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => action(() => rejectFriendRequest(status.id), "تم الرفض")}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md bg-destructive/15 text-destructive text-sm font-bold hover:bg-destructive/25 transition disabled:opacity-50"
                    >
                      رفض
                    </button>
                  </div>
                )}
                {status?.kind === "friends" && (
                  <button
                    disabled={busy}
                    onClick={() => action(() => unfriend(status.id), "تم إلغاء الصداقة")}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-surface border border-border text-sm font-bold hover:bg-destructive/15 hover:text-destructive transition disabled:opacity-50"
                  >
                    <UserMinus className="size-4" /> إلغاء الصداقة
                  </button>
                )}
                <button
                  onClick={openDm}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold hover:opacity-90 transition"
                >
                  <MessageCircle className="size-4" /> محادثة
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm("هل تريد حظر هذا المستخدم؟ لن يتمكن من مراسلتك أو رؤية ملفك.")) {
                      action(() => blockUser(userId), "تم حظر المستخدم");
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-surface border border-border text-sm font-bold hover:bg-destructive/15 hover:text-destructive transition disabled:opacity-50"
                >
                  <Ban className="size-4" /> حظر
                </button>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
