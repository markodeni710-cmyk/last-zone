import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Heart, Plus, Play, MessageCircle, Share2, X, Send, Trash2, Upload, Link2, Image as ImageIcon, Sparkles, Check, MoreVertical, Ban, Settings, Film, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProfilePopover } from "@/components/ProfilePopover";
import { AdminBadge } from "@/components/AdminBadge";
import { isAdminUsername } from "@/lib/admin-utils";

export const Route = createFileRoute("/_authenticated/app/feed")({
  component: FeedPage,
});

const SUGGESTED_TAGS = ["Clip", "1v4", "Sniper", "Funny", "Tip", "Scrim", "Highlight", "Clutch", "WTF"];
const MAX_TAGS = 4;
const INLINE_COMMENTS_LIMIT = 7;

// ---------- video URL helpers ----------
function parseYouTube(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m?.[1] ?? null;
}
function parseTikTok(url: string): string | null {
  const m = url.match(/tiktok\.com\/(?:@[^/]+\/video\/|v\/|embed\/v2\/)(\d{6,})/);
  return m?.[1] ?? null;
}

function FeedPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<any | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [myClipsOpen, setMyClipsOpen] = useState(false);
  const [editClip, setEditClip] = useState<any | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMe(data.session?.user?.id ?? null)).catch(() => setMe(null));
  }, []);

  // Realtime: any new/deleted clip + any like change refreshes the feed for everyone instantly
  useEffect(() => {
    const ch = supabase
      .channel("clips-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "clips" }, () => {
        qc.invalidateQueries({ queryKey: ["clips"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "clip_likes" }, () => {
        qc.invalidateQueries({ queryKey: ["clips"] });
        qc.invalidateQueries({ queryKey: ["my-clip-likes"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { data: clips } = useQuery({
    queryKey: ["clips"],
    queryFn: async () => {
      const { data: raw } = await supabase.from("clips").select("*").order("created_at", { ascending: false }).limit(40);
      const list = raw ?? [];
      if (list.length === 0) return list;
      const ids = Array.from(new Set(list.map((c: any) => c.user_id)));
      const { data: profs } = await supabase.from("profiles").select("id, username, display_name, avatar_url, rank").in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((c: any) => ({ ...c, profile: map.get(c.user_id) ?? null }));
    },
  });

  const { data: myLikes } = useQuery({
    queryKey: ["my-clip-likes", me],
    enabled: !!me,
    queryFn: async () => {
      const { data } = await supabase.from("clip_likes").select("clip_id").eq("user_id", me!);
      return new Set((data ?? []).map((r) => r.clip_id));
    },
  });

  const toggleLike = async (clipId: string, liked: boolean) => {
    if (!me) return;
    if (liked) await supabase.from("clip_likes").delete().eq("clip_id", clipId).eq("user_id", me);
    else await supabase.from("clip_likes").insert({ clip_id: clipId, user_id: me });
    qc.invalidateQueries({ queryKey: ["clips"] });
    qc.invalidateQueries({ queryKey: ["my-clip-likes", me] });
  };

  const deleteClip = async (clip: any) => {
    if (!confirm("حذف هذا المقطع؟")) return;
    const { error } = await supabase.from("clips").delete().eq("id", clip.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["clips"] });
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="display text-3xl flex items-center gap-2"><Sparkles className="size-6 text-primary" /> اللقطات</h1>
          <p className="text-xs text-muted-foreground">أفضل اللقطات والكليبات من المجتمع</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-md bg-gradient-gold px-4 py-2 text-sm font-bold text-primary-foreground">
            <Plus className="size-4" /> انشر لقطة
          </button>
          <div className="relative">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="size-9 rounded-md bg-surface border border-border hover:bg-surface-2 text-muted-foreground hover:text-foreground flex items-center justify-center transition"
              title="إعدادات"
            >
              <Settings className="size-4" />
            </button>
            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSettingsOpen(false)} />
                <div className="absolute left-0 top-11 z-20 min-w-[180px] rounded-md border border-border bg-surface shadow-lg py-1 text-sm">
                  <button
                    onClick={() => { setSettingsOpen(false); setMyClipsOpen(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2 text-right"
                  >
                    <Film className="size-4" /> مقاطعي
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto py-6 px-4 space-y-5">
        {clips?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-12 text-center">
            <Play className="size-12 text-primary mx-auto mb-3" />
            <p className="text-muted-foreground">ما في لقطات بعد. كن أول من ينشر لقطة جلد 🔥</p>
          </div>
        )}
        {clips?.map((c: any) => {
          const liked = myLikes?.has(c.id) ?? false;
          return (
            <ClipCard
              key={c.id}
              clip={c}
              liked={liked}
              me={me}
              isOpen={openComments === c.id}
              onLike={() => toggleLike(c.id, liked)}
              onToggleComments={() => setOpenComments(openComments === c.id ? null : c.id)}
              onShare={() => setShareFor(c)}
              onDelete={() => deleteClip(c)}
            />
          );
        })}
      </div>

      {shareFor && <ShareSheet clip={shareFor} onClose={() => setShareFor(null)} />}
      {open && <NewClipDialog me={me} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["clips"] }); }} />}
      {myClipsOpen && me && (
        <MyClipsDialog
          me={me}
          onClose={() => setMyClipsOpen(false)}
          onEdit={(c) => { setMyClipsOpen(false); setEditClip(c); }}
        />
      )}
      {editClip && (
        <EditClipDialog
          clip={editClip}
          onClose={() => setEditClip(null)}
          onSaved={() => { setEditClip(null); qc.invalidateQueries({ queryKey: ["clips"] }); qc.invalidateQueries({ queryKey: ["my-clips"] }); }}
        />
      )}
    </div>
  );
}

// ---------------- Clip Card ----------------
type ClipCardProps = {
  clip: any; liked: boolean; me: string | null; isOpen: boolean;
  onLike: () => void; onToggleComments: () => void; onShare: () => void; onDelete: () => void;
};
function ClipCard(props: ClipCardProps) {
  const { clip, liked, me, isOpen, onLike, onToggleComments, onShare, onDelete } = props;
  const isOwner = me && clip.user_id === me;
  const ytId = parseYouTube(clip.video_url ?? "");
  const ttId = parseTikTok(clip.video_url ?? "");
  const isFile = !ytId && !ttId && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(clip.video_url ?? "");
  const [playing, setPlaying] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);

  const { data: commentsCount } = useQuery({
    queryKey: ["clip-comments-count", clip.id],
    queryFn: async () => {
      const { count } = await supabase.from("clip_comments").select("id", { count: "exact", head: true }).eq("clip_id", clip.id);
      return count ?? 0;
    },
  });

  const tags: string[] = Array.isArray(clip.tags) && clip.tags.length > 0
    ? clip.tags
    : (clip.tag ? [clip.tag] : []);

  return (
    <article className="rounded-2xl border border-border bg-surface/60 backdrop-blur overflow-hidden">
      <header className="flex items-center justify-between p-3">
        <ProfilePopover userId={clip.user_id}>
          <button className="flex items-center gap-2 text-right hover:opacity-80 transition">
            <div className={"size-9 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold text-xs overflow-hidden " + (isAdminUsername(clip.profile?.username) ? "ring-2 ring-primary shadow-[0_0_10px_rgba(212,170,80,0.5)]" : "")}>
              {clip.profile?.avatar_url ? <img src={clip.profile.avatar_url} alt="" className="size-full object-cover" /> : (clip.profile?.display_name ?? clip.profile?.username ?? "؟").slice(0, 1)}
            </div>
            <div>
              <div className="text-sm font-bold leading-tight flex items-center gap-1.5">
                <span className={isAdminUsername(clip.profile?.username) ? "text-primary" : ""}>{clip.profile?.display_name || clip.profile?.username || "لاعب"}</span>
                <AdminBadge username={clip.profile?.username} size="xs" />
              </div>
              <div className="text-[10px] text-muted-foreground">{clip.profile?.rank ?? "بدون رانك"} · {new Date(clip.created_at).toLocaleDateString("ar")}</div>
            </div>
          </button>
        </ProfilePopover>
        <div className="flex items-center gap-2">
          {isOwner && (
            <button onClick={onDelete} className="size-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center transition" title="حذف">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </header>

      <div className="relative bg-black aspect-video max-h-[420px]">
        {playing && ytId ? (
          <iframe src={`https://www.youtube.com/embed/${ytId}?autoplay=1`} className="size-full" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
        ) : playing && ttId ? (
          <iframe src={`https://www.tiktok.com/embed/v2/${ttId}`} className="size-full" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
        ) : isFile ? (
          <video src={clip.video_url} poster={clip.thumbnail_url ?? undefined} controls playsInline loop preload="metadata" className="size-full object-contain" />
        ) : (
          <button onClick={() => setPlaying(true)} className="block size-full relative group">
            {clip.thumbnail_url ? <img src={clip.thumbnail_url} alt="" className="size-full object-cover" /> : <div className="size-full bg-gradient-to-br from-primary/40 to-background" />}
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition flex items-center justify-center">
              <div className="size-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <Play className="size-7 text-black ms-1" fill="currentColor" />
              </div>
            </div>
            {ttId && <span className="absolute bottom-2 left-2 text-[10px] bg-black/70 text-white px-2 py-1 rounded">TikTok</span>}
            {ytId && <span className="absolute bottom-2 left-2 text-[10px] bg-red-600 text-white px-2 py-1 rounded">YouTube</span>}
          </button>
        )}
      </div>

      <footer className="p-3">
        {clip.caption && <p className="text-sm mb-2">{clip.caption}</p>}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">#{t}</span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-5 text-muted-foreground text-sm">
          <button onClick={onLike} className={`flex items-center gap-1.5 hover:text-primary transition ${liked ? "text-primary" : ""}`}>
            <Heart className={`size-5 ${liked ? "fill-current" : ""}`} /> {clip.likes_count}
          </button>
          <button onClick={onToggleComments} className={`flex items-center gap-1.5 hover:text-foreground ${isOpen ? "text-foreground" : ""}`}>
            <MessageCircle className="size-5" /> {commentsCount ?? 0}
          </button>
          <button onClick={onShare} className="flex items-center gap-1.5 hover:text-foreground mr-auto">
            <Share2 className="size-5" />
          </button>
        </div>

        <div className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            {isOpen && <InlineComments clipId={clip.id} clipOwnerId={clip.user_id} me={me} limit={INLINE_COMMENTS_LIMIT} onShowAll={() => setShowAllModal(true)} />}
          </div>
        </div>
      </footer>

      {showAllModal && (
        <div
          className="fixed inset-x-0 top-[64px] bottom-[72px] md:bottom-0 z-30 bg-background/40 backdrop-blur-md flex items-center justify-center p-3 md:p-4"
          onClick={() => setShowAllModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[70vh] md:max-h-[60vh] bg-surface border border-border rounded-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150 shadow-2xl"
          >
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="display text-lg">جميع التعليقات ({commentsCount ?? 0})</h3>
              <button onClick={() => setShowAllModal(false)} className="size-8 rounded-md hover:bg-surface-2 flex items-center justify-center"><X className="size-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <InlineComments clipId={clip.id} clipOwnerId={clip.user_id} me={me} hideInput />
            </div>
            <div className="shrink-0 p-4 border-t border-border bg-surface">
              <CommentInput clipId={clip.id} me={me} />
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------- Inline Comments ----------------
function InlineComments({ clipId, clipOwnerId, me, limit, onShowAll, hideInput }: { clipId: string; clipOwnerId: string; me: string | null; limit?: number; onShowAll?: () => void; hideInput?: boolean }) {
  const qc = useQueryClient();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; at: number }>>({});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const instanceIdRef = useRef<string>(Math.random().toString(36).slice(2, 10));
  const isOwner = !!me && me === clipOwnerId;

  // Realtime: new/deleted comments (unique channel per instance to allow multiple mounts)
  useEffect(() => {
    const ch = supabase
      .channel(`clip-comments:${clipId}:${instanceIdRef.current}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "clip_comments", filter: `clip_id=eq.${clipId}` }, () => {
        qc.invalidateQueries({ queryKey: ["clip-comments", clipId] });
        qc.invalidateQueries({ queryKey: ["clip-comments-count", clipId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  // Typing broadcasts — SHARED channel name so users see each other
  useEffect(() => {
    const ch = supabase
      .channel(`clip-typing:${clipId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { userId, name, stop } = payload as { userId: string; name: string; stop?: boolean };
        if (!userId || userId === me) return;
        setTypingUsers((prev) => {
          const next = { ...prev };
          if (stop) delete next[userId];
          else next[userId] = { name, at: Date.now() };
          return next;
        });
      })
      .subscribe();
    typingChannelRef.current = ch;

    const sweep = window.setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next: typeof prev = {};
        let changed = false;
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.at < 4000) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      supabase.removeChannel(ch);
      typingChannelRef.current = null;
      window.clearInterval(sweep);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, me]);

  const { data: comments } = useQuery({
    queryKey: ["clip-comments", clipId],
    queryFn: async () => {
      const { data: raw } = await supabase.from("clip_comments").select("*").eq("clip_id", clipId).order("created_at", { ascending: true });
      const list = raw ?? [];
      if (list.length === 0) return list;
      const ids = Array.from(new Set(list.map((c: any) => c.user_id)));
      const { data: profs } = await supabase.from("profiles").select("id, display_name, username, avatar_url").in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return list.map((c: any) => ({ ...c, profile: map.get(c.user_id) ?? null }));
    },
  });

  const deleteComment = async (commentId: string) => {
    setMenuFor(null);
    const { error } = await supabase.from("clip_comments").delete().eq("id", commentId);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف التعليق");
    qc.invalidateQueries({ queryKey: ["clip-comments", clipId] });
    qc.invalidateQueries({ queryKey: ["clip-comments-count", clipId] });
  };

  const banUser = async (userId: string) => {
    setMenuFor(null);
    if (!me) return;
    if (!confirm("منع هذا الشخص من التعليق على هذه اللقطة؟")) return;
    const { error } = await supabase.from("clip_comment_bans").insert({ clip_id: clipId, user_id: userId, banned_by: me });
    if (error) { toast.error(error.message); return; }
    await supabase.from("clip_comments").delete().eq("clip_id", clipId).eq("user_id", userId);
    toast.success("تم منع هذا الشخص من التعليق هنا");
    qc.invalidateQueries({ queryKey: ["clip-comments", clipId] });
    qc.invalidateQueries({ queryKey: ["clip-comments-count", clipId] });
  };

  const typingList = Object.values(typingUsers);
  const allComments = comments ?? [];
  const hasMore = typeof limit === "number" && allComments.length > limit;
  const visibleComments = hasMore ? allComments.slice(-limit!) : allComments;

  return (
    <div className="border-t border-border pt-3 space-y-2.5">
      {allComments.length === 0 && typingList.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">كن أول من يعلّق</p>}
      {hasMore && onShowAll && (
        <button type="button" onClick={onShowAll} className="w-full text-center text-xs text-primary hover:underline py-1">
          عرض المزيد ({allComments.length - limit!} تعليق سابق)
        </button>
      )}
      {visibleComments.map((c: any) => {
        const canDelete = !!me && (c.user_id === me || isOwner);
        const canBan = isOwner && c.user_id !== me;
        const showMenu = menuFor === c.id;
        return (
          <div key={c.id} className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
            <ProfilePopover userId={c.user_id}>
              <button className={"size-7 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold text-[10px] overflow-hidden shrink-0 " + (isAdminUsername(c.profile?.username) ? "ring-2 ring-primary shadow-[0_0_8px_rgba(212,170,80,0.5)]" : "")}>
                {c.profile?.avatar_url ? <img src={c.profile.avatar_url} alt="" className="size-full object-cover" /> : (c.profile?.display_name ?? c.profile?.username ?? "؟").slice(0, 1)}
              </button>
            </ProfilePopover>
            <div className="flex-1 min-w-0">
              <div className={"rounded-2xl px-3 py-2 " + (isAdminUsername(c.profile?.username) ? "bg-primary/5 border border-primary/30" : "bg-surface-2")}>
                <div className="text-[11px] font-bold mb-0.5 text-foreground/80 flex items-center gap-1.5">
                  <span className={isAdminUsername(c.profile?.username) ? "text-primary" : ""}>{c.profile?.display_name || c.profile?.username || "لاعب"}</span>
                  <AdminBadge username={c.profile?.username} size="xs" />
                </div>
                <p className="text-sm break-words">{c.content}</p>
              </div>
            </div>
            {(canDelete || canBan) && (
              <div className="relative shrink-0">
                <button onClick={() => setMenuFor(showMenu ? null : c.id)} className="size-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-muted-foreground" title="خيارات">
                  <MoreVertical className="size-4" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                    <div className="absolute left-0 top-8 z-20 min-w-[160px] rounded-md border border-border bg-surface shadow-lg py-1 text-sm">
                      {canDelete && (
                        <button onClick={() => deleteComment(c.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2 text-destructive">
                          <Trash2 className="size-4" /> حذف التعليق
                        </button>
                      )}
                      {canBan && (
                        <button onClick={() => banUser(c.user_id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-2 text-destructive">
                          <Ban className="size-4" /> إساءة - منع من التعليق
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {typingList.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground animate-in fade-in duration-200 px-1">
          <span className="flex gap-0.5">
            <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "120ms" }} />
            <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "240ms" }} />
          </span>
          <span>
            {typingList.length === 1
              ? `${typingList[0].name} يكتب...`
              : `${typingList.length} أشخاص يكتبون...`}
          </span>
        </div>
      )}

      {!hideInput && <CommentInput clipId={clipId} me={me} />}
    </div>
  );
}

function CommentInput({ clipId, me }: { clipId: string; me: string | null }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const typingSentAtRef = useRef<number>(0);
  const typingStopTimerRef = useRef<number | null>(null);
  const myNameRef = useRef<string>("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!me) return;
    supabase.from("profiles").select("display_name, username").eq("id", me).maybeSingle()
      .then(({ data }) => { myNameRef.current = data?.display_name || data?.username || "لاعب"; });
  }, [me]);

  useEffect(() => {
    const ch = supabase.channel(`clip-typing:${clipId}`);
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [clipId]);

  const sendTyping = (stop = false) => {
    const ch = channelRef.current;
    if (!ch || !me) return;
    const now = Date.now();
    if (!stop && now - typingSentAtRef.current < 1500) return;
    typingSentAtRef.current = now;
    ch.send({ type: "broadcast", event: "typing", payload: { userId: me, name: myNameRef.current || "لاعب", stop } });
  };

  const scheduleTypingStop = () => {
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = window.setTimeout(() => sendTyping(true), 2500);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me || !text.trim()) return;
    const content = text.trim();
    setText("");
    sendTyping(true);
    const { error } = await supabase.from("clip_comments").insert({ clip_id: clipId, user_id: me, content });
    if (error) {
      if (/policy/i.test(error.message)) toast.error("لا يمكنك التعليق على هذه اللقطة");
      else toast.error(error.message);
      setText(content);
      return;
    }
    qc.invalidateQueries({ queryKey: ["clip-comments", clipId] });
    qc.invalidateQueries({ queryKey: ["clip-comments-count", clipId] });
  };

  if (!me) return null;

  return (
    <form onSubmit={send} className="flex items-center gap-2 pt-1">
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.trim()) { sendTyping(false); scheduleTypingStop(); }
          else sendTyping(true);
        }}
        onBlur={() => sendTyping(true)}
        placeholder="أضف تعليق..."
        className="flex-1 rounded-full bg-surface-2 border border-border px-4 py-2 text-sm focus:outline-none focus:border-primary transition"
      />
      <button type="submit" disabled={!text.trim()} className="size-9 rounded-full bg-gradient-gold text-primary-foreground flex items-center justify-center disabled:opacity-40 transition">
        <Send className="size-4" />
      </button>
    </form>
  );
}

// ---------------- Share Sheet (Internal Site Link) ----------------
function ShareSheet({ clip, onClose }: { clip: any; onClose: () => void }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/clip/${clip.id}` : `/clip/${clip.id}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ الرابط");
      onClose();
    } catch {
      toast.error("فشل النسخ");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-surface border border-border rounded-2xl p-5 animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="display text-xl">مشاركة اللقطة</h3>
          <button onClick={onClose} className="size-8 rounded-md hover:bg-surface-2 flex items-center justify-center"><X className="size-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">انسخ الرابط وشاركه أينما تريد</p>
        <div className="flex gap-2">
          <input readOnly value={url} className="flex-1 rounded-md bg-input border border-border px-3 py-2 text-xs text-muted-foreground truncate" />
          <button onClick={copy} className="px-4 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold flex items-center gap-1.5">
            <Share2 className="size-4" /> نسخ الرابط
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- New Clip Dialog ----------------
function NewClipDialog({ me, onClose, onCreated }: { me: string | null; onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<"upload" | "youtube">("upload");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string>("");
  const [thumbBlob, setThumbBlob] = useState<Blob | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); if (thumbUrl) URL.revokeObjectURL(thumbUrl); }, [localUrl, thumbUrl]);

  const toggleTag = (t: string) => {
    setTags((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= MAX_TAGS) { toast.error(`الحد الأقصى ${MAX_TAGS} هاشتاقات`); return prev; }
      return [...prev, t];
    });
  };

  const addCustom = () => {
    const t = customTag.trim().replace(/^#/, "").replace(/\s/g, "");
    if (!t) return;
    if (tags.includes(t)) { setCustomTag(""); return; }
    if (tags.length >= MAX_TAGS) { toast.error(`الحد الأقصى ${MAX_TAGS} هاشتاقات`); return; }
    setTags([...tags, t.slice(0, 24)]);
    setCustomTag("");
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) { toast.error("الحد الأقصى 60 ميجا"); return; }
    setFile(f);
    if (localUrl) URL.revokeObjectURL(localUrl);
    setLocalUrl(URL.createObjectURL(f));
    setThumbBlob(null);
    if (thumbUrl) { URL.revokeObjectURL(thumbUrl); setThumbUrl(""); }
  };

  const captureFrame = () => {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 360;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (!b) return;
      setThumbBlob(b);
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      setThumbUrl(URL.createObjectURL(b));
      toast.success("تم اختيار اللقطة الافتتاحية");
    }, "image/jpeg", 0.85);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me || busy) return;
    setBusy(true);
    try {
      let videoUrl = "";
      let thumbnailUrl: string | null = null;

      if (mode === "upload") {
        if (!file) { toast.error("اختر فيديو"); setBusy(false); return; }
        const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
        const path = `${me}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("clips").upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw up.error;
        videoUrl = supabase.storage.from("clips").getPublicUrl(path).data.publicUrl;
        if (thumbBlob) {
          const tp = `${me}/${crypto.randomUUID()}.jpg`;
          const upt = await supabase.storage.from("clips").upload(tp, thumbBlob, { contentType: "image/jpeg" });
          if (!upt.error) thumbnailUrl = supabase.storage.from("clips").getPublicUrl(tp).data.publicUrl;
        }
      } else {
        const id = parseYouTube(link);
        if (!id) { toast.error("رابط يوتيوب غير صحيح"); setBusy(false); return; }
        videoUrl = link.trim();
        thumbnailUrl = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      }


      const { error } = await supabase.from("clips").insert({
        user_id: me,
        caption: caption.trim() || null,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        tag: tags[0] ?? null,
        tags: tags.length ? tags : null,
      });
      if (error) throw error;
      toast.success("تم النشر! 🔥");
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-lg my-6 rounded-2xl bg-surface border border-border p-5 shadow-elegant">
        <div className="flex items-center justify-between mb-4">
          <h3 className="display text-2xl">انشر لقطة جديدة</h3>
          <button type="button" onClick={onClose} className="size-8 rounded-md hover:bg-surface-2 flex items-center justify-center"><X className="size-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-surface-2 rounded-lg mb-4">
          {([
            { k: "upload", label: "رفع فيديو", icon: Upload },
            { k: "youtube", label: "يوتيوب", icon: Link2 },
          ] as const).map((t) => (
            <button key={t.k} type="button" onClick={() => setMode(t.k)}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition ${mode === t.k ? "bg-background text-foreground shadow" : "text-muted-foreground"}`}>
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>


        {mode === "upload" ? (
          <div className="space-y-3">
            <label className="block">
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition cursor-pointer">
                <Upload className="size-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm">{file ? file.name : "اختر فيديو من جهازك"}</p>
                <p className="text-[11px] text-muted-foreground mt-1">MP4 / MOV / WEBM · أقل من 60 ميجا</p>
              </div>
              <input type="file" accept="video/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>

            {localUrl && (
              <div className="space-y-2">
                <video ref={videoRef} src={localUrl} controls playsInline className="w-full rounded-lg bg-black max-h-64" />
                <canvas ref={canvasRef} className="hidden" />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={captureFrame} className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-surface-2 border border-border py-2 text-xs hover:bg-surface transition">
                    <ImageIcon className="size-4" /> التقط هذه اللحظة كصورة افتتاحية
                  </button>
                  {thumbUrl && <img src={thumbUrl} alt="" className="size-10 rounded object-cover border border-primary" />}
                  {thumbUrl && <Check className="size-4 text-primary" />}
                </div>
                <p className="text-[11px] text-muted-foreground">شغّل الفيديو وأوقفه عند اللحظة المطلوبة ثم اضغط الزر</p>
              </div>
            )}
          </div>
        ) : (
          <input required type="url" placeholder="https://youtube.com/watch?v=..." value={link} onChange={(e) => setLink(e.target.value)} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm" />
        )}

        <textarea placeholder="اكتب وصف للقطة (اختياري)..." rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} className="w-full mt-3 rounded-md bg-input border border-border px-3 py-2 text-sm resize-none" />

        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-foreground/80">الهاشتاقات</span>
            <span className="text-[11px] text-muted-foreground">{tags.length}/{MAX_TAGS}</span>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <button type="button" key={t} onClick={() => toggleTag(t)} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-primary text-primary-foreground">
                  #{t} <X className="size-3" />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-muted-foreground text-sm">#</span>
            <input value={customTag} onChange={(e) => setCustomTag(e.target.value.replace(/\s/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} placeholder="اكتب هاشتاق خاص" maxLength={24} className="flex-1 rounded-md bg-input border border-border px-3 py-1.5 text-sm" />
            <button type="button" onClick={addCustom} className="px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs">إضافة</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_TAGS.map((t) => {
              const active = tags.includes(t);
              return (
                <button type="button" key={t} onClick={() => toggleTag(t)} className={`px-2.5 py-0.5 rounded-full text-[11px] border transition ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  #{t}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">إلغاء</button>
          <button type="submit" disabled={busy} className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold disabled:opacity-50">
            {busy ? "جاري النشر..." : "نشر"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------- My Clips Dialog ----------------
function MyClipsDialog({ me, onClose, onEdit }: { me: string; onClose: () => void; onEdit: (clip: any) => void }) {
  const qc = useQueryClient();
  const { data: clips, isLoading } = useQuery({
    queryKey: ["my-clips", me],
    queryFn: async () => {
      const { data } = await supabase.from("clips").select("*").eq("user_id", me).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const remove = async (id: string) => {
    if (!confirm("حذف هذا المقطع نهائياً؟")) return;
    const { error } = await supabase.from("clips").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["my-clips", me] });
    qc.invalidateQueries({ queryKey: ["clips"] });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[85vh] bg-surface border border-border rounded-2xl flex flex-col shadow-elegant">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h3 className="display text-2xl flex items-center gap-2"><Film className="size-5 text-primary" /> مقاطعي</h3>
          <button onClick={onClose} className="size-8 rounded-md hover:bg-surface-2 flex items-center justify-center"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && <p className="text-center text-sm text-muted-foreground py-8">جاري التحميل...</p>}
          {!isLoading && clips?.length === 0 && (
            <div className="text-center py-12">
              <Film className="size-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">ما عندك مقاطع بعد</p>
            </div>
          )}
          {clips?.map((c: any) => {
            const tags: string[] = Array.isArray(c.tags) && c.tags.length ? c.tags : (c.tag ? [c.tag] : []);
            return (
              <div key={c.id} className="flex gap-3 p-3 rounded-xl bg-surface-2/60 border border-border">
                <div className="w-24 h-16 rounded-lg bg-black overflow-hidden shrink-0">
                  {c.thumbnail_url ? <img src={c.thumbnail_url} alt="" className="size-full object-cover" /> : <div className="size-full bg-gradient-to-br from-primary/40 to-background" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{c.caption || <span className="text-muted-foreground italic">بدون وصف</span>}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tags.slice(0, 3).map((t) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">#{t}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(c.created_at).toLocaleDateString("ar")} · ❤ {c.likes_count}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => onEdit(c)} className="size-8 rounded-md bg-surface hover:bg-primary/10 text-muted-foreground hover:text-primary flex items-center justify-center transition" title="تعديل">
                    <Pencil className="size-4" />
                  </button>
                  <button onClick={() => remove(c.id)} className="size-8 rounded-md bg-surface hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center transition" title="حذف">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------- Edit Clip Dialog ----------------
function EditClipDialog({ clip, onClose, onSaved }: { clip: any; onClose: () => void; onSaved: () => void }) {
  const [caption, setCaption] = useState<string>(clip.caption ?? "");
  const [tags, setTags] = useState<string[]>(Array.isArray(clip.tags) && clip.tags.length ? clip.tags : (clip.tag ? [clip.tag] : []));
  const [customTag, setCustomTag] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleTag = (t: string) => {
    setTags((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= MAX_TAGS) { toast.error(`الحد الأقصى ${MAX_TAGS} هاشتاقات`); return prev; }
      return [...prev, t];
    });
  };

  const addCustom = () => {
    const t = customTag.trim().replace(/^#/, "").replace(/\s/g, "");
    if (!t) return;
    if (tags.includes(t)) { setCustomTag(""); return; }
    if (tags.length >= MAX_TAGS) { toast.error(`الحد الأقصى ${MAX_TAGS} هاشتاقات`); return; }
    setTags([...tags, t.slice(0, 24)]);
    setCustomTag("");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("clips").update({
      caption: caption.trim() || null,
      tag: tags[0] ?? null,
      tags: tags.length ? tags : null,
    }).eq("id", clip.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحفظ");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-lg my-6 rounded-2xl bg-surface border border-border p-5 shadow-elegant">
        <div className="flex items-center justify-between mb-4">
          <h3 className="display text-2xl flex items-center gap-2"><Pencil className="size-5 text-primary" /> تعديل اللقطة</h3>
          <button type="button" onClick={onClose} className="size-8 rounded-md hover:bg-surface-2 flex items-center justify-center"><X className="size-4" /></button>
        </div>

        {clip.thumbnail_url && <img src={clip.thumbnail_url} alt="" className="w-full max-h-48 object-cover rounded-lg mb-3" />}

        <textarea placeholder="وصف اللقطة..." rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm resize-none" />

        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-foreground/80">الهاشتاقات</span>
            <span className="text-[11px] text-muted-foreground">{tags.length}/{MAX_TAGS}</span>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => (
                <button type="button" key={t} onClick={() => toggleTag(t)} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] bg-primary text-primary-foreground">
                  #{t} <X className="size-3" />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-muted-foreground text-sm">#</span>
            <input value={customTag} onChange={(e) => setCustomTag(e.target.value.replace(/\s/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} placeholder="اكتب هاشتاق خاص" maxLength={24} className="flex-1 rounded-md bg-input border border-border px-3 py-1.5 text-sm" />
            <button type="button" onClick={addCustom} className="px-3 py-1.5 rounded-md bg-surface-2 border border-border text-xs">إضافة</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_TAGS.map((t) => {
              const active = tags.includes(t);
              return (
                <button type="button" key={t} onClick={() => toggleTag(t)} className={`px-2.5 py-0.5 rounded-full text-[11px] border transition ${active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  #{t}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">إلغاء</button>
          <button type="submit" disabled={busy} className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground text-sm font-bold disabled:opacity-50">
            {busy ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </form>
    </div>
  );
}
