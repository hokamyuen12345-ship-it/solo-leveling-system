#!/usr/bin/env node
/**
 * 從 Supabase user_state 直接匯出（本機執行，需 service_role，唔使開瀏覽器登入）
 *
 * 用法：
 *   node scripts/export-user-state-rescue.mjs <user-uuid>
 *   node scripts/export-user-state-rescue.mjs you@gmail.com
 *
 * 環境變數（寫入 .env.local，唔好提交）：
 *   NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  （Dashboard → Project Settings → API → service_role）
 *
 * 輸出到 exports/ 目錄（已 .gitignore）：
 *   rescue-solo-leveling-<stamp>.json  → 主頁「匯入（合併去重）」
 *   rescue-ielts-<stamp>.json         → IELTS 設定頁匯入
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SOLO_LEVELING_STORAGE_KEYS = [
  "slq_v2",
  "slq_meta_v1",
  "slq_history_v1",
  "slq_boss_v1",
  "slq_achievements_v1",
  "slq_voice_enabled",
  "slq_custom_quests_v1",
  "slq_top_custom_quests_v1",
  "slq_task_sections_v1",
  "slq_hidden_quest_ids_v1",
  "slq_hidden_builtin_debuffs_v1",
  "slq_quest_overrides_v1",
  "slq_avatar_data_url_v1",
  "slq_custom_debuffs_v1",
  "slq_skills_v1",
];

const IELTS_KEY_TO_EXPORT = [
  ["ielts_settings", "settings"],
  ["ielts_custom_tasks", "scheduleOverride"],
  ["ielts_completed", "completion"],
  ["ielts_notes", "notes"],
  ["ielts_scores", "mockScores"],
  ["ielts_wrong_questions", "wrongItems"],
  ["ielts_pomodoro_session", "pomodoroSession"],
  ["ielts_flashcards_v1", "flashcards"],
  ["ielts_flashcard_review_queue_v1", "flashcardReviewQueue"],
  ["ielts_sw_records_v1", "swRecords"],
];

function loadEnvLocal() {
  try {
    const p = join(root, ".env.local");
    let raw = readFileSync(p, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim().replace(/^\uFEFF/, "");
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!k) continue;
      process.env[k] = v;
    }
  } catch {
    /* no .env.local */
  }
}

/** 只列出變數名，唔顯示值，方便對照有冇打錯字 */
function listEnvLocalKeyNames() {
  try {
    const p = join(root, ".env.local");
    let raw = readFileSync(p, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const names = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim().replace(/^\uFEFF/, "");
      if (k) names.push(k);
    }
    return names;
  } catch {
    return [];
  }
}

loadEnvLocal();

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const arg = process.argv[2];

if (!url || !serviceKey) {
  const miss = [!url && "NEXT_PUBLIC_SUPABASE_URL（或 SUPABASE_URL）", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
  console.error(`缺少：${miss.join("、")}。請喺專案根目錄 .env.local 加齊。`);
  const names = listEnvLocalKeyNames();
  if (names.length) {
    console.error(`\n而家 .env.local 偵測到嘅變數名（請確認有「SUPABASE_SERVICE_ROLE_KEY」，同埋值唔係空白）：\n  ${names.join("\n  ")}`);
  } else {
    console.error(`\n讀唔到 .env.local 入面有效嘅 KEY=值 行（檔案係咪喺專案根目錄？）\n  預期路徑: ${join(root, ".env.local")}`);
  }
  if (!serviceKey && names.some((n) => /service|role|secret/i.test(n) && n !== "SUPABASE_SERVICE_ROLE_KEY")) {
    console.error("\n提示：Supabase 後台複製嘅係 **service_role** 金鑰，變數名必須係 SUPABASE_SERVICE_ROLE_KEY（唔係 anon key）。");
  }
  process.exit(1);
}

if (!arg) {
  console.error(
    "用法: node scripts/export-user-state-rescue.mjs <user-uuid 或 email>",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resolveUserId() {
  if (arg.includes("@")) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw error;
    const u = data.users.find(
      (x) => (x.email || "").toLowerCase() === arg.toLowerCase(),
    );
    if (!u) throw new Error(`找不到 email：${arg}`);
    return u.id;
  }
  return arg;
}

async function main() {
  const userId = await resolveUserId();
  const { data: rows, error } = await supabase
    .from("user_state")
    .select("key,value")
    .eq("user_id", userId);

  if (error) throw error;

  const byKey = new Map();
  for (const r of rows || []) {
    if (r && typeof r.key === "string") byKey.set(r.key, r.value);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const soloEntries = {};
  for (const k of SOLO_LEVELING_STORAGE_KEYS) {
    if (!byKey.has(k)) continue;
    let v = byKey.get(k);
    if (k === "slq_voice_enabled") {
      soloEntries[k] = v === true || v === "true";
    } else {
      soloEntries[k] = v;
    }
  }

  const soloPayload = {
    kind: "solo-leveling-backup-v1",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    entries: soloEntries,
  };

  const ieltsPayload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
  };
  for (const [lsKey, exportKey] of IELTS_KEY_TO_EXPORT) {
    if (!byKey.has(lsKey)) continue;
    ieltsPayload[exportKey] = byKey.get(lsKey);
  }

  const outDir = join(root, "exports");
  mkdirSync(outDir, { recursive: true });
  const soloPath = join(outDir, `rescue-solo-leveling-${stamp}.json`);
  const ieltsPath = join(outDir, `rescue-ielts-${stamp}.json`);
  writeFileSync(soloPath, JSON.stringify(soloPayload, null, 2), "utf8");
  writeFileSync(ieltsPath, JSON.stringify(ieltsPayload, null, 2), "utf8");

  console.log(`user_id: ${userId}`);
  console.log(`Solo Leveling 鍵數: ${Object.keys(soloEntries).length}`);
  console.log(`IELTS 欄位數: ${IELTS_KEY_TO_EXPORT.filter(([k]) => byKey.has(k)).length}`);
  console.log(`已寫入:\n  ${soloPath}\n  ${ieltsPath}`);
  console.log(
    "\n下一步：將兩個 JSON 傳去手機 → 主頁貼上 solo 檔「匯入（合併去重）」→ IELTS 設定貼上 ielts 檔「匯入」。建議用無痕／唔登入雲端以免再卡住。",
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
