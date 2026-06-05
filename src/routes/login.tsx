import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import { useState, useEffect } from "react";
import { Crosshair } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

const NATIVE_OAUTH_REDIRECT = "app.lovable.lastzone://oauth-callback";

function isRunningInsideAndroidApp() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  const bridge = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }).Capacitor;
  const userAgent = navigator.userAgent.toLowerCase();

  return (
    Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() === "android" ||
    bridge?.isNativePlatform?.() === true ||
    bridge?.getPlatform?.() === "android" ||
    window.location.protocol === "capacitor:" ||
    window.location.protocol === "ionic:" ||
    userAgent.includes("lastzoneandroidapp") ||
    (userAgent.includes("android") && (userAgent.includes("; wv") || userAgent.includes(" wv")))
  );
}

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    mode: (s.mode as string) === "signup" ? "signup" : "login",
  }),
  component: LoginPage,
});

function LoginPage() {
  const { mode: initial } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isNativeApp, setIsNativeApp] = useState(() => isRunningInsideAndroidApp());
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsNativeApp(isRunningInsideAndroidApp());

    const goToApp = () => setTimeout(() => navigate({ to: "/app" }), 0);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) goToApp();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goToApp();
    });

    // Deep link handler for native OAuth callback
    let urlListener: { remove: () => void } | undefined;
    if (isRunningInsideAndroidApp()) {
      CapApp.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith(NATIVE_OAUTH_REDIRECT)) return;
        try {
          // Close in-app browser
          await Browser.close().catch(() => {});

          // Extract code or hash tokens
          const u = new URL(url);
          const code = u.searchParams.get("code");
          const errorDesc = u.searchParams.get("error_description") || u.searchParams.get("error");

          if (errorDesc) {
            toast.error("فشل تسجيل الدخول: " + errorDesc);
            return;
          }

          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
            toast.success("تم تسجيل الدخول!");
            return;
          }

          // Fallback: implicit flow with #access_token
          const hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
          const params = new URLSearchParams(hash);
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) throw error;
            toast.success("تم تسجيل الدخول!");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "حصل خطأ";
          toast.error(msg);
          setLoading(false);
        }
      }).then((l) => { urlListener = l; });
      
      Browser.addListener('browserFinished', () => {
         setLoading(false);
      });
    }

    return () => {
      subscription.unsubscribe();
      urlListener?.remove();
      if (isRunningInsideAndroidApp()) {
         Browser.removeAllListeners();
      }
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            ...(isNativeApp ? {} : { emailRedirectTo: window.location.origin }),
            data: { username, display_name: username },
          },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب! جاري تسجيل الدخول...");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("أهلاً بعودتك!");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حصل خطأ";
      toast.error(msg.includes("Invalid") ? "بيانات غير صحيحة" : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      if (isNativeApp || isRunningInsideAndroidApp()) {
        // Native: open OAuth URL in in-app browser, return via deep link
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: NATIVE_OAUTH_REDIRECT,
            skipBrowserRedirect: true,
          },
        });
        if (error) throw error;
        if (!data?.url) throw new Error("لم يتم استلام رابط جوجل");
        await Browser.open({ url: data.url, presentationStyle: "fullscreen" });
        // setLoading stays true until deep link returns
      } else {
        // Web: existing Lovable broker flow
        const result = await lovable.auth.signInWithOAuth("google", {
          redirect_uri: window.location.origin + "/app",
        });
        if (result.error) {
          toast.error("فشل تسجيل الدخول بجوجل");
          setLoading(false);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حصل خطأ";
      toast.error(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <Crosshair className="size-7 text-primary" />
          <span className="display text-3xl tracking-wider">LAST <span className="text-gradient-gold">ZØNE</span></span>
        </Link>

        <div className="rounded-2xl border border-border bg-surface/80 backdrop-blur p-8 shadow-elegant">
          <h1 className="display text-4xl mb-1">{mode === "login" ? "أهلاً بعودتك" : "أنشئ حسابك"}</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "login" ? "ادخل لتكمل القتال" : "انضم لمجتمع لاعبي ببجي"}
          </p>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-md border border-border bg-background hover:bg-surface-2 py-2.5 mb-4 text-sm font-medium transition disabled:opacity-50"
          >
            <svg className="size-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            متابعة بحساب جوجل
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">أو</span>
            <div className="h-px flex-1 bg-border" />
          </div>


          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">اسم اللاعب</label>
                <input
                  required minLength={3} value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="ProSniper99"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">البريد الإلكتروني</label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">كلمة المرور</label>
              <input
                type="password" required minLength={6} value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full rounded-md bg-gradient-gold py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "..." : mode === "login" ? "دخول" : "إنشاء حساب"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {mode === "login" ? "ما عندك حساب؟" : "عندك حساب؟"}{" "}
            <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-primary hover:underline">
              {mode === "login" ? "أنشئ حساب" : "سجل دخول"}
            </button>
          </p>
        </div>

        <Link to="/" className="block text-center text-xs text-muted-foreground hover:text-foreground mt-6">
          ← رجوع للرئيسية
        </Link>
      </div>
    </div>
  );
}
