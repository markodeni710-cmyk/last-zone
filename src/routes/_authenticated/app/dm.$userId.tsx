import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Send, Lock, Check, X, Settings, Ban, Trash2, ShieldOff, CheckCheck, Phone, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getOrCreateDmThread, getBlockStatus, blockUser, unblockUserByOther, deleteDmThread } from "@/lib/friends";
import { toast } from "sonner";
import { playPing } from "@/lib/ping-sound";
import { useDmCall } from "@/components/DmCallProvider";
import { useOnlineUsers } from "@/hooks/use-online-presence";
import { AdminBadge } from "@/components/AdminBadge";
import { isAdminUsername } from "@/lib/admin-utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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

export const Route = createFileRoute("/_authenticated/app/dm/$userId")({
  component: DmPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">حصل خطأ: {error.message}</div>
  ),
});

type Msg = { id: string; sender_id: string; content: string; created_at: string; read_at: string | null };

function DmPage() {
  const { userId: otherId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { startCall } = useDmCall();
  const onlineUsers = useOnlineUsers();
  const [me, setMe] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    getOrCreateDmThread(otherId)
      .then((id) => { if (!cancelled) setThreadId(id); })
      .catch((e) => toast.error(e.message));
    return () => { cancelled = true; };
  }, [otherId]);

  const { data: other } = useQuery({
    queryKey: ["dm-profile", otherId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles").select("id, username, display_name, avatar_url, last_seen_at")
        .eq("id", otherId).maybeSingle();
      return data;
    },
  });

  const { data: block, refetch: refetchBlock } = useQuery({
    queryKey: ["dm-block", otherId],
    queryFn: () => getBlockStatus(otherId),
  });

  const { data: thread } = useQuery({
    queryKey: ["dm-thread", threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data } = await supabase.from("dm_threads").select("*").eq("id", threadId!).maybeSingle();
      return data;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["dm-messages", threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data } = await supabase
        .from("direct_messages").select("id, sender_id, content, created_at, read_at")
        .eq("thread_id", threadId!).order("created_at", { ascending: true });
      return (data ?? []) as Msg[];
    },
  });

  // realtime
  useEffect(() => {
    if (!threadId) return;
    const ch = supabase
      .channel(`dm-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages", filter: `thread_id=eq.${threadId}` },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: ["dm-messages", threadId] });
          if (payload?.new?.sender_id && payload.new.sender_id !== me) {
            playPing();
          }
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_messages", filter: `thread_id=eq.${threadId}` },
        () => qc.invalidateQueries({ queryKey: ["dm-messages", threadId] }))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "direct_messages", filter: `thread_id=eq.${threadId}` },
        () => qc.invalidateQueries({ queryKey: ["dm-messages", threadId] }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_threads", filter: `id=eq.${threadId}` },
        () => qc.invalidateQueries({ queryKey: ["dm-thread", threadId] }))
      .subscribe();
    const blocksCh = supabase
      .channel(`dm-blocks-${otherId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_blocks" },
        () => refetchBlock())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      supabase.removeChannel(blocksCh);
    };
  }, [threadId, qc, me, otherId, refetchBlock]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Mark incoming messages as read while viewing
  useEffect(() => {
    if (!threadId || !me) return;
    (async () => {
      await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("thread_id", threadId)
        .neq("sender_id", me)
        .is("read_at", null);
      qc.invalidateQueries({ queryKey: ["dm-unread", me] });
      qc.invalidateQueries({ queryKey: ["dm-unread-by-sender", me] });
    })();
  }, [threadId, me, messages, qc]);

  const accepted = thread?.accepted ?? false;
  const isInitiator = thread?.initiator_id === me;
  const hasOne = (messages?.length ?? 0) >= 1;
  const isBlocked = !!(block?.blockedByMe || block?.blockedMe);
  const canSend = !!threadId && !!me && !isBlocked && (accepted || (isInitiator && !hasOne) || (!isInitiator));
  const lockedRecipient = !accepted && !isInitiator;
  const lockedInitiator = !accepted && isInitiator && hasOne;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || !threadId || !me) return;
    const { error } = await supabase.from("direct_messages").insert({
      thread_id: threadId, sender_id: me, content,
    });
    if (error) { toast.error(error.message); return; }
    setText("");
  };

  const acceptRequest = async () => {
    if (!threadId) return;
    const { error } = await supabase.from("dm_threads").update({ accepted: true }).eq("id", threadId);
    if (error) { toast.error(error.message); return; }
    toast.success("تم قبول المحادثة");
    qc.invalidateQueries({ queryKey: ["dm-thread", threadId] });
  };

  const rejectRequest = async () => {
    if (!threadId) return;
    await deleteDmThread(threadId);
    toast.success("تم رفض المحادثة");
    history.back();
  };

  const handleBlock = async () => {
    if (!confirm("هل تريد حظر هذا المستخدم؟ لن يتمكن من مراسلتك أو رؤية ملفك.")) return;
    try {
      await blockUser(otherId);
      toast.success("تم الحظر");
      refetchBlock();
      qc.invalidateQueries({ queryKey: ["my-blocks"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const handleUnblock = async () => {
    try {
      await unblockUserByOther(otherId);
      toast.success("تم إلغاء الحظر");
      refetchBlock();
      qc.invalidateQueries({ queryKey: ["my-blocks"] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const handleDelete = async () => {
    if (!threadId) return;
    if (!confirm("حذف هذه الدردشة بالكامل؟")) return;
    try {
      await deleteDmThread(threadId);
      toast.success("تم حذف الدردشة");
      qc.invalidateQueries({ queryKey: ["my-dm-threads"] });
      navigate({ to: "/app/friends" });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background" dir="rtl">
      <header className="h-14 border-b border-border bg-sidebar/60 flex items-center gap-3 px-4">
        <Link to="/app/friends" className="text-muted-foreground hover:text-foreground"><ArrowRight className="size-5" /></Link>
        <div className={"size-9 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground text-xs font-bold overflow-hidden " + (isAdminUsername(other?.username) ? "ring-2 ring-primary shadow-[0_0_12px_rgba(212,170,80,0.55)]" : "") }>
          {other?.avatar_url ? <img src={other.avatar_url} alt="" className="size-full object-cover" /> : (other?.display_name ?? "؟").slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate flex items-center gap-1.5">
            <span className={isAdminUsername(other?.username) ? "text-primary" : ""}>{other?.display_name || other?.username || "لاعب"}</span>
            <AdminBadge username={other?.username} size="xs" />
          </div>
          {accepted && !isAdminUsername(other?.username) && (
            <div className="flex items-center gap-1 text-[11px]">
              {onlineUsers.has(otherId) ? (
                <>
                  <span className="size-1.5 rounded-full bg-green-500 inline-block" />
                  <span className="text-green-500">متصل الآن</span>
                </>
              ) : (
                <span className="text-muted-foreground">{formatLastSeen((other as any)?.last_seen_at)}</span>
              )}
            </div>
          )}
          {!accepted && <div className="text-[11px] text-muted-foreground">طلب مراسلة</div>}
        </div>

        {!isBlocked && accepted && !isAdminUsername(other?.username) && (
          <>
            <button
              onClick={() => other && startCall({
                id: other.id,
                name: other.display_name || other.username || "صديق",
                username: other.username,
                avatar: other.avatar_url ?? null,
              }, "video")}
              className="size-9 rounded-md bg-primary/20 text-primary hover:bg-primary/30 flex items-center justify-center"
              title="مكالمة فيديو"
            >
              <Video className="size-4" />
            </button>
            <button
              onClick={() => other && startCall({
                id: other.id,
                name: other.display_name || other.username || "صديق",
                username: other.username,
                avatar: other.avatar_url ?? null,
              }, "audio")}
              className="size-9 rounded-md bg-green-600/20 text-green-500 hover:bg-green-600/30 flex items-center justify-center"
              title="اتصال صوتي"
            >
              <Phone className="size-4" />
            </button>
          </>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="size-9 rounded-md hover:bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground">
              <Settings className="size-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {block?.blockedByMe ? (
              <DropdownMenuItem onClick={handleUnblock}>
                <ShieldOff className="size-4 ml-2" /> إلغاء الحظر
              </DropdownMenuItem>
            ) : isAdminUsername(other?.username) ? null : (
              <DropdownMenuItem onClick={handleBlock} className="text-destructive focus:text-destructive">
                <Ban className="size-4 ml-2" /> حظر المستخدم
              </DropdownMenuItem>
            )}
            {!isAdminUsername(other?.username) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="size-4 ml-2" /> حذف الدردشة
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {thread && !accepted && !isInitiator && !isBlocked && (
        <div className="p-4 bg-primary/5 border-b border-border flex items-center gap-3">
          <Lock className="size-4 text-primary shrink-0" />
          <div className="flex-1 text-xs">
            هذا المستخدم أرسل لك طلب مراسلة. اقبل لاستكمال المحادثة.
          </div>
          <div className="flex gap-2">
            <button onClick={acceptRequest} className="px-3 py-1.5 rounded bg-primary/15 text-primary text-xs font-bold hover:bg-primary/25 flex items-center gap-1">
              <Check className="size-3" /> قبول
            </button>
            <button onClick={rejectRequest} className="px-3 py-1.5 rounded bg-destructive/15 text-destructive text-xs font-bold hover:bg-destructive/25 flex items-center gap-1">
              <X className="size-3" /> رفض
            </button>
          </div>
        </div>
      )}

      {isBlocked && (
        <div className="p-3 bg-destructive/10 border-b border-destructive/30 text-xs text-destructive flex items-center gap-2">
          <Ban className="size-4 shrink-0" />
          تم حظرك من قِبَل هذا المستخدم. لا يمكنك إرسال او استقبال الرسائل
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2">
        {messages?.length === 0 && (
          <div className="text-center text-muted-foreground text-sm mt-8">لا توجد رسائل بعد</div>
        )}
        {messages?.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-surface border border-border"}`}>
                <div>{m.content}</div>
                {mine && (
                  <div className="flex justify-end mt-0.5 opacity-80">
                    {m.read_at ? (
                      <CheckCheck className="size-3.5 text-sky-300" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="p-3 border-t border-border bg-sidebar/60 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            isBlocked ? "لا يمكن إرسال رسائل"
            : lockedRecipient ? "اقبل الطلب أولاً للرد..."
            : lockedInitiator ? "في انتظار قبول الطرف الآخر..."
            : "اكتب رسالة..."
          }
          disabled={!canSend || lockedRecipient || lockedInitiator}
          className="flex-1 rounded-md bg-input border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
        />
        <button type="submit" disabled={!canSend || !text.trim() || lockedRecipient || lockedInitiator}
          className="px-4 rounded-md bg-gradient-gold text-primary-foreground font-bold disabled:opacity-50">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
