import { getSupabase } from "./supabase";
import { IELTS_SW_RECORDS_KEY, migrateSwRecords, type SpeakingWritingEntry } from "@/app/ielts/store";

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

function mergeSwRecords(localRaw: unknown, incomingRaw: unknown): SpeakingWritingEntry[] {
  const local = migrateSwRecords(localRaw);
  const incoming = migrateSwRecords(incomingRaw);
  const byId = new Map<string, SpeakingWritingEntry>();

  const consider = (r: SpeakingWritingEntry) => {
    const prev = byId.get(r.id);
    if (!prev) {
      byId.set(r.id, r);
      return;
    }
    const u = isoCmp(prev.updatedAt, r.updatedAt);
    if (u < 0) {
      byId.set(r.id, r);
      return;
    }
    if (u > 0) return;
    // same updatedAt day: keep the one with more content
    if (swRecordContentWeight(r) > swRecordContentWeight(prev)) byId.set(r.id, r);
  };

  local.forEach(consider);
  incoming.forEach(consider);

  return [...byId.values()].sort((a, b) => {
    const u = isoCmp(a.updatedAt, b.updatedAt);
    if (u !== 0) return -u;
    return b.createdAt.localeCompare(a.createdAt);
  });
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
  try {
    for (const key of keys) {
      const value = readLocalStorageValueForSync(key);
      if (value === null || value === undefined) continue;
      await sb.from("user_state").upsert(
        { user_id: userId, key, value, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" },
      );
    }
  } catch {
    /* payload 過大或網路錯誤 */
  }
}
