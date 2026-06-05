# خطة بناء البث المباشر للعبة على Android

## النتيجة النهائية
- اللاعب يضغط "ابدأ البث" داخل التطبيق
- Android يطلب صلاحية تسجيل الشاشة (نظام)
- تبدأ خدمة Foreground Service تبث الشاشة عبر Agora Native SDK
- تظهر **نافذة عائمة (Floating Bubble)** فوق أي تطبيق (بما فيها ببجي) تعرض:
  - عدد المشاهدين الحاليين
  - زر إيقاف/استئناف البث
  - زر إنهاء كامل
- اللاعب يفتح ببجي ويلعب عادي، البث مستمر بالخلفية

---

## التنفيذ

### 1. تجهيز مشروع Android (Capacitor)
- تثبيت `@capacitor/android`
- تشغيل `npx cap add android` لتوليد مجلد `android/`
- ضبط `capacitor.config.ts` (موجود جزئياً)

### 2. إنشاء Capacitor Plugin مخصص: `GameBroadcastPlugin`
موقعه: `android/app/src/main/java/app/lovable/lastzone/gamebroadcast/`

**ملفات Kotlin/Java:**
- `GameBroadcastPlugin.kt` — جسر JS ↔ Native (يستقبل `startBroadcast`, `stopBroadcast`, `updateViewerCount`)
- `ScreenCaptureService.kt` — Foreground Service يحمل MediaProjection ويغذي Agora
- `FloatingBubbleService.kt` — Service يعرض النافذة العائمة عبر `WindowManager` + `TYPE_APPLICATION_OVERLAY`
- `AgoraScreenPusher.kt` — ينشئ `RtcEngine` ويبث الفيديو كـ Custom Video Source من MediaProjection

**الصلاحيات في `AndroidManifest.xml`:**
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PROJECTION`
- `SYSTEM_ALERT_WINDOW` (للنافذة العائمة)
- `RECORD_AUDIO` (لصوت اللعبة)
- `INTERNET`, `ACCESS_NETWORK_STATE`

### 3. SDKs Native في `android/app/build.gradle`
```gradle
implementation 'io.agora.rtc:full-sdk:4.3.2'
```

### 4. واجهة JS للـ Plugin
ملف جديد: `src/lib/game-broadcast.ts`
```ts
import { registerPlugin } from '@capacitor/core';
export interface GameBroadcastPlugin {
  startBroadcast(opts: { appId, channel, token, uid }): Promise<void>;
  stopBroadcast(): Promise<void>;
  updateViewerCount(opts: { count: number }): Promise<void>;
  addListener(event: 'broadcastStopped', cb): Promise<...>;
}
export const GameBroadcast = registerPlugin<GameBroadcastPlugin>('GameBroadcast');
```

### 5. تعديل `TournamentLiveStream.tsx`
- اكتشاف `Capacitor.isNativePlatform()` و `getPlatform() === 'android'`
- على Android Native: استدعاء `GameBroadcast.startBroadcast(...)` بدل Agora Web SDK
- مراقبة عدد المشاهدين عبر Supabase Realtime وتمريرها للـ plugin لتحديث الفقاعة
- على المتصفح: السلوك الحالي (شاشة كمبيوتر فقط)

### 6. بناء APK
```bash
npm run build
npx cap sync android
npx cap open android   # يفتح Android Studio
# Build > Build Bundle(s)/APK(s) > Build APK
```
الـ APK يطلع في `android/app/build/outputs/apk/debug/`

---

## ملاحظات تقنية

- **النافذة العائمة** تحتاج صلاحية `SYSTEM_ALERT_WINDOW` — Android يفتح صفحة الإعدادات تلقائياً ليفعّلها المستخدم أول مرة
- **Agora Native SDK مجاني** للاستخدام (نفس مفاتيح App ID و Certificate الموجودة)
- المشاهدون يستقبلون البث من المتصفح عادي عبر Web SDK (لا تغيير)
- المشروع الويب الحالي **يستمر يعمل** بدون أي كسر

## ما لن أعمله الآن
- نسخة iOS (تحتاج Mac + ReplayKit، نأجلها)
- نشر على Google Play (تجربة محلية أولاً عبر APK)

---

## أحتاج تأكيدك على نقطة واحدة:
هل عندك **JDK 17+** مثبت مع Android Studio؟ (شرط لبناء Capacitor الحديث). لو ما متأكد، Android Studio عادة يحمله تلقائياً.

بعد موافقتك على الخطة سأبدأ بإنشاء الـ Plugin وكل الملفات.