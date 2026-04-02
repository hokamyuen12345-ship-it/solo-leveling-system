import { getStoredGoogleAIKey } from "./llm-key-storage";
import type { Flashcard } from "./store";

export type ClozePayload = {
  zhContext: string;
  enSentence: string;
  expectedAnswer: string;
  noteZh?: string;
};

export async function fetchCloze(card: Flashcard, signal: AbortSignal): Promise<ClozePayload> {
  const googleApiKey = getStoredGoogleAIKey();
  const res = await fetch("/api/ielts/generate-cloze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      word: card.word,
      meaning: card.meaning,
      example: card.example?.trim() || undefined,
      ...(googleApiKey ? { googleApiKey } : {}),
    }),
    signal,
  });
  const data = (await res.json()) as ClozePayload & { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(data.message || data.error || "request_failed");
  }
  return data;
}
