/**
 * تسجيل الجهاز في OneSignal وحفظ player_id في قاعدة البيانات.
 * يعمل فقط على Android (داخل تطبيق Capacitor)، ويتجاهل في المتصفح.
 */
import { supabase } from "@/integrations/supabase/client";

// App ID الخاص بـ OneSignal (آمن للظهور في الكود — هو معرّف عام، ليس سرّاً)
const ONESIGNAL_APP_ID = "9e09f984-af73-457c-b743-5bc24e044d68";

declare global {
  interface Window {
    cordova?: unknown;
    plugins?: { OneSignal?: any };
    OneSignal?: any;
  }
}

function isNativeApp(): boolean {
  return typeof window !== "undefined" && !!window.cordova;
}

export async function initOneSignal(userId: string) {
  if (!isNativeApp()) return; // لا شيء على الويب

  // الحصول على كائن OneSignal (يتوفر بعد deviceready)
  await new Promise<void>((resolve) => {
    if (window.OneSignal || window.plugins?.OneSignal) return resolve();
    document.addEventListener("deviceready", () => resolve(), { once: true });
  });

  const OneSignal: any = window.OneSignal || window.plugins?.OneSignal;
  if (!OneSignal) {
    console.warn("[OneSignal] plugin not found");
    return;
  }

  try {
    // التهيئة
    OneSignal.initialize(ONESIGNAL_APP_ID);

    // طلب إذن الإشعارات
    OneSignal.Notifications.requestPermission(true);

    // ربط حساب المستخدم
    OneSignal.login(userId);

    // الحصول على Push Subscription ID (player_id)
    const sub = OneSignal.User?.pushSubscription;
    const playerId: string | null = sub?.id ?? sub?.getIdAsync?.() ?? null;

    const resolvedPlayerId =
      typeof playerId === "string" ? playerId : await Promise.resolve(playerId);

    if (resolvedPlayerId) {
      await supabase.from("device_tokens").upsert(
        {
          user_id: userId,
          player_id: resolvedPlayerId,
          platform: "android",
        },
        { onConflict: "user_id,player_id" },
      );
      console.log("[OneSignal] device registered:", resolvedPlayerId);
    }

    // تحديث عند تغيّر الاشتراك
    OneSignal.User?.pushSubscription?.addEventListener?.(
      "change",
      async (e: any) => {
        const newId = e?.current?.id;
        if (newId) {
          await supabase.from("device_tokens").upsert(
            { user_id: userId, player_id: newId, platform: "android" },
            { onConflict: "user_id,player_id" },
          );
        }
      },
    );
  } catch (e) {
    console.error("[OneSignal] init failed", e);
  }
}
