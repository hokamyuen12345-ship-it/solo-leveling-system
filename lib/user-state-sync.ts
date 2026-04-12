import { getSupabase } from "./supabase";
import { IELTS_SW_RECORDS_KEY, migrateSwRecords, type Flashcard, type SpeakingWritingEntry } from "@/app/ielts/store";

function isoCmp(a: string, b: string): number {
  // YYYY-MM-DD lexicographic compare
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function swRecordContentWeight(r: SpeakingWritingEntry): number {
  const a = (r.myAnswer ?? "").trim().length;
  const b = (r.improvedAnswer ?? "").trim().length;
  const c = (r.commonMistakes ?? "").trim().length;
  const n = (r.notes ?? "").trim().length;
  const img = r.attachmentImageDataUrl ? 1 : 0;
  const band = typeof r.band === "number" ? 1 : 0;
  return a + b + c + n + img * 30 + band * 5;
}

function mergeSwRecordLocalFirst(local: SpeakingWritingEntry, incoming: SpeakingWritingEntry): SpeakingWritingEntry {
  // Local always wins; fill missing local fields from incoming so we can still recover content.
  const pick = (a: string | undefined, b: string | undefined) => (a && a.trim() ? a : b && b.trim() ? b : a ?? b ?? "");
  const updatedAt = isoCmp(local.updatedAt, incoming.updatedAt) >= 0 ? local.updatedAt : incoming.updatedAt;
  return {
    ...incoming,
    ...local,
    myAnswer: pick(local.myAnswer, incoming.myAnswer),
    improvedAnswer: pick(local.improvedAnswer, incoming.improvedAnswer),
    commonMistakes: pick(local.commonMistakes, incoming.commonMistakes) || undefined,
    notes: pick(local.notes, incoming.notes) || undefined,
    attachmentImageDataUrl: local.attachmentImageDataUrl ?? incoming.attachmentImageDataUrl,
    band: typeof local.band === "number" ? local.band : incoming.band,
    updatedAt,
  };
}

function mergeSwRecords(localRaw: unknown, incomingRaw: unknown): SpeakingWritingEntry[] {
  const local = migrateSwRecords(localRaw);
  const incoming = migrateSwRecords(incomingRaw);
  const byId = new Map<string, SpeakingWritingEntry>(local.map((r) => [r.id, r]));
  for (const r of incoming) {
    const prev = byId.get(r.id);
    if (!prev) byId.set(r.id, r);
    else byId.set(r.id, mergeSwRecordLocalFirst(prev, r));
  }

  return [...byId.values()].sort((a, b) => {
    const u = isoCmp(a.updatedAt, b.updatedAt);
    if (u !== 0) return -u;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

const IELTS_FLASHCARDS_KEY = "ielts_flashcards_v1";

function migrateFlashcards(raw: unknown): Flashcard[] {
  if (!Array.isArray(raw)) return [];
  const out: Flashcard[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Partial<Record<string, unknown>>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const word = typeof o.word === "string" ? o.word : "";
    const meaning = typeof o.meaning === "string" ? o.meaning : "";
    const category = typeof o.category === "string" ? o.category : "vocab";
    const mastered = typeof o.mastered === "boolean" ? o.mastered : false;
    const createdAt = typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString().slice(0, 10);
    const example = typeof o.example === "string" ? o.example : undefined;
    if (!id) continue;
    out.push({ id, word, meaning, example, category, mastered, createdAt });
  }
  return out;
}

function mergeFlashcardsLocalFirst(localRaw: unknown, incomingRaw: unknown): Flashcard[] {
  const local = migrateFlashcards(localRaw);
  const incoming = migrateFlashcards(incomingRaw);
  const byId = new Map<string, Flashcard>(local.map((c) => [c.id, c]));

  const pick = (a: string | undefined, b: string | undefined) => (a && a.trim() ? a : b && b.trim() ? b : a ?? b);
  for (const c of incoming) {
    const prev = byId.get(c.id);
    if (!prev) byId.set(c.id, c);
    else {
      // local wins; fill missing local text from incoming, and keep mastered if either mastered.
      byId.set(c.id, {
        ...c,
        ...prev,
        word: pick(prev.word, c.word) ?? "",
        meaning: pick(prev.meaning, c.meaning) ?? "",
        example: pick(prev.example, c.example),
        category: prev.category || c.category,
        mastered: prev.mastered || c.mastered,
        createdAt: prev.createdAt || c.createdAt,
      });
    }
  }

  // Keep local ordering as much as possible: local first, then incoming additions.
  const localOrder = new Set(local.map((c) => c.id));
  const merged = [...byId.values()];
  merged.sort((a, b) => {
    const al = localOrder.has(a.id);
    const bl = localOrder.has(b.id);
    if (al !== bl) return al ? -1 : 1;
    return 0;
  });
  return merged;
}

/** 寫入單筆 user_state 到 localStorage（與首頁邏輯一致） */
export function applyUserStateRowToLocalStorage(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    if (key === "slq_voice_enabled") localStorage.setItem(key, String(value));
    else if (key === IELTS_SW_RECORDS_KEY) {
      // Merge instead of overwrite: prevents losing freshly created/edited records on reload
      // when cloud state is stale (e.g. edits done on detail page before periodic push).
      const localRaw = (() => {
        try {
          const raw = localStorage.getItem(key);
          return raw ? (JSON.parse(raw) as unknown) : [];
        } catch {
          return [];
        }
      })();
      const merged = mergeSwRecords(localRaw, value);
      localStorage.setItem(key, JSON.stringify(merged));
    } else if (key === IELTS_FLASHCARDS_KEY) {
      const localRaw = (() => {
        try {
          const raw = localStorage.getItem(key);
          return raw ? (JSON.parse(raw) as unknown) : [];
        } catch {
          return [];
        }
      })();
      const merged = mergeFlashcardsLocalFirst(localRaw, value);
      localStorage.setItem(key, JSON.stringify(merged));
    } else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

/** 從 Supabase 拉取該使用者所有 user_state 並寫入 localStorage */
export async function fetchUserStateAndApplyToLocalStorage(userId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: rows } = await sb.from("user_state").select("key, value").eq("user_id", userId);
    if (!rows?.length) return;
    for (const row of rows) {
      const key = row.key as string;
      const val = row.value;
      if (typeof key === "string" && val !== undefined) applyUserStateRowToLocalStorage(key, val);
    }
  } catch {
    /* 離線或權限：保留本機 */
  }
}

function readLocalStorageValueForSync(key: string): unknown | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  if (key === "slq_voice_enabled") return raw === "true";
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** 將指定 keys 的本機值 upsert 到 user_state（登入時使用） */
export async function pushKeysToUserState(userId: string, keys: readonly string[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const updatedAt = new Date().toISOString();
  const rows: { user_id: string; key: string; value: unknown; updated_at: string }[] = [];
  for (const key of keys) {
    const value = readLocalStorageValueForSync(key);
    if (value === null || value === undefined) continue;
    rows.push({ user_id: userId, key, value, updated_at: updatedAt });
  }
  if (!rows.length) return;
  const chunkSize = 8;
  try {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const slice = rows.slice(i, i + chunkSize);
      await sb.from("user_state").upsert(slice, { onConflict: "user_id,key" });
    }
  } catch {
    /* payload 過大或網路錯誤 */
  }
}
