# GameBroadcast — Capacitor Native Android Plugin

كود Capacitor Plugin (Kotlin) يبث شاشة اللعبة عبر Agora Native SDK مع نافذة عائمة (Floating Bubble) تظهر فوق أي تطبيق (بما فيها ببجي/PUBG).

> ⚠️ هذا المجلد ملفات **مرجعية**. لازم تنسخها داخل مشروع Android الفعلي بعد ما تشغّل `npx cap add android`.

---

## 📋 خطوات البناء (مرّة واحدة على جهاز ويندوز)

### المتطلبات
- Node.js 20+ ، Bun أو npm
- **JDK 17** (مثبت ومضبوط في PATH)
- **Android Studio** (Hedgehog أو أحدث)

### 1️⃣ تجهيز مشروع Android

من PowerShell في جذر المشروع:

```powershell
npm install
npm run build
npx cap add android
npx cap sync android
```

سينشأ مجلد `android/` في جذر المشروع.

### 2️⃣ نسخ ملفات الـ Plugin

أنشئ المجلد التالي:
```
android/app/src/main/java/app/lovable/lastzone/gamebroadcast/
```

ثم انسخ هذه الملفات إليه:

| من (هذا المجلد) | إلى (داخل `android/`) |
|---|---|
| `java/GameBroadcastPlugin.kt` | `android/app/src/main/java/app/lovable/lastzone/gamebroadcast/GameBroadcastPlugin.kt` |
| `java/ScreenCaptureService.kt` | `android/app/src/main/java/app/lovable/lastzone/gamebroadcast/ScreenCaptureService.kt` |
| `java/FloatingBubbleService.kt` | `android/app/src/main/java/app/lovable/lastzone/gamebroadcast/FloatingBubbleService.kt` |
| `java/AgoraScreenPusher.kt` | `android/app/src/main/java/app/lovable/lastzone/gamebroadcast/AgoraScreenPusher.kt` |
| `res/layout/floating_bubble.xml` | `android/app/src/main/res/layout/floating_bubble.xml` |
| `res/drawable/bubble_bg.xml` | `android/app/src/main/res/drawable/bubble_bg.xml` |

**أمر PowerShell سريع للنسخ دفعة واحدة:**

```powershell
$src = "android-native-plugin"
$dst = "android/app/src/main"
New-Item -ItemType Directory -Force -Path "$dst/java/app/lovable/lastzone/gamebroadcast"
New-Item -ItemType Directory -Force -Path "$dst/res/layout"
New-Item -ItemType Directory -Force -Path "$dst/res/drawable"
Copy-Item "$src/java/*.kt" "$dst/java/app/lovable/lastzone/gamebroadcast/" -Force
Copy-Item "$src/res/layout/*.xml" "$dst/res/layout/" -Force
Copy-Item "$src/res/drawable/*.xml" "$dst/res/drawable/" -Force
```

### 3️⃣ تعديل `AndroidManifest.xml`

افتح `android/app/src/main/AndroidManifest.xml`:

**أ. أضف الصلاحيات** داخل `<manifest>` (قبل `<application>`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

**ب. سجّل الـ Services** داخل `<application>`:

```xml
<service
    android:name=".gamebroadcast.ScreenCaptureService"
    android:enabled="true"
    android:exported="false"
    android:foregroundServiceType="mediaProjection" />

<service
    android:name=".gamebroadcast.FloatingBubbleService"
    android:enabled="true"
    android:exported="false" />
```

**ج. (مهم لـ OAuth/Google) أضف intent-filter للديب لينك** داخل `<activity android:name=".MainActivity">`:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="app.lovable.lastzone" android:host="oauth-callback" />
</intent-filter>
```

### 4️⃣ إضافة Agora Native SDK

افتح `android/app/build.gradle` وأضف داخل `dependencies`:

```gradle
implementation 'io.agora.rtc:full-sdk:4.3.2'
```

وداخل `android { ... }`:

```gradle
compileOptions {
    sourceCompatibility JavaVersion.VERSION_17
    targetCompatibility JavaVersion.VERSION_17
}
kotlinOptions {
    jvmTarget = '17'
}
```

### 5️⃣ تسجيل الـ Plugin في MainActivity

افتح `android/app/src/main/java/app/lovable/lastzone/MainActivity.java`:

```java
package app.lovable.lastzone;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import app.lovable.lastzone.gamebroadcast.GameBroadcastPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GameBroadcastPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

### 6️⃣ البناء والتشغيل

```powershell
npx cap sync android
npx cap open android
```

في Android Studio:
- **Build → Make Project** → للتحقق من نجاح البناء
- **Build → Build Bundle(s)/APK(s) → Build APK(s)** → لتوليد APK
- أو وصّل هاتفك واضغط **Run ▶** للتثبيت مباشرة

ملف APK سيكون في:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### 7️⃣ عند أي تحديث للكود

```powershell
npm run build
npx cap sync android
```

ثم أعد البناء من Android Studio.

---

## 🎬 كيف يعمل البث

1. المنظم يضغط **"ابدأ البث المباشر للروم"** داخل صفحة البطولة
2. التطبيق يطلب صلاحية **النافذة العائمة** (مرّة واحدة، يفتح إعدادات النظام)
3. Android يفتح Dialog "السماح بتسجيل الشاشة؟" → المنظم يوافق
4. تبدأ `ScreenCaptureService` كـ **Foreground Service** مع إشعار دائم
5. تظهر `FloatingBubbleService` فوق كل التطبيقات (فقاعة قابلة للسحب فيها زر إيقاف + توقف مؤقت + عدد المشاهدين)
6. `AgoraScreenPusher` يلتقط الشاشة + صوت اللعبة ويبثها لـ Agora
7. المنظم يضغط Home ويفتح ببجي ← الفقاعة تطفو فوق اللعبة
8. عدد المشاهدين يتحدّث تلقائياً (عبر Supabase Realtime presence)
9. الضغط على زر الإيقاف في الفقاعة ← يوقف البث، يخبر JS، يحدّث `tournaments.live_stream_active = false`

---

## 🧪 استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| `Build fails: Java version` | ثبت JDK 17 وضعه في **File → Project Structure → SDK Location** |
| `Agora SDK not found` | تأكد من سطر `implementation 'io.agora.rtc:full-sdk:4.3.2'` في `build.gradle` |
| الفقاعة العائمة ما تظهر | فعّل **Display over other apps** يدوياً من إعدادات التطبيق |
| APK يكراش على Android 14+ | تأكد من إضافة `FOREGROUND_SERVICE_MEDIA_PROJECTION` في Manifest |
| البث ما يبدأ — `OVERLAY_PERMISSION_REQUIRED` | اعطِ صلاحية النافذة العائمة من إعدادات Android للتطبيق |
| البث ما يبدأ — `PERMISSION_DENIED` | المستخدم رفض dialog تسجيل الشاشة، اضغط ابدأ من جديد |
| البث يشتغل بس بدون صوت اللعبة | `audioCaptureParameters` يحتاج Android 10+ (API 29) |

---

## 📦 الـ Secrets المطلوبة (مُهيّأة فعلاً في Lovable Cloud)

- ✅ `AGORA_APP_ID`
- ✅ `AGORA_APP_CERTIFICATE`

تُقرأ على السيرفر من `app_settings` table أولاً ثم من env. لا يحتاج تغيير.
