import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { recordSession } from "./session-tracker.functions";

let fpPromise: Promise<string | null> | null = null;

async function getFingerprint(): Promise<string | null> {
  if (fpPromise) return fpPromise;
  fpPromise = (async () => {
    try {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      return result.visitorId;
    } catch (e) {
      console.warn("fingerprint failed", e);
      return null;
    }
  })();
  return fpPromise;
}

let lastRecorded = 0;
const THROTTLE_MS = 1000 * 60 * 60; // once per hour per page session

export async function trackSession(): Promise<string | null> {
  const now = Date.now();
  if (now - lastRecorded < THROTTLE_MS) return null;
  lastRecorded = now;
  try {
    const fingerprint = await getFingerprint();
    const res = await recordSession({ data: { fingerprint } });
    return res?.country ?? null;
  } catch (e) {
    console.warn("session record failed", e);
    return null;
  }
}
