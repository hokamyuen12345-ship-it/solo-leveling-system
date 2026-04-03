/** 任務全螢幕計時改為背景執行時寫入，離開首頁（如 /ielts）仍依結束時間戳倒數 */

export const MISSION_TIMER_SESSION_KEY = "sl_mission_timer_session_v1";

/** 從 IELTS 背景條按「返回計時」：略過首頁 Boot，並使用簡潔載入 */
export const SL_SKIP_BOOT_RETURN_MISSION_TIMER_V1 = "sl_skip_boot_return_mission_timer_v1";
export const MISSION_TIMER_PENDING_EXPIRE_KEY = "sl_mission_timer_pending_expire_v1";

export type MissionTimerStoredQuest = {
  id: number;
  type: string;
  label: string;
  exp: number;
  attr: string;
  minutes: number;
  completionMode?: string;
};

export type MissionTimerSession = {
  quest: MissionTimerStoredQuest;
  endTimeMs: number;
  totalSecs: number;
};

export type MissionTimerPendingExpire = {
  quest: MissionTimerStoredQuest;
};

export function readMissionTimerSession(): MissionTimerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MISSION_TIMER_SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as MissionTimerSession;
    if (!p || typeof p.endTimeMs !== "number" || typeof p.totalSecs !== "number" || !p.quest || typeof p.quest.id !== "number") {
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function writeMissionTimerSession(s: MissionTimerSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MISSION_TIMER_SESSION_KEY, JSON.stringify(s));
  } catch {
    /* */
  }
}

export function clearMissionTimerSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MISSION_TIMER_SESSION_KEY);
  } catch {
    /* */
  }
}

export function readPendingExpire(): MissionTimerPendingExpire | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MISSION_TIMER_PENDING_EXPIRE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as MissionTimerPendingExpire;
    if (!p?.quest || typeof p.quest.id !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

export function clearPendingExpire(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MISSION_TIMER_PENDING_EXPIRE_KEY);
  } catch {
    /* */
  }
}

export function writePendingExpire(q: MissionTimerStoredQuest): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MISSION_TIMER_PENDING_EXPIRE_KEY, JSON.stringify({ quest: q }));
  } catch {
    /* */
  }
}
