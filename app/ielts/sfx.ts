"use client";

const IELTS_CLICK_MP3_URL = "/ielts/click.mp3";

let clickBuf: AudioBuffer | null = null;
let clickBufPromise: Promise<AudioBuffer | null> | null = null;
let clickBufFailed = false;

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

function trimSilence(
  ctx: AudioContext,
  buf: AudioBuffer,
  opts?: { threshold?: number; padMs?: number; minMs?: number }
): AudioBuffer {
  const threshold = opts?.threshold ?? 0.012; // amplitude threshold
  const padMs = opts?.padMs ?? 6; // keep a tiny lead-in/out
  const minMs = opts?.minMs ?? 12; // don't over-trim ultra short sfx

  const sr = buf.sampleRate;
  const n = buf.length;
  if (n <= 0) return buf;

  let start = 0;
  let end = n - 1;

  const over = (i: number) => {
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      if (Math.abs(d[i] ?? 0) >= threshold) return true;
    }
    return false;
  };

  while (start < n && !over(start)) start++;
  while (end > start && !over(end)) end--;

  // If everything is "silent", just return original.
  if (start >= end) return buf;

  const pad = Math.floor((padMs / 1000) * sr);
  start = Math.max(0, start - pad);
  end = Math.min(n - 1, end + pad);

  const trimmedLen = end - start + 1;
  const minLen = Math.floor((minMs / 1000) * sr);
  if (trimmedLen < minLen) return buf;
  if (trimmedLen >= n) return buf;

  const out = ctx.createBuffer(buf.numberOfChannels, trimmedLen, sr);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(start, end + 1));
  }
  return out;
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

async function ensureClickBuffer(): Promise<AudioBuffer | null> {
  if (typeof window === "undefined") return null;
  if (clickBuf) return clickBuf;
  if (clickBufPromise) return clickBufPromise;
  const ctx = getCtx();
  if (!ctx) return null;

  clickBufPromise = (async () => {
    try {
      const res = await fetch(IELTS_CLICK_MP3_URL);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr.slice(0));
      clickBuf = trimSilence(ctx, buf);
      clickBufFailed = false;
      return buf;
    } catch {
      clickBufFailed = true;
      return null;
    } finally {
      clickBufPromise = null;
    }
  })();

  return clickBufPromise;
}

/** 預載 IELTS click mp3（需要在使用者手勢內呼叫，iOS 才可以 resume AudioContext）。 */
export function primeIeltsClick() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  void ensureClickBuffer();
}

/** IELTS 全站按鈕點擊音效（mp3）；若播放失敗則 fallback to synth。 */
export function playIeltsClick() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  if (clickBuf) {
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = clickBuf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t0); // soft
    src.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
    return;
  }

  // Not ready yet: trigger load; don't play fallback (avoid hearing old synth).
  void ensureClickBuffer();

  // If decode is impossible on this device/browser, then use synth as last resort.
  if (clickBufFailed) playFallbackSoftClickSynth();
}

