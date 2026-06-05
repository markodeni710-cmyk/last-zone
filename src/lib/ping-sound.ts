// Messenger-like "ping" sound using Web Audio API (no asset needed)
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

export function playPing() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;

  const tone = (freq: number, start: number, dur: number, gain = 0.18) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + start);
    g.gain.setValueAtTime(0, now + start);
    g.gain.linearRampToValueAtTime(gain, now + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };

  // Two-tone messenger-ish ping
  tone(880, 0, 0.18);
  tone(1320, 0.09, 0.22);
}
