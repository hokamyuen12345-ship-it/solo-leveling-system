import { getSupabase } from "./supabase";

/** 寫入單筆 user_state 到 localStorage（與首頁邏輯一致） */
export function applyUserStateRowToLocalStorage(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    if (key === "slq_voice_enabled") localStorage.setItem(key, String(value));
    else localStorage.setItem(key, JSON.stringify(value));
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
