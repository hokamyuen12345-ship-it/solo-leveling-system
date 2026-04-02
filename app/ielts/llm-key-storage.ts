/** Browser-only: Google AI Studio (Gemini) API key when server env is unset. */

export const IELTS_GOOGLE_AI_KEY_LS = "ielts_google_ai_key";

export function getStoredGoogleAIKey(): string {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(IELTS_GOOGLE_AI_KEY_LS) ?? "").trim();
}

export function setStoredGoogleAIKey(value: string): void {
  if (typeof window === "undefined") return;
  const v = value.trim().replace(/\s/g, "");
  if (!v) localStorage.removeItem(IELTS_GOOGLE_AI_KEY_LS);
  else localStorage.setItem(IELTS_GOOGLE_AI_KEY_LS, v);
}

/** True if saved (AIza…, no spaces). */
export function storeGoogleAiKeyFromPaste(value: string): boolean {
  const v = value.trim().replace(/\s/g, "");
  if (v.startsWith("AIza") && v.length >= 30) {
    setStoredGoogleAIKey(v);
    return true;
  }
  return false;
}
