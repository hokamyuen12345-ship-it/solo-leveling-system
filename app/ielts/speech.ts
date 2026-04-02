/**
 * 使用瀏覽器 Web Speech API 朗讀英文（無需 API Key）。
 * 需在使用者點擊等手勢後呼叫，部分行動瀏覽器才會播音。
 */

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

/** 正規化空白後朗讀；預設英式英文 en-GB（IELTS 常用），並盡量選英語語音。 */
export function speakEnglish(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return;

  const synth = window.speechSynthesis;
  synth.cancel();

  const run = () => {
    const u = new SpeechSynthesisUtterance(raw);
    u.lang = "en-GB";
    u.rate = 0.92;
    u.pitch = 1;
    const voices = synth.getVoices();
    const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
    u.voice =
      en.find((v) => /en-gb|united kingdom|british/i.test(`${v.lang} ${v.name}`)) ??
      en.find((v) => /en-us/i.test(v.lang)) ??
      en[0] ??
      null;
    synth.speak(u);
  };

  if (synth.getVoices().length > 0) run();
  else synth.addEventListener("voiceschanged", run, { once: true });
}
