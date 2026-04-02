import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  word?: string;
  meaning?: string;
  example?: string;
  googleApiKey?: string;
};

/**
 * Fallback order when ListModels fails (offline, 403, etc.). Prefer unversioned IDs — versioned IDs
 * (`*-002`) often 404 for some keys/regions. Primary path: `listGeminiGenerateModels()` from the API.
 * @see https://ai.google.dev/api/rest/v1beta/models/list
 */
const GEMINI_MODELS_FALLBACK = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
] as const;

/** Prefer these when both appear in ListModels (faster / cheaper first). */
const GEMINI_PREFERRED_ORDER = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
] as const;

const LIST_MODELS_TTL_MS = 10 * 60 * 1000;
let listModelsCache: { keyFp: string; at: number; ids: string[] } | null = null;

type ListModelsResp = {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
  nextPageToken?: string;
};

function fingerprintApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

function modelIdFromName(full: string): string | null {
  const t = full.trim();
  if (!t.startsWith("models/")) return null;
  const id = t.slice("models/".length);
  return id && !id.includes("/") ? id : null;
}

function scoreModelForCloze(id: string): number {
  const low = id.toLowerCase();
  if (low.includes("embedding") || low.includes("embed")) return 1000;
  if (low.includes("tts") || low.includes("text-bison") || low.includes("chat-bison")) return 900;
  if (low.includes("flash")) return low.includes("lite") ? 15 : 10;
  if (low.includes("pro")) return 40;
  return 50;
}

function orderDiscoveredModels(ids: string[]): string[] {
  const uniq = [...new Set(ids)];
  const pref = new Set<string>(GEMINI_PREFERRED_ORDER);
  const preferred = GEMINI_PREFERRED_ORDER.filter((p) => uniq.includes(p));
  const rest = uniq.filter((id) => !pref.has(id));
  rest.sort((a, b) => {
    const sa = scoreModelForCloze(a);
    const sb = scoreModelForCloze(b);
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });
  return [...preferred, ...rest];
}

async function listGeminiGenerateModels(apiKey: string): Promise<string[]> {
  const keyFp = fingerprintApiKey(apiKey);
  const now = Date.now();
  if (listModelsCache && listModelsCache.keyFp === keyFp && now - listModelsCache.at < LIST_MODELS_TTL_MS) {
    return listModelsCache.ids;
  }

  const out: string[] = [];
  let pageToken: string | undefined;

  do {
    const q = new URLSearchParams({ key: apiKey, pageSize: "100" });
    if (pageToken) q.set("pageToken", pageToken);
    const url = `https://generativelanguage.googleapis.com/v1beta/models?${q.toString()}`;
    const res = await fetch(url, { method: "GET" });
    const data = (await res.json()) as ListModelsResp & { error?: { message?: string } };

    if (!res.ok) {
      const msg = data.error?.message ?? JSON.stringify(data);
      throw new Error(`ListModels HTTP ${res.status}: ${msg}`);
    }

    for (const m of data.models ?? []) {
      const methods = m.supportedGenerationMethods ?? [];
      if (!methods.includes("generateContent")) continue;
      const id = m.name ? modelIdFromName(m.name) : null;
      if (!id) continue;
      out.push(id);
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  if (out.length > 0) {
    listModelsCache = { keyFp, at: now, ids: out };
  }
  return out;
}

type Variant = "sys_json" | "merged_json" | "plain";

function trimQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1).trim();
  return t;
}

function envGeminiKey(): string {
  return trimQuotes(
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || "",
  );
}

function looksLikeGoogleAIKey(s: string): boolean {
  const t = s.trim().replace(/\s/g, "");
  return t.startsWith("AIza") && t.length >= 30;
}

function normalizeGoogleKey(s: string): string {
  return trimQuotes(s).replace(/\s/g, "");
}

function resolveGeminiKey(body: Body): string | null {
  const fromBody = typeof body.googleApiKey === "string" ? normalizeGoogleKey(body.googleApiKey) : "";
  if (looksLikeGoogleAIKey(fromBody)) return fromBody;
  const fromEnv = normalizeGoogleKey(envGeminiKey());
  if (looksLikeGoogleAIKey(fromEnv)) return fromEnv;
  return null;
}

const SYSTEM_PROMPT =
  "You create IELTS vocabulary cloze items. Reply with valid JSON only, no markdown fences. Use Traditional Chinese for zhContext and noteZh.";

function buildUserPrompt(word: string, meaning: string, example: string | undefined): string {
  return `Target word or phrase (lemma): ${word}
Chinese meaning from the learner's flashcard: ${meaning}
${
  example
    ? `Optional reference from the learner (do not copy verbatim if it gives away the blank): ${example}`
    : ""
}

Create ONE short English sentence at IELTS-friendly B1–B2 level. The sentence must naturally use the target in a grammatically correct INFLECTED form (tense, singular/plural, comparative, phrasal verb form, etc.). Replace ONLY that word or phrase in the sentence with exactly three underscores: ___ as the single blank.

Also write one short Chinese line (zhContext) that sets up the situation — you may paraphrase the flashcard meaning but must NOT spell or hint the English answer.

Return a JSON object with exactly these keys:
- "zhContext": string (Traditional Chinese)
- "enSentence": string (must contain exactly one "___")
- "expectedAnswer": string (exact text the learner types in the blank; match natural casing for the sentence)
- "noteZh": string (optional, one Traditional Chinese line on the grammar form)

Rules:
- expectedAnswer is only the blank fill, no leading/trailing spaces.
- enSentence contains exactly one "___" and no other underscore runs used as blanks.`;
}

type GeminiResp = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string; code?: number };
};

function isModelNotFound(message: string): boolean {
  return /not\s*found|NOT_FOUND|404|invalid.*model|Unknown.*model|is not supported/i.test(message);
}

function userFacingGeminiError(status: number, apiMessage: string): string {
  const m = apiMessage.slice(0, 500);
  const low = m.toLowerCase();
  if (status === 400 && (low.includes("api key") || low.includes("invalid argument"))) {
    return "API 金鑰無效或格式錯誤。請到 Google AI Studio 重新複製金鑰（勿含空格或換行），或確認已啟用 Generative Language API。";
  }
  if (status === 403 || low.includes("permission") || low.includes("forbidden")) {
    return `Google 拒絕存取：${m}`;
  }
  if (status === 429 || low.includes("quota") || low.includes("resource exhausted")) {
    return "已超過免費額度或請求過於頻繁，請稍後再試或到 Google Cloud 檢查配額。";
  }
  if (status === 404 && isModelNotFound(m)) {
    return `指定的模型暫不可用：${m}`;
  }
  return `Gemini API（HTTP ${status}）：${m}`;
}

async function callGeminiOnce(
  apiKey: string,
  model: string,
  variant: Variant,
  userPrompt: string,
): Promise<{ ok: true; raw: string } | { ok: false; message: string }> {
  const mergedText = `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`;

  const generationConfig: Record<string, unknown> = { temperature: 0.65 };
  if (variant === "sys_json" || variant === "merged_json") {
    generationConfig.responseMimeType = "application/json";
  }

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: variant === "merged_json" || variant === "plain" ? mergedText : userPrompt }] }],
    generationConfig,
  };

  if (variant === "sys_json") {
    body.systemInstruction = { parts: [{ text: SYSTEM_PROMPT }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as GeminiResp;

  if (!res.ok) {
    const apiMsg = data.error?.message ?? JSON.stringify(data);
    return { ok: false, message: userFacingGeminiError(res.status, apiMsg) };
  }

  if (data.promptFeedback?.blockReason) {
    return {
      ok: false,
      message: `內容遭安全設定阻擋（${data.promptFeedback.blockReason}）。請換一個單字再試，或使用「默寫」。`,
    };
  }

  const cand = data.candidates?.[0];
  if (!cand) {
    return {
      ok: false,
      message:
        "模型沒有回傳內容（可能被安全策略擋下）。請到 Google AI Studio 確認專案已啟用「Generative Language API」，或換張字卡再試。",
    };
  }

  if (cand.finishReason === "SAFETY" || cand.finishReason === "BLOCKLIST" || cand.finishReason === "PROHIBITED_CONTENT") {
    return { ok: false, message: "模型因安全政策未產生內容，請換一個單字或使用默寫。" };
  }

  const text =
    cand.content?.parts?.map((p) => (typeof p.text === "string" ? p.text : "")).join("")?.trim() ?? "";
  if (!text) {
    return { ok: false, message: "模型回傳空白。若持續發生，請到 AI Studio 換一個模型或檢查 API 限制。" };
  }

  return { ok: true, raw: text };
}

async function generateWithGemini(apiKey: string, userPrompt: string): Promise<{ raw: string } | { error: string }> {
  const variants: Variant[] = ["sys_json", "merged_json", "plain"];
  let lastMessage = "";

  let modelIds: string[] = [];
  try {
    const discovered = await listGeminiGenerateModels(apiKey);
    modelIds = orderDiscoveredModels(discovered);
  } catch (e) {
    const hint = e instanceof Error ? e.message.slice(0, 200) : String(e);
    lastMessage = `無法取得可用模型清單（${hint}）。將改試預設模型。`;
  }

  if (modelIds.length === 0) {
    modelIds = [...GEMINI_MODELS_FALLBACK];
  }

  for (const model of modelIds) {
    for (const variant of variants) {
      const r = await callGeminiOnce(apiKey, model, variant, userPrompt);
      if (r.ok) return { raw: r.raw };
      lastMessage = r.message;
      if (isModelNotFound(r.message)) break;
    }
  }

  return {
    error:
      lastMessage ||
      "無法連線 Gemini。請確認金鑰有效、已啟用 Generative Language API，或到 Google AI Studio 檢查專案與計費狀態。",
  };
}

function extractJsonObject(raw: string): string | null {
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return s.slice(start, end + 1);
}

function parseAndValidateClozeJson(content: string) {
  const blob = extractJsonObject(content) ?? content.trim();
  let parsed: { zhContext?: string; enSentence?: string; expectedAnswer?: string; noteZh?: string };
  try {
    parsed = JSON.parse(blob) as typeof parsed;
  } catch {
    return { error: NextResponse.json({ error: "parse", message: "無法解析模型回應（不是合法 JSON）。請按「僅重試」再試一次。" }, { status: 502 }) };
  }

  const zhContext = typeof parsed.zhContext === "string" ? parsed.zhContext.trim() : "";
  const enSentence = typeof parsed.enSentence === "string" ? parsed.enSentence.trim() : "";
  const expectedAnswer = typeof parsed.expectedAnswer === "string" ? parsed.expectedAnswer.trim() : "";

  if (!zhContext || !enSentence || !expectedAnswer || !enSentence.includes("___")) {
    return {
      error: NextResponse.json({ error: "invalid_shape", message: "題目格式不完整（需含 zhContext、enSentence 與單一 ___）。請重試。" }, { status: 502 }),
    };
  }

  const blankCount = (enSentence.match(/___/g) ?? []).length;
  if (blankCount !== 1) {
    return { error: NextResponse.json({ error: "invalid_blank", message: "句子必須只有一個填空 ___，請重試。" }, { status: 502 }) };
  }

  return {
    body: {
      zhContext,
      enSentence,
      expectedAnswer,
      noteZh: typeof parsed.noteZh === "string" ? parsed.noteZh.trim() : undefined,
    },
  };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const key = resolveGeminiKey(body);
  if (!key) {
    return NextResponse.json(
      {
        error: "missing_api_key",
        message:
          "找不到 Google AI Studio 金鑰：請在「設定」貼上以 AIza 開頭的金鑰，或在專案 .env.local 設定 GEMINI_API_KEY 後重啟伺服器。",
      },
      { status: 503 },
    );
  }

  const word = typeof body.word === "string" ? body.word.trim() : "";
  const meaning = typeof body.meaning === "string" ? body.meaning.trim() : "";
  if (!word || !meaning) {
    return NextResponse.json({ error: "bad_request", message: "需要 word 與 meaning。" }, { status: 400 });
  }
  const example = typeof body.example === "string" && body.example.trim() ? body.example.trim() : undefined;
  const userPrompt = buildUserPrompt(word, meaning, example);

  const gen = await generateWithGemini(key, userPrompt);
  if ("error" in gen) {
    return NextResponse.json({ error: "gemini_failed", message: gen.error }, { status: 502 });
  }

  const validated = parseAndValidateClozeJson(gen.raw);
  if ("error" in validated) return validated.error;
  return NextResponse.json(validated.body);
}
