"use client";

const IELTS_CLICK_MP3_URL = "/ielts/click.mp3";

let clickPool: HTMLAudioElement[] | null = null;
let clickPoolIdx = 0;

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx)
    audioCtx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
  return audioCtx;
}

function playFallbackSoftClickSynth() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const t0 = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0008, t0);
  g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.09);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1800, t0);
  lp.frequency.exponentialRampToValueAtTime(1200, t0 + 0.09);
  lp.Q.setValueAtTime(0.7, t0);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(140, t0);
  hp.Q.setValueAtTime(0.6, t0);
  g.connect(lp);
  lp.connect(hp);
  hp.connect(ctx.destination);
  const click = ctx.createOscillator();
  click.type = "sine";
  click.frequency.setValueAtTime(980, t0);
  click.frequency.exponentialRampToValueAtTime(1450, t0 + 0.02);
  click.connect(g);
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(420, t0);
  body.frequency.exponentialRampToValueAtTime(300, t0 + 0.06);
  body.connect(g);
  click.start(t0);
  body.start(t0);
  click.stop(t0 + 0.09);
  body.stop(t0 + 0.09);
}

function ensureClickPool() {
  if (typeof window === "undefined") return;
  if (clickPool) return;
  clickPool = Array.from({ length: 4 }, () => {
    const a = new Audio(IELTS_CLICK_MP3_URL);
    a.preload = "auto";
    a.volume = 0.22; // soft
    return a;
  });
}

/** IELTS 全站按鈕點擊音效（mp3）；若播放失敗則 fallback to synth。 */
export function playIeltsClick() {
  ensureClickPool();
  const pool = clickPool;
  if (!pool || pool.length === 0) {
    playFallbackSoftClickSynth();
    return;
  }
  const a = pool[clickPoolIdx % pool.length]!;
  clickPoolIdx++;
  try {
    a.pause();
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof (p as Promise<void>).catch === "function") {
      (p as Promise<void>).catch(() => playFallbackSoftClickSynth());
    }
  } catch {
    playFallbackSoftClickSynth();
  }
}

