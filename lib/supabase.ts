import { createClient, type SupabaseClient as SupabaseClientType } from "@supabase/supabase-js";

export type SupabaseClient = SupabaseClientType;

function getSupabaseUrl(): string | undefined {
  if (typeof window !== "undefined") return process.env.NEXT_PUBLIC_SUPABASE_URL;
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}
function getSupabaseAnonKey(): string | undefined {
  if (typeof window !== "undefined") return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

let client: SupabaseClient | null = null;

/** Client for browser; use only in client components. Returns null if env is not set. */
export function getSupabase(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key);
  }
  return client;
}

export const SYNC_KEYS = [
  "slq_v2",
  "slq_meta_v1",
  "slq_history_v1",
  "slq_boss_v1",
  "slq_achievements_v1",
  "slq_voice_enabled",
  "slq_custom_quests_v1",
  /** Top Priority 自訂任務清單（與 slq_custom_quests_v1 分開） */
  "slq_top_custom_quests_v1",
  "slq_task_sections_v1",
  "slq_hidden_quest_ids_v1",
  /** 從 Danger Zone 隱藏的內建懲罰 id（8–12），可還原 */
  "slq_hidden_builtin_debuffs_v1",
  /** 任務名稱／EXP／時長覆寫 — 影響 Top Priority 排序與顯示，需跨裝置一致 */
  "slq_quest_overrides_v1",
  "slq_avatar_data_url_v1",
] as const;
