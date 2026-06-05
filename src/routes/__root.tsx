import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { installAudioUnlocker } from "@/lib/audio-unlock";
import { installExternalLinkInterceptor } from "@/lib/external-links";
import { trackSession } from "@/lib/session-tracker";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="display text-8xl text-gradient-gold">404</h1>
        <h2 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة اللي تدور عليها مش موجودة أو تم نقلها.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-gradient-gold px-6 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          الرجوع للرئيسية
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="display text-2xl">حصل خطأ</h1>
        <p className="mt-2 text-sm text-muted-foreground">جرّب تحدّث الصفحة.</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-gradient-gold px-6 py-2 text-sm font-bold text-primary-foreground"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "LAST ZØNE — مجتمع لاعبي ببجي" },
      { name: "description", content: "للاعبي PUBG Mobile: سيرفرات للكلانات، بحث عن سكواد، بطولات،" },
      { name: "theme-color", content: "#0a0a0a" },
      { property: "og:title", content: "LAST ZØNE — مجتمع لاعبي ببجي" },
      { property: "og:description", content: "للاعبي PUBG Mobile: سيرفرات للكلانات، بحث عن سكواد، بطولات،" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "LAST ZØNE — مجتمع لاعبي ببجي" },
      { name: "twitter:description", content: "للاعبي PUBG Mobile: سيرفرات للكلانات، بحث عن سكواد، بطولات،" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/35fedc3f-f8fd-4e96-91fd-67e6c1987fbf" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/35fedc3f-f8fd-4e96-91fd-67e6c1987fbf" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@300;400;500;600;700;800;900&family=Cairo:wght@400;600;700;800;900&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function AuthSync() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    // Record session on initial mount if already authenticated
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) trackSession();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        trackSession();
      }
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      queryClient.invalidateQueries();
      if (event === "SIGNED_OUT") router.invalidate();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => { installAudioUnlocker(); installExternalLinkInterceptor(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <Outlet />
      <Toaster theme="dark" />
    </QueryClientProvider>
  );
}
