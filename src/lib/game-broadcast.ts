import { registerPlugin, Capacitor, type PluginListenerHandle } from "@capacitor/core";

export interface StartBroadcastOptions {
  appId: string;
  channel: string;
  token: string;
  uid: number;
  tournamentName: string;
}

export interface BroadcastEvent {
  type: "started" | "stopped" | "error" | "permission_denied";
  message?: string;
}

export interface GameBroadcastPlugin {
  /** يطلب صلاحية تسجيل الشاشة + يفتح Foreground Service + يبدأ Agora Native */
  startBroadcast(opts: StartBroadcastOptions): Promise<{ success: boolean }>;
  /** يوقف البث، يغلق Floating Bubble، ويغادر القناة */
  stopBroadcast(): Promise<{ success: boolean }>;
  /** يحدّث عدد المشاهدين الظاهر في الفقاعة العائمة */
  updateViewerCount(opts: { count: number }): Promise<void>;
  /** هل صلاحية SYSTEM_ALERT_WINDOW ممنوحة؟ */
  hasOverlayPermission(): Promise<{ granted: boolean }>;
  /** يفتح صفحة إعدادات النظام لمنح صلاحية النافذة العائمة */
  requestOverlayPermission(): Promise<{ granted: boolean }>;
  addListener(
    event: "broadcastEvent",
    cb: (data: BroadcastEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const GameBroadcast = registerPlugin<GameBroadcastPlugin>("GameBroadcast");

/** متاح فقط على Android Native (Capacitor) */
export const isNativeAndroidBroadcast = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
