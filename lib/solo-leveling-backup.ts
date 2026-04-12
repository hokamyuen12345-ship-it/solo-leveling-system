/**
 * Solo Leveling 主系統：本機 JSON 備份／還原／合併（不依賴 Supabase）
 */

export const SOLO_LEVELING_BACKUP_KIND = "solo-leveling-backup-v1" as const;
export const SOLO_LEVELING_BACKUP_SCHEMA_VERSION = 1;

/** 與主頁 localStorage 一致；含 SYNC 未涵蓋但實際會用嘅鍵 */
export const SOLO_LEVELING_STORAGE_KEYS = [
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
] as const;

export type SoloLevelingStorageKey = (typeof SOLO_LEVELING_STORAGE_KEYS)[number];

export type SoloLevelingBackupV1 = {
  kind: typeof SOLO_LEVELING_BACKUP_KIND;
  schemaVersion: number;
  exportedAt: string;
  entries: Partial<Record<SoloLevelingStorageKey, unknown>>;
};

function readParsed(key: SoloLevelingStorageKey): unknown | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return undefined;
    if (key === "slq_voice_enabled") return raw === "true";
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  } catch {
    return undefined;
  }
}

export function buildSoloLevelingBackupObject(): SoloLevelingBackupV1 {
  const entries: Partial<Record<SoloLevelingStorageKey, unknown>> = {};
  for (const key of SOLO_LEVELING_STORAGE_KEYS) {
    const v = readParsed(key);
    if (v !== undefined) entries[key] = v;
  }
  return {
    kind: SOLO_LEVELING_BACKUP_KIND,
    schemaVersion: SOLO_LEVELING_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    entries,
  };
}

export function stringifySoloLevelingBackup(): string {
  return JSON.stringify(buildSoloLevelingBackupObject(), null, 2);
}

export function parseSoloLevelingBackup(json: unknown): SoloLevelingBackupV1 | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (o.kind !== SOLO_LEVELING_BACKUP_KIND) return null;
  if (typeof o.exportedAt !== "string") return null;
  if (!o.entries || typeof o.entries !== "object") return null;
  return o as SoloLevelingBackupV1;
}

function writeStorageKey(key: SoloLevelingStorageKey, value: unknown): void {
  if (typeof window === "undefined") return;
  if (value === undefined) return;
  try {
    if (key === "slq_voice_enabled") {
      localStorage.setItem(key, value === true || value === "true" ? "true" : "false");
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

/** 遊戲日 YYYY-M-D 比較（與 getGameDayKey 格式一致） */
export function cmpGameDayKey(a: string, b: string): number {
  const pa = a.split("-").map((x) => parseInt(x, 10));
  const pb = b.split("-").map((x) => parseInt(x, 10));
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function asSlqV2(v: unknown): {
  totalExp: number;
  completed: number[];
  debuffs: number[];
  lastReset: string;
  streak: number;
  bossExpToday: number;
} | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.lastReset !== "string") return null;
  const totalExp = typeof o.totalExp === "number" ? o.totalExp : 0;
  const streak = typeof o.streak === "number" ? o.streak : 0;
  const bossExpToday = typeof o.bossExpToday === "number" ? o.bossExpToday : 0;
  const completed = Array.isArray(o.completed) ? o.completed.filter((x): x is number => typeof x === "number") : [];
  const debuffs = Array.isArray(o.debuffs) ? o.debuffs.filter((x): x is number => typeof x === "number") : [];
  return { totalExp, completed, debuffs, lastReset: o.lastReset, streak, bossExpToday };
}

function unionSortedNums(a: number[], b: number[]): number[] {
  return [...new Set([...a, ...b])].sort((x, y) => x - y);
}

function mergeSlqV2(local: unknown, incoming: unknown): unknown | undefined {
  const L = asSlqV2(local);
  const R = asSlqV2(incoming);
  if (!L && !R) return undefined;
  if (!L) return R;
  if (!R) return L;
  const day = cmpGameDayKey(L.lastReset, R.lastReset);
  if (day < 0) return { ...R };
  if (day > 0) return { ...L };
  return {
    lastReset: L.lastReset,
    totalExp: Math.max(L.totalExp, R.totalExp),
    completed: unionSortedNums(L.completed, R.completed),
    debuffs: unionSortedNums(L.debuffs, R.debuffs),
    streak: Math.max(L.streak, R.streak),
    bossExpToday: Math.max(L.bossExpToday, R.bossExpToday),
  };
}

type HistEntry = { id?: string; finishedAt?: string; [k: string]: unknown };

function mergeHistory(local: unknown, incoming: unknown): unknown {
  const L = Array.isArray(local) ? (local as HistEntry[]) : [];
  const R = Array.isArray(incoming) ? (incoming as HistEntry[]) : [];
  const byId = new Map<string, HistEntry>();
  const push = (e: HistEntry) => {
    const id = typeof e.id === "string" ? e.id : null;
    if (!id) return;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, e);
      return;
    }
    const a = typeof prev.finishedAt === "string" ? prev.finishedAt : "";
    const b = typeof e.finishedAt === "string" ? e.finishedAt : "";
    byId.set(id, b >= a ? e : prev);
  };
  for (const e of L) push(e);
  for (const e of R) push(e);
  return [...byId.values()].sort((x, y) => {
    const ax = typeof x.finishedAt === "string" ? x.finishedAt : "";
    const ay = typeof y.finishedAt === "string" ? y.finishedAt : "";
    return ax.localeCompare(ay);
  });
}

function mergeAchievements(local: unknown, incoming: unknown): unknown {
  const L = Array.isArray(local) ? local : [];
  const R = Array.isArray(incoming) ? incoming : [];
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const x of [...L, ...R]) {
    if (typeof x !== "string") continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function mergeByNumericId(local: unknown, incoming: unknown): unknown {
  const L = Array.isArray(local) ? local : [];
  const R = Array.isArray(incoming) ? incoming : [];
  const map = new Map<number, unknown>();
  for (const x of L) {
    if (!x || typeof x !== "object") continue;
    const id = (x as { id?: unknown }).id;
    if (typeof id === "number") map.set(id, x);
  }
  for (const x of R) {
    if (!x || typeof x !== "object") continue;
    const id = (x as { id?: unknown }).id;
    if (typeof id === "number") map.set(id, x);
  }
  return [...map.values()];
}

function mergeQuestOverrides(local: unknown, incoming: unknown): unknown {
  const L = local && typeof local === "object" && !Array.isArray(local) ? (local as Record<string, unknown>) : {};
  const R = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? (incoming as Record<string, unknown>) : {};
  return { ...L, ...R };
}

function mergeMeta(local: unknown, incoming: unknown): unknown {
  const L = local && typeof local === "object" && !Array.isArray(local) ? (local as Record<string, unknown>) : {};
  const R = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? (incoming as Record<string, unknown>) : {};
  const wa = (L.weekHistory && typeof L.weekHistory === "object" && !Array.isArray(L.weekHistory) ? L.weekHistory : {}) as Record<string, number>;
  const wb = (R.weekHistory && typeof R.weekHistory === "object" && !Array.isArray(R.weekHistory) ? R.weekHistory : {}) as Record<string, number>;
  const wk: Record<string, number> = { ...wa };
  for (const [d, v] of Object.entries(wb)) {
    if (typeof v !== "number") continue;
    wk[d] = Math.max(wk[d] ?? 0, v);
  }
  const out: Record<string, unknown> = { ...L, ...R, weekHistory: wk };
  if (out.randomHiddenQuest == null && R.randomHiddenQuest != null) out.randomHiddenQuest = R.randomHiddenQuest;
  return out;
}

function mergeBoss(local: unknown, incoming: unknown): unknown {
  type BossRow = { weekKey: string; boss?: unknown; completed?: boolean };
  const parse = (v: unknown): BossRow | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as { weekKey?: string; boss?: unknown; completed?: boolean };
    if (typeof o.weekKey !== "string") return null;
    return o as BossRow;
  };
  const L = parse(local);
  const R = parse(incoming);
  if (!L && !R) return undefined;
  if (!L) return incoming;
  if (!R) return local;
  if (L.weekKey.localeCompare(R.weekKey) < 0) return incoming;
  if (L.weekKey.localeCompare(R.weekKey) > 0) return local;
  if (L.completed && !R.completed) return local;
  if (!L.completed && R.completed) return incoming;
  return incoming;
}

function mergeHiddenIds(local: unknown, incoming: unknown): unknown {
  const L = Array.isArray(local) ? local.filter((x): x is number => typeof x === "number") : [];
  const R = Array.isArray(incoming) ? incoming.filter((x): x is number => typeof x === "number") : [];
  return unionSortedNums(L, R);
}

function mergeTaskSections(local: unknown, incoming: unknown): unknown {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return local ?? incoming;
  if (!local || typeof local !== "object" || Array.isArray(local)) return incoming;
  const L = local as Record<string, unknown>;
  const R = incoming as Record<string, unknown>;
  const lc = L.collapsed && typeof L.collapsed === "object" && !Array.isArray(L.collapsed) ? L.collapsed : {};
  const rc = R.collapsed && typeof R.collapsed === "object" && !Array.isArray(R.collapsed) ? R.collapsed : {};
  return {
    ...L,
    ...R,
    order: Array.isArray(R.order) ? R.order : L.order,
    collapsed: { ...lc, ...rc },
  };
}

export type MergeSoloLevelingOptions = {
  /** 合併時是否用匯入檔覆寫語音開關同頭像（預設 false：保留本機） */
  includeVoiceAndAvatar: boolean;
};

/**
 * 將備份合併入本機：同一遊戲日之 slq_v2 會合併完成任務／懲罰 id 不重複；
 * 歷史以 id 去重保留較新 finishedAt；成就聯集；自訂任務等同 id 以匯入為準。
 */
export function mergeSoloLevelingBackupIntoLocalStorage(
  backup: SoloLevelingBackupV1,
  opts: MergeSoloLevelingOptions,
): void {
  const inc = backup.entries;
  for (const key of SOLO_LEVELING_STORAGE_KEYS) {
    if (key === "slq_voice_enabled") {
      if (!opts.includeVoiceAndAvatar) continue;
      if (inc.slq_voice_enabled !== undefined) writeStorageKey(key, inc.slq_voice_enabled);
      continue;
    }
    if (key === "slq_avatar_data_url_v1") {
      if (!opts.includeVoiceAndAvatar) continue;
      if (inc.slq_avatar_data_url_v1 !== undefined) writeStorageKey(key, inc.slq_avatar_data_url_v1);
      continue;
    }
    if (inc[key] === undefined) continue;
    const cur = readParsed(key);
    let next: unknown;
    switch (key) {
      case "slq_v2":
        next = mergeSlqV2(cur, inc.slq_v2);
        break;
      case "slq_history_v1":
        next = mergeHistory(cur, inc.slq_history_v1);
        break;
      case "slq_achievements_v1":
        next = mergeAchievements(cur, inc.slq_achievements_v1);
        break;
      case "slq_custom_quests_v1":
      case "slq_top_custom_quests_v1":
      case "slq_custom_debuffs_v1":
        next = mergeByNumericId(cur, inc[key]);
        break;
      case "slq_quest_overrides_v1":
        next = mergeQuestOverrides(cur, inc.slq_quest_overrides_v1);
        break;
      case "slq_meta_v1":
        next = mergeMeta(cur, inc.slq_meta_v1);
        break;
      case "slq_boss_v1":
        next = mergeBoss(cur, inc.slq_boss_v1);
        break;
      case "slq_hidden_quest_ids_v1":
      case "slq_hidden_builtin_debuffs_v1":
        next = mergeHiddenIds(cur, inc[key]);
        break;
      case "slq_task_sections_v1":
        next = mergeTaskSections(cur, inc.slq_task_sections_v1);
        break;
      case "slq_skills_v1":
        next = inc.slq_skills_v1 ?? cur;
        break;
      default:
        next = inc[key];
    }
    if (next !== undefined) writeStorageKey(key, next);
  }
}

/** 只寫入備份檔內有嘅鍵（本機有但備份冇嘅鍵會保留） */
export function replaceSoloLevelingBackupIntoLocalStorage(backup: SoloLevelingBackupV1): void {
  for (const key of SOLO_LEVELING_STORAGE_KEYS) {
    const v = backup.entries[key];
    if (v === undefined) continue;
    writeStorageKey(key, v);
  }
}
