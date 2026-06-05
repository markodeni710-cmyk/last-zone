import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.lastzone',
  appName: 'Last Zone',
  webDir: 'dist/client',
  server: {
    url: 'https://last-zone.lovable.app',
    cleartext: false,
    androidScheme: 'https',
    // لا تضف Google أو روابط OAuth هنا؛ يجب أن تُفتح عبر Chrome Custom Tab وليس داخل WebView
    allowNavigation: ['last-zone.lovable.app', '*.lovable.app'],
  },
  android: {
    allowMixedContent: true,
    appendUserAgent: 'LastZoneAndroidApp',
  },
  plugins: {
    OneSignal: {},
  },
};

export default config;
