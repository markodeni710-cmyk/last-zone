import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

/**
 * Intercepts external link clicks in the native app and opens them
 * inside an In-App Browser (Capacitor Browser) instead of leaving the app.
 */
export function installExternalLinkInterceptor() {
  if (typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform()) return;

  const isExternal = (url: string): boolean => {
    try {
      const u = new URL(url, window.location.href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      // Same-origin links should navigate normally within the WebView
      return u.origin !== window.location.origin;
    } catch {
      return false;
    }
  };

  const handler = async (e: MouseEvent) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const target = e.target as HTMLElement | null;
    const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    const opensNewTab = anchor.target === "_blank";
    const external = isExternal(href);

    if (!opensNewTab && !external) return;
    if (!external && !opensNewTab) return;

    // Only intercept real external http(s) URLs
    if (!external) return;

    e.preventDefault();
    try {
      await Browser.open({ url: anchor.href, presentationStyle: "popover" });
    } catch (err) {
      console.error("Failed to open in-app browser", err);
    }
  };

  document.addEventListener("click", handler, true);
}
