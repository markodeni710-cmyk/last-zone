import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowRight, Play, LogIn, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/clip/$clipId")({
  loader: async ({ params }) => {
    const { data: clip } = await supabase
      .from("clips")
      .select("id, user_id, caption, video_url, thumbnail_url, tags, created_at, likes_count")
      .eq("id", params.clipId)
      .maybeSingle();
    if (!clip) return { clip: null, profile: null };
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", clip.user_id)
      .maybeSingle();
    return { clip, profile };
  },
  head: ({ loaderData }) => {
    const clip = loaderData?.clip;
    const profile = loaderData?.profile;
    if (!clip) {
      return { meta: [{ title: "لقطة غير موجودة — LAST ZØNE" }] };
    }
    const author = profile?.display_name || profile?.username || "لاعب";
    const title = clip.caption ? `${clip.caption.slice(0, 80)} — ${author}` : `لقطة من ${author} — LAST ZØNE`;
    const desc = clip.caption || `شاهد لقطة ${author} على LAST ZØNE — مجتمع لاعبي ببجي`;
    const img = clip.thumbnail_url || undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "video.other" },
        ...(img ? [{ property: "og:image", content: img }, { name: "twitter:image", content: img }] : []),
        { name: "twitter:card", content: img ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
    };
  },
  component: PublicClipPage,
});

function parseYouTube(url: string) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m?.[1] ?? null;
}

function PublicClipPage() {
  const { clipId } = useParams({ from: "/clip/$clipId" });
  const initial = Route.useLoaderData();
  const [playing, setPlaying] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => { if (alive) setAuthed(!!data.user); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s?.user));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const { data } = useQuery({
    queryKey: ["public-clip", clipId],
    queryFn: async () => initial,
    initialData: initial,
  });

  const clip = data?.clip;
  const profile = data?.profile;

  if (!clip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center p-6 bg-background">
        <h1 className="display text-3xl text-gradient-gold">LAST ZØNE</h1>
        <p className="text-lg">اللقطة غير موجودة أو تم حذفها</p>
        <Link to="/" className="text-primary text-sm flex items-center gap-1"><ArrowRight className="size-4" /> الرئيسية</Link>
      </div>
    );
  }

  const ytId = parseYouTube(clip.video_url ?? "");
  const isFile = !ytId && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(clip.video_url ?? "");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <Link to="/" className="display text-xl text-gradient-gold">LAST ZØNE</Link>
        {authed === false && (
          <div className="flex items-center gap-2">
            <Link to="/login" className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-surface-2 flex items-center gap-1"><LogIn className="size-3.5" /> دخول</Link>
            <Link to="/login" className="text-xs px-3 py-1.5 rounded-md bg-gradient-gold text-primary-foreground font-bold flex items-center gap-1"><UserPlus className="size-3.5" /> انضم</Link>
          </div>
        )}
        {authed && (
          <Link to="/app/feed" className="text-xs px-3 py-1.5 rounded-md bg-gradient-gold text-primary-foreground font-bold">فتح التطبيق</Link>
        )}
      </header>

      <main className="max-w-md mx-auto py-6 px-4 space-y-4">
        <article className="rounded-2xl border border-border bg-surface/60 overflow-hidden">
          <div className="flex items-center gap-2 p-3">
            <div className="size-10 rounded-full bg-gradient-gold flex items-center justify-center text-primary-foreground font-bold overflow-hidden">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="size-full object-cover" /> : (profile?.display_name ?? "؟").slice(0, 1)}
            </div>
            <div className="text-right">
              <div className="text-sm font-bold">{profile?.display_name || profile?.username || "لاعب"}</div>
              <div className="text-[10px] text-muted-foreground">{new Date(clip.created_at).toLocaleString("ar")}</div>
            </div>
          </div>

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

        {authed === false && (
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5 text-center space-y-3">
            <h2 className="display text-xl">انضم لمجتمع LAST ZØNE</h2>
            <p className="text-sm text-muted-foreground">شاهد لقطات أكثر، علّق، وشارك لقطاتك مع لاعبي ببجي.</p>
            <div className="flex gap-2 justify-center pt-1">
              <Link to="/login" className="px-5 py-2 rounded-md bg-gradient-gold text-primary-foreground font-bold text-sm flex items-center gap-1.5"><UserPlus className="size-4" /> إنشاء حساب</Link>
              <Link to="/login" className="px-5 py-2 rounded-md border border-border hover:bg-surface-2 text-sm flex items-center gap-1.5"><LogIn className="size-4" /> دخول</Link>
            </div>
          </div>
        )}

        {authed && (
          <Link to="/app/feed" className="block text-center text-xs text-muted-foreground hover:text-foreground">شاهد المزيد من اللقطات →</Link>
        )}
      </main>
    </div>
  );
}
