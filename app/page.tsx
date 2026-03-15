"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { getSupabase, SYNC_KEYS } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// ===== 聲效系統：Cyber-Metallic / Sharp Digital (SFX Specification) =====
let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return audioCtx;
}
function useSound() {
  // 導航：Hover 15% — 極短促光感滑動音
  const playHover = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 1600; o.type = "sine";
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.04);
  }, []);
  // 導航：Click 25% — 數位敲擊 / 全息投影感
  const playClick = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.frequency.value = 320; o2.frequency.value = 640; o1.type = "square"; o2.type = "sine";
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    o1.start(ctx.currentTime); o2.start(ctx.currentTime);
    o1.stop(ctx.currentTime + 0.05); o2.stop(ctx.currentTime + 0.05);
  }, []);
  // 任務啟動 50% — 機械鎖定 + 數位蓄力上滑
  const playMissionStart = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const gMaster = ctx.createGain();
    gMaster.connect(ctx.destination);
    const lock = ctx.createOscillator();
    const gLock = ctx.createGain();
    lock.connect(gLock); gLock.connect(gMaster);
    lock.frequency.value = 80; lock.type = "sawtooth";
    gLock.gain.setValueAtTime(0, t0);
    gLock.gain.linearRampToValueAtTime(0.5, t0 + 0.03);
    gLock.gain.exponentialRampToValueAtTime(0.01, t0 + 0.12);
    lock.start(t0); lock.stop(t0 + 0.12);
    const charge = ctx.createOscillator();
    const gCharge = ctx.createGain();
    charge.connect(gCharge); gCharge.connect(gMaster);
    charge.frequency.setValueAtTime(400, t0 + 0.08);
    charge.frequency.linearRampToValueAtTime(1200, t0 + 0.22);
    charge.type = "sine";
    gCharge.gain.setValueAtTime(0, t0 + 0.08);
    gCharge.gain.linearRampToValueAtTime(0.5, t0 + 0.14);
    gCharge.gain.exponentialRampToValueAtTime(0.01, t0 + 0.28);
    charge.start(t0 + 0.08); charge.stop(t0 + 0.28);
    gMaster.gain.setValueAtTime(1, t0);
  }, []);
  // 計時器啟動 35% — 短促快門/心跳
  const playTimerInit = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 220; o.type = "sine";
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.1);
  }, []);
  // 每分鐘脈衝 10% — 深海/太空系統心跳
  const playMinuteTick = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 55; o.type = "sine";
    g.gain.setValueAtTime(0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.08);
  }, []);
  // 最後 10 秒倒數：可傳入 0–9 做漸強
  const playCountdownTick = useCallback((intensity: number = 0) => {
    const ctx = getCtx();
    if (!ctx) return;
    const gain = 0.2 + (intensity / 9) * 0.2;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 440 + intensity * 80; o.type = "square";
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.06);
  }, []);
  // 任務完成 60% — 神聖感 + 數位金幣
  const playMissionCleared = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const gMaster = ctx.createGain();
    gMaster.connect(ctx.destination);
    gMaster.gain.setValueAtTime(0.6, t0);
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(gMaster);
      o.frequency.value = freq; o.type = "sine";
      const t = t0 + i * 0.1;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      o.start(t); o.stop(t + 0.2);
    });
    const coin = ctx.createOscillator();
    const gCoin = ctx.createGain();
    coin.connect(gCoin); gCoin.connect(gMaster);
    coin.frequency.value = 2000; coin.type = "sine";
    gCoin.gain.setValueAtTime(0, t0 + 0.35);
    gCoin.gain.linearRampToValueAtTime(0.4, t0 + 0.38);
    gCoin.gain.exponentialRampToValueAtTime(0.01, t0 + 0.5);
    coin.start(t0 + 0.35); coin.stop(t0 + 0.5);
  }, []);
  // EXP 條滾動 — 快速數位計數 30%
  const playExpTick = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; o.type = "square";
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.03);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.03);
  }, []);
  // 取消/失敗 40% — 數位重低音 / Glitch
  const playCancel = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 90; o.type = "sawtooth";
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.18);
  }, []);
  // 無效點擊 (Disabled) — 低頻錯誤 25%
  const playDisabled = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 150; o.type = "square";
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.08);
  }, []);
  const playSuccess = playMissionCleared;
  const playAlert = playCancel;
  return {
    playHover, playClick, playMissionStart, playTimerInit, playMinuteTick, playCountdownTick,
    playMissionCleared, playExpTick, playCancel, playDisabled, playSuccess, playAlert,
  };
}

// ===== System Voice (TTS) — calm, authoritative, deliberate =====
const VOICE_STORAGE_KEY = "slq_voice_enabled";
function useSystemVoice() {
  const [voiceEnabled, setVoiceEnabledState] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem(VOICE_STORAGE_KEY);
      setVoiceEnabledState(v === "true");
    } catch { setVoiceEnabledState(false); }
  }, []);
  const setVoiceEnabled = useCallback((enabled: boolean) => {
    setVoiceEnabledState(enabled);
    try { localStorage.setItem(VOICE_STORAGE_KEY, String(enabled)); } catch {}
  }, []);
  const speak = useCallback((phrase: string) => {
    if (!voiceEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(phrase);
    u.rate = 0.88;
    u.pitch = 0.98;
    u.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find(v => v.lang.startsWith("en")) ?? voices[0];
    if (en) u.voice = en;
    u.lang = "en-US";
    window.speechSynthesis.speak(u);
  }, [voiceEnabled]);
  const speakSequence = useCallback((phrases: string[], delayMs: number = 420) => {
    if (!voiceEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    phrases.forEach((p, i) => {
      setTimeout(() => { if (voiceEnabled) speak(p); }, i * delayMs);
    });
  }, [voiceEnabled, speak]);
  return { speak, speakSequence, voiceEnabled, setVoiceEnabled };
}

// ===== 型別與共用工具 =====
type AttrKey = "PHY" | "INT" | "EXE" | "RES" | "SOC";
type QuestType = "daily" | "challenge" | "hidden" | "boss" | "emergency";

interface Quest {
  id: number;
  type: QuestType;
  label: string;
  exp: number;
  attr: AttrKey;
  minutes: number;
}

interface MissionHistoryEntry {
  id: string;           // unique id
  missionId: number;    // 對應 Quest id
  label: string;
  type: QuestType;
  attr: AttrKey;
  durationMin: number;
  completed: boolean;
  date: string;         // YYYY-MM-DD
  finishedAt: string;   // ISO string
  expGained: number;
}

type AchievementId =
  | "first_mission"
  | "streak_3"
  | "streak_7"
  | "streak_14"
  | "streak_30"
  | "hundred_missions";

interface Achievement {
  id: AchievementId;
  title: string;
  description: string;
  icon: string;
  rewardExp: number;
}

const HISTORY_KEY = "slq_history_v1";
const ACHIEVEMENT_KEY = "slq_achievements_v1";
const SKILL_KEY = "slq_skills_v1";
const BOSS_KEY = "slq_boss_v1";
const META_KEY = "slq_meta_v1"; // lastActivityAt, weekHistory, shadowArmy cache

const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_mission",
    title: "First Blood",
    description: "Complete your first mission.",
    icon: "🎯",
    rewardExp: 10,
  },
  {
    id: "streak_3",
    title: "Discipline Initiate",
    description: "Maintain a 3-day streak.",
    icon: "🔥",
    rewardExp: 20,
  },
  {
    id: "streak_7",
    title: "Iron Will",
    description: "Maintain a 7-day streak.",
    icon: "🛡️",
    rewardExp: 40,
  },
  {
    id: "streak_14",
    title: "Unstoppable",
    description: "Maintain a 14-day streak.",
    icon: "⚡",
    rewardExp: 80,
  },
  {
    id: "streak_30",
    title: "Unbreakable",
    description: "Maintain a 30-day streak.",
    icon: "🏆",
    rewardExp: 150,
  },
  {
    id: "hundred_missions",
    title: "Centurion",
    description: "Complete 100 missions.",
    icon: "💯",
    rewardExp: 120,
  },
];

// ===== Skill Tree =====
type SkillId = "deep_work" | "focus" | "consistency" | "reading_speed" | "knowledge_retention" | "endurance" | "strength" | "energy";
type SkillTree = "EXECUTION" | "INTELLIGENCE" | "PHYSICAL";

interface SkillDef {
  id: SkillId;
  tree: SkillTree;
  name: string;
  description: string;
  requirement: { attr?: Partial<Record<AttrKey, number>>; missionsCompleted?: number };
  expBonusPercent: number; // e.g. 10 = +10% EXP for matching quests
  appliesTo: QuestType[]; // which quest types get the bonus
}

const SKILLS: SkillDef[] = [
  { id: "deep_work", tree: "EXECUTION", name: "Deep Work", description: "EXE ≥ 20", requirement: { attr: { EXE: 20 } }, expBonusPercent: 10, appliesTo: ["challenge"] },
  { id: "focus", tree: "EXECUTION", name: "Focus", description: "Complete 15 EXE missions", requirement: { missionsCompleted: 15 }, expBonusPercent: 5, appliesTo: ["daily", "challenge"] },
  { id: "consistency", tree: "EXECUTION", name: "Consistency", description: "7-day streak", requirement: { missionsCompleted: 0 }, expBonusPercent: 10, appliesTo: ["daily"] },
  { id: "reading_speed", tree: "INTELLIGENCE", name: "Reading Speed", description: "INT ≥ 15", requirement: { attr: { INT: 15 } }, expBonusPercent: 10, appliesTo: ["daily", "challenge"] },
  { id: "knowledge_retention", tree: "INTELLIGENCE", name: "Knowledge Retention", description: "Complete 20 INT missions", requirement: { missionsCompleted: 20 }, expBonusPercent: 8, appliesTo: ["daily", "challenge"] },
  { id: "endurance", tree: "PHYSICAL", name: "Endurance", description: "PHY ≥ 20", requirement: { attr: { PHY: 20 } }, expBonusPercent: 10, appliesTo: ["daily"] },
  { id: "strength", tree: "PHYSICAL", name: "Strength", description: "Complete 15 PHY missions", requirement: { missionsCompleted: 15 }, expBonusPercent: 8, appliesTo: ["daily"] },
  { id: "energy", tree: "PHYSICAL", name: "Energy", description: "RES ≥ 15", requirement: { attr: { RES: 15 } }, expBonusPercent: 5, appliesTo: ["daily", "challenge"] },
];

function getUnlockedSkillIds(attrs: Record<AttrKey, number>, completedCountByAttr: Record<AttrKey, number>, streak: number): SkillId[] {
  const unlocked: SkillId[] = [];
  for (const s of SKILLS) {
    if (s.id === "consistency") {
      if (streak >= 7) unlocked.push(s.id);
      continue;
    }
    if (s.requirement.attr) {
      const [k, v] = Object.entries(s.requirement.attr)[0] as [AttrKey, number];
      if ((attrs[k] ?? 0) >= v) unlocked.push(s.id);
    } else if (s.requirement.missionsCompleted != null) {
      const attrForSkill: Record<SkillId, AttrKey> = {
        focus: "EXE", knowledge_retention: "INT", strength: "PHY",
        deep_work: "EXE", reading_speed: "INT", endurance: "PHY", energy: "RES", consistency: "RES",
      };
      const attr = attrForSkill[s.id];
      const n = attr ? (completedCountByAttr[attr] ?? 0) : 0;
      if (n >= s.requirement.missionsCompleted) unlocked.push(s.id);
    }
  }
  return unlocked;
}

function getSkillExpBonus(quest: { type: QuestType; attr: AttrKey }, unlockedIds: SkillId[]): number {
  let pct = 0;
  for (const id of unlockedIds) {
    const def = SKILLS.find(s => s.id === id);
    if (!def || !def.appliesTo.includes(quest.type)) continue;
    pct += def.expBonusPercent;
  }
  return pct;
}

// ===== Boss Raid =====
const BOSS_POOL: Omit<Quest, "id">[] = [
  { type: "boss", label: "地下城：永恆圖書館 — 完成一份完整學習筆記或專案進度報告", exp: 100, attr: "INT", minutes: 120 },
  { type: "boss", label: "地下城：鋼鐵意志 — 拒絕一次誘惑，堅持當下目標", exp: 50, attr: "RES", minutes: 30 },
];

function getWeekKey(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
}

function getWeeklyBoss(): Quest | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOSS_KEY);
    if (!raw) return null;
    const { weekKey, boss } = JSON.parse(raw) as { weekKey: string; boss: Quest; completed?: boolean };
    if (weekKey !== getWeekKey() || (JSON.parse(raw) as { completed?: boolean }).completed) return null;
    return boss;
  } catch {
    return null;
  }
}

function setWeeklyBoss(boss: Quest) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BOSS_KEY, JSON.stringify({ weekKey: getWeekKey(), boss, completed: false }));
  } catch {}
}

function markBossCompleted() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(BOSS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    data.completed = true;
    localStorage.setItem(BOSS_KEY, JSON.stringify(data));
  } catch {}
}

function initWeeklyBossIfNeeded(): Quest | null {
  const existing = getWeeklyBoss();
  if (existing) return existing;
  const seed = getWeekKey().split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const pick = BOSS_POOL[seed % BOSS_POOL.length];
  const boss: Quest = { ...pick, id: 200 + (seed % 100) };
  setWeeklyBoss(boss);
  return boss;
}

// ===== Emergency Quest =====
const EMERGENCY_QUESTS: Quest[] = [
  { id: 301, type: "emergency", label: "聖所恢復：整理書桌或房間地板，清除所有雜物", exp: 15, attr: "EXE", minutes: 15 },
  { id: 302, type: "emergency", label: "水分補給脈衝：今日攝取超過 2500ml 純水（記錄即完成）", exp: 10, attr: "PHY", minutes: 5 },
];
const INACTIVE_HOURS = 24;

const SHADOW_NAMES = ["兵卒", "騎士", "將軍", "統領", "君王"];

function getMeta(): {
  lastActivityAt?: string;
  weekHistory?: Record<string, number>;
  emergencyDismissedDate?: string;
  penaltyActiveSince?: string;
  recoveryDoneAt?: string;
  shadowSoldiersFromStreak?: number;
  lastStreakForShadow?: number;
  randomHiddenQuestDate?: string;
  randomHiddenQuest?: Quest;
} {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setMeta(updates: {
  lastActivityAt?: string;
  weekHistory?: Record<string, number>;
  emergencyDismissedDate?: string;
  penaltyActiveSince?: string;
  recoveryDoneAt?: string;
  shadowSoldiersFromStreak?: number;
  lastStreakForShadow?: number;
  randomHiddenQuestDate?: string;
  randomHiddenQuest?: Quest;
}) {
  if (typeof window === "undefined") return;
  try {
    const prev = getMeta();
    const next = { ...prev, ...updates };
    localStorage.setItem(META_KEY, JSON.stringify(next));
  } catch {}
}

function isEmergencyActive(): boolean {
  const meta = getMeta();
  const last = meta.lastActivityAt;
  if (!last) return true; // never done anything → show emergency once?
  const h = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60);
  return h >= INACTIVE_HOURS;
}

// ===== Shadow Army (from history: same attr 4+ per week, 2 consecutive weeks) =====
function getShadowArmyCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list: MissionHistoryEntry[] = raw ? JSON.parse(raw) : [];
    const byWeek = new Map<string, Record<AttrKey, number>>();
    for (const e of list.filter(x => x.completed)) {
      const d = new Date(e.date);
      const mon = new Date(d);
      mon.setDate(d.getDate() - d.getDay() + 1);
      const wk = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
      if (!byWeek.has(wk)) byWeek.set(wk, { PHY: 0, INT: 0, EXE: 0, RES: 0, SOC: 0 });
      byWeek.get(wk)![e.attr]++;
    }
    const weeks = Array.from(byWeek.keys()).sort();
    let soldiers = 0;
    for (let i = 1; i < weeks.length; i++) {
      const prev = byWeek.get(weeks[i - 1]) ?? { PHY: 0, INT: 0, EXE: 0, RES: 0, SOC: 0 };
      const curr = byWeek.get(weeks[i]) ?? { PHY: 0, INT: 0, EXE: 0, RES: 0, SOC: 0 };
      for (const k of ["PHY", "INT", "EXE", "RES", "SOC"] as AttrKey[]) {
        if (prev[k] >= 4 && curr[k] >= 4) soldiers++;
      }
    }
    return Math.min(soldiers, 10); // cap 10 for display
  } catch {
    return 0;
  }
}

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
}

function getCompletedCountByAttrFromHistory(): Record<AttrKey, number> {
  const out: Record<AttrKey, number> = { PHY: 0, INT: 0, EXE: 0, RES: 0, SOC: 0 };
  if (typeof window === "undefined") return out;
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list: MissionHistoryEntry[] = raw ? JSON.parse(raw) : [];
    for (const e of list.filter(x => x.completed)) {
      out[e.attr] = (out[e.attr] ?? 0) + 1;
    }
  } catch {}
  return out;
}

function appendMissionHistory(entry: MissionHistoryEntry) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list: MissionHistoryEntry[] = raw ? JSON.parse(raw) : [];
    list.push(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // 寫入失敗就略過，不影響主流程
  }
}

function getUnlockedAchievementIdsFromStorage(): AchievementId[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACHIEVEMENT_KEY);
    return raw ? (JSON.parse(raw) as AchievementId[]) : [];
  } catch {
    return [];
  }
}

function saveUnlockedAchievementIds(ids: AchievementId[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACHIEVEMENT_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function evaluateAchievements(params: { streak: number }): Achievement[] {
  if (typeof window === "undefined") return [];
  const { streak } = params;
  const unlocked = getUnlockedAchievementIdsFromStorage();
  const newly: Achievement[] = [];

  const rawHistory = localStorage.getItem(HISTORY_KEY);
  const history: MissionHistoryEntry[] = rawHistory ? JSON.parse(rawHistory) : [];
  const completedCount = history.filter(h => h.completed).length;

  const unlock = (id: AchievementId) => {
    if (!unlocked.includes(id)) {
      unlocked.push(id);
      const ach = ACHIEVEMENTS.find(a => a.id === id);
      if (ach) newly.push(ach);
    }
  };

  if (completedCount >= 1) unlock("first_mission");
  if (streak >= 3) unlock("streak_3");
  if (streak >= 7) unlock("streak_7");
  if (streak >= 14) unlock("streak_14");
  if (streak >= 30) unlock("streak_30");
  if (completedCount >= 100) unlock("hundred_missions");

  if (newly.length > 0) {
    saveUnlockedAchievementIds(unlocked);
  }

  return newly;
}

// 簡易 AI 任務生成（rule-based）
function generateDailyMissions(args: {
  streak: number;
  completedIds: number[];
  debuffIds: number[];
}) : Quest[] {
  const { streak, completedIds, debuffIds } = args;
  const result: Quest[] = [];
  let nextId = 101; // 與原本 1–7 的 QUESTS 區分

  const hasCompletedAttr = (attr: AttrKey) =>
    QUESTS.some(q => q.attr === attr && completedIds.includes(q.id));

  // 1. 如果 EXE 明顯偏弱（很少完成執行力任務），給一個 Deep Work 類型
  if (!hasCompletedAttr("EXE")) {
    result.push({
      id: nextId++,
      type: "challenge",
      label: "Deep Work 深度專注 60 分鐘",
      exp: 45,
      attr: "EXE",
      minutes: 60,
    });
  }

  // 2. 如果 PHY 沒什麼動，補一個身體任務
  if (!hasCompletedAttr("PHY")) {
    result.push({
      id: nextId++,
      type: "daily",
      label: "快走 / 慢跑 25 分鐘",
      exp: 22,
      attr: "PHY",
      minutes: 25,
    });
  }

  // 3. 如果最近很多熬夜 / 滑手機 Debuff，給一個恢復型任務
  const hasBadDebuff = debuffIds.includes(8) || debuffIds.includes(9);
  if (hasBadDebuff) {
    result.push({
      id: nextId++,
      type: "daily",
      label: "睡前 10 分鐘無螢幕＋呼吸放鬆",
      exp: 18,
      attr: "RES",
      minutes: 10,
    });
  }

  // 4. Streak 低的時候，給一個超小任務讓你「先動起來」
  if (streak === 0 && result.length === 0) {
    result.push({
      id: nextId++,
      type: "daily",
      label: "5 分鐘 Reset：整理桌面或短冥想",
      exp: 8,
      attr: "RES",
      minutes: 5,
    });
  }

  return result;
}

/* Rank colors from Solo Leveling UI Design System */
const RANK_CONFIG: Record<string, {color: string, glow: string, bg: string, next: string}> = {
  "E": { color: "var(--rank-e)", glow: "var(--rank-e-glow)", bg: "var(--bg-panel)", next: "D-RANK at Lv.11" },
  "D": { color: "var(--rank-d)", glow: "var(--rank-d-glow)", bg: "var(--bg-panel)", next: "C-RANK at Lv.21" },
  "C": { color: "var(--rank-c)", glow: "var(--rank-c-glow)", bg: "var(--bg-panel)", next: "B-RANK at Lv.36" },
  "B": { color: "var(--rank-b)", glow: "var(--rank-b-glow)", bg: "var(--bg-panel)", next: "A-RANK at Lv.51" },
  "A": { color: "var(--rank-a)", glow: "var(--rank-a-glow)", bg: "var(--bg-panel)", next: "S-RANK at Lv.71" },
  "S": { color: "var(--rank-s)", glow: "var(--rank-s-glow)", bg: "var(--bg-panel)", next: "MAX RANK" },
};

// Avatar frame & aura by rank (E: simple, B: metallic hunter, S: glowing monarch)
const RANK_AVATAR: Record<string, { frame: string; auraSize: number; auraOpacity: number; particles: boolean }> = {
  "E": { frame: "simple", auraSize: 0, auraOpacity: 0.15, particles: false },
  "D": { frame: "simple", auraSize: 4, auraOpacity: 0.2, particles: false },
  "C": { frame: "glow", auraSize: 12, auraOpacity: 0.35, particles: false },
  "B": { frame: "metallic", auraSize: 20, auraOpacity: 0.4, particles: false },
  "A": { frame: "glow", auraSize: 28, auraOpacity: 0.5, particles: false },
  "S": { frame: "monarch", auraSize: 36, auraOpacity: 0.6, particles: true },
};

const ATTRIBUTES = [
  { key: "PHY", label: "體能",   desc: "Physical",     stat: "STR" },
  { key: "INT", label: "學習",   desc: "Intelligence", stat: "INT" },
  { key: "EXE", label: "執行力", desc: "Execution",    stat: "STR" },
  { key: "RES", label: "抗壓力", desc: "Resilience",   stat: "VIT" },
  { key: "SOC", label: "社交",   desc: "Social",       stat: "AGI" },
];

const QUESTS: Quest[] = [
  { id: 1, type: "daily",     label: "基礎體能恢復：100下掌上壓、100下深蹲、100下仰臥起坐", exp: 20, attr: "PHY", minutes: 30 },
  { id: 2, type: "daily",     label: "基礎耐力訓練：戶外跑步或開合跳 5公里/500下", exp: 15, attr: "PHY", minutes: 35 },
  { id: 3, type: "daily",     label: "大腦迴路校準：閱讀固定 20 頁書籍（非螢幕閱讀）", exp: 10, attr: "INT", minutes: 25 },
  { id: 4, type: "daily",     label: "神經元冥想：閉目靜坐 10 分鐘，專注呼吸", exp: 5, attr: "RES", minutes: 10 },
  { id: 5, type: "challenge", label: "高階專注試煉：連續 60 分鐘深度工作，手機置於視線外", exp: 40, attr: "EXE", minutes: 60 },
  { id: 6, type: "challenge", label: "語言覺醒路徑：背誦並應用 10 個新單字或一句長難句", exp: 25, attr: "INT", minutes: 30 },
  { id: 7, type: "challenge", label: "主動社交偵測：與陌生人或同事進行超過 3 分鐘的有意義對話", exp: 20, attr: "SOC", minutes: 15 },
  { id: 70, type: "hidden",   label: "??? 隱藏試煉（解鎖後顯示）", exp: 30, attr: "RES", minutes: 15 },
];

const RANDOM_HIDDEN_POOL: Omit<Quest, "id">[] = [
  { type: "hidden", label: "5 分鐘內整理桌面", exp: 10, attr: "EXE", minutes: 5 },
  { type: "hidden", label: "喝水 500ml", exp: 10, attr: "PHY", minutes: 2 },
  { type: "hidden", label: "伸展 3 分鐘", exp: 10, attr: "PHY", minutes: 3 },
  { type: "hidden", label: "寫下一件感恩的事", exp: 10, attr: "RES", minutes: 5 },
  { type: "hidden", label: "回覆一則重要訊息", exp: 10, attr: "SOC", minutes: 5 },
];
const RANDOM_HIDDEN_QUEST_ID = 400;

const DEBUFFS = [
  { id: 8,  label: "【意志洩漏】精氣流失 (Willpower Dissipation)", exp: -20 },
  { id: 9,  label: "【數位成癮】過度滑動手機：非工作使用超過 2 小時", exp: -10 },
  { id: 10, label: "【夜梟懲罰】熬夜破壞作息：超過凌晨 1:00 未就寢", exp: -15 },
  { id: 11, label: "【情緒暴走】情緒失控：對他人或自己無意義憤怒", exp: -5 },
  { id: 12, label: "【影子拖延】延遲重要決策：該做的事推遲超過 3 小時", exp: -15 },
];

/* Quest type colors from Solo Leveling UI Design System */
const QUEST_TYPE_COLOR: Record<QuestType, string> = {
  daily: "var(--quest-daily)",
  challenge: "var(--quest-challenge)",
  hidden: "var(--quest-hidden)",
  boss: "var(--quest-boss)",
  emergency: "var(--quest-emergency)",
};
const QUEST_TYPE_GLOW: Record<QuestType, string> = {
  daily: "var(--quest-daily-glow)",
  challenge: "var(--quest-challenge-glow)",
  hidden: "var(--quest-hidden-glow)",
  boss: "var(--quest-boss-glow)",
  emergency: "var(--quest-emergency-glow)",
};
const AI_QUEST_COLOR = "var(--quest-ai)";
const AI_QUEST_GLOW = "var(--quest-ai-glow)";

function getTimerThemeColor(quest: Quest, aiQuestIds: number[]): { color: string; glow: string } {
  if (aiQuestIds.includes(quest.id)) return { color: AI_QUEST_COLOR, glow: AI_QUEST_GLOW };
  return { color: QUEST_TYPE_COLOR[quest.type], glow: QUEST_TYPE_GLOW[quest.type] };
}

const LEVEL_TABLE = [0,100,250,450,700,1000,1400,1900,2500,3200,4200];
const BASE_EXP = 700;
const BASE_ATTRS: Record<AttrKey,number> = { PHY:0, INT:0, EXE:0, RES:0, SOC:0 };

function getRank(lv: number) {
  if (lv >= 71) return "S";
  if (lv >= 51) return "A";
  if (lv >= 36) return "B";
  if (lv >= 21) return "C";
  if (lv >= 11) return "D";
  return "E";
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function getStreakTitle(streak: number): string {
  if (streak >= 30) return "UNBREAKABLE";
  if (streak >= 14) return "UNSTOPPABLE";
  if (streak >= 7)  return "IRON WILL";
  if (streak >= 3)  return "DISCIPLINE INITIATE";
  return "BEGINNER";
}

function getStreakColor(streak: number): string {
  if (streak >= 30) return "var(--rank-s)";
  if (streak >= 14) return "var(--accent-purple)";
  if (streak >= 7)  return "var(--accent-blue)";
  if (streak >= 3)  return "var(--accent-gold)";
  return "var(--text-muted)";
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function CountUp({ target, duration = 400, color, suffix = "" }:
  { target: number, duration?: number, color: string, suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * ease));
      if (p < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [target, duration]);
  return <span style={{ color, fontWeight: 700 }}>{display}{suffix}</span>;
}

function Particles({ color }: { color: string }) {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    size: 1 + Math.random() * 2, duration: 4 + Math.random() * 6, delay: Math.random() * 4,
  }));
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
          width: `${p.size}px`, height: `${p.size}px`,
          borderRadius: "50%", background: color, opacity: 0.4,
          animation: `float${p.id % 3} ${p.duration}s ${p.delay}s ease-in-out infinite`,
        }}/>
      ))}
    </div>
  );
}

// ===== Boot Sequence =====
function BootSequence({ onComplete, onUserGesture }: { onComplete: () => void; onUserGesture?: () => void }) {
  const [step, setStep] = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);
  const [gestureDone, setGestureDone] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 600);
    const t2 = setTimeout(() => setStep(2), 1600);
    const t3 = setTimeout(() => setStep(3), 2400);
    const progressInterval = setInterval(() => {
      setLoadProgress(p => (p >= 100 ? 100 : p + 2));
    }, 40);
    const t4 = setTimeout(() => {
      clearInterval(progressInterval);
      setLoadProgress(100);
      setStep(4);
    }, 3400);
    const t5 = setTimeout(onComplete, 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); clearInterval(progressInterval); };
  }, [onComplete]);
  const handleClick = useCallback(() => {
    if (onUserGesture && !gestureDone) {
      setGestureDone(true);
      onUserGesture();
    }
  }, [onUserGesture, gestureDone]);
  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 50%, var(--bg-primary) 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'SF Mono','Courier New',monospace",
      overflow: "hidden",
      cursor: onUserGesture && !gestureDone ? "pointer" : "default",
    }}>
      <style>{`
        @keyframes bootScan{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
        @keyframes bootFlicker{0%,100%{opacity:1}50%{opacity:0.85}}
        @keyframes bootTyping{from{width:0;opacity:1}to{width:100%;opacity:1}}
        @keyframes bootGlow{0%,100%{text-shadow:0 0 20px #0ea5e9,0 0 40px #0ea5e944}50%{text-shadow:0 0 30px #0ea5e9,0 0 60px #0ea5e966}}
      `}</style>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px",
        background: "linear-gradient(90deg, transparent, var(--accent-blue), var(--accent-blue-glow), transparent)",
        animation: "bootScan 2s linear infinite", opacity: 0.6 }} />
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "24px" }}>
        {step >= 1 && (
          <div style={{ color: "var(--accent-blue)", fontSize: "0.7rem", letterSpacing: "8px", marginBottom: "32px",
            animation: "bootFlicker 0.5s ease infinite", fontFamily: "var(--font-system)" }}>
            SYSTEM INITIALIZING
          </div>
        )}
        {step >= 2 && (
          <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", letterSpacing: "2px", marginBottom: "24px" }}>
            Scanning user data...
          </div>
        )}
        {step >= 3 && (
          <div style={{ width: "280px", marginBottom: "12px" }}>
            <div style={{ color: "var(--text-muted)", fontSize: "0.6rem", marginBottom: "8px" }}>Loading modules...</div>
            <div style={{ height: "4px", background: "var(--bg-panel)", borderRadius: "2px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${loadProgress}%`, background: "linear-gradient(90deg, var(--accent-blue), var(--accent-blue-glow))", borderRadius: "2px", transition: "width 0.05s linear", boxShadow: "var(--glow-card)" }} />
            </div>
          </div>
        )}
        {step >= 4 && (
          <div style={{ color: "var(--accent-blue-glow)", fontSize: "0.85rem", letterSpacing: "6px", marginTop: "20px", animation: "bootGlow 1.5s ease-in-out infinite", fontFamily: "var(--font-system)" }}>
            SYSTEM ONLINE
          </div>
        )}
      </div>
      {onUserGesture && !gestureDone && (
        <div style={{ position: "absolute", bottom: "32px", left: 0, right: 0, textAlign: "center", color: "var(--accent-blue)", fontSize: "0.6rem", letterSpacing: "3px", opacity: 0.9 }}>
          點擊畫面開啟 BGM
        </div>
      )}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)", backgroundSize: "24px 24px", pointerEvents: "none", opacity: 0.5 }} />
    </div>
  );
}

// ===== Background Immersion Layers (Design System) =====
function BackgroundLayers() {
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: -1, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 35%, var(--bg-primary) 70%, var(--bg-primary) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)", backgroundSize: "32px 32px", opacity: 0.4 }} />
      <div style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: 25 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute", left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
            width: "3px", height: "3px", borderRadius: "50%", background: "var(--accent-blue)",
            opacity: 0.15 + Math.random() * 0.2, animation: `float${i % 3} ${8 + Math.random() * 6}s ${Math.random() * 4}s ease-in-out infinite`,
          }} />
        ))}
        {/* 數位碎屑：緩慢上升 */}
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={`debris-${i}`} style={{
            position: "absolute", left: `${5 + Math.random() * 90}%`, bottom: "-20px",
            width: `${1 + Math.random() * 2}px`, height: `${1 + Math.random() * 2}px`,
            background: "var(--accent-blue)", borderRadius: "1px",
            opacity: 0.04, animation: `debrisUp ${18 + Math.random() * 12}s ${Math.random() * 10}s linear infinite`,
          }} />
        ))}
      </div>
      <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent, transparent 2px, var(--border-subtle) 2px, var(--border-subtle) 4px)", opacity: 0.3, animation: "scanH 8s linear infinite" }} />
    </div>
  );
}

// ===== Quest difficulty stars =====
function getQuestDifficulty(quest: Quest): number {
  const score = quest.exp / 10 + quest.minutes / 30;
  if (score <= 2) return 1;
  if (score <= 4) return 2;
  return 3;
}

// ===== Quest Card (RPG mission card) =====
function QuestCard({
  quest,
  accentColor,
  done,
  onStart,
  onUndo,
  onHoverSound,
  onClickSound,
  isAi,
  idx,
  optionalDisplayLabel,
  priority,
}: {
  quest: Quest;
  accentColor: string;
  done: boolean;
  onStart: () => void;
  onUndo: () => void;
  onHoverSound?: () => void;
  onClickSound?: () => void;
  isAi?: boolean;
  idx?: number;
  optionalDisplayLabel?: string;
  priority?: boolean;
}) {
  const stars = getQuestDifficulty(quest);
  const [hover, setHover] = useState(false);
  const displayLabel = optionalDisplayLabel ?? quest.label;
  const pad = priority ? "18px 20px" : "14px 16px";
  const labelSize = priority ? "1rem" : "0.9rem";
  return (
    <div
      onMouseEnter={() => { setHover(true); onHoverSound?.(); }}
      onMouseLeave={() => setHover(false)}
      className="task-row quest-card-shimmer"
      style={{
        padding: pad,
        marginBottom: priority ? "0" : "8px",
        borderRadius: priority ? "12px" : "10px",
        background: done ? "rgba(58,122,212,0.08)" : `rgba(255,255,255,0.02)`,
        border: `1px solid ${done ? "rgba(58,122,212,0.25)" : hover ? `${accentColor}66` : "rgba(255,255,255,0.06)"}`,
        boxShadow: hover && !done ? `0 0 24px ${accentColor}22, inset 0 0 20px ${accentColor}08` : "none",
        transform: hover && !done ? "scale(1.02)" : "scale(1)",
        transition: "all 0.25s ease",
        animation: idx != null ? "taskRowIn 0.4s ease forwards" : undefined,
        animationDelay: idx != null ? `${idx * 0.04}s` : undefined,
        opacity: idx != null ? 0 : undefined,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 流光掃描：藍光從左往右 */}
      {!done && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(90deg, transparent 0%, transparent 40%, rgba(58,122,212,0.12) 50%, transparent 60%, transparent 100%)",
          backgroundSize: "200% 100%", animation: "shimmerSweep 3s ease-in-out infinite",
        }} />
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", position: "relative", zIndex: 1 }}>
        <div style={{ flex: "1 1 200px" }}>
          <div style={{ color: done ? "#6A8AAA" : "#C8DCF0", fontSize: labelSize, fontWeight: 600, marginBottom: "6px", textDecoration: done ? "line-through" : "none" }}>
            {displayLabel}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", fontSize: "0.65rem", color: "#4A6078" }}>
            <span style={{ color: accentColor }}>Difficulty: {"★".repeat(stars)}{"☆".repeat(3 - stars)}</span>
            <span>Duration: {quest.minutes} min</span>
            <span className="font-mono-num" style={{ color: done ? "#3A5A4A" : "#2ECC71" }}>Reward: +{quest.exp} EXP</span>
          </div>
          {hover && !done && (
            <div style={{ marginTop: "6px", fontSize: "0.5rem", color: "rgba(58,122,212,0.6)", letterSpacing: "1px", fontFamily: "var(--font-system)" }}>
              LOADING_REWARD_DATA...
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {!done && (
            <button
              className="start-btn start-btn-glitch"
              onClick={() => { onClickSound?.(); onStart(); }}
              style={{
                background: `linear-gradient(135deg,${accentColor}33,${accentColor}11)`,
                border: `1px solid ${accentColor}99`,
                borderRadius: "6px",
                padding: "8px 16px",
                color: accentColor,
                fontSize: "0.7rem",
                fontWeight: "700",
                letterSpacing: "2px",
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: `0 0 12px ${accentColor}44`,
              }}
            >
              START MISSION
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const ICE_BLUE = "#00F2FF";
const CYAN_GLOW = "rgba(0, 242, 255, 0.4)";
const GOLD_RANK = "#FFD700";

function AnalyticsRadarChart({ values, colors, labels }: { values: number[]; colors: string[]; labels: string[] }) {
  const size = 200;
  const padding = 28;
  const cx = size / 2, cy = size / 2, r = 80;
  const n = values.length;
  const angles = values.map((_, i) => (i * 2 * Math.PI / n) - Math.PI / 2);
  const getPoint = (radius: number, angle: number) => ({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  const dataPoints = values.map((v, i) => getPoint((v / 100) * r, angles[i]));
  const polyPoints = dataPoints.map(p => `${p.x},${p.y}`).join(" ");
  const vbSize = size + padding * 2;
  return (
    <svg width={size} height={size} viewBox={`${-padding} ${-padding} ${vbSize} ${vbSize}`} style={{ filter: "drop-shadow(0 0 20px rgba(0,242,255,0.15))", overflow: "visible" }}>
      {[20, 40, 60, 80, 100].map(lvl => {
        const pts = angles.map(a => getPoint((lvl/100)*r, a));
        return <polygon key={lvl} points={pts.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke="rgba(0,242,255,0.08)" strokeWidth="0.8"/>;
      })}
      {angles.map((a, i) => {
        const end = getPoint(r, a);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="rgba(0,242,255,0.12)" strokeWidth="1"/>;
      })}
      <polygon points={polyPoints} fill="rgba(0,242,255,0.3)" stroke={ICE_BLUE} strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 10px rgba(0,242,255,0.5))" }}/>
      {dataPoints.map((p, i) => (
        <g key={i}>
          <rect x={p.x - 4} y={p.y - 4} width={8} height={8} rx={1} fill={colors[i]} opacity={0.9} style={{ filter: `drop-shadow(0 0 6px ${colors[i]})` }}/>
          <line x1={p.x} y1={p.y - 6} x2={p.x} y2={p.y + 6} stroke={colors[i]} strokeWidth="1"/>
          <line x1={p.x - 6} y1={p.y} x2={p.x + 6} y2={p.y} stroke={colors[i]} strokeWidth="1"/>
        </g>
      ))}
      {angles.map((a, i) => {
        const labelPt = getPoint(r + 16, a);
        return <text key={i} x={labelPt.x} y={labelPt.y} textAnchor="middle" dominantBaseline="central" fill={colors[i]} fontSize="9" fontFamily="inherit" fontWeight="600" letterSpacing="1px">{labels[i]}</text>;
      })}
    </svg>
  );
}

function AnalyticsGrowthCurve({ data, color }: { data: { label: string; exp: number }[]; color: string }) {
  const maxExp = Math.max(...data.map(d => d.exp), 1);
  const w = 640, h = 160, pad = 40;
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - ((d.exp / maxExp) * (h - pad * 2));
    return { x, y, ...d };
  });
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1].x} ${h - pad} L ${points[0].x} ${h - pad} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="analyticsGrowthGrad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0"/><stop offset="70%" stopColor={color} stopOpacity="0.3"/><stop offset="100%" stopColor={color} stopOpacity="0.5"/>
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map(pct => {
        const y = h - pad - (pct / 100) * (h - pad * 2);
        return <g key={pct}><line x1={pad} y1={y} x2={w - pad} y2={y} stroke="rgba(0,242,255,0.06)" strokeWidth="1"/><text x={pad - 8} y={y} textAnchor="end" dominantBaseline="middle" fill="rgba(0,242,255,0.35)" fontSize="8" fontFamily="inherit">{Math.round(maxExp * pct / 100)}</text></g>;
      })}
      <path d={areaD} fill="url(#analyticsGrowthGrad)"/>
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" style={{ filter: `drop-shadow(0 0 10px ${color})` }}/>
      {points.map((p, i) => (
        <g key={i}>
          <rect x={p.x - 3} y={p.y - 3} width={6} height={6} rx={1} fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }}/>
          <text x={p.x} y={p.y - 8} textAnchor="middle" fill={color} fontSize="7" fontFamily="inherit">{p.exp > 0 ? p.exp : ""}</text>
          <text x={p.x} y={h - pad + 14} textAnchor="middle" fill="rgba(0,242,255,0.5)" fontSize="7" fontFamily="inherit">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

function GlowCard({ children, color, style = {} }:
  { children: React.ReactNode, color: string, style?: React.CSSProperties }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: "var(--radius-md)", padding: "var(--card-padding)",
        background: "linear-gradient(160deg, var(--bg-panel), var(--bg-primary))",
        border: `1px solid ${hovered ? color + "66" : "var(--border-subtle)"}`,
        boxShadow: hovered ? `0 0 30px ${color}33, var(--glow-card)` : "none",
        transition: "all var(--anim-normal) ease", position: "relative", overflow: "hidden", ...style,
      }}>
      {hovered && <Particles color={color} />}
      <div style={{
        position: "absolute", top: 0, left: "-100%", right: 0, height: "1px",
        background: `linear-gradient(90deg, transparent, ${color}44, transparent)`,
        animation: hovered ? "scanCard 1.5s linear infinite" : "none",
      }}/>
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

interface TimerProps {
  quest: typeof QUESTS[0];
  rankColor: string;
  rankGlow: string;
  onComplete: () => void;
  onCancel: () => void;
  skillBonusPct?: number;
  onPlayMissionStart?: () => void;
  onPlayTimerInit?: () => void;
  onPlayMinuteTick?: () => void;
  onPlayCountdownTick?: (intensity: number) => void;
  onPlayCancel?: () => void;
  onPlayClick?: () => void;
  onTimeExpired?: () => void;
  onTenSecondsRemaining?: () => void;
}

function MissionTimer({ quest, rankColor, rankGlow, onComplete, onCancel, skillBonusPct = 0, onPlayMissionStart, onPlayTimerInit, onPlayMinuteTick, onPlayCountdownTick, onPlayCancel, onPlayClick, onTimeExpired, onTenSecondsRemaining }: TimerProps) {
  const [totalSecs, setTotalSecs] = useState(quest.minutes * 60);
  const [remaining, setRemaining] = useState(quest.minutes * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [customMin, setCustomMin] = useState(String(quest.minutes));
  const [editing, setEditing] = useState(false);
  const [showStartFlash, setShowStartFlash] = useState(false);
  const [ripple, setRipple] = useState<{ id: number; x: number; y: number; target: string } | null>(null);
  const savedRef  = useRef<number>(quest.minutes * 60);
  const endTimeRef = useRef<number>(0);
  const rafRef    = useRef<number>(0);
  const lastMinuteTick = useRef<number>(-1);
  const lastCountdownSec = useRef<number>(-1);
  const tenSecondsSpoken = useRef(false);
  const isBoss = quest.type === "boss";

  useEffect(() => {
    const t = setTimeout(() => { onPlayTimerInit?.(); }, 200);
    return () => clearTimeout(t);
  }, [onPlayTimerInit]);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const elapsedMin = Math.floor((totalSecs - remaining) / 60);
    if (elapsedMin > lastMinuteTick.current && elapsedMin > 0) {
      lastMinuteTick.current = elapsedMin;
      onPlayMinuteTick?.();
    }
    if (remaining <= 10 && remaining >= 1) {
      const sec = Math.ceil(remaining);
      if (sec !== lastCountdownSec.current) {
        lastCountdownSec.current = sec;
        onPlayCountdownTick?.(10 - sec);
        if (sec === 10 && !tenSecondsSpoken.current) {
          tenSecondsSpoken.current = true;
          onTenSecondsRemaining?.();
        }
      }
    }
  }, [running, remaining, totalSecs, onPlayMinuteTick, onPlayCountdownTick, onTenSecondsRemaining]);

  useEffect(() => {
    if (!running) { lastMinuteTick.current = -1; tenSecondsSpoken.current = false; }
    if (remaining > 10) lastCountdownSec.current = -1;
  }, [running, remaining]);

  // 用「結束時間戳」計算剩餘時間，離開分頁／關螢幕後再回來仍會顯示正確倒數並在到點時完成
  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) { onTimeExpired?.(); setFinished(true); setRunning(false); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, onTimeExpired]);

  const pct = totalSecs > 0 ? ((totalSecs - remaining) / totalSecs) * 100 : 100;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  function handleStart() {
    onPlayMissionStart?.();
    setShowStartFlash(true);
    setTimeout(() => setShowStartFlash(false), 450);
    savedRef.current = remaining;
    endTimeRef.current = Date.now() + remaining * 1000;
    setRunning(true);
  }
  function handlePause() { savedRef.current = remaining; setRunning(false); }
  function addRipple(e: React.MouseEvent<HTMLButtonElement>, target: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();
    setRipple({ id, x, y, target });
    setTimeout(() => setRipple(null), 600);
  }
  function handleApplyCustom() {
    const m = Math.max(1, Math.min(180, parseInt(customMin) || quest.minutes));
    const s = m * 60;
    setTotalSecs(s); setRemaining(s); savedRef.current = s;
    setEditing(false); setRunning(false);
  }

  const circumference = 2 * Math.PI * 100;
  const outerCircumference = 2 * Math.PI * 120;
  const dashedOffset = outerCircumference * (pct / 100);

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      background: `linear-gradient(180deg, rgba(8,6,18,0.98) 0%, rgba(4,2,14,0.99) 100%)`,
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      fontFamily:"var(--font-system)",
      overflow:"hidden",
      boxShadow: `inset 0 0 120px ${rankColor}18`,
    }}>
      {/* Theme color vignette — 所有任務類型都用該任務主色 */}
      <div style={{
        position:"absolute",inset:0,pointerEvents:"none",
        background: `radial-gradient(ellipse at center, ${rankColor}12 0%, transparent 45%, ${rankColor}18 70%, ${rankColor}12 100%)`,
      }}/>

      {/* Start flash — 用任務主色 */}
      {showStartFlash && (
        <div style={{
          position:"absolute",inset:0,zIndex:250,pointerEvents:"none",
          background: `radial-gradient(circle at center, ${rankColor}55 0%, ${rankColor}22 40%, transparent 70%)`,
          animation:"startFlash 0.45s ease-out forwards",
        }}/>
      )}

      {/* Floating particles — 任務主色 */}
      {[...Array(12)].map((_,i) => (
        <div key={i} style={{
          position:"absolute",left:`${5+Math.random()*90}%`,bottom:"-10px",
          width:"3px",height:"3px",borderRadius:"50%",background:rankColor,
          opacity:0.5,
          animation:`hudParticleFloat ${12+Math.random()*8}s linear infinite`,animationDelay:`${Math.random()*5}s`,
          boxShadow: `0 0 8px ${rankGlow}`,
        }}/>
      ))}

      {/* Corner L-brackets — 任務主色光邊 */}
      <div style={{position:"absolute",top:16,left:16,width:20,height:20,borderColor:rankColor,borderStyle:"solid",borderWidth:"2px 0 0 2px",borderRadius:"4px 0 0 0",opacity:0.6,boxShadow:`0 0 10px ${rankGlow}`}}/>
      <div style={{position:"absolute",top:16,right:16,width:20,height:20,borderColor:rankColor,borderStyle:"solid",borderWidth:"2px 2px 0 0",borderRadius:"0 4px 0 0",opacity:0.6,boxShadow:`0 0 10px ${rankGlow}`}}/>
      <div style={{position:"absolute",bottom:16,left:16,width:20,height:20,borderColor:rankColor,borderStyle:"solid",borderWidth:"0 0 2px 2px",borderRadius:"0 0 0 4px",opacity:0.6,boxShadow:`0 0 10px ${rankGlow}`}}/>
      <div style={{position:"absolute",bottom:16,right:16,width:20,height:20,borderColor:rankColor,borderStyle:"solid",borderWidth:"0 2px 2px 0",borderRadius:"0 0 4px 0",opacity:0.6,boxShadow:`0 0 10px ${rankGlow}`}}/>

      <style>{`
        @keyframes timerPulse{0%,100%{filter:drop-shadow(0 0 20px ${rankColor})}50%{filter:drop-shadow(0 0 35px ${rankColor})}}
        @keyframes timerShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-1px)}75%{transform:translateX(1px)}}
        @keyframes completePop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
        @keyframes expFly{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-120px) scale(0.5)}}
        @keyframes hudRingRotate{from{transform:rotate(-90deg)}to{transform:rotate(270deg)}}
        @keyframes hudScanline{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}
        @keyframes borderFlow{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        @keyframes hudParticleFloat{0%{opacity:0;transform:translateY(0)}10%{opacity:0.4}90%{opacity:0.2}100%{opacity:0;transform:translateY(-100vh)}}
        @keyframes startFlash{0%{opacity:1}70%{opacity:0.3}100%{opacity:0}}
        @keyframes btnGlitch{0%,100%{filter:brightness(1)}50%{filter:brightness(1.4)}}
        .hud-btn{position:relative;overflow:hidden;clip-path:polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px));}
        .hud-btn:hover{animation:btnGlitch 0.15s ease}
        .hud-btn-ripple{position:absolute;border-radius:50%;background:rgba(255,255,255,0.35);transform:translate(-50%,-50%) scale(0);animation:rippleExpand 0.6s ease-out forwards;pointer-events:none;}
        @keyframes rippleExpand{to{transform:translate(-50%,-50%) scale(4);opacity:0}}
      `}</style>

      {!finished ? (
        <>
          {/* 標題：固定於上方 */}
          <div style={{
            position:"absolute",top:"24px",left:0,right:0,textAlign:"center",zIndex:1,
          }}>
            <div style={{color:rankColor,fontSize:"0.6rem",letterSpacing:"4px",marginBottom:"10px",opacity:0.95,textShadow:`0 0 12px ${rankGlow}`}}>
              &lt;&lt;&lt; MISSION IN PROGRESS &gt;&gt;&gt;
            </div>
            <div style={{color:"#E2E8F0",fontSize:"1.05rem",fontWeight:"800",letterSpacing:"3px",
              textAlign:"center",maxWidth:"320px",margin:"0 auto",textShadow:`0 0 24px ${rankColor}, 0 0 48px ${rankGlow}88`}}>
              {quest.label}
            </div>
          </div>
          {/* 計時器圓盤：絕對定位於視窗正中央 */}
          <div style={{
            position:"absolute",top:"50%",left:"50%",
            transform:"translate(-50%, -50%)",
            width:"260px",height:"260px",
            margin:0,
            pointerEvents:"none",
          }}>
            <div style={{position:"relative",width:"100%",height:"100%",margin:0}}>
            {/* Radial glow behind timer */}
            <div style={{
              position:"absolute",inset:"-30px",borderRadius:"50%",
              background:`radial-gradient(circle at center, ${rankColor}18 0%, ${rankColor}06 40%, transparent 70%)`,
              pointerEvents:"none",
            }}/>
            {/* Outer dashed ring (depletes with time) — 對齊容器中心 */}
            <svg width="260" height="260" style={{position:"absolute",top:0,left:0}}>
              <circle cx="130" cy="130" r="120" fill="none" stroke={rankColor} strokeWidth="1.5"
                strokeDasharray="6 12" strokeLinecap="round"
                strokeDashoffset={dashedOffset}
                style={{transform:"rotate(-90deg)",transformOrigin:"130px 130px",transition:"stroke-dashoffset 0.5s ease",opacity:0.8,filter:`drop-shadow(0 0 6px ${rankGlow})`}}/>
            </svg>
            {/* 外圈旋轉光點 — 任務主色 */}
            <div style={{position:"absolute",inset:0,animation:"hudRingRotate 16s linear infinite"}}>
              {[...Array(24)].map((_,i) => (
                <div key={i} style={{
                  position:"absolute",left:"50%",top:"50%",
                  width:"4px",height:"4px",borderRadius:"50%",background:rankColor,
                  boxShadow: `0 0 8px ${rankGlow}, 0 0 12px ${rankColor}`,
                  transform: `rotate(${i * 15}deg) translateY(-120px)`,
                }}/>
              ))}
            </div>
            <div style={{position:"absolute",width:"220px",height:"220px",top:"20px",left:"20px"}}>
              {/* Inner thin rotating ring */}
              <div style={{position:"absolute",inset:"-8px",borderRadius:"50%",
                border:`1px solid ${rankColor}44`,
                animation:running ? "hudRingRotate 8s linear infinite" : "none"}}/>
              <svg width="220" height="220" style={{position:"absolute",top:0,left:0}}>
                <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8"/>
                <circle cx="110" cy="110" r="100" fill="none" stroke={rankColor} strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - pct / 100)}
                  strokeLinecap="round"
                  style={{transform:"rotate(-90deg)",transformOrigin:"110px 110px",
                    transition:"stroke-dashoffset 0.5s ease",
                    filter:`drop-shadow(0 0 12px ${rankColor})`}}/>
              </svg>
              {/* Glassmorphism + scanline inside ring */}
              <div style={{
                position:"absolute",inset:"10px",borderRadius:"50%",
                background:"rgba(255,255,255,0.03)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
                border:"1px solid rgba(255,255,255,0.06)",overflow:"hidden",
              }}>
                <div style={{
                  position:"absolute",inset:0,
                  background:"repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px)",
                  animation:"hudScanline 4s linear infinite",pointerEvents:"none",
                }}/>
              </div>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <div style={{
                  color:rankColor,fontSize:"3.5rem",fontWeight:"800",lineHeight:1,
                  textShadow:`0 0 20px ${rankColor}, 0 0 40px ${rankColor}88, 0 0 60px ${rankGlow}`,
                  animation: running ? (isBoss ? "timerPulse 1.5s ease-in-out infinite, timerShake 0.2s ease-in-out infinite" : "timerPulse 2s ease-in-out infinite") : "none",
                }}>
                  {pad(mins)}:{pad(secs)}
                </div>
                <div style={{color:"#64748b",fontSize:"0.5rem",letterSpacing:"4px",marginTop:"10px",fontWeight:400}}>
                  {running?"RUNNING":remaining===totalSecs?"READY":"PAUSED"}
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* 編輯、按鈕、獎勵：固定於下方 */}
          <div style={{
            position:"absolute",bottom:"24px",left:0,right:0,
            display:"flex",flexDirection:"column",alignItems:"center",zIndex:1,
          }}>
          {!running && (
            <div style={{marginBottom:"24px",display:"flex",alignItems:"center",gap:"8px",justifyContent:"center"}}>
              {editing ? (
                <>
                  <input type="number" min="1" max="180" value={customMin}
                    onChange={e=>setCustomMin(e.target.value)}
                    style={{background:`${rankColor}15`,border:`1px solid ${rankColor}66`,
                      borderRadius:"4px",padding:"4px 10px",color:rankColor,
                      fontFamily:"inherit",fontSize:"0.8rem",width:"70px",textAlign:"center"}}/>
                  <span style={{color:rankColor,fontSize:"0.7rem",opacity:0.9}}>分鐘</span>
                  <button onClick={()=>{ onPlayClick?.(); handleApplyCustom(); }} style={{
                    background:`${rankColor}25`,border:`1px solid ${rankColor}88`,
                    borderRadius:"4px",padding:"4px 12px",color:rankColor,
                    fontSize:"0.65rem",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>確認</button>
                </>
              ) : (
                <button onClick={()=>{ onPlayClick?.(); setEditing(true); }} style={{
                  background:"transparent",border:`1px solid ${rankColor}44`,
                  borderRadius:"4px",padding:"4px 14px",color:rankColor,
                  fontSize:"0.6rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:"1px",opacity:0.9}}>
                  ✏️ 修改時間（預設 {quest.minutes} 分鐘）
                </button>
              )}
            </div>
          )}

          <div style={{display:"flex",gap:"16px",flexWrap:"wrap",justifyContent:"center"}}>
            {!running ? (
              <button
                className="hud-btn"
                onClick={(e)=>{ addRipple(e,"start"); handleStart(); }}
                style={{
                  background:`linear-gradient(135deg,${rankColor}44,${rankColor}18)`,
                  border:`2px solid ${rankColor}`,padding:"14px 44px",color:rankColor,fontSize:"0.8rem",
                  fontWeight:"800",letterSpacing:"4px",cursor:"pointer",fontFamily:"inherit",
                  boxShadow:`0 0 20px ${rankColor}, 0 0 40px ${rankGlow}88, inset 0 1px 0 rgba(255,255,255,0.15)`,
                  transition:"all 0.2s",textShadow: `0 0 12px ${rankGlow}`,
                }}>
                {ripple?.target==="start"&&<span key={ripple.id} className="hud-btn-ripple" style={{left:ripple.x,top:ripple.y,width:20,height:20}}/>}
                {remaining===totalSecs ? "► START MISSION" : "► RESUME"}
              </button>
            ) : (
              <button className="hud-btn" onClick={(e)=>{ addRipple(e,"pause"); handlePause(); }} style={{
                background:`linear-gradient(135deg,${rankColor}35,${rankColor}12)`,
                border:`2px solid ${rankColor}99`,padding:"14px 44px",color:rankColor,fontSize:"0.8rem",
                fontWeight:"800",letterSpacing:"4px",cursor:"pointer",fontFamily:"inherit",
                boxShadow:`0 0 20px ${rankColor}, 0 0 40px ${rankGlow}66`,transition:"all 0.2s",textShadow: `0 0 10px ${rankGlow}`,
              }}>
                {ripple?.target==="pause"&&<span key={ripple.id} className="hud-btn-ripple" style={{left:ripple.x,top:ripple.y,width:20,height:20}}/>}
                ⏸ PAUSE
              </button>
            )}
            <button className="hud-btn" onClick={(e)=>{ addRipple(e,"cancel"); onPlayCancel?.(); onCancel(); }} style={{
              background:"rgba(231,76,60,0.15)",border:"2px solid rgba(231,76,60,0.7)",
              padding:"14px 28px",color:"#FF6B6E",fontSize:"0.8rem",
              letterSpacing:"3px",cursor:"pointer",fontFamily:"inherit",fontWeight:"700",
              boxShadow:"0 0 16px rgba(231,76,60,0.4)",textShadow:"0 0 8px rgba(255,107,110,0.8)",
            }}>
              {ripple?.target==="cancel"&&<span key={ripple.id} className="hud-btn-ripple" style={{left:ripple.x,top:ripple.y,width:20,height:20}}/>}
              ✕ CANCEL
            </button>
          </div>

          <div style={{marginTop:"28px",color:"#64748b",fontSize:"0.55rem",letterSpacing:"3px",fontWeight:400,textAlign:"center"}}>
            REWARD: <span style={{color:rankColor,fontWeight:600,textShadow:`0 0 10px ${rankGlow}`}}>+{quest.exp} pt</span>
            &nbsp;·&nbsp;<span style={{color:rankColor,opacity:0.9,textShadow:`0 0 8px ${rankGlow}`}}>{quest.attr} +3</span>
          </div>
          </div>
        </>
      ) : (
        <div style={{textAlign:"center",animation:"completePop 0.6s ease forwards"}}>
          {[...Array(12)].map((_,i) => (
            <div key={i} style={{
              position:"absolute",left:`${30+Math.random()*40}%`,top:`${30+Math.random()*40}%`,
              color:"#2ECC71",fontSize:`${0.8+Math.random()*0.8}rem`,fontWeight:"700",
              animation:"expFly 1.5s ease forwards",animationDelay:`${Math.random()*0.8}s`,
              pointerEvents:"none",
            }}>+EXP</div>
          ))}
          <div style={{fontSize:"0.65rem",color:rankColor,letterSpacing:"6px",marginBottom:"24px",fontWeight:400}}>
            ── SYSTEM MESSAGE ──
          </div>
          <div style={{fontSize:"2.5rem",fontWeight:"800",color:rankColor,
            textShadow:`0 0 40px ${rankColor}, 0 0 80px ${rankGlow}`,
            letterSpacing:"4px",marginBottom:"16px"}}>
            {quest.type === "boss" ? "BOSS DEFEATED" : "MISSION COMPLETE"}
          </div>
          <div style={{fontSize:"1rem",color:"#94A3B8",marginBottom:"8px",letterSpacing:"2px",fontWeight:400}}>
            {quest.label}
          </div>
          <div style={{display:"flex",gap:"24px",justifyContent:"center",
            marginBottom:"40px",marginTop:"16px",flexWrap:"wrap"}}>
            <div style={{textAlign:"center"}}>
              <div style={{color:rankColor,fontSize:"1.5rem",fontWeight:"800"}}>
                +{quest.type === "boss" ? quest.exp : Math.round(quest.exp * (1 + skillBonusPct / 100))}
              </div>
              <div style={{color:"#64748b",fontSize:"0.55rem",letterSpacing:"2px"}}>pt</div>
              {skillBonusPct > 0 && quest.type !== "boss" && (
                <div style={{color:rankColor,fontSize:"0.5rem",marginTop:"2px",opacity:0.8}}>+{skillBonusPct}% from skills</div>
              )}
            </div>
            {quest.type !== "boss" && (
              <>
                <div style={{width:"1px",background:"rgba(255,255,255,0.1)"}}/>
                <div style={{textAlign:"center"}}>
                  <div style={{color:rankColor,fontSize:"1.5rem",fontWeight:"800"}}>+3</div>
                  <div style={{color:"#64748b",fontSize:"0.55rem",letterSpacing:"2px"}}>{quest.attr}</div>
                </div>
              </>
            )}
          </div>
          <button className="hud-btn" onClick={(e)=>{ addRipple(e,"claim"); onPlayClick?.(); onComplete(); }} style={{
            background:`linear-gradient(135deg,${rankColor}4D,${rankColor}1A)`,
            border:`1px solid ${rankColor}`,padding:"14px 48px",
            color:rankColor,fontSize:"0.8rem",fontWeight:"800",letterSpacing:"4px",
            cursor:"pointer",fontFamily:"inherit",boxShadow:`0 0 24px ${rankColor}66`}}>
            {ripple?.target==="claim"&&<span key={ripple.id} className="hud-btn-ripple" style={{left:ripple.x,top:ripple.y,width:20,height:20}}/>}
            {quest.type === "boss" ? "CLAIM REWARD · DEFEAT" : "CLAIM REWARD"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [completed, setCompleted] = useState<number[]>([]);
  const [debuffs,   setDebuffs]   = useState<number[]>([]);
  const [totalExp,  setTotalExp]  = useState(BASE_EXP);
  const [streak,    setStreak]    = useState(0);
  const [tab, setTab]             = useState<"tasks"|"summary"|"analytics">("tasks");
  const [expRange, setExpRange]   = useState<"7"|"14"|"30">("14");
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [loaded, setLoaded]       = useState(false);
  const [syncStatus, setSyncStatus] = useState<"pending" | "local" | "synced">("pending");
  const [user, setUser]           = useState<User | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTimer, setActiveTimer] = useState<typeof QUESTS[0] | null>(null);
  const [aiQuests, setAiQuests] = useState<Quest[]>([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState<AchievementId[]>([]);
  const [justUnlocked, setJustUnlocked] = useState<Achievement | null>(null);
  const [weeklyBoss, setWeeklyBoss] = useState<Quest | null>(null);
  const [bossExpToday, setBossExpToday] = useState(0);
  const [showBossDefeated, setShowBossDefeated] = useState(false);
  const [emergencyActive, setEmergencyActive] = useState(false);
  const [emergencyDismissedForToday, setEmergencyDismissedForToday] = useState(false);
  const [bootComplete, setBootComplete] = useState(false);
  const [authPortalReady, setAuthPortalReady] = useState(false);
  const authAnchorRef = useRef<HTMLDivElement | null>(null);
  const [showRankUp, setShowRankUp] = useState(false);
  const [prevRank, setPrevRank] = useState<string | null>(null);
  const [systemAlert, setSystemAlert] = useState<{ id: string; title: string; message: string } | null>(null);
  const [floatingExp, setFloatingExp] = useState<{ value: number; key: number } | null>(null);
  const [missionCompleteEffect, setMissionCompleteEffect] = useState<{ exp: number; questLabel: string; questId?: number } | null>(null);
  const [systemHud, setSystemHud] = useState<{ id: string; title: string; subtitle: string } | null>(null);
  const [justUnlockedSkillId, setJustUnlockedSkillId] = useState<SkillId | null>(null);
  const prevUnlockedSkillIdsRef = useRef<SkillId[]>([]);
  const [commandAccepted, setCommandAccepted] = useState(false);
  const [penaltyModeActive, setPenaltyModeActive] = useState(false);
  const [penaltyShakeDone, setPenaltyShakeDone] = useState(false);
  const [showArise, setShowArise] = useState(false);
  const [shadowSoldiersFromStreak, setShadowSoldiersFromStreak] = useState(0);
  const [dailyRandomHiddenQuest, setDailyRandomHiddenQuest] = useState<Quest | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const bgmFadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const emergencyVoiceSpoken = useRef(false);
  const sound = useSound();
  const systemVoice = useSystemVoice();

  const fadeOutBgm = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (bgmFadeIntervalRef.current) clearInterval(bgmFadeIntervalRef.current);
    const startVol = 0.25;
    const steps = 50;
    const stepMs = 40;
    let step = 0;
    bgmFadeIntervalRef.current = setInterval(() => {
      step++;
      const vol = Math.max(0, startVol - (startVol * step) / steps);
      a.volume = vol;
      if (step >= steps) {
        if (bgmFadeIntervalRef.current) clearInterval(bgmFadeIntervalRef.current);
        bgmFadeIntervalRef.current = null;
      }
    }, stepMs);
  }, []);
  const restoreBgmVolume = useCallback(() => {
    if (bgmFadeIntervalRef.current) {
      clearInterval(bgmFadeIntervalRef.current);
      bgmFadeIntervalRef.current = null;
    }
    const a = audioRef.current;
    if (a) a.volume = 0.25;
  }, []);
  const restoreBgmVolumeRef = useRef(restoreBgmVolume);
  restoreBgmVolumeRef.current = restoreBgmVolume;
  const [timeTick, setTimeTick] = useState(0);
  const systemMessageFromState = useMemo(() => {
    const completedDaily = completed.filter(id => QUESTS.some(q => q.id === id)).length;
    const totalDaily = QUESTS.length;
    const rate = totalDaily > 0 ? completedDaily / totalDaily : 0;
    const now = new Date();
    const hoursLeft = 23 - now.getHours() + (59 - now.getMinutes()) / 60;
    if (hoursLeft <= 2 && rate < 1) {
      const h = Math.max(0, Math.floor(hoursLeft));
      return `[SYSTEM] 距離今日結算僅剩 ${h} 小時，請加速執行。`;
    }
    if (rate >= 1) return "[SYSTEM] 你正在超越極限。";
    if (rate >= 0.7) return "[SYSTEM] 穩定成長中，繼續保持。";
    if (rate < 0.3 && totalDaily > 0) return "[SYSTEM] 檢測到怠惰情緒，警告：弱者將被淘汰。";
    return "[NOTICE] 今天的目標是突破極限。";
  }, [completed, timeTick]);
  useEffect(() => {
    const t = setInterval(() => setTimeTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!penaltyModeActive || penaltyShakeDone) return;
    sound.playAlert();
    systemVoice.speak("SYSTEM ALERT");
    setPenaltyShakeDone(true);
  }, [penaltyModeActive, penaltyShakeDone, sound, systemVoice.speak]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).closest("input, textarea")) return;
      if (e.code === "Escape" && activeTimer) {
        sound.playCancel();
        systemVoice.speak("MISSION CANCELED");
        restoreBgmVolumeRef.current();
        setActiveTimer(null);
        setCommandAccepted(true);
        setTimeout(() => setCommandAccepted(false), 1500);
      }
      if (e.code === "Space") {
        e.preventDefault();
        const firstUnfinished = QUESTS.find(q => !completed.includes(q.id));
        if (firstUnfinished && !activeTimer) {
          sound.playClick();
          toggle(firstUnfinished.id);
          setCommandAccepted(true);
          setTimeout(() => setCommandAccepted(false), 1500);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTimer, completed, sound, systemVoice.speak]);

  useEffect(() => {
    if (!missionCompleteEffect) return;
    const ids: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push(setTimeout(() => { sound.playExpTick(); }, i * 55));
    }
    return () => ids.forEach(clearTimeout);
  }, [missionCompleteEffect, sound]);

  useEffect(() => {
    if (!systemHud) return;
    const t = setTimeout(() => setSystemHud(null), 2700);
    return () => clearTimeout(t);
  }, [systemHud]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = 0.25;
    a.play().then(() => setIsPlaying(true)).catch(() => {});
  }, []);

  useEffect(() => {
    const el = document.createElement("div");
    el.id = "auth-fixed-anchor";
    el.style.cssText = "position:fixed !important; top:0 !important; right:0 !important; left:auto !important; bottom:auto !important; z-index:9999 !important; transform:none !important; pointer-events:auto;";
    document.body.appendChild(el);
    authAnchorRef.current = el;
    setAuthPortalReady(true);
    return () => {
      if (authAnchorRef.current && authAnchorRef.current.parentNode) authAnchorRef.current.parentNode.removeChild(authAnchorRef.current);
      authAnchorRef.current = null;
    };
  }, []);

  // Auth + cloud sync: resolve session and optionally hydrate from Supabase before init
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setSyncStatus("local");
      return;
    }
    const resolve = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (!session) {
        setSyncStatus("local");
        return;
      }
      setSyncStatus("pending");
      try {
        const { data: rows } = await supabase.from("user_state").select("key, value").eq("user_id", session.user.id);
        if (rows?.length) {
          for (const row of rows) {
            const key = row.key as string;
            const val = row.value;
            if (typeof key === "string" && val !== undefined) {
              try {
                if (key === "slq_voice_enabled") localStorage.setItem(key, String(val));
                else localStorage.setItem(key, JSON.stringify(val));
              } catch {}
            }
          }
        }
      } catch {
        // keep local data
      }
      setSyncStatus("synced");
    };
    resolve();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) setSyncStatus("local");
      else resolve();
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (syncStatus === "pending" || hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    const today = getToday();
    const yesterday = getYesterday();
    const saved = localStorage.getItem("slq_v2");
    if (saved) {
      const d = JSON.parse(saved);
      const savedTotal   = d.totalExp   ?? BASE_EXP;
      const savedStreak  = d.streak     ?? 0;
      const savedLast    = d.lastReset  ?? "";
      const savedComp    = d.completed  ?? [];
      if (d.lastReset !== today) {
        // New day: check yesterday's completion rate for penalty
        const totalDaily = QUESTS.length;
        const rate = totalDaily > 0 ? savedComp.length / totalDaily : 1;
        if (savedLast === yesterday && rate < 0.5) {
          setMeta({ ...getMeta(), penaltyActiveSince: today });
        }
        setTotalExp(savedTotal);
        setCompleted([]);
        setDebuffs([]);
        setBossExpToday(0);
        setTimeout(() => { try { if (localStorage.getItem(VOICE_STORAGE_KEY) === "true") systemVoice.speak("NEW DAY INITIALIZED"); } catch {} }, 600);
        if (savedLast === yesterday && savedComp.length > 0) setStreak(savedStreak);
        else {
          setStreak(0);
          const m = getMeta();
          const prev = m.shadowSoldiersFromStreak ?? 0;
          if (prev > 0 && savedStreak > 0) {
            setMeta({ ...m, shadowSoldiersFromStreak: prev - 1 });
            setShadowSoldiersFromStreak(prev - 1);
          }
        }
      } else {
        setTotalExp(savedTotal);
        setCompleted(savedComp);
        setDebuffs(d.debuffs ?? []);
        setStreak(savedStreak);
        setBossExpToday(d.bossExpToday ?? 0);
      }
    }
    setUnlockedAchievements(getUnlockedAchievementIdsFromStorage());
    setWeeklyBoss(initWeeklyBossIfNeeded());
    setEmergencyActive(isEmergencyActive());
    setEmergencyDismissedForToday(getMeta().emergencyDismissedDate === getToday());
    const meta = getMeta();
    setPenaltyModeActive(meta.penaltyActiveSince === today && meta.recoveryDoneAt !== today);
    setShadowSoldiersFromStreak(meta.shadowSoldiersFromStreak ?? 0);
    if (meta.randomHiddenQuestDate === today && meta.randomHiddenQuest) {
      setDailyRandomHiddenQuest(meta.randomHiddenQuest);
    } else {
      const savedData = saved ? JSON.parse(saved) as { lastReset?: string } : null;
      const isNewDay = !savedData || savedData.lastReset !== today;
      if (isNewDay && Math.random() < 0.1) {
        const pick = RANDOM_HIDDEN_POOL[Math.floor(Math.random() * RANDOM_HIDDEN_POOL.length)];
        const quest: Quest = { ...pick, id: RANDOM_HIDDEN_QUEST_ID };
        setMeta({ ...getMeta(), randomHiddenQuestDate: today, randomHiddenQuest: quest });
        setDailyRandomHiddenQuest(quest);
      } else {
        setDailyRandomHiddenQuest(null);
      }
    }
    setLoaded(true);
  }, [syncStatus]);

  useEffect(() => {
    if (!emergencyDismissedForToday) return;
    emergencyVoiceSpoken.current = false;
  }, [emergencyDismissedForToday]);
  useEffect(() => {
    if (!loaded || !emergencyActive || emergencyDismissedForToday || emergencyVoiceSpoken.current) return;
    systemVoice.speak("EMERGENCY QUEST DETECTED");
    emergencyVoiceSpoken.current = true;
  }, [loaded, emergencyActive, emergencyDismissedForToday, systemVoice]);

  const completedByAttr = useMemo(() => getCompletedCountByAttrFromHistory(), [completed, streak]);
  const attrsForSkill = useMemo(() => Object.fromEntries(
    (["PHY","INT","EXE","RES","SOC"] as AttrKey[]).map(k => [k, (completedByAttr[k] ?? 0) * 3])
  ) as Record<AttrKey, number>, [completedByAttr]);
  const unlockedSkillIds = useMemo(() => getUnlockedSkillIds(attrsForSkill, completedByAttr, streak), [attrsForSkill, completedByAttr, streak]);
  const skillBonus = useMemo(() => (q: Quest) => Math.round(q.exp * (1 + getSkillExpBonus(q, unlockedSkillIds) / 100)), [unlockedSkillIds]);
  const shadowArmyCount = useMemo(() => getShadowArmyCount(), [completed]);

  useEffect(() => {
    const prev = prevUnlockedSkillIdsRef.current;
    const added = unlockedSkillIds.find(id => !prev.includes(id));
    if (added && prev.length > 0) {
      const skill = SKILLS.find(s => s.id === added);
      if (skill) {
        setJustUnlockedSkillId(skill.id);
        setSystemHud({ id: `skill-${skill.id}`, title: "SKILL UNLOCKED", subtitle: `${skill.name} +${skill.expBonusPercent}% EXP` });
        setTimeout(() => setJustUnlockedSkillId(null), 3000);
      }
    }
    prevUnlockedSkillIdsRef.current = [...unlockedSkillIds];
  }, [unlockedSkillIds]);

  useEffect(() => {
    if (!loaded) return;
    const today = getToday();
    const todayGain =
      QUESTS.filter(q=>completed.includes(q.id)).reduce((s,q)=>s+skillBonus(q),0)
      + (dailyRandomHiddenQuest && completed.includes(dailyRandomHiddenQuest.id) ? dailyRandomHiddenQuest.exp : 0)
      + aiQuests.filter(q=>completed.includes(q.id)).reduce((s,q)=>s+skillBonus(q),0)
      + EMERGENCY_QUESTS.filter(q=>completed.includes(q.id)).reduce((s,q)=>s+q.exp,0)
      + bossExpToday
      + DEBUFFS.filter(d=>debuffs.includes(d.id)).reduce((s,d)=>s+d.exp,0);
    const newTotal = Math.max(0, BASE_EXP + todayGain);
    setTotalExp(newTotal);
    const newStreak = completed.length > 0 ? Math.max(streak, 1) : streak;
    localStorage.setItem("slq_v2", JSON.stringify({
      totalExp: newTotal, completed, debuffs, lastReset: today, streak: newStreak, bossExpToday,
    }));
    const sb = getSupabase();
    if (user && sb) {
      (async () => {
        try {
          for (const key of SYNC_KEYS) {
            const raw = localStorage.getItem(key);
            const value = key === "slq_voice_enabled" ? (raw === "true") : (raw ? JSON.parse(raw) : null);
            if (value !== null && value !== undefined) {
              await sb.from("user_state").upsert(
                { user_id: user.id, key, value, updated_at: new Date().toISOString() },
                { onConflict: "user_id,key" }
              );
            }
          }
        } catch {}
      })();
    }
    const meta = getMeta();
    setMeta({ ...meta, weekHistory: { ...(meta.weekHistory ?? {}), [today]: todayGain } });
    // Shadow Extraction: streak hits multiple of 7
    if (newStreak > 0 && newStreak % 7 === 0 && newStreak > (meta.lastStreakForShadow ?? 0)) {
      const newCount = (meta.shadowSoldiersFromStreak ?? 0) + 1;
      setMeta({ ...meta, shadowSoldiersFromStreak: newCount, lastStreakForShadow: newStreak });
      setShadowSoldiersFromStreak(newCount);
      setShowArise(true);
      sound.playSuccess();
      setTimeout(() => setShowArise(false), 3500);
    }
  }, [completed, debuffs, loaded, bossExpToday, streak, sound, dailyRandomHiddenQuest, user]);

  // Periodic sync to Supabase when logged in (catches meta, history, boss, achievements, voice)
  useEffect(() => {
    if (!loaded || !user) return;
    const sb = getSupabase();
    if (!sb) return;
    const sync = async () => {
      try {
        for (const key of SYNC_KEYS) {
          const raw = localStorage.getItem(key);
          const value = key === "slq_voice_enabled" ? (raw === "true") : (raw ? JSON.parse(raw) : null);
          if (value !== null && value !== undefined) {
            await sb.from("user_state").upsert(
              { user_id: user.id, key, value, updated_at: new Date().toISOString() },
              { onConflict: "user_id,key" }
            );
          }
        }
      } catch {}
    };
    const id = setInterval(sync, 5000);
    return () => clearInterval(id);
  }, [loaded, user]);

  // 依照目前狀態，每次載入 / 狀態變化時重新計算 AI 建議任務
  const prevAiLen = useRef(0);
  useEffect(() => {
    if (!loaded) return;
    const missions = generateDailyMissions({
      streak,
      completedIds: completed,
      debuffIds: debuffs,
    });
    if (missions.length > prevAiLen.current && prevAiLen.current > 0) {
      setSystemAlert({ id: String(Date.now()), title: "NEW QUEST GENERATED", message: "AI System has suggested new missions." });
      systemVoice.speak("NEW QUEST GENERATED");
      setTimeout(() => setSystemAlert(null), 4000);
    }
    prevAiLen.current = missions.length;
    setAiQuests(missions);
  }, [loaded, streak, completed, debuffs]);

  const todayExp =
    QUESTS.filter(q=>completed.includes(q.id)).reduce((s,q)=>s+skillBonus(q),0)
    + (dailyRandomHiddenQuest && completed.includes(dailyRandomHiddenQuest.id) ? dailyRandomHiddenQuest.exp : 0)
    + aiQuests.filter(q=>completed.includes(q.id)).reduce((s,q)=>s+skillBonus(q),0)
    + EMERGENCY_QUESTS.filter(q=>completed.includes(q.id)).reduce((s,q)=>s+q.exp,0)
    + bossExpToday
    + DEBUFFS.filter(d=>debuffs.includes(d.id)).reduce((s,d)=>s+d.exp,0);
  const currentExp = Math.max(0, BASE_EXP + todayExp);
  const level = LEVEL_TABLE.reduce((lv,req,i) => currentExp>=req ? i+1 : lv, 1);
  const lvExp   = LEVEL_TABLE[level-1] ?? 0;
  const nextExp = LEVEL_TABLE[level]   ?? 9999;
  const expPct  = Math.min(100, ((currentExp-lvExp)/(nextExp-lvExp))*100);
  const rank = getRank(level);
  const rc = RANK_CONFIG[rank];
  const prevRankRef = useRef(rank);
  useEffect(() => {
    if (!loaded) return;
    if (prevRankRef.current !== rank && level > 1) {
      setPrevRank(prevRankRef.current);
      systemVoice.speak("RANK UP");
      setSystemHud({ id: `rank-${Date.now()}`, title: "RANK EVOLUTION", subtitle: `${prevRankRef.current}-RANK → ${rank}-RANK` });
      setShowRankUp(true);
      setTimeout(() => { setShowRankUp(false); setPrevRank(null); }, 3500);
    }
    prevRankRef.current = rank;
  }, [rank, level, loaded]);

  const attrs = Object.entries(BASE_ATTRS).map(([k,v]) => {
    const bonus = QUESTS.filter(q=>completed.includes(q.id) && q.attr===k).length * 3;
    return { ...ATTRIBUTES.find(a=>a.key===k)!, value: Math.min(100, v+bonus) };
  });

  const analyticsData = useMemo(() => {
    const meta = getMeta();
    const today = getToday();
    const history = meta.weekHistory ?? {};
    const days = ["一","二","三","四","五","六","日"];
    const weekData = Array.from({ length: 7 }, (_, i) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - (6 - i));
      const key = `${dt.getFullYear()}-${dt.getMonth()+1}-${dt.getDate()}`;
      const dayLabel = i === 6 ? "今" : days[dt.getDay() === 0 ? 6 : dt.getDay() - 1];
      const isToday = key === today;
      return { day: dayLabel, exp: isToday ? Math.max(0, todayExp) : (history[key] ?? 0) };
    });
    const dailyExpLast14 = Array.from({ length: 14 }, (_, i) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - (13 - i));
      const key = `${dt.getFullYear()}-${dt.getMonth()+1}-${dt.getDate()}`;
      const dayLabel = i === 13 ? "今" : `${dt.getMonth()+1}/${dt.getDate()}`;
      const exp = key === today ? Math.max(0, todayExp) : (history[key] ?? 0);
      return { date: key, label: dayLabel, exp };
    });
    const dailyExpLast30 = Array.from({ length: 30 }, (_, i) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - (29 - i));
      const key = `${dt.getFullYear()}-${dt.getMonth()+1}-${dt.getDate()}`;
      const dayLabel = i === 29 ? "今" : `${dt.getMonth()+1}/${dt.getDate()}`;
      const exp = key === today ? Math.max(0, todayExp) : (history[key] ?? 0);
      return { label: dayLabel, exp };
    });
    let missionHistory: { date: string; completed: number; exp: number }[] = [];
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const list = raw ? (JSON.parse(raw) as MissionHistoryEntry[]) : [];
        const byDate = new Map<string, { completed: number; exp: number }>();
        for (const e of list) {
          if (!e.completed) continue;
          const prev = byDate.get(e.date) ?? { completed: 0, exp: 0 };
          byDate.set(e.date, { completed: prev.completed + 1, exp: prev.exp + (e.expGained ?? 0) });
        }
        missionHistory = Array.from(byDate.entries()).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)).slice(-28);
      } catch {}
    }
    const totalMissionsCompleted = missionHistory.reduce((s, d) => s + d.completed, 0);
    const daysWithData = missionHistory.length || 1;
    const completionRatePct = Math.min(100, Math.round((totalMissionsCompleted / (daysWithData * 5)) * 100));
    const thisWeekKeys = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    });
    const lastWeekKeys = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - 13 + i);
      return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    });
    const thisWeekExp = thisWeekKeys.reduce((s, k) => s + (history[k] ?? 0), 0);
    const lastWeekExp = lastWeekKeys.reduce((s, k) => s + (history[k] ?? 0), 0);
    const weeklyDiff = thisWeekExp - lastWeekExp;
    return { weekData, dailyExpLast14, dailyExpLast30, missionHistory, completionRatePct, weeklyDiff };
  }, [todayExp, loaded, completed, debuffs]);

  function handleTimerComplete() {
    if (!activeTimer) return;
    const q = activeTimer;
    restoreBgmVolume();
    setActiveTimer(null);
    const isBoss = q.type === "boss" && q.id >= 200;
    setMeta({ lastActivityAt: new Date().toISOString() });
    setEmergencyActive(false);

    if (isBoss) {
      systemVoice.speak("BOSS DEFEATED");
      setTimeout(() => systemVoice.speak("RAID COMPLETE"), 1200);
      setBossExpToday(q.exp);
      markBossCompleted();
      setWeeklyBoss(null);
      setShowBossDefeated(true);
      setTimeout(() => setShowBossDefeated(false), 3500);
      setFloatingExp({ value: q.exp, key: Date.now() });
      setTimeout(() => setFloatingExp(null), 1300);
      appendMissionHistory({
        id: `${Date.now()}-${q.id}`, missionId: q.id, label: q.label, type: q.type, attr: q.attr,
        durationMin: q.minutes, completed: true, date: getToday(), finishedAt: new Date().toISOString(), expGained: q.exp,
      });
      const newStreak = streak === 0 ? 1 : streak;
      setStreak(newStreak);
      const nx = BASE_EXP + QUESTS.filter(x=>completed.includes(x.id)).reduce((s,x)=>s+skillBonus(x),0) + q.exp + DEBUFFS.filter(d=>debuffs.includes(d.id)).reduce((s,d)=>s+d.exp,0);
      const newLv = LEVEL_TABLE.reduce((lv,req,i)=>nx>=req?i+1:lv,1);
      if (newLv > level) setTimeout(()=>{ systemVoice.speak("LEVEL UP"); setSystemHud({ id: `lv-${Date.now()}`, title: "LEVEL UP", subtitle: `Lv.${newLv-1} → Lv.${newLv}` }); setShowLevelUp(true); setTimeout(()=>setShowLevelUp(false),3000); },100);
      return;
    }

    const actualExp = skillBonus(q);
    const next = [...completed, q.id];
    setCompleted(next);
    sound.playSuccess();
    systemVoice.speak("MISSION COMPLETE");
    systemVoice.speak("EXPERIENCE GAINED");
    setSystemHud({ id: `mc-${Date.now()}`, title: "MISSION COMPLETE", subtitle: `+${actualExp} EXP` });
    setMissionCompleteEffect({ exp: actualExp, questLabel: q.label, questId: q.id });
    setFloatingExp({ value: actualExp, key: Date.now() });
    setTimeout(() => setMissionCompleteEffect(null), 2200);
    setTimeout(() => setFloatingExp(null), 1300);
    const newStreak = streak === 0 ? 1 : streak;
    setStreak(newStreak);
    const nx = BASE_EXP + QUESTS.filter(x=>next.includes(x.id)).reduce((s,x)=>s+skillBonus(x),0)
      + bossExpToday + DEBUFFS.filter(d=>debuffs.includes(d.id)).reduce((s,d)=>s+d.exp,0);
    const newLv = LEVEL_TABLE.reduce((lv,req,i)=>nx>=req?i+1:lv,1);
    if (newLv > level) setTimeout(()=>{ systemVoice.speak("LEVEL UP"); setSystemHud({ id: `lv-${Date.now()}`, title: "LEVEL UP", subtitle: `Lv.${newLv-1} → Lv.${newLv}` }); setShowLevelUp(true); setTimeout(()=>setShowLevelUp(false),3000); },100);

    appendMissionHistory({
      id: `${Date.now()}-${q.id}`, missionId: q.id, label: q.label, type: q.type, attr: q.attr,
      durationMin: q.minutes, completed: true, date: getToday(), finishedAt: new Date().toISOString(), expGained: actualExp,
    });

    const newly = evaluateAchievements({ streak: newStreak });
    if (newly.length > 0) {
      setUnlockedAchievements(prev => Array.from(new Set([...prev, ...newly.map(a => a.id)])));
      setJustUnlocked(newly[0]);
      setSystemHud({ id: `ach-${newly[0].id}`, title: "NEW ACHIEVEMENT UNLOCKED", subtitle: newly[0].title });
      systemVoice.speak("ACHIEVEMENT UNLOCKED");
      setTimeout(() => setJustUnlocked(null), 3000);
    }
  }

  function getAllQuests(): Quest[] {
    return [...QUESTS, ...(dailyRandomHiddenQuest ? [dailyRandomHiddenQuest] : []), ...(weeklyBoss ? [weeklyBoss] : []), ...(emergencyActive ? EMERGENCY_QUESTS : []), ...aiQuests];
  }
  const completedTodayList = useMemo(() => {
    const list: { id: number; label: string; exp: number; attr: AttrKey }[] = [];
    getAllQuests().filter(q => completed.includes(q.id)).forEach(q => {
      list.push({
        id: q.id,
        label: q.label,
        exp: q.type === "boss" ? q.exp : skillBonus(q),
        attr: q.attr,
      });
    });
    if (bossExpToday > 0) list.push({ id: -1, label: "BOSS RAID", exp: bossExpToday, attr: "EXE" });
    return list;
  }, [completed, bossExpToday, dailyRandomHiddenQuest, emergencyActive, aiQuests, weeklyBoss, skillBonus]);
  function findQuest(id: number): Quest | undefined {
    return getAllQuests().find(q => q.id === id);
  }
  function toggle(id: number) {
    const was = completed.includes(id);
    if (was) {
      setCompleted(completed.filter(x=>x!==id));
    } else {
      const q = findQuest(id);
      if (q) setActiveTimer(q);
    }
  }

  return (
    <>
      <audio
        ref={audioRef}
        src="/bgm.mp3"
        loop
        preload="auto"
        autoPlay
        style={{ display: "none" }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      {!bootComplete ? (
        <BootSequence
          onComplete={() => {
            setBootComplete(true);
            systemVoice.speak("SYSTEM READY");
          }}
          onUserGesture={() => {
            const a = audioRef.current;
            if (a) {
              a.volume = 0.25;
              a.play().then(() => setIsPlaying(true)).catch(() => {});
            }
          }}
        />
      ) : !loaded ? (
        <main style={{background:"var(--bg-primary)",minHeight:"100vh",display:"flex",alignItems:"center",
          justifyContent:"center",fontFamily:"var(--font-ui)",color:"var(--text-muted)"}}>
          SYSTEM LOADING...
        </main>
      ) : (
    <main style={{
      background: penaltyModeActive ? "rgba(80,0,0,0.12)" : "transparent",
      minHeight:"100vh",position:"relative",
      fontFamily:"var(--font-ui)",padding:"var(--space-lg)",
      animation: penaltyModeActive ? "penaltyShake 0.8s ease" : missionCompleteEffect ? "screenShake 0.5s ease" : "none",
      transition: "background 0.5s ease",
    }}>
      {penaltyModeActive && (
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:1,
          background:"linear-gradient(180deg, rgba(120,0,0,0.2) 0%, transparent 50%)",borderBottom:"3px solid rgba(200,50,50,0.5)"}}/>
      )}
      <BackgroundLayers />

      {/* 右上角登入/登出：計時畫面時隱藏避免擋到；其餘時候釘在視窗最上方右邊 */}
      {authPortalReady && authAnchorRef.current && !activeTimer && createPortal(
        <div style={{
          display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-system)", fontSize: "clamp(0.65rem, 2.2vw, 0.75rem)",
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          padding: "10px 14px", margin: "8px", borderRadius: "8px",
          boxShadow: "0 2px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}>
          {user ? (
            <>
              <span style={{ color: "var(--text-muted)", letterSpacing: "1px", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1 }} title={user.email ?? undefined}>{user.email ?? user.id.slice(0, 8)}</span>
              <button
                type="button"
                onClick={async () => { await getSupabase()?.auth.signOut(); }}
                style={{
                  padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "var(--text-muted)",
                  borderRadius: "6px", cursor: "pointer", letterSpacing: "1px", flexShrink: 0,
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={async () => {
                const sb = getSupabase();
                if (!sb) { window.alert("雲端同步未設定：請在 Vercel 的 Environment Variables 加入 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY，並重新部署。"); return; }
                await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: typeof window !== "undefined" ? window.location.origin + window.location.pathname : undefined } });
              }}
              style={{
                padding: "6px 12px", border: "1px solid rgba(58,122,212,0.5)", background: "rgba(58,122,212,0.2)", color: "var(--accent-blue)",
                borderRadius: "6px", cursor: "pointer", letterSpacing: "1px",
              }}
            >
              Sign in with Google
            </button>
          )}
        </div>,
        authAnchorRef.current
      )}

      {commandAccepted && (
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:108,pointerEvents:"none",
          padding:"16px 32px",background:"rgba(0,0,0,0.7)",border:"1px solid rgba(58,122,212,0.6)",
          borderRadius:"8px",boxShadow:"0 0 30px rgba(58,122,212,0.4)",
          color:"#7dd3fc",fontSize:"0.7rem",letterSpacing:"6px",fontFamily:"var(--font-system)",
          animation:"alertSlideIn 0.3s ease forwards"}}>
          COMMAND ACCEPTED
        </div>
      )}

      {showArise && (
        <div style={{position:"fixed",inset:0,zIndex:111,pointerEvents:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          background:"radial-gradient(circle at center, rgba(0,0,0,0.85) 0%, rgba(20,10,40,0.9) 100%)"}}>
          <div style={{fontSize:"0.6rem",color:"var(--accent-purple)",letterSpacing:"8px",marginBottom:"12px",fontFamily:"var(--font-system)"}}>── SHADOW EXTRACTION ──</div>
          <div style={{fontSize:"2.8rem",fontWeight:800,color:"#fff",textShadow:"0 0 40px var(--accent-purple), 0 0 80px var(--accent-purple-glow)",letterSpacing:"12px",fontFamily:"var(--font-system)",animation:"lvUp 3s ease forwards"}}>
            ARISE
          </div>
          <div style={{fontSize:"1.2rem",color:"rgba(255,255,255,0.9)",marginTop:"16px",letterSpacing:"4px"}}>站起來</div>
          <div style={{fontSize:"0.65rem",color:"var(--accent-purple)",marginTop:"20px",letterSpacing:"2px"}}>新影子士兵已加入軍團</div>
        </div>
      )}

      {missionCompleteEffect && (
        <div style={{position:"fixed",inset:0,zIndex:95,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{textAlign:"center",animation:"completePop 0.6s ease forwards",fontFamily:"var(--font-system)"}}>
            <div style={{fontSize:"0.7rem",color:"var(--accent-blue)",letterSpacing:"8px",marginBottom:"12px"}}>── SYSTEM MESSAGE ──</div>
            <div style={{fontSize:"2.2rem",fontWeight:700,color:"var(--accent-gold)",textShadow:"0 0 30px var(--accent-gold), 0 0 60px var(--accent-gold-glow)",letterSpacing:"4px"}}>MISSION COMPLETE</div>
            <div style={{fontSize:"1.4rem",color:"var(--accent-gold)",marginTop:"12px",fontWeight:700,textShadow:"0 0 20px var(--accent-gold-glow)"}}>+{missionCompleteEffect.exp} EXP</div>
          </div>
          {[...Array(16)].map((_,i)=>(
            <div key={i} style={{
              position:"absolute",left:"50%",top:"50%",
              width:"6px",height:"6px",borderRadius:"50%",background:"var(--accent-gold)",
              opacity:0,animation:"expFly 1.5s ease forwards",animationDelay:`${i*0.05}s`,
              transform:`translate(-50%,-50%) rotate(${i*22.5}deg) translateY(-20px)`,
            }}/>
          ))}
        </div>
      )}

      {activeTimer && (() => {
        const theme = getTimerThemeColor(activeTimer, aiQuests.map(q => q.id));
        return (
          <MissionTimer quest={activeTimer} rankColor={theme.color} rankGlow={theme.glow}
            onComplete={handleTimerComplete} onCancel={()=>{ sound.playCancel(); systemVoice.speak("MISSION CANCELED"); restoreBgmVolume(); setActiveTimer(null); }}
            skillBonusPct={activeTimer.type !== "boss" ? getSkillExpBonus(activeTimer, unlockedSkillIds) : 0}
            onPlayMissionStart={()=>{ sound.playMissionStart(); fadeOutBgm(); }} onPlayTimerInit={()=>{ sound.playTimerInit(); }}
            onPlayMinuteTick={sound.playMinuteTick} onPlayCountdownTick={sound.playCountdownTick} onPlayCancel={sound.playCancel} onPlayClick={sound.playClick}
            onTimeExpired={()=> systemVoice.speak("MISSION TIME EXPIRED")} onTenSecondsRemaining={()=> systemVoice.speak("TEN SECONDS REMAINING")}/>
        );
      })()}

      <style>{`
        @keyframes scanH{0%{transform:translateY(-100%)}100%{transform:translateY(800px)}}
        @keyframes scanCard{0%{left:-100%}100%{left:200%}}
        @keyframes shimmerSweep{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes expBarPulse{0%,100%{opacity:0.85;box-shadow:0 0 8px var(--exp-color),0 0 12px var(--exp-glow)}50%{opacity:1;box-shadow:0 0 14px var(--exp-color),0 0 20px var(--exp-glow)}}
        @keyframes btnGlitch{0%,100%{filter:brightness(1)}50%{filter:brightness(1.25)}}
        @keyframes debrisUp{0%{opacity:0.03;transform:translateY(0)}50%{opacity:0.08}100%{opacity:0;transform:translateY(-80vh)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes lvUp{0%{opacity:0;transform:translate(-50%,-50%) scale(0.5)}40%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.1)}}
        @keyframes bgPulse{0%{opacity:0}20%{opacity:1}80%{opacity:1}100%{opacity:0}}
        @keyframes particle{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-100px) scale(0)}}
        @keyframes glowPulse{0%,100%{opacity:0.6}50%{opacity:1}}
        @keyframes float0{0%,100%{transform:translate(0,0)}50%{transform:translate(3px,-8px)}}
        @keyframes float1{0%,100%{transform:translate(0,0)}50%{transform:translate(-4px,-6px)}}
        @keyframes float2{0%,100%{transform:translate(0,0)}50%{transform:translate(2px,-10px)}}
        @keyframes ringRotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes streakGlow{0%,100%{opacity:0.7}50%{opacity:1}}
        @keyframes taskRowIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes panelEntry{0%{opacity:0;transform:translateY(12px);box-shadow:none}75%{opacity:1;transform:translateY(0);box-shadow:none}100%{opacity:1;transform:translateY(0);box-shadow:0 0 20px rgba(58,122,212,0.25)}}
        @keyframes completedItemIn{0%{opacity:0;transform:translateX(-24px)}70%{opacity:1;transform:translateX(0)}100%{opacity:1;transform:translateX(0)}}
        @keyframes completedExpIn{0%{opacity:0}100%{opacity:1}}
        @keyframes hudSequence{0%{opacity:0;transform:scale(0.95)}15%{opacity:1;transform:scale(1)}85%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}
        @keyframes hudBorderPulse{0%,90%,100%{box-shadow:0 0 0 1px rgba(58,122,212,0.4)}45%{box-shadow:0 0 24px rgba(58,122,212,0.8),0 0 0 1px rgba(58,122,212,0.8)}}
        @keyframes glowBreath{0%,100%{opacity:0.7;filter:drop-shadow(0 0 6px currentColor)}50%{opacity:1;filter:drop-shadow(0 0 14px currentColor)}}
        @keyframes rankDarken{0%{opacity:0}100%{opacity:1}}
        @keyframes goldBurst{0%{transform:translate(-50%,-50%) scale(0);opacity:0.8}50%{transform:translate(-50%,-50%) scale(2);opacity:0.4}100%{transform:translate(-50%,-50%) scale(3);opacity:0}}
        @keyframes achievementRotate{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(8deg) scale(1.15)}100%{transform:rotate(0deg) scale(1)}}
        @keyframes skillNodeFlash{0%,100%{box-shadow:none;background:rgba(74,154,138,0.15)}50%{box-shadow:0 0 16px rgba(74,154,138,0.6);background:rgba(74,154,138,0.35)}}
        @keyframes missionRowGlow{0%{background:rgba(34,197,94,0.25);box-shadow:0 0 12px rgba(34,197,94,0.4)}100%{background:transparent;box-shadow:none}}
        @keyframes systemScan{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
        @keyframes expBarFlow{0%{background-position:0% 50%}100%{background-position:200% 50%}}
        @keyframes expBarGlow{0%,100%{box-shadow:0 0 8px var(--exp-color),0 0 12px var(--exp-glow)}50%{box-shadow:0 0 16px var(--exp-color),0 0 24px var(--exp-glow)}}
        @keyframes screenShake{0%,100%{transform:translateX(0)}10%{transform:translateX(-4px)}30%{transform:translateX(4px)}50%{transform:translateX(-3px)}70%{transform:translateX(3px)}90%{transform:translateX(-1px)}}
        @keyframes penaltyShake{0%,100%{transform:translateX(0)}15%{transform:translateX(-8px)}35%{transform:translateX(8px)}55%{transform:translateX(-6px)}75%{transform:translateX(6px)}90%{transform:translateX(-2px)}}
        @keyframes levelUpWave{0%{transform:translate(-50%,-50%) scale(0);opacity:0.8}100%{transform:translate(-50%,-50%) scale(3);opacity:0}}
        @keyframes rankUpFlash{0%{opacity:0}20%{opacity:1}80%{opacity:1}100%{opacity:0}}
        @keyframes expFloatUp{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-80px)}}
        @keyframes alertSlideIn{from{opacity:0;transform:translateY(-30px)}to{opacity:1;transform:translateY(0)}}
        @keyframes holoText{0%,100%{filter:drop-shadow(0 0 4px currentColor)}50%{filter:drop-shadow(0 0 12px currentColor) drop-shadow(0 0 24px currentColor)}}
        .scan{position:absolute;top:0;left:0;right:0;height:2px;
          background:linear-gradient(transparent,var(--border-active),transparent);opacity:0.35;
          animation:systemScan 8s linear infinite;pointer-events:none}
        .fade-in{animation:fadeUp 0.6s ease forwards}
        .task-row{transition:all var(--anim-normal) ease;border-radius:var(--radius-sm);cursor:pointer}
        .task-row:hover{background:var(--bg-panel)!important;box-shadow:var(--glow-card)}
        .nav-link{transition:all 0.2s;opacity:0.7}
        .nav-link:hover{opacity:1}
        .start-btn:hover{transform:scale(1.05);filter:brightness(1.2)}
        .start-btn-glitch:hover{animation:btnGlitch 0.15s ease}
        .growth-bar-pulse{animation:expBarPulse 2s ease-in-out infinite}
        .undo-btn{transition:all 0.2s ease;opacity:1}
        .undo-btn:hover{background:rgba(231,76,60,0.15)!important;border-color:rgba(231,76,60,0.5)!important;transform:scale(1.08);box-shadow:0 0 10px rgba(231,76,60,0.25)}
        @keyframes debuffDissolve{0%{opacity:1;transform:scale(1);filter:drop-shadow(0 0 6px #E74C3C)}100%{opacity:0.72;transform:scale(0.97);filter:drop-shadow(0 0 2px #E74C3C)}}
        @keyframes summarySectionIn{0%{opacity:0;transform:translateY(16px);filter:blur(4px)}100%{opacity:1;transform:translateY(0);filter:blur(0)}}
        @keyframes dataLinePulse{0%,100%{opacity:0.4}50%{opacity:0.9}}
        @keyframes nodeRing{0%,100%{transform:scale(1);opacity:0.6}50%{transform:scale(1.15);opacity:0}}
        @keyframes holoShine{0%{background-position:200% 50%}100%{background-position:-200% 50%}}
        .debuff-penalty-active{animation:debuffDissolve 1.2s ease-out forwards}
        .summary-card-in{animation:panelEntry 0.4s ease forwards}
        .completed-item-in{animation:completedItemIn 0.3s ease forwards}
        .glow-breath{animation:glowBreath 3s ease-in-out infinite}
        @media (max-width: 768px){
          .dashboard-grid{grid-template-columns:1fr !important;}
          .analytics-stat-grid{grid-template-columns:repeat(2,1fr) !important;}
        }
      `}</style>

      {showLevelUp && (
        <div style={{position:"fixed",inset:0,zIndex:100,pointerEvents:"none",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,
            background:`radial-gradient(circle at center, ${rc.glow} 0%, transparent 60%)`,
            animation:"bgPulse 3s ease forwards"}}/>
          <div style={{position:"absolute",top:"50%",left:"50%",width:"100vmax",height:"100vmax",marginLeft:"-50vmax",marginTop:"-50vmax",
            borderRadius:"50%",border:`3px solid ${rc.color}44`,animation:"levelUpWave 1.2s ease-out forwards",opacity:0.6}}/>
          {[...Array(30)].map((_,i)=>(
            <div key={i} style={{position:"absolute",
              left:`${5+Math.random()*90}%`,top:`${5+Math.random()*90}%`,
              width:`${2+Math.random()*4}px`,height:`${2+Math.random()*4}px`,
              borderRadius:"50%",background:rc.color,
              animation:`particle ${0.8+Math.random()*1.5}s ease forwards`,
              animationDelay:`${Math.random()*0.6}s`}}/>
          ))}
          <div style={{position:"absolute",top:"50%",left:"50%",textAlign:"center",
            animation:"lvUp 3s ease forwards",fontFamily:"var(--font-system)"}}>
            <div style={{fontSize:"0.7rem",color:rc.color,letterSpacing:"6px",marginBottom:"16px"}}>
              ── SYSTEM ALERT ──
            </div>
            <div style={{fontSize:"3.5rem",fontWeight:"700",color:rc.color,
              textShadow:`0 0 40px ${rc.color}, 0 0 80px ${rc.glow}`,letterSpacing:"6px"}}>
              LEVEL UP
            </div>
            <div className="font-mono-num" style={{fontSize:"1.5rem",color:"#ffffff",marginTop:"12px",letterSpacing:"2px"}}>
              Lv.{level-1} → Lv.{level}
            </div>
            <div style={{fontSize:"0.65rem",color:rc.color,marginTop:"20px",letterSpacing:"4px"}}>
              {rc.next}
            </div>
          </div>
        </div>
      )}

      {showRankUp && prevRank && (
        <div style={{position:"fixed",inset:0,zIndex:105,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)",animation:"rankDarken 0.3s ease forwards"}}/>
          <div style={{position:"absolute",top:"50%",left:"50%",width:"200vmax",height:"200vmax",marginLeft:"-100vmax",marginTop:"-100vmax",borderRadius:"50%",border:"4px solid rgba(240,192,48,0.5)",animation:"goldBurst 1s ease-out forwards",pointerEvents:"none"}}/>
          <div style={{position:"relative",animation:"rankUpFlash 3s ease forwards",textAlign:"center",padding:"var(--space-xl)",fontFamily:"var(--font-system)"}}>
            <div style={{fontSize:"0.7rem",color:rc.color,letterSpacing:"8px",marginBottom:"12px"}}>── RANK UP ──</div>
            <div style={{fontSize:"3rem",fontWeight:700,color:rc.color,textShadow:`0 0 40px ${rc.color}`}}>
              RANK UP
            </div>
            <div className="font-mono-num" style={{fontSize:"2rem",color:"#fff",marginTop:"16px",letterSpacing:"4px"}}>
              {prevRank} → {rank}
            </div>
            <div style={{marginTop:"20px",display:"flex",justifyContent:"center",gap:"16px"}}>
              <span style={{padding:"8px 16px",borderRadius:"8px",border:`2px solid ${RANK_CONFIG[prevRank]?.color ?? "#666"}`,color:RANK_CONFIG[prevRank]?.color,fontSize:"1.2rem",fontWeight:700}}>{prevRank}-RANK</span>
              <span style={{fontSize:"1.5rem",color:rc.color}}>→</span>
              <span style={{padding:"8px 16px",borderRadius:"8px",border:`2px solid ${rc.color}`,color:rc.color,fontSize:"1.2rem",fontWeight:700,boxShadow:`0 0 20px ${rc.glow}`}}>{rank}-RANK</span>
            </div>
          </div>
        </div>
      )}

      {showBossDefeated && (
        <div style={{position:"fixed",inset:0,zIndex:100,pointerEvents:"none",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,background:"radial-gradient(circle at center, rgba(231,76,60,0.25) 0%, transparent 60%)",animation:"bgPulse 3s ease forwards"}}/>
          <div style={{position:"absolute",top:"50%",left:"50%",textAlign:"center",transform:"translate(-50%,-50%)",animation:"lvUp 3.5s ease forwards"}}>
            <div style={{fontSize:"0.7rem",color:"#E74C3C",letterSpacing:"6px",marginBottom:"16px"}}>── SYSTEM ALERT ──</div>
            <div style={{fontSize:"3rem",fontWeight:"700",color:"#E74C3C",textShadow:"0 0 40px #E74C3C",letterSpacing:"4px"}}>BOSS DEFEATED</div>
            <div style={{fontSize:"0.9rem",color:"#C0D4E8",marginTop:"12px"}}>+120 EXP</div>
          </div>
        </div>
      )}

      {systemAlert && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:109,display:"flex",justifyContent:"center",padding:"20px",pointerEvents:"none",animation:"alertSlideIn 0.4s ease forwards"}}>
          <div style={{padding:"14px 24px",borderRadius:"12px",background:"linear-gradient(135deg, rgba(14,165,233,0.15), rgba(14,165,233,0.04))",border:"2px solid rgba(14,165,233,0.7)",boxShadow:"0 0 30px rgba(14,165,233,0.3), inset 0 0 20px rgba(14,165,233,0.06)"}}>
            <div style={{fontSize:"0.6rem",color:"#38bdf8",letterSpacing:"4px",marginBottom:"4px"}}>SYSTEM ALERT</div>
            <div style={{fontSize:"0.85rem",color:"#7dd3fc",letterSpacing:"2px",animation:"holoText 2s ease-in-out infinite"}}>{systemAlert.title}</div>
            <div style={{fontSize:"0.65rem",color:"#94a3b8",marginTop:"4px"}}>{systemAlert.message}</div>
          </div>
        </div>
      )}

      {systemHud && (
        <div style={{position:"fixed",top:"22%",left:"50%",transform:"translateX(-50%)",zIndex:112,pointerEvents:"none",width:"min(90vw,320px)"}}>
          <div style={{
            padding:"20px 28px",borderRadius:"12px",
            background:"rgba(12,20,40,0.92)",border:"1px solid rgba(58,122,212,0.6)",
            boxShadow:"0 0 0 1px rgba(58,122,212,0.4), 0 0 40px rgba(58,122,212,0.15)",
            animation:"hudSequence 2.7s ease forwards",
            fontFamily:"var(--font-system)",textAlign:"center",
          }}>
            <div style={{fontSize:"0.55rem",color:"#7dd3fc",letterSpacing:"5px",marginBottom:"8px",opacity:0.9}}>SYSTEM MESSAGE</div>
            <div style={{fontSize:"1.1rem",fontWeight:700,color:"#93c5fd",letterSpacing:"3px",marginBottom:"4px"}}>{systemHud.title}</div>
            <div style={{fontSize:"0.85rem",color:"#bfdbfe",letterSpacing:"1px"}}>{systemHud.subtitle}</div>
          </div>
        </div>
      )}

      {justUnlocked && (
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:110,display:"flex",
          justifyContent:"center",pointerEvents:"none",animation:"alertSlideIn 0.4s ease forwards"}}>
          <div style={{
            marginTop:"20px",
            padding:"14px 24px",
            borderRadius:"12px",
            background:"linear-gradient(135deg, rgba(240,192,48,0.15), rgba(240,192,48,0.05))",
            border:"2px solid rgba(240,192,48,0.8)",
            boxShadow:"0 0 30px rgba(240,192,48,0.4), 0 0 60px rgba(240,192,48,0.2), inset 0 0 20px rgba(240,192,48,0.08)",
            display:"flex",
            alignItems:"center",
            gap:"12px",
            fontFamily:"'SF Mono','Courier New',monospace",
            color:"#F0C030",
            letterSpacing:"3px",
            fontSize:"0.7rem",
            pointerEvents:"auto",
            animation:"alertSlideIn 0.4s ease forwards",
          }}>
            <span style={{fontSize:"0.6rem",letterSpacing:"4px",opacity:0.9}}>SYSTEM ALERT</span>
            <span style={{width:"1px",height:"16px",background:"rgba(240,192,48,0.5)"}}/>
            <span style={{fontSize:"1.1rem",animation:"achievementRotate 0.6s ease forwards",display:"inline-block",filter:"drop-shadow(0 0 8px rgba(240,192,48,0.8))"}}>{justUnlocked.icon}</span>
            <span style={{animation:"holoText 2s ease-in-out infinite"}}>NEW ACHIEVEMENT · {justUnlocked.title}</span>
          </div>
        </div>
      )}

      <div style={{maxWidth:"1100px",margin:"0 auto",position:"relative",zIndex:2}}>
        {penaltyModeActive && (
          <div style={{marginBottom:"var(--space-lg)",padding:"var(--space-lg)",borderRadius:"var(--radius-md)",
            background:"linear-gradient(135deg, rgba(80,0,0,0.4), rgba(40,0,0,0.3))",border:"2px solid rgba(220,60,60,0.8)",
            boxShadow:"0 0 40px rgba(220,60,60,0.3), inset 0 0 30px rgba(0,0,0,0.2)"}}>
            <div style={{color:"#FF6B6B",fontSize:"0.75rem",letterSpacing:"4px",fontWeight:800,marginBottom:"12px",fontFamily:"var(--font-system)"}}>
              [WARNING: PENALTY QUEST ACTIVE]
            </div>
            <div style={{color:"rgba(255,200,200,0.9)",fontSize:"0.65rem",letterSpacing:"2px",marginBottom:"16px"}}>
              昨日任務達成率低於 50%，請完成強制復原任務以解除懲罰並恢復系統。
            </div>
            <div style={{padding:"14px",background:"rgba(0,0,0,0.3)",borderRadius:"8px",border:"1px solid rgba(220,60,60,0.4)",marginBottom:"12px"}}>
              <div style={{color:"#E0A0A0",fontSize:"0.7rem",marginBottom:"8px"}}>強制復原任務</div>
              <div style={{color:"#fff",fontSize:"0.8rem",marginBottom:"12px"}}>深蹲 30 下 或 閱讀 15 分鐘</div>
              <button onClick={()=>{
                setMeta({ ...getMeta(), recoveryDoneAt: getToday(), penaltyActiveSince: undefined });
                setPenaltyModeActive(false);
                sound.playSuccess();
              }} style={{
                background:"linear-gradient(135deg, #2E7D32, #1B5E20)",border:"1px solid rgba(100,255,100,0.5)",
                borderRadius:"6px",padding:"10px 20px",color:"#C8E6C9",fontSize:"0.65rem",letterSpacing:"2px",
                cursor:"pointer",fontFamily:"inherit",fontWeight:700,boxShadow:"0 0 12px rgba(0,255,0,0.2)"
              }}>
                確認已完成復原
              </button>
            </div>
          </div>
        )}
        {emergencyActive && !emergencyDismissedForToday && (
          <div style={{marginBottom:"var(--space-md)",padding:"var(--space-sm) var(--space-lg)",borderRadius:"var(--radius-md)",
            background:"var(--debuff-bg)",border:"1px solid var(--debuff-border)",
            display:"flex",alignItems:"center",justifyContent:"space-between",gap:"var(--space-md)",flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:"var(--space-sm)"}}>
              <span style={{fontSize:"1.2rem"}}>⚠️</span>
              <span style={{color:"var(--debuff-text)",fontSize:"0.75rem",letterSpacing:"2px",fontWeight:"700"}}>SYSTEM WARNING · 超過 24 小時未完成任務 · 觸發 EMERGENCY QUEST</span>
            </div>
            <button onClick={() => { sound.playClick(); setMeta({ ...getMeta(), emergencyDismissedDate: getToday() }); setEmergencyDismissedForToday(true); }}
              style={{background:"var(--bg-panel)",border:"1px solid var(--debuff-border)",borderRadius:"var(--radius-sm)",padding:"var(--space-xs) var(--space-sm)",color:"var(--text-primary)",fontSize:"0.6rem",letterSpacing:"1px",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              今日不再顯示
            </button>
          </div>
        )}
        <div style={{marginBottom:"var(--space-md)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            paddingBottom:"var(--space-md)",borderBottom:"1px solid var(--border-subtle)"}}>
            <div style={{display:"flex",alignItems:"center",gap:"var(--space-sm)"}}>
              <div style={{width:"6px",height:"6px",borderRadius:"50%",background:"var(--accent-blue)",
                animation:"glowPulse 2s ease-in-out infinite",boxShadow:"var(--glow-card)"}}/>
              <span style={{color:"var(--accent-blue-glow)",fontSize:"0.72rem",letterSpacing:"4px",fontWeight:700,fontFamily:"var(--font-system)"}}>
                SOLO LEVELING EQUATION
              </span>
            </div>
          </div>
          {/* 系統狀態跑馬燈 */}
          <div style={{marginTop:"10px",padding:"8px 12px",background:"rgba(16,25,53,0.5)",borderRadius:"6px",
            border:"1px solid rgba(58,122,212,0.15)",fontSize:"0.55rem",color:"rgba(125,211,252,0.8)",
            letterSpacing:"2px",fontFamily:"var(--font-system)",minHeight:"28px",display:"flex",alignItems:"center"}}>
            <span style={{animation:"blink 2s ease-in-out infinite"}}>■</span>
            <span style={{marginLeft:"8px"}}>{systemMessageFromState}</span>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",marginBottom:"var(--space-xl)"}}>
          <div style={{display:"flex",alignItems:"center",gap:"var(--space-lg)"}}>
            <button onClick={()=>{
              sound.playClick();
              const a = audioRef.current;
              if (!a) return;
              if (a.paused) {
                a.volume = 0.25;
                a.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
              } else {
                a.pause();
                setIsPlaying(false);
              }
            }} style={{
              background:"transparent",
              border:`1px solid ${isPlaying ? "var(--border-glow)" : "var(--border-subtle)"}`,
              borderRadius:"var(--radius-sm)",padding:"var(--space-xs) var(--space-sm)",
              color:isPlaying ? "var(--accent-blue-glow)" : "var(--accent-blue)",
              fontSize:"0.55rem",letterSpacing:"2px",cursor:"pointer",fontFamily:"inherit",
              boxShadow:isPlaying ? "var(--glow-card)" : "none",transition:"all var(--anim-normal)"}}>
              {isPlaying?"⏸ BGM":"♪ BGM"}
            </button>
            <button onClick={()=>{ sound.playClick(); systemVoice.setVoiceEnabled(!systemVoice.voiceEnabled); }} style={{
              background:"transparent",
              border:`1px solid ${systemVoice.voiceEnabled ? "var(--border-glow)" : "var(--border-subtle)"}`,
              borderRadius:"var(--radius-sm)",padding:"var(--space-xs) var(--space-sm)",
              color:systemVoice.voiceEnabled ? "var(--accent-blue-glow)" : "var(--accent-blue)",
              fontSize:"0.55rem",letterSpacing:"2px",cursor:"pointer",fontFamily:"inherit",
              boxShadow:systemVoice.voiceEnabled ? "var(--glow-card)" : "none",transition:"all var(--anim-normal)"}} title="System voice announcements">
              {systemVoice.voiceEnabled ? "🔊 VOICE" : "🔇 VOICE"}
            </button>
          </div>
        </div>

        <div className="dashboard-grid" style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:"28px",alignItems:"start"}}>

          {/* Profile */}
          <div className="fade-in" style={{
            background:"linear-gradient(160deg,var(--bg-panel) 0%,var(--bg-primary) 100%)",
            border:`1px solid var(--border-subtle)`,borderRadius:"var(--radius-lg)",padding:"var(--space-lg)",
            position:"relative",overflow:"hidden",boxShadow:`0 0 60px ${rc.glow}`}}>
            <div className="scan"/>
            <Particles color={rc.color}/>
            <div style={{position:"relative",zIndex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:"24px"}}>
                <span style={{color:"var(--text-secondary)",fontSize:"0.6rem",letterSpacing:"3px"}}>HUNTER PROFILE</span>
                <div className="glow-breath" style={{background:rc.bg,border:`1px solid ${rc.color}`,
                  borderRadius:"4px",padding:"2px 10px",boxShadow:`0 0 14px ${rc.glow}, 0 0 28px ${rc.glow}88, inset 0 0 12px ${rc.color}22`,color:rc.color}}>
                  <span style={{color:rc.color,fontSize:"0.75rem",fontWeight:"700",letterSpacing:"2px",textShadow:`0 0 8px ${rc.glow}`}}>
                    {rank}-RANK
                  </span>
                </div>
              </div>

              <div style={{textAlign:"center",marginBottom:"20px",position:"relative"}}>
                {(()=>{
                  const ra = RANK_AVATAR[rank] ?? RANK_AVATAR["E"];
                  const isMetallic = ra.frame === "metallic";
                  const isMonarch = ra.frame === "monarch";
                  return (
                    <div style={{display:"inline-block",position:"relative"}}>
                      {/* Aura layers (expand with rank) */}
                      {ra.auraSize > 0 && (
                        <div style={{
                          position:"absolute",inset: -ra.auraSize,
                          borderRadius:"50%",border:`2px solid ${rc.color}44`,
                          boxShadow:`0 0 ${20+ra.auraSize}px ${rc.color}44, inset 0 0 ${15+ra.auraSize}px ${rc.color}22`,
                          opacity: ra.auraOpacity,
                          animation:"ringRotate 8s linear infinite",
                        }}/>
                      )}
                      {ra.auraSize > 0 && (
                        <div style={{
                          position:"absolute",inset: -ra.auraSize - 8,
                          borderRadius:"50%",border:`1px solid ${rc.color}22`,
                          boxShadow:`0 0 ${30+ra.auraSize}px ${rc.glow}`,
                          opacity: ra.auraOpacity * 0.7,
                          animation:"ringRotate 12s linear infinite reverse",
                        }}/>
                      )}
                      {ra.particles && (
                        <div style={{position:"absolute",inset:"-20px",pointerEvents:"none"}}>
                          {[...Array(8)].map((_,i)=>(
                            <div key={i} style={{
                              position:"absolute",left:"50%",top:"50%",
                              width:"4px",height:"4px",borderRadius:"50%",background:rc.color,
                              opacity:0.5,transform:`rotate(${i*45}deg) translateY(-55px)`,
                              animation:`float${i%3} ${3+i*0.5}s ${i*0.2}s ease-in-out infinite`,
                            }}/>
                          ))}
                        </div>
                      )}
                      <div style={{position:"absolute",inset:"-8px",borderRadius:"50%",
                        border: isMetallic ? `2px solid rgba(180,160,120,0.6)` : `1px solid ${rc.color}33`,
                        borderTop: `2px solid ${rc.color}`,
                        boxShadow: isMonarch ? `0 0 25px ${rc.color}, 0 0 50px ${rc.glow}` : isMetallic ? "0 0 15px rgba(180,160,120,0.4)" : "none",
                        animation:"ringRotate 4s linear infinite"}}/>
                      <div style={{borderRadius:"50%",padding: isMonarch ? "4px" : "3px",
                        background: isMetallic ? "linear-gradient(135deg, rgba(180,160,120,0.5), rgba(100,80,60,0.3))" : `linear-gradient(135deg,${rc.color},transparent)`,
                        boxShadow:`0 0 30px ${rc.glow}`}}>
                        <div style={{borderRadius:"50%",overflow:"hidden",
                          width:"90px",height:"90px",background:"var(--bg-primary)"}}>
                          <Image src="/avatar.jpg" alt="avatar" width={90} height={90}
                            style={{objectFit:"cover",width:"100%",height:"100%",filter:"brightness(0.95)"}}/>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{textAlign:"center",marginBottom:"20px"}}>
                <div style={{color:"#E0EAF4",fontSize:"1.1rem",letterSpacing:"4px",
                  fontWeight:"600",marginBottom:"4px",textShadow:`0 0 20px ${rc.color}44`}}>何錦沅</div>
                <div style={{color:"#7A9ABB",fontSize:"0.6rem",letterSpacing:"2px"}}>HO KAM YUEN · TOMMY</div>
              </div>

              <div style={{marginBottom:"16px"}}>
                <div style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"3px",marginBottom:"12px"}}>ATTRIBUTES</div>
                {attrs.map(a => (
                  <div key={a!.key} style={{marginBottom:"10px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                      <span style={{color:"#A0BCD4",fontSize:"0.65rem"}}>{a!.desc}</span>
                      <CountUp target={a!.value} color={a!.value>0?"#3A7AD4":"#7A9ABB"} duration={800}/>
                    </div>
                    <div style={{background:"rgba(255,255,255,0.06)",borderRadius:"2px",height:"3px"}}>
                      <div style={{
                        background:a!.value>0?"linear-gradient(90deg,#1a4a7a,#3A7AD4)":"transparent",
                        width:`${a!.value}%`,height:"100%",borderRadius:"2px",
                        transition:"width 1s ease",
                        boxShadow:a!.value>0?"0 0 6px rgba(58,122,212,0.5)":"none"
                      }}/>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{borderTop:"1px solid rgba(58,122,212,0.15)",paddingTop:"14px",marginBottom:"12px"}}>
                <div style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"2px",marginBottom:"6px"}}>NEXT MILESTONE</div>
                <div style={{color:rc.color,fontSize:"0.7rem",letterSpacing:"1px"}}>{rc.next}</div>
              </div>

              {/* 🔥 Streak */}
              <div style={{
                background:`rgba(${streak>=7?"58,122,212":streak>=3?"46,204,113":"58,90,112"},0.06)`,
                border:`1px solid ${getStreakColor(streak)}33`,
                borderRadius:"8px",padding:"12px",
                boxShadow:streak>=3?`0 0 16px ${getStreakColor(streak)}22`:"none",
                transition:"all 0.5s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                  <span style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"2px"}}>STREAK</span>
                  <span style={{color:getStreakColor(streak),fontSize:"0.55rem",letterSpacing:"1px",
                    animation:streak>=3?"streakGlow 2s ease-in-out infinite":"none"}}>
                    {getStreakTitle(streak)}
                  </span>
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"8px"}}>
                  <span className="font-mono-num" style={{color:getStreakColor(streak),fontSize:"2rem",fontWeight:"700",
                    textShadow:streak>0?`0 0 16px ${getStreakColor(streak)}`:"none"}}>
                    {streak}
                  </span>
                  <span style={{color:"#3A5070",fontSize:"0.65rem"}}>
                    {streak===1?"DAY":"DAYS"} {streak>0?"🔥":""}
                  </span>
                </div>
                <div style={{background:"rgba(255,255,255,0.04)",borderRadius:"2px",height:"3px"}}>
                  <div style={{
                    background:`linear-gradient(90deg,${getStreakColor(streak)}66,${getStreakColor(streak)})`,
                    width:`${Math.min(100,(streak/30)*100)}%`,height:"100%",borderRadius:"2px",
                    boxShadow:`0 0 6px ${getStreakColor(streak)}`,transition:"width 1s ease",
                  }}/>
                </div>
                <div style={{color:"#3A5070",fontSize:"0.5rem",marginTop:"4px",textAlign:"right"}}>
                  {streak>=30?"MAX STREAK 🏆":`${30-streak} days to UNBREAKABLE`}
                </div>
              </div>

              {/* Shadow Army：影子槽（streak 每 7 日解鎖 1 隻） */}
              <div style={{marginTop:"12px",padding:"12px",borderRadius:"8px",background:"rgba(0,0,0,0.3)",border:"1px solid rgba(136,136,136,0.2)"}}
                title={shadowSoldiersFromStreak > 0 ? `已解鎖：${SHADOW_NAMES.slice(0, shadowSoldiersFromStreak).join(" · ")}` : undefined}>
                <div style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"2px",marginBottom:"8px"}}>SHADOW ARMY</div>
                <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"6px"}}>
                  {[1,2,3,4,5].map(slot => {
                    const unlocked = shadowSoldiersFromStreak >= slot;
                    return (
                      <div key={slot} style={{
                        width:"28px",height:"28px",borderRadius:"6px",
                        background: unlocked ? "linear-gradient(180deg,#1a1a2e,#0d0d14)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${unlocked ? "rgba(136,136,136,0.5)" : "rgba(255,255,255,0.08)"}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        boxShadow: unlocked ? "inset 0 0 12px rgba(0,0,0,0.8), 0 0 8px rgba(100,100,120,0.2)" : "none",
                      }} title={unlocked ? SHADOW_NAMES[slot - 1] : "未解鎖"}>
                        {unlocked ? <span style={{fontSize:"0.65rem",opacity:0.9}}>◆</span> : <span style={{fontSize:"0.5rem",color:"#3A5070"}}>?</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="font-mono-num" style={{color:"#3A5070",fontSize:"0.5rem"}}>{shadowSoldiersFromStreak} / 5 soldiers</div>
              </div>
            </div>
          </div>

          {/* 右：今日戰報 — 核心成長槽 + 微縮 HUD */}
          <div className="fade-in" style={{position:"relative"}}>
            {/* 核心成長槽：Level + Total EXP 合併 */}
            <GlowCard color={rc.color} style={{marginBottom:"16px",padding:"14px 20px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                <span style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"3px"}}>GROWTH</span>
                {penaltyModeActive ? (
                  <span className="font-mono-num" style={{color:"#666",fontSize:"0.9rem"}}>???</span>
                ) : (
                  <span className="font-mono-num" style={{color:rc.color,fontSize:"0.9rem",fontWeight:700,textShadow:`0 0 12px ${rc.glow}`}}>Lv.<CountUp target={level} color={rc.color} duration={800}/></span>
                )}
              </div>
              <div style={{background:"rgba(255,255,255,0.06)",borderRadius:"4px",height:"10px",overflow:"hidden",position:"relative"}}>
                {!penaltyModeActive && (
                <div className={expPct > 0 ? "growth-bar-pulse" : ""} style={{
                  ["--exp-color" as string]: rc.color,
                  ["--exp-glow" as string]: rc.glow,
                  background: `linear-gradient(90deg, ${rc.color}44, ${rc.color}, ${rc.color}99, ${rc.color})`,
                  backgroundSize: "200% 100%",
                  width: `${expPct}%`,
                  height: "100%",
                  borderRadius: "4px",
                  boxShadow: `0 0 8px ${rc.color}`,
                  transition: "width 1s ease",
                  animation: expPct >= 90 ? "expBarFlow 3s linear infinite, expBarGlow 1.5s ease-in-out infinite" : expPct > 0 ? "expBarFlow 3s linear infinite" : "none",
                }}/>
                )}
              </div>
              <div className="font-mono-num" style={{display:"flex",justifyContent:"space-between",marginTop:"6px",color:"#3A5070",fontSize:"0.55rem"}}>
                {penaltyModeActive ? <span>---</span> : (
                  <>
                    <span><span style={{color:rc.color,fontWeight:600}}>{Math.round(currentExp - lvExp)}</span> / {nextExp - lvExp} EXP</span>
                    <span>{nextExp - lvExp} to next</span>
                  </>
                )}
              </div>
            </GlowCard>
            {floatingExp && (
              <div key={floatingExp.key} style={{
                position:"absolute",right:"0",top:"8px",color:"var(--accent-gold)",fontSize:"0.8rem",fontWeight:700,pointerEvents:"none",zIndex:10,
                animation:"expFloatUp 1.2s ease forwards",textShadow:"0 0 10px var(--accent-gold-glow)",
              }} className="font-mono-num">+{floatingExp.value} EXP</div>
            )}
            {/* 微縮 HUD 標籤 */}
            <div style={{display:"flex",flexWrap:"wrap",gap:"8px",marginBottom:"20px"}}>
              {[
                {label:"EXP", value:todayExp>=0?"+":"", num:todayExp, color:todayExp>=0?"#2ECC71":"#E74C3C"},
                {label:"STREAK", value:null, num:streak, color:getStreakColor(streak)},
              ].map(s => (
                <div key={s.label} style={{
                  padding:"8px 14px",borderRadius:"8px",border:`1px solid ${s.color}44`,
                  background:`${s.color}11`,display:"flex",alignItems:"center",gap:"8px",
                }}>
                  <span style={{color:"#7A9ABB",fontSize:"0.5rem",letterSpacing:"2px"}}>{s.label}</span>
                  <span className="font-mono-num" style={{color:s.color,fontSize:"1rem",fontWeight:700}}>
                    {penaltyModeActive && s.label==="EXP" ? "???" : s.value != null ? `${s.value}${s.num}` : <CountUp target={s.num} color={s.color} duration={800}/>}
                  </span>
                  {s.label==="STREAK" && streak>0 && <span style={{fontSize:"0.75rem"}}>🔥</span>}
                </div>
              ))}
            </div>

            <div style={{display:"flex",gap:"4px",marginBottom:"20px",
              background:"rgba(58,122,212,0.06)",borderRadius:"10px",padding:"5px",
              border:"1px solid rgba(58,122,212,0.1)"}}>
              {(["tasks","summary","analytics"] as const).map(t => (
                <button key={t} onClick={()=>{ sound.playClick(); setTab(t); }} style={{
                  flex:1,padding:"10px 12px",borderRadius:"8px",border:"none",cursor:"pointer",
                  background:tab===t?"rgba(58,122,212,0.25)":"transparent",
                  color:tab===t?"#A5D4F7":"#8AB0CC",
                  fontSize:"0.7rem",letterSpacing:"2.5px",fontWeight:600,fontFamily:"inherit",transition:"all 0.3s ease",
                  boxShadow:tab===t?"0 0 16px rgba(58,122,212,0.25)":"none",
                }}>
                  {t==="tasks"?"DAILY TASKS":t==="summary"?"SUMMARY":"ANALYTICS"}
                </button>
              ))}
            </div>

            {tab==="tasks" && (() => {
                const topPriorityQuests = [...QUESTS.filter(q => q.type === "challenge")].sort((a, b) => b.exp - a.exp).slice(0, 3);
                const dailySystemQuests = [...QUESTS.filter(q => q.type === "daily")].sort((a, b) => b.exp - a.exp);
                const supportQuests = [
                  ...QUESTS.filter(q => q.type === "hidden"),
                  ...(dailyRandomHiddenQuest ? [dailyRandomHiddenQuest] : []),
                  ...aiQuests,
                ].sort((a, b) => b.exp - a.exp);
                return (
              <div style={{animation:"fadeUp 0.35s ease forwards"}}>
                {/* TOP PRIORITY MISSIONS — max 3, largest cards, bright system blue */}
                <div style={{marginBottom:"24px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"8px"}}>
                    <div style={{width:"4px",height:"18px",background:"#38bdf8",borderRadius:"2px",boxShadow:"0 0 12px #38bdf8"}}/>
                    <span style={{color:"#38bdf8",fontSize:"0.72rem",letterSpacing:"4px",fontWeight:800}}>TOP PRIORITY MISSIONS</span>
                  </div>
                  <div style={{color:"#7dd3fc",fontSize:"0.55rem",letterSpacing:"1.5px",marginBottom:"12px",opacity:0.9}}>最高價值行動 · 今日首要專注</div>
                  <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
                    {topPriorityQuests.map((q, idx) => (
                        <div key={q.id} style={{border:"2px solid rgba(56,189,248,0.6)",borderRadius:"12px",padding:"3px",background:"rgba(56,189,248,0.08)",boxShadow:"0 0 20px rgba(56,189,248,0.2)"}}>
                          <QuestCard quest={q} accentColor="#38bdf8" done={completed.includes(q.id)} onStart={()=>toggle(q.id)} onUndo={()=>setCompleted(completed.filter(x=>x!==q.id))} onHoverSound={sound.playHover} onClickSound={sound.playClick} idx={idx} priority />
                        </div>
                      ))}
                  </div>
                </div>

                {/* DAILY SYSTEM TASKS — energy teal, consistent cards */}
                <div style={{marginBottom:"24px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"8px"}}>
                    <div style={{width:"3px",height:"14px",background:"#4A9A8A",borderRadius:"2px",boxShadow:"0 0 8px #4A9A8A"}}/>
                    <span style={{color:"#4A9A8A",fontSize:"0.68rem",letterSpacing:"3px",fontWeight:700}}>DAILY SYSTEM TASKS</span>
                  </div>
                  <div style={{color:"#5A7A9A",fontSize:"0.55rem",letterSpacing:"1px",marginBottom:"10px"}}>每日習慣 · 維持系統穩定</div>
                  {dailySystemQuests.map((q, idx) => {
                    const evolved = (streak>=3 && q.id===1) ? "基礎體能恢復 II：各項 120 下" : (streak>=3 && q.id===2) ? "基礎耐力訓練 II：6 公里/600 下" : undefined;
                    return (
                      <QuestCard key={q.id} quest={q} optionalDisplayLabel={evolved} accentColor="#4A9A8A" done={completed.includes(q.id)} onStart={()=>toggle(q.id)} onUndo={()=>setCompleted(completed.filter(x=>x!==q.id))} onHoverSound={sound.playHover} onClickSound={sound.playClick} idx={idx} />
                    );
                  })}
                </div>

                {/* SUPPORT MISSIONS — muted blue */}
                {supportQuests.length > 0 && (
                  <div style={{marginBottom:"24px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"8px"}}>
                      <div style={{width:"3px",height:"14px",background:"#6B8AAF",borderRadius:"2px",boxShadow:"0 0 6px #6B8AAF"}}/>
                      <span style={{color:"#6B8AAF",fontSize:"0.65rem",letterSpacing:"3px",fontWeight:600}}>SUPPORT MISSIONS</span>
                    </div>
                    <div style={{color:"#5A6A7A",fontSize:"0.52rem",letterSpacing:"1px",marginBottom:"10px"}}>輔助任務 · 不分散高優先事項</div>
                    {supportQuests.map((q, idx) => (
                      <QuestCard key={`support-${q.id}-${idx}`} quest={q} accentColor="#6B8AAF" done={completed.includes(q.id)} onStart={()=>toggle(q.id)} onUndo={()=>setCompleted(completed.filter(x=>x!==q.id))} onHoverSound={sound.playHover} onClickSound={sound.playClick} isAi={aiQuests.some(a=>a.id===q.id)} idx={idx} />
                    ))}
                  </div>
                )}

                {/* Boss Raid */}
                {weeklyBoss && (
                  <div style={{marginBottom:"20px"}}>
                    <div style={{marginBottom:"10px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                        <div style={{width:"3px",height:"14px",background:"#E74C3C",borderRadius:"2px",boxShadow:"0 0 8px #E74C3C"}}/>
                        <span style={{color:"#E74C3C",fontSize:"0.68rem",letterSpacing:"3px",fontWeight:700}}>BOSS RAID</span>
                      </div>
                      <div style={{color:"#6A8AAA",fontSize:"0.55rem",letterSpacing:"1px",marginTop:"4px"}}>地下城首領戰 · 深度消耗</div>
                    </div>
                    <div style={{border:"2px solid rgba(231,76,60,0.5)",borderRadius:"12px",padding:"2px",background:"rgba(231,76,60,0.06)",boxShadow:"0 0 20px rgba(231,76,60,0.15)"}}>
                      <QuestCard quest={weeklyBoss} accentColor="#E74C3C" done={false} onStart={()=>setActiveTimer(weeklyBoss)} onUndo={()=>{}} onHoverSound={sound.playHover} onClickSound={sound.playClick} />
                    </div>
                  </div>
                )}

                {/* Emergency Quest */}
                {emergencyActive && (
                  <div style={{marginBottom:"20px"}}>
                    <div style={{marginBottom:"10px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                        <div style={{width:"3px",height:"14px",background:"#F39C12",borderRadius:"2px",boxShadow:"0 0 8px #F39C12"}}/>
                        <span style={{color:"#F39C12",fontSize:"0.68rem",letterSpacing:"3px",fontWeight:700}}>EMERGENCY QUEST</span>
                      </div>
                      <div style={{color:"#8A7A5A",fontSize:"0.55rem",letterSpacing:"1px",marginTop:"4px"}}>緊急任務 · 環境整理</div>
                    </div>
                    {EMERGENCY_QUESTS.map((q, idx) => (
                      <QuestCard key={q.id} quest={q} accentColor="#F39C12" done={completed.includes(q.id)} onStart={()=>toggle(q.id)} onUndo={()=>setCompleted(completed.filter(x=>x!==q.id))} onHoverSound={sound.playHover} onClickSound={sound.playClick} idx={idx} />
                    ))}
                  </div>
                )}

                {/* DANGER ZONE — penalty, warning red, danger icon */}
                <div style={{marginBottom:"20px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px"}}>
                    <span style={{fontSize:"1rem"}} aria-hidden>⚠</span>
                    <div style={{width:"3px",height:"14px",background:"#E74C3C",borderRadius:"2px",boxShadow:"0 0 8px #E74C3C"}}/>
                    <span style={{color:"#E74C3C",fontSize:"0.68rem",letterSpacing:"3px",fontWeight:700}}>DANGER ZONE</span>
                  </div>
                  <div style={{color:"#7A4A4A",fontSize:"0.55rem",letterSpacing:"1px",marginBottom:"10px"}}>負面行為 · 一經套用無法取消 · 翌日 00:00 重置</div>
                  {DEBUFFS.map(d => {
                    const isActive = debuffs.includes(d.id);
                    const debuffBorder = isActive ? "rgba(231,76,60,0.25)" : "rgba(255,255,255,0.05)";
                    const debuffBorder2 = isActive ? "#E74C3C" : "#2A4A6A";
                    return (
                      <div key={d.id} className="task-row"
                        onClick={()=>{
                          if (isActive) return;
                          sound.playClick();
                          sound.playAlert();
                          setDebuffs([...debuffs, d.id]);
                        }}
                        style={{
                          display:"flex",alignItems:"center",gap:"12px",
                          padding:"12px 14px",marginBottom:"4px",
                          background:isActive?"rgba(231,76,60,0.08)":"rgba(255,255,255,0.02)",
                          border:"1px solid " + debuffBorder,
                          transition:"all 0.25s ease",
                          cursor:isActive?"default":"pointer",
                          opacity:isActive?0.9:1,
                        }}>
                        <div style={{width:"16px",height:"16px",borderRadius:"3px",flexShrink:0,
                          border:"1px solid " + debuffBorder2,
                          background:isActive?"rgba(231,76,60,0.2)":"transparent",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          boxShadow:isActive?"0 0 8px rgba(231,76,60,0.4)":"none"}}>
                          {isActive && <span style={{color:"#E74C3C",fontSize:"11px",fontWeight:"700"}}>✓</span>}
                        </div>
                        <span style={{flex:1,color:"#C8DCF0",fontSize:"0.85rem",fontWeight:500}}>{d.label}</span>
                        {isActive ? (
                          <span style={{color:"#8B6A6A",fontSize:"0.6rem",letterSpacing:"1px",marginRight:"8px"}}>已套用 · 翌日 00:00 重置</span>
                        ) : null}
                        <span className={`font-mono-num ${isActive ? "debuff-penalty-active" : ""}`} style={{color:"#E74C3C",fontSize:"0.7rem",fontWeight:600}} title={`原因：${d.label} (${d.exp} EXP)`}>{d.exp}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ); })()}

            {tab==="summary" && (
              <div className="summary-card-in" style={{display:"flex",flexDirection:"column",gap:"20px",opacity:0}}>
                {/* 橫向 HUD 標籤 — 玻璃擬態 */}
                <div style={{display:"flex",flexWrap:"wrap",gap:"10px",marginBottom:"4px"}}>
                  {[
                    {label:"RANK", value:rank+"-RANK", color:rc.color},
                    {label:"EXP", value:null as number|null, color:"#7AC0F4", num:totalExp},
                    {label:"DONE", value:null as number|null, color:"#3A7AD4", num:completed.length},
                    {label:"STREAK", value:null as number|null, color:getStreakColor(streak), num:streak},
                  ].map((s,i)=>(<div key={s.label} style={{
                    animation:"summarySectionIn 0.5s ease forwards",
                    animationDelay:`${i*0.06}s`,
                    opacity:0,
                    padding:"8px 14px",borderRadius:"10px",
                    background:"rgba(12,24,48,0.6)",backdropFilter:"blur(8px)",
                    border:`1px solid ${s.color}40`,boxShadow:`0 0 20px ${s.color}15, inset 0 1px 0 rgba(255,255,255,0.04)`,
                    display:"flex",alignItems:"center",gap:"8px",
                  }}>
                    <span style={{color:"#6B8AAF",fontSize:"0.5rem",letterSpacing:"2.5px",fontWeight:600}}>{s.label}</span>
                    <span style={{color:s.color,fontSize:"0.9rem",fontWeight:700}}>
                      {s.value!=null ? s.value : <CountUp target={s.num!} color={s.color} duration={400}/>}
                      {s.label==="STREAK" && streak>0 && " 🔥"}
                    </span>
                  </div>))}
                </div>

                {/* COMPLETED TODAY — 任務日誌 / 數據流風格 */}
                {completedTodayList.length>0 && (
                  <div style={{
                    animation:"summarySectionIn 0.55s ease forwards",
                    animationDelay:"0.12s",
                    opacity:0,
                    position:"relative",
                    background:"linear-gradient(135deg, rgba(34,197,94,0.06) 0%, rgba(12,24,48,0.85) 50%)",
                    border:"1px solid rgba(34,197,94,0.25)",
                    borderRadius:"14px",
                    padding:"18px 20px",
                    boxShadow:"0 0 30px rgba(34,197,94,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
                    overflow:"hidden",
                  }}>
                    <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,197,94,0.02) 2px, rgba(34,197,94,0.02) 4px)",pointerEvents:"none"}}/>
                    <div style={{position:"absolute",top:0,left:0,right:0,height:"1px",background:"linear-gradient(90deg, transparent, rgba(34,197,94,0.5), transparent)",animation:"dataLinePulse 2s ease-in-out infinite",opacity:0.6}}/>
                    <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"16px",position:"relative",zIndex:1}}>
                      <div style={{width:"4px",height:"18px",background:"linear-gradient(180deg,#4ADE80,#22C55E)",borderRadius:"2px",boxShadow:"0 0 12px rgba(74,222,128,0.5)"}}/>
                      <span style={{color:"#6EE7B7",fontSize:"0.65rem",letterSpacing:"5px",fontWeight:800}}>COMPLETED TODAY</span>
                      <span style={{color:"#4A6B5A",fontSize:"0.55rem",marginLeft:"auto"}}>MISSION_LOG</span>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:"2px",position:"relative",zIndex:1}}>
                      {completedTodayList.map((q, i)=>(
                        <div key={q.id} style={{
                          display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",
                          padding:"12px 14px",borderRadius:"10px",
                          borderLeft:"3px solid rgba(74,222,128,0.6)",
                          background: missionCompleteEffect?.questId === q.id ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.02)",
                          animation: missionCompleteEffect?.questId === q.id ? "completedItemIn 0.3s ease forwards, missionRowGlow 0.6s ease 0.2s forwards" : "completedItemIn 0.3s ease forwards",
                          animationDelay: missionCompleteEffect?.questId === q.id ? "0s, 0s" : `${i * 0.06}s`,
                          opacity: 0,
                        }}>
                          <span style={{color:"#A7F3D0",fontSize:"0.82rem",fontWeight:500,flex:1}}>✓ {q.label}</span>
                          <span style={{
                            padding:"4px 10px",borderRadius:"8px",
                            background:"linear-gradient(135deg, rgba(34,197,94,0.25), rgba(22,163,74,0.2))",
                            border:"1px solid rgba(74,222,128,0.4)",
                            color:"#86EFAC",fontSize:"0.72rem",fontWeight:700,
                            animation:"completedExpIn 0.2s ease 0.15s forwards",opacity:0,
                            boxShadow:"0 0 12px rgba(34,197,94,0.2)",
                          }}>+{q.exp} EXP</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ACHIEVEMENTS — 節點環 + 全息徽章 */}
                <div style={{
                  animation:"summarySectionIn 0.55s ease forwards",
                  animationDelay:"0.18s",
                  opacity:0,
                  position:"relative",
                  background:"linear-gradient(145deg, rgba(20,15,35,0.95) 0%, rgba(12,24,48,0.9) 100%)",
                  border:"1px solid rgba(240,192,48,0.3)",
                  borderRadius:"16px",
                  padding:"20px 22px",
                  boxShadow:"0 0 40px rgba(240,192,48,0.1), inset 0 0 60px rgba(240,192,48,0.03)",
                  overflow:"hidden",
                }}>
                  <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 80% 50% at 50% 0%, rgba(240,192,48,0.06), transparent 70%)",pointerEvents:"none"}}/>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"18px",position:"relative",zIndex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                      <span style={{fontSize:"1.1rem",filter:"drop-shadow(0 0 8px rgba(240,192,48,0.6))"}}>◇</span>
                      <span style={{color:"#FCD34D",fontSize:"0.7rem",letterSpacing:"5px",fontWeight:800,textShadow:"0 0 20px rgba(252,211,77,0.4)"}}>ACHIEVEMENTS</span>
                    </div>
                    <span style={{color:"#A78B4A",fontSize:"0.6rem",letterSpacing:"2px",fontWeight:600}}>{unlockedAchievements.length}/{ACHIEVEMENTS.length} UNLOCKED</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:"14px",marginBottom:"18px",position:"relative",zIndex:1}}>
                    {ACHIEVEMENTS.map((a,idx)=>{
                      const unlocked = unlockedAchievements.includes(a.id);
                      return (
                        <div key={a.id} title={a.title} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"8px"}}>
                          <div className={unlocked ? "glow-breath" : ""} style={{
                            position:"relative",
                            width:"52px",height:"52px",borderRadius:"50%",
                            background: unlocked ? "linear-gradient(145deg, rgba(252,211,77,0.25), rgba(245,158,11,0.15))" : "rgba(255,255,255,0.03)",
                            border: unlocked ? "2px solid rgba(252,211,77,0.7)" : "1px solid rgba(255,255,255,0.08)",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            boxShadow: unlocked ? "0 0 24px rgba(240,192,48,0.35), inset 0 0 20px rgba(252,211,77,0.1)" : "none",
                            animation: "summarySectionIn 0.4s ease forwards",
                            animationDelay: `${0.22 + idx*0.04}s`,
                            opacity: 0,
                          }}>
                            {unlocked && <div style={{position:"absolute",inset:"-4px",borderRadius:"50%",border:"1px solid rgba(252,211,77,0.25)",animation:"nodeRing 2s ease-in-out infinite"}}/>}
                            <span style={{fontSize:unlocked ? "1.4rem" : "0.9rem",opacity:unlocked ? 1 : 0.3,filter:unlocked ? "drop-shadow(0 0 6px rgba(252,211,77,0.8))" : "none"}}>{unlocked ? a.icon : "○"}</span>
                          </div>
                          {unlocked && (
                            <div style={{
                              padding:"4px 10px",borderRadius:"8px",
                              background:"linear-gradient(135deg, rgba(252,211,77,0.15), rgba(245,158,11,0.08))",
                              border:"1px solid rgba(252,211,77,0.4)",
                              boxShadow:"0 0 16px rgba(240,192,48,0.2)",
                              maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                            }}>
                              <span style={{color:"#FDE68A",fontSize:"0.58rem",letterSpacing:"1px",fontWeight:600}}>{a.title}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SKILL TREE — 科技樹節點 + 連線感 */}
                <div style={{
                  animation:"summarySectionIn 0.55s ease forwards",
                  animationDelay:"0.24s",
                  opacity:0,
                  position:"relative",
                  background:"linear-gradient(160deg, rgba(12,35,40,0.95) 0%, rgba(12,24,48,0.92) 100%)",
                  border:"1px solid rgba(74,154,138,0.35)",
                  borderRadius:"16px",
                  padding:"22px 24px",
                  boxShadow:"0 0 35px rgba(74,154,138,0.12), inset 0 0 50px rgba(74,154,138,0.04)",
                  overflow:"hidden",
                }}>
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg, transparent 0%, rgba(74,154,138,0.03) 50%, transparent 100%)",pointerEvents:"none"}}/>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px",position:"relative",zIndex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                      <div style={{width:"4px",height:"20px",background:"linear-gradient(180deg,#5EEAD4,#2DD4BF)",borderRadius:"2px",boxShadow:"0 0 14px rgba(94,234,212,0.5)"}}/>
                      <span style={{color:"#5EEAD4",fontSize:"0.7rem",letterSpacing:"5px",fontWeight:800,textShadow:"0 0 18px rgba(94,234,212,0.35)"}}>SKILL TREE</span>
                    </div>
                    <span style={{color:"#4A7A6A",fontSize:"0.6rem",letterSpacing:"2px",fontWeight:600}}>{unlockedSkillIds.length}/{SKILLS.length} UNLOCKED</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"18px",position:"relative",zIndex:1}}>
                    {(["EXECUTION","INTELLIGENCE","PHYSICAL"] as SkillTree[]).map((tree, treeIdx)=>{
                      const treeSkills = SKILLS.filter(s=>s.tree===tree);
                      const unlockedInTree = treeSkills.filter(s=>unlockedSkillIds.includes(s.id)).length;
                      const pct = treeSkills.length ? (unlockedInTree / treeSkills.length) * 100 : 0;
                      const treeColor = tree==="EXECUTION" ? "#38BDF8" : tree==="INTELLIGENCE" ? "#A78BFA" : "#34D399";
                      return (
                        <div key={tree} style={{
                          padding:"16px 18px",
                          borderRadius:"14px",
                          background:"rgba(0,0,0,0.25)",
                          border:`1px solid ${treeColor}30`,
                          boxShadow:`0 0 20px ${treeColor}10, inset 0 1px 0 rgba(255,255,255,0.03)`,
                          animation:"summarySectionIn 0.45s ease forwards",
                          animationDelay:`${0.28 + treeIdx*0.06}s`,
                          opacity:0,
                        }}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
                            <span style={{color:treeColor,fontSize:"0.62rem",letterSpacing:"3px",fontWeight:700}}>{tree}</span>
                            <span style={{color:"#5A7A6A",fontSize:"0.52rem"}}>{unlockedInTree}/{treeSkills.length}</span>
                          </div>
                          <div style={{height:"5px",background:"rgba(255,255,255,0.06)",borderRadius:"3px",marginBottom:"14px",overflow:"hidden",boxShadow:"inset 0 1px 2px rgba(0,0,0,0.2)"}}>
                            <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${treeColor}88,${treeColor})`,borderRadius:"3px",transition:"width 0.5s ease",boxShadow:`0 0 10px ${treeColor}50`}}/>
                          </div>
                          {treeSkills.map((s,i)=>{
                            const ok = unlockedSkillIds.includes(s.id);
                            const isNewUnlock = justUnlockedSkillId === s.id;
                            return (
                              <div key={s.id} style={{
                                display:"flex",alignItems:"center",gap:"8px",marginBottom:"8px",
                                padding:"6px 8px",borderRadius:"8px",
                                ...(isNewUnlock ? {animation:"skillNodeFlash 0.6s ease 2 forwards",background:"rgba(74,154,138,0.15)"} : {}),
                              }}>
                                <span className={ok ? "glow-breath" : ""} style={{
                                  width:"22px",height:"22px",borderRadius:"50%",
                                  border:ok ? `2px solid ${treeColor}` : "1px solid rgba(255,255,255,0.1)",
                                  background:ok ? `${treeColor}22` : "rgba(255,255,255,0.04)",
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                  fontSize:"0.65rem",color:ok ? treeColor : "rgba(255,255,255,0.25)",
                                  boxShadow:ok ? `0 0 12px ${treeColor}40` : "none",
                                }}>{ok?"✓":"○"}</span>
                                <span style={{flex:1,color:ok?"#C8E0E8":"#4A6078",fontSize:"0.68rem",fontWeight:500}}>{s.name}</span>
                                {ok && <span style={{color:"#34D399",fontSize:"0.58rem",fontWeight:700}}>+{s.expBonusPercent}%</span>}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab==="analytics" && (() => {
                const glass = { background:"rgba(255,255,255,0.03)", backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)" };
                return (
              <div style={{animation:"fadeUp 0.35s ease forwards",display:"flex",flexDirection:"column",gap:"24px"}}>
                {/* RADAR — 透明玻璃，青藍強調 */}
                <div style={{
                  animation:"summarySectionIn 0.5s ease forwards",opacity:0,
                  position:"relative",borderRadius:"16px",padding:"22px 24px",
                  ...glass,border:"1px solid rgba(0,194,255,0.25)",boxShadow:"0 0 24px rgba(0,194,255,0.08)",
                  overflow:"hidden",
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"18px",position:"relative",zIndex:1}}>
                    <div style={{width:"4px",height:"18px",background:"#00C2FF",borderRadius:"2px",boxShadow:"0 0 12px #00C2FF"}}/>
                    <span style={{color:"#00C2FF",fontSize:"0.72rem",letterSpacing:"5px",fontWeight:800}}>RADAR</span>
                  </div>
                  <div style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"1.5px",marginBottom:"16px",position:"relative",zIndex:1}}>五維屬性 · 能力矩陣</div>
                  <div style={{display:"flex",justifyContent:"center",alignItems:"center",padding:"24px",background:"rgba(255,255,255,0.02)",borderRadius:"14px",border:"1px solid rgba(0,194,255,0.15)",position:"relative",zIndex:1}}>
                    <div style={{transform:"scale(1.2)",overflow:"visible"}}>
                      <AnalyticsRadarChart values={attrs.map(a=>a.value||5)} colors={["#00C2FF","#3F8CFF","#00C2B3","#4A9A8A","#9C6BFF"]} labels={attrs.map(a=>a.label)}/>
                    </div>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"12px",marginTop:"16px",justifyContent:"center",position:"relative",zIndex:1}}>
                    {attrs.map((a,i)=>(
                      <div key={a.key} style={{display:"flex",alignItems:"center",gap:"6px",padding:"6px 12px",borderRadius:"8px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)"}}>
                        <div style={{width:"8px",height:"8px",borderRadius:"2px",background:["#00C2FF","#3F8CFF","#00C2B3","#4A9A8A","#9C6BFF"][i],boxShadow:`0 0 8px ${["#00C2FF","#3F8CFF","#00C2B3","#4A9A8A","#9C6BFF"][i]}`}}/>
                        <span style={{color:"#A5D4F7",fontSize:"0.6rem",letterSpacing:"1px",fontWeight:500}}>{a.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 核心數據卡 — 透明玻璃，每格不同強調色 */}
                <div className="analytics-stat-grid" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px"}}>
                  {[
                    { label: "RANK", value: `${rank}-RANK`, color: rc.color },
                    { label: "LEVEL", num: level, color: "#3F8CFF" },
                    { label: "EXP", value: `${todayExp>=0?"+":""}${todayExp}`, color: todayExp>=0 ? "#22C55E" : "#EF4444" },
                    { label: "STREAK", num: streak, color: getStreakColor(streak) },
                  ].map((s,i) => (
                    <div key={s.label} style={{
                      animation:"summarySectionIn 0.5s ease forwards",animationDelay:`${0.06*(i+1)}s`,opacity:0,
                      padding:"14px 16px",borderRadius:"12px",textAlign:"center",
                      ...glass,border:"1px solid rgba(255,255,255,0.08)",boxShadow:"0 0 24px rgba(255,255,255,0.06)",
                    }}>
                      <div style={{color:"#7A9ABB",fontSize:"0.5rem",letterSpacing:"2.5px",marginBottom:"8px",fontWeight:600}}>{s.label}</div>
                      <div style={{fontSize:"1.15rem",fontWeight:700,color:s.color,textShadow:`0 0 10px ${s.color}88`}}>
                        {s.value != null ? s.value : <CountUp target={s.num!} color={s.color} duration={1000}/>}
                        {s.label==="STREAK" && streak>0 && " 🔥"}
                      </div>
                    </div>
                  ))}
                </div>

                {/* EXP TREND — 透明玻璃，藍色強調 */}
                <div style={{
                  animation:"summarySectionIn 0.55s ease forwards",animationDelay:"0.28s",opacity:0,
                  position:"relative",borderRadius:"16px",padding:"22px 24px",
                  ...glass,border:"1px solid rgba(63,140,255,0.25)",boxShadow:"0 0 24px rgba(63,140,255,0.08)",
                  overflow:"hidden",
                }}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"12px",marginBottom:"16px",position:"relative",zIndex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                      <div style={{width:"4px",height:"16px",background:"#3F8CFF",borderRadius:"2px",boxShadow:"0 0 10px #3F8CFF"}}/>
                      <span style={{color:"#5AA4FF",fontSize:"0.68rem",letterSpacing:"5px",fontWeight:700}}>EXP TREND</span>
                    </div>
                    <div style={{display:"flex",gap:"6px"}}>
                      {(["7","14","30"] as const).map(r=>(
                        <button key={r} onClick={()=>{ sound.playClick(); setExpRange(r); }} style={{
                          padding:"8px 16px",borderRadius:"8px",border:`1px solid ${expRange===r?"#3F8CFF":"rgba(63,140,255,0.2)"}`,
                          background:expRange===r?"rgba(63,140,255,0.12)":"transparent",color:expRange===r?"#93C5FD":"#7A9ABB",
                          fontSize:"0.62rem",letterSpacing:"2px",cursor:"pointer",fontFamily:"inherit",fontWeight:600,
                          boxShadow:expRange===r?"0 0 12px rgba(63,140,255,0.2)":"none",transition:"all 0.25s ease",
                        }}>{r}d</button>
                      ))}
                    </div>
                  </div>
                  <div style={{padding:"8px 0",position:"relative",zIndex:1}}>
                    <AnalyticsGrowthCurve color="#3F8CFF" data={
                      expRange==="7" ? analyticsData.weekData.map(d=>({label:d.day,exp:d.exp})) :
                      expRange==="14" ? analyticsData.dailyExpLast14.map(d=>({label:d.label,exp:d.exp})) :
                      analyticsData.dailyExpLast30
                    }/>
                  </div>
                  <div style={{display:"flex",justifyContent:"center",gap:"28px",marginTop:"16px",paddingTop:"14px",borderTop:"1px solid rgba(255,255,255,0.06)",position:"relative",zIndex:1}}>
                    <span style={{color:"#7A9ABB",fontSize:"0.58rem",letterSpacing:"2px"}}>COMPLETION <span style={{color:"#7AC0F4",fontWeight:700}}>{analyticsData.completionRatePct}%</span></span>
                    <span style={{color:analyticsData.weeklyDiff>=0?"#22C55E":"#EF4444",fontSize:"0.58rem",letterSpacing:"2px",fontWeight:600}}>{analyticsData.weeklyDiff>=0?"↑":"↓"} {Math.abs(analyticsData.weeklyDiff)} vs last</span>
                  </div>
                </div>

                {/* TODAY LOG — 透明玻璃，綠色強調 */}
                <div style={{
                  animation:"summarySectionIn 0.55s ease forwards",animationDelay:"0.45s",opacity:0,
                  position:"relative",borderRadius:"16px",padding:"22px 24px",
                  ...glass,border:"1px solid rgba(74,222,128,0.25)",boxShadow:"0 0 24px rgba(34,197,94,0.08)",
                  overflow:"hidden",
                }}>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:"1px",background:"linear-gradient(90deg, transparent, rgba(74,222,128,0.5), transparent)",opacity:0.6}}/>
                  <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"16px",position:"relative",zIndex:1}}>
                    <div style={{width:"4px",height:"18px",background:"linear-gradient(180deg,#4ADE80,#22C55E)",borderRadius:"2px",boxShadow:"0 0 12px rgba(74,222,128,0.4)"}}/>
                    <span style={{color:"#6EE7B7",fontSize:"0.68rem",letterSpacing:"5px",fontWeight:800}}>TODAY LOG</span>
                    <span style={{color:"#4A6B5A",fontSize:"0.52rem",marginLeft:"auto"}}>MISSION_LOG</span>
                  </div>
                  {completedTodayList.length===0 ? (
                    <div style={{padding:"24px",borderRadius:"10px",border:"1px dashed rgba(74,222,128,0.2)",color:"#5A7A6A",fontSize:"0.65rem",textAlign:"center",position:"relative",zIndex:1}}>No missions completed today</div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:"6px",position:"relative",zIndex:1}}>
                      {completedTodayList.map(q=>(
                          <div key={q.id} style={{
                            display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderRadius:"10px",
                            borderLeft:"3px solid rgba(74,222,128,0.5)",background:"rgba(255,255,255,0.02)",
                          }}>
                            <span style={{color:"#A7F3D0",fontSize:"0.78rem",fontWeight:500}}>✓ {q.label}</span>
                            <span style={{padding:"4px 10px",borderRadius:"8px",background:"rgba(34,197,94,0.15)",border:"1px solid rgba(74,222,128,0.35)",color:"#86EFAC",fontSize:"0.7rem",fontWeight:700}}>+{q.exp} EXP</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ); })()}
          </div>
        </div>

        <div style={{marginTop:"32px",paddingTop:"16px",
          borderTop:"1px solid rgba(58,122,212,0.1)",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#3A5070",fontSize:"0.6rem",letterSpacing:"3px",fontWeight:500}}>
            SOLO LEVELING EQUATION · SYSTEM v2.0
          </span>
          <span style={{color:"#3A7AD4",fontSize:"0.6rem",animation:"blink 3s ease-in-out infinite"}}>■</span>
        </div>
      </div>
    </main>
      )}
    </>
  );
}