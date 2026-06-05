import { createFileRoute, Link } from "@tanstack/react-router";
import { Crosshair, Users, Trophy, Flame, Headphones, Zap } from "lucide-react";
import heroImg from "@/assets/hero-tactical.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LAST ZØNE — مجتمع لاعبي ببجي العربي" },
      { name: "description", content: "سيرفرات للكلانات، بحث عن سكواد حسب الرانك والرول، بطولات، وفيد كليبات وتفاعل مثل تيك توك — كل اللي يخص لاعب PUBG في تطبيق واحد." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen overflow-hidden">
      {/* NAV */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-background/60 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Crosshair className="size-6 text-primary" />
            <span className="display text-2xl tracking-wider">LAST <span className="text-gradient-gold">ZØNE</span></span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition">المميزات</a>
            <a href="#community" className="hover:text-foreground transition">المجتمع</a>
            <a href="#tournaments" className="hover:text-foreground transition">البطولات</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm hover:text-primary transition">دخول</Link>
            <Link to="/login" search={{ mode: "signup" }} className="rounded-md bg-gradient-gold px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition">
              ابدأ مجاناً
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative pt-32 pb-24 px-6">
        <div className="absolute inset-0 -z-10">
          <img src={heroImg} alt="" className="size-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>

        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs text-primary mb-6">
            <Zap className="size-3" /> الإصدار التجريبي متاح الآن
          </div>
          <h1 className="display text-6xl md:text-8xl lg:text-9xl leading-[0.95] mb-6">
            مجتمع <span className="text-gradient-gold">ببجي</span><br />
            في مكان واحد
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            سيرفرات للكلانات، فويس سريع، بحث عن سكواد حسب الرانك والرول، بطولات وكؤوس، فيد كليبات وتفاعل — بواجهة فخمة عربية صنعت للاعبين.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link to="/login" search={{ mode: "signup" }} className="rounded-md bg-gradient-gold px-8 py-3 text-base font-bold text-primary-foreground hover:opacity-90 transition glow-gold">
              انضم للمجتمع
            </Link>
            <a href="#features" className="rounded-md border border-border bg-surface/40 backdrop-blur px-8 py-3 text-base font-bold hover:bg-surface transition">
              اكتشف المميزات
            </a>
          </div>

          <div className="mt-20 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
            {[
              { n: "12K+", l: "لاعب" },
              { n: "340+", l: "كلان" },
              { n: "85+", l: "بطولة" },
            ].map((s) => (
              <div key={s.l}>
                <div className="display text-4xl md:text-5xl text-gradient-gold">{s.n}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6 border-t border-border/40">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-primary text-sm mb-3 tracking-widest">المميزات</p>
            <h2 className="display text-5xl md:text-6xl">كل شيء يحتاجه <span className="text-gradient-gold">المحترف</span></h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { i: Users, t: "كلانات وسيرفرات", d: "أنشئ سيرفر للكلان بقنوات نصية وصوتية، وادعُ أعضاءك ببساطة." },
              { i: Crosshair, t: "بحث عن سكواد", d: "ادخل تيم في ثوانٍ حسب الرانك، السيرفر، والمود اللي تحبه." },
              { i: Flame, t: "فيد المجتمع", d: "شارك كليباتك ولقطات جلدك، وشوف أحدث المقاطع من اللاعبين العرب." },
              { i: Trophy, t: "بطولات وكؤوس", d: "نظّم بطولات بجوائز حقيقية أو شارك بفريقك في بطولات المجتمع." },
              { i: Headphones, t: "فويس سريع", d: "كروم بقفز فوري وجودة عالية، مصمم خصيصاً للسكريمات." },
              { i: Zap, t: "حساسيات وHUD", d: "شارك إعداداتك مع التيم بكبسة زر، واستفد من إعدادات النخبة." },
            ].map((f) => (
              <div key={f.t} className="group relative overflow-hidden rounded-xl border border-border bg-surface/60 backdrop-blur p-6 hover:border-primary/40 transition">
                <div className="absolute -top-20 -left-20 size-40 rounded-full bg-primary/10 blur-3xl opacity-0 group-hover:opacity-100 transition" />
                <f.i className="size-8 text-primary mb-4" />
                <h3 className="display text-2xl mb-2">{f.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="community" className="py-32 px-6 relative">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="display text-5xl md:text-7xl mb-6">
            مستعد <span className="text-gradient-gold">للقتال؟</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-10">
            انضم لآلاف اللاعبين العرب. مجاناً تماماً.
          </p>
          <Link to="/login" search={{ mode: "signup" }} className="inline-block rounded-md bg-gradient-gold px-10 py-4 text-lg font-bold text-primary-foreground glow-gold hover:opacity-90 transition">
            ابدأ الآن
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/40 py-8 px-6 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Crosshair className="size-4 text-primary" />
          <span className="display tracking-wider">LAST ZØNE</span>
        </div>
        غير مرتبط رسمياً بشركة Krafton أو Tencent · صنع بحب للمجتمع العربي
      </footer>
    </div>
  );
}
