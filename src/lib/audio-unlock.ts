// Global audio unlocker.
//
// Browsers (Chrome/Safari/Firefox) block any audio playback until the user
// has interacted with the page at least once. This module creates a single
// shared AudioContext on the FIRST user gesture anywhere in the app, so that
// later events (like an incoming voice-call ringtone) can play sound without
// needing another click.

let sharedCtx: AudioContext | null = null;
let installed = false;

export function getSharedAudioContext(): AudioContext | null {
  return sharedCtx;
}

function createCtx(): AudioContext | null {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    return new AC();
  } catch {
    return null;
  }
}

async function unlock() {
  if (!sharedCtx) sharedCtx = createCtx();
  if (!sharedCtx) return;
  try {
    if (sharedCtx.state === "suspended") await sharedCtx.resume();
    // Play a 1-sample silent buffer to fully "unlock" on iOS Safari.
    const buf = sharedCtx.createBuffer(1, 1, 22050);
    const src = sharedCtx.createBufferSource();
    src.buffer = buf;
    src.connect(sharedCtx.destination);
    src.start(0);
  } catch {}
}

export function installAudioUnlocker() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const handler = () => {
    void unlock();
  };
  const opts: AddEventListenerOptions = { once: true, capture: true };
  window.addEventListener("pointerdown", handler, opts);
  window.addEventListener("keydown", handler, opts);
  window.addEventListener("touchstart", handler, opts);
  window.addEventListener("click", handler, opts);
}
