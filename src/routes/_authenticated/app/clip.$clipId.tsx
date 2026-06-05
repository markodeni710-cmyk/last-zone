import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfilePopover } from "@/components/ProfilePopover";
import { AdminBadge } from "@/components/AdminBadge";
import { isAdminUsername } from "@/lib/admin-utils";

export const Route = createFileRoute("/_authenticated/app/clip/$clipId")({
  component: ClipPage,
});

function parseYouTube(url: string) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m?.[1] ?? null;
}

function ClipPage() {
  const { clipId } = useParams({ from: "/_authenticated/app/clip/$clipId" });
  const [playing, setPlaying] = useState(false);

  const { data: clip, isLoading } = useQuery({
    queryKey: ["clip", clipId],
    queryFn: async () => {
      const { data } = await supabase.from("clips").select("*").eq("id", clipId).maybeSingle();
      if (!data) return null;
      const { data: prof } = await supabase.from("profiles").select("id, username, display_name, avatar_url, rank").eq("id", data.user_id).maybeSingle();
      return { ...data, profile: prof };
    },
  });

  useEffect(() => { document.title = clip?.caption ? `${clip.caption.slice(0, 60)} · لقطة` : "لقطة"; }, [clip]);

  if (isLoading) return <div className="flex-1 flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;
  if (!clip) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-6">
      <p className="text-lg">اللقطة غير موجودة أو تم حذفها</p>
      <Link to="/app/feed" className="text-primary text-sm flex items-center gap-1"><ArrowRight className="size-4" /> العودة للقطات</Link>
    </div>
  );

  const ytId = parseYouTube(clip.video_url ?? "");
  const isFile = !ytId && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(clip.video_url ?? "");

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Link to="/app/feed" className="size-9 rounded-md hover:bg-surface-2 flex items-center justify-center"><ArrowRight className="size-5" /></Link>
        <h1 className="display text-lg">لقطة</h1>
      </div>

      <div className="max-w-md mx-auto py-6 px-4 space-y-4">
        <article className="rounded-2xl border border-border bg-surface/60 overflow-hidden">
          <header className="flex items-center gap-2 p-3">
            <ProfilePopover userId={clip.user_id}>
              <button className="flex items-center gap-2 hover:opacity-80">
                <div className={"size-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold overflow-hidden " + (isAdminUsername(clip.profile?.username) ? "ring-2 ring-primary shadow-[0_0_12px_rgba(212,170,80,0.55)]" : "")}>
                  {clip.profile?.avatar_url ? <img src={clip.profile.avatar_url} alt="" className="size-full object-cover" /> : (clip.profile?.display_name ?? "؟").slice(0, 1)}
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    <span className={isAdminUsername(clip.profile?.username) ? "text-primary" : ""}>{clip.profile?.display_name || clip.profile?.username || "لاعب"}</span>
                    <AdminBadge username={clip.profile?.username} size="xs" />
                  </div>
                  <div className="text-[10px] text-muted-foreground">{new Date(clip.created_at).toLocaleString("ar")}</div>
                </div>
              </button>
            </ProfilePopover>
          </header>

          <div className="relative bg-black aspect-video">
            {playing && ytId ? (
              <iframe src={`https://www.youtube.com/embed/${ytId}?autoplay=1`} className="size-full" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
            ) : isFile ? (
              <video src={clip.video_url ?? undefined} poster={clip.thumbnail_url ?? undefined} controls autoPlay playsInline className="size-full object-contain" />
            ) : (
              <button onClick={() => setPlaying(true)} className="block size-full relative group">
                {clip.thumbnail_url ? <img src={clip.thumbnail_url} alt="" className="size-full object-cover" /> : <div className="size-full bg-gradient-to-br from-primary/40 to-background" />}
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 flex items-center justify-center">
                  <div className="size-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                    <Play className="size-7 text-black ms-1" fill="currentColor" />
                  </div>
                </div>
              </button>
            )}
          </div>

          {clip.caption && <div className="p-3 text-sm">{clip.caption}</div>}
          {Array.isArray(clip.tags) && clip.tags.length > 0 && (
            <div className="px-3 pb-3 flex flex-wrap gap-1.5">
              {clip.tags.map((t: string) => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">#{t}</span>
              ))}
            </div>
          )}
        </article>

        <Link to="/app/feed" className="block text-center text-xs text-muted-foreground hover:text-foreground">شاهد المزيد من اللقطات →</Link>
      </div>
    </div>
  );
}
