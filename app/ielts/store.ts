"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IELTS_GOOGLE_AI_KEY_LS } from "./llm-key-storage";

export type IELTSSection = "today" | "calendar" | "cards" | "records" | "scores" | "settings";

/** 字卡分類 id（自訂類別存在 settings.flashcardCategories） */
export type FlashcardCategory = string;

export type FlashcardCategoryDef = {
  id: string;
  label: string;
};

export const DEFAULT_FLASHCARD_CATEGORIES: FlashcardCategoryDef[] = [
  { id: "vocab", label: "詞彙" },
  { id: "writing", label: "寫作" },
  { id: "speaking", label: "口說" },
  { id: "grammar", label: "語法" },
];

export type Flashcard = {
  id: string;
  word: string;
  meaning: string;
  example?: string;
  category: FlashcardCategory;
  mastered: boolean;
  createdAt: string;
};

export type FlashcardWordPatchV1 = {
  type: "flashcard_word_patch";
  schemaVersion: 1;
  createdAt?: string;
  /** id -> new word */
  map: Record<string, string>;
};

function isFlashcardWordPatchV1(json: unknown): json is FlashcardWordPatchV1 {
  if (!json || typeof json !== "object") return false;
  const o = json as Record<string, unknown>;
  if (o.type !== "flashcard_word_patch") return false;
  if (o.schemaVersion !== 1) return false;
  if (!o.map || typeof o.map !== "object") return false;
  return true;
}

export type FlashcardTextPatchV1 = {
  type: "flashcard_text_patch";
  schemaVersion: 1;
  createdAt?: string;
  /** id -> { word?, meaning? } */
  map: Record<string, { word?: string; meaning?: string }>;
};

function isFlashcardTextPatchV1(json: unknown): json is FlashcardTextPatchV1 {
  if (!json || typeof json !== "object") return false;
  const o = json as Record<string, unknown>;
  if (o.type !== "flashcard_text_patch") return false;
  if (o.schemaVersion !== 1) return false;
  if (!o.map || typeof o.map !== "object") return false;
  return true;
}
export type SkillType = "L" | "R" | "W" | "S";

/** `writing` 為舊版單一寫作類型，統計與篩選時視同 Part 2 */
export type SpeakingWritingType = "writing" | "writing_part1" | "writing_part2" | "speaking";

export function isSwRecordWriting(t: SpeakingWritingType): boolean {
  return t === "writing" || t === "writing_part1" || t === "writing_part2";
}

function looksLikeReadingFlashcardCategory(c: FlashcardCategoryDef): boolean {
  const id = c.id.toLowerCase();
  const lab = c.label.trim();
  const labLo = lab.toLowerCase();
  if (id === "reading" || /\breading\b/.test(id)) return true;
  // 繁體 閱讀、簡體 阅读（舊版只比對「閱讀」會漏掉簡體，導致仍留在 pool 變成 pool[0]）
  if (/閱讀|阅读/.test(lab)) return true;
  if (labLo === "reading" || /\breading\b/i.test(lab)) return true;
  return false;
}

function looksLikeSpeakingFlashcardCategory(c: FlashcardCategoryDef): boolean {
  const id = c.id.toLowerCase();
  const lab = c.label.trim();
  if (id === "speaking") return true;
  if (/\b(speaking|spoken)\b/.test(id) || /_speak|speak_/.test(id)) return true;
  return /口說|口语|口語|說話|Speaking|SPEAKING|IELTS\s*S\b|Oral/i.test(lab);
}

function looksLikeWritingFlashcardCategory(c: FlashcardCategoryDef): boolean {
  const id = c.id.toLowerCase();
  const lab = c.label.trim();
  if (id === "writing") return true;
  if (/\bwriting\b/.test(id)) return true;
  return /寫作|写作|Writing|WRITING/i.test(lab);
}

function pickSpeakingCategoryId(categories: FlashcardCategoryDef[]): FlashcardCategory | null {
  const byId = categories.find((c) => c.id === "speaking");
  if (byId) return byId.id;
  const hit = categories.find(looksLikeSpeakingFlashcardCategory);
  return hit?.id ?? null;
}

function pickWritingCategoryId(categories: FlashcardCategoryDef[]): FlashcardCategory | null {
  const byId = categories.find((c) => c.id === "writing");
  if (byId) return byId.id;
  const hit = categories.find(looksLikeWritingFlashcardCategory);
  return hit?.id ?? null;
}

/**
 * 口說記錄 → 口說字卡類；寫作 → 寫作類。
 * 自訂類別 id 若與預設不同，會依標籤（含簡體「阅读」）辨識，避免誤入閱讀。
 */
export function flashcardCategoryIdForSwRecord(
  categories: FlashcardCategoryDef[],
  type: SpeakingWritingType,
): FlashcardCategory {
  if (categories.length === 0) return "vocab";

  if (type === "speaking") {
    const direct = pickSpeakingCategoryId(categories);
    if (direct) return direct;
    const nonRead = categories.filter((c) => !looksLikeReadingFlashcardCategory(c));
    const fromPool = pickSpeakingCategoryId(nonRead);
    if (fromPool) return fromPool;
    return (nonRead[0] ?? categories[0]).id;
  }

  if (isSwRecordWriting(type)) {
    const direct = pickWritingCategoryId(categories);
    if (direct) return direct;
    const nonRead = categories.filter((c) => !looksLikeReadingFlashcardCategory(c));
    const fromPool = pickWritingCategoryId(nonRead);
    if (fromPool) return fromPool;
    return (nonRead[0] ?? categories[0]).id;
  }

  return categories[0].id;
}

/**
 * 將 localStorage／舊版寫入的 category id 對齊到目前 `flashcardCategories` 裡實際存在的 id。
 * 避免「speaking」等預設 id 在使用者自訂類別後不存在，載入時被誤改成第一個類別（常為閱讀）。
 */
function coerceFlashcardCategoryId(categories: FlashcardCategoryDef[], stored: string): string {
  if (categories.length === 0) return "vocab";
  const valid = new Set(categories.map((c) => c.id));
  if (valid.has(stored)) return stored;

  const lo = stored.trim().toLowerCase();

  if (lo === "speaking" || lo === "spoken") {
    return pickSpeakingCategoryId(categories) ?? categories[0].id;
  }
  if (lo === "writing") {
    return pickWritingCategoryId(categories) ?? categories[0].id;
  }
  if (lo === "reading") {
    const hit = categories.find(looksLikeReadingFlashcardCategory);
    return hit?.id ?? categories[0].id;
  }
  if (lo === "vocab") {
    const hit = categories.find((c) => c.id === "vocab" || /詞彙|词汇/i.test(c.label));
    return hit?.id ?? categories[0].id;
  }
  if (lo === "grammar") {
    const hit = categories.find(
      (c) => c.id.toLowerCase() === "grammar" || /語法|语法|grammar/i.test(c.label),
    );
    return hit?.id ?? categories[0].id;
  }

  return categories[0].id;
}

/** 從答案標記字串（!!…!! 紅標）取出不重複片語，空白正規化 */
export function extractRedSegmentsFromAnswerMarkup(s: string): string[] {
  const re = /!!([\s\S]*?)!!/g;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const t = (m[1] ?? "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
export type SpeakingWritingEntry = {
  id: string;
  type: SpeakingWritingType;
  prompt: string;
  myAnswer: string;
  improvedAnswer: string;
  notes?: string;
  /** 附圖（壓縮後 data URL），詳情頁預覽用 */
  attachmentImageDataUrl?: string;
  createdAt: string; // YYYY-MM-DD
  updatedAt: string; // YYYY-MM-DD
};

export type DayTask = {
  id: string;
  time: string;
  icon: string;
  label: string;
  task: string;
  tip: string;
};

export type DayPlan = {
  day: number; // 1..25
  theme: string;
  tasks: DayTask[];
};

export type MockScore = {
  id: string;
  date: string; // YYYY-MM-DD
  day?: number;
  L?: number;
  R?: number;
  W?: number;
  S?: number;
};

export type WrongItem = {
  id: string;
  type: SkillType;
  description: string;
  createdDate: string; // YYYY-MM-DD
  nextReview: string; // YYYY-MM-DD
  mastered: boolean;
  reviewStage: number; // 0..n
};

export type Settings = {
  schemaVersion: number;
  startDate: string; // YYYY-MM-DD
  examDate: string; // YYYY-MM-DD
  dailyGoalMinutes: number;
  pomodoroFocusMin: number;
  pomodoroBreakMin: number;
  /** 字卡分類：id 穩定供既有字卡／匯入 JSON 對應；label 為顯示名稱 */
  flashcardCategories: FlashcardCategoryDef[];
};

export type PomodoroPhase = "idle" | "focus" | "break" | "pause";
export type PomodoroSession = {
  phase: PomodoroPhase;
  endAt: number | null; // epoch ms
  pausedPhase: "focus" | "break" | null;
  remainingMs: number | null;
  focusMin: number;
  breakMin: number;
  startedAt: number | null;
};

type Overrides = Record<number, DayTask[]>;
type Completion = Record<string, boolean>; // `${day}_${taskId}`
type Notes = Record<number, string>;

const KEY_VERSION = "ielts_schema_version";
const KEY_SETTINGS = "ielts_settings";
const KEY_OVERRIDE = "ielts_custom_tasks";
const KEY_COMPLETION = "ielts_completed";
const KEY_NOTES = "ielts_notes";
const KEY_SCORES = "ielts_scores";
const KEY_WRONG = "ielts_wrong_questions";
const KEY_POMO_SESSION = "ielts_pomodoro_session";
const KEY_FLASHCARDS = "ielts_flashcards_v1";
const KEY_FLASHCARD_REVIEW_QUEUE = "ielts_flashcard_review_queue_v1";
export const IELTS_SW_RECORDS_KEY = "ielts_sw_records_v1";

/** 字卡篩選「待複習」系列用，避免與自訂類別 id 衝突 */
export const FLASHCARD_REVIEW_QUEUE_FILTER_ID = "__ielts_review_queue__";

export const IELTS_STORAGE_KEYS = [
  KEY_VERSION,
  KEY_SETTINGS,
  KEY_OVERRIDE,
  KEY_COMPLETION,
  KEY_NOTES,
  KEY_SCORES,
  KEY_WRONG,
  KEY_POMO_SESSION,
  KEY_FLASHCARDS,
  KEY_FLASHCARD_REVIEW_QUEUE,
  IELTS_SW_RECORDS_KEY,
] as const;

const SCHEMA_VERSION = 1;

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** 同一 id 只保留第一張；缺 id 則補 uuid（避免重複 merge／匯入造成 React key 重複） */
function dedupeFlashcardsById(cards: Flashcard[]): Flashcard[] {
  const seen = new Set<string>();
  const out: Flashcard[] = [];
  for (const c of cards) {
    const id = typeof c.id === "string" && c.id.trim() ? c.id.trim() : crypto.randomUUID();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id === c.id ? c : { ...c, id });
  }
  return out;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function lsGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  return safeParse<T>(localStorage.getItem(key));
}

export function migrateSwRecords(raw: unknown): SpeakingWritingEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SpeakingWritingEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const obj = r as Partial<Record<string, unknown>>;
    const id = typeof obj.id === "string" ? obj.id : null;
    const typeRaw = obj.type;
    const tr = typeof typeRaw === "string" ? typeRaw.trim().toLowerCase() : "";
    const type =
      tr === "writing" || tr === "writing_part1" || tr === "writing_part2" || tr === "speaking"
        ? (tr as SpeakingWritingType)
        : null;
    const prompt = typeof obj.prompt === "string" ? obj.prompt : null;
    const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : todayIso();
    const updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt : createdAt;
    if (!id || !type || !prompt) continue;
    const notes = typeof obj.notes === "string" ? obj.notes : undefined;
    // v1: response -> myAnswer, improvedAnswer 空白
    const response = typeof obj.response === "string" ? obj.response : "";
    const myAnswer = typeof obj.myAnswer === "string" ? obj.myAnswer : response;
    const improvedAnswer = typeof obj.improvedAnswer === "string" ? obj.improvedAnswer : "";
    const rawAtt = obj.attachmentImageDataUrl;
    const attachmentImageDataUrl =
      typeof rawAtt === "string" && rawAtt.startsWith("data:image/") && rawAtt.length < 4_000_000 ? rawAtt : undefined;
    out.push({
      id,
      type,
      prompt,
      myAnswer,
      improvedAnswer,
      notes,
      attachmentImageDataUrl,
      createdAt,
      updatedAt,
    });
  }
  return out;
}

function lsSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function dayDiff(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00`).getTime();
  const b = new Date(`${bIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function generateDefaultSchedule(): DayPlan[] {
  const plans: DayPlan[] = [];
  for (let day = 1; day <= 25; day++) {
    const theme =
      day <= 5 ? "基礎打底 · 摸清現況" :
      day <= 10 ? "閱讀與聽力 · 穩定節奏" :
      day <= 15 ? "寫作結構 · 精準表達" :
      day <= 20 ? "口說流暢 · 混合演練" :
      "總複習 · 模考與調整";
    const tasks: DayTask[] = [
      {
        id: `d${day}-warmup`,
        time: "10–15 分",
        icon: "☕",
        label: "暖身",
        task: "輕量開場：複習幾個單字，或短句跟讀。",
        tip: "從小的步驟開始，慢慢進入狀態就好。",
      },
      {
        id: `d${day}-core`,
        time: day % 2 === 0 ? "45 分" : "60 分",
        icon: day % 2 === 0 ? "📖" : "🎧",
        label: day % 2 === 0 ? "閱讀核心" : "聽力核心",
        task:
          day % 2 === 0
            ? "計時完成一組閱讀，訂正並寫下錯因。"
            : "完成一組聽力，對照原文整理聽不懂的片段。",
        tip: "記下最多三個錯誤與對應的修正方式。",
      },
      {
        id: `d${day}-writing`,
        time: "30 分",
        icon: "✎",
        label: "寫作",
        task: "Task 2：先列大綱，再寫一段並潤飾銜接與用字。",
        tip: "這一輪優先顧好邏輯與文法，不必追求完美長度。",
      },
      {
        id: `d${day}-speaking`,
        time: "15 分",
        icon: "💬",
        label: "口說",
        task: "Part 2：錄一段回答，聽回放後調整卡頓處。",
        tip: "流暢比用艱深詞彙更重要。",
      },
    ];
    plans.push({ day, theme, tasks });
  }
  return plans;
}

function defaultSettings(): Settings {
  const start = todayIso();
  // default exam date = +25 days
  const exam = new Date(`${start}T00:00:00`);
  exam.setDate(exam.getDate() + 24);
  const yyyy = exam.getFullYear();
  const mm = String(exam.getMonth() + 1).padStart(2, "0");
  const dd = String(exam.getDate()).padStart(2, "0");
  return {
    schemaVersion: SCHEMA_VERSION,
    startDate: start,
    examDate: `${yyyy}-${mm}-${dd}`,
    dailyGoalMinutes: 150,
    pomodoroFocusMin: 25,
    pomodoroBreakMin: 5,
    flashcardCategories: DEFAULT_FLASHCARD_CATEGORIES.map((c) => ({ ...c })),
  };
}

function parseFlashcardCategories(raw: unknown): FlashcardCategoryDef[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_FLASHCARD_CATEGORIES.map((c) => ({ ...c }));
  const out: FlashcardCategoryDef[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as { id?: unknown; label?: unknown };
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label });
  }
  return out.length > 0 ? out : DEFAULT_FLASHCARD_CATEGORIES.map((c) => ({ ...c }));
}

export function flashcardCategoryLabel(categoryId: string, defs: FlashcardCategoryDef[]): string {
  return defs.find((d) => d.id === categoryId)?.label ?? categoryId;
}

function normalizeFlashcardReviewQueue(ids: unknown, validIds: Set<string>): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of ids) {
    if (typeof x !== "string" || !x.trim() || !validIds.has(x) || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

/** Strip fields removed from Settings so old localStorage / backups still load. */
function sanitizeSettingsRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const { targetOverallBand: _removed, ...rest } = raw;
  void _removed;
  return rest;
}

function migrateIfNeeded() {
  if (typeof window === "undefined") return;
  const v = Number(localStorage.getItem(KEY_VERSION) ?? "0");
  if (!Number.isFinite(v) || v >= SCHEMA_VERSION) return;
  // v0 -> v1: ensure keys exist
  if (!localStorage.getItem(KEY_SETTINGS)) lsSet(KEY_SETTINGS, defaultSettings());
  if (!localStorage.getItem(KEY_OVERRIDE)) lsSet(KEY_OVERRIDE, {});
  if (!localStorage.getItem(KEY_COMPLETION)) lsSet(KEY_COMPLETION, {});
  if (!localStorage.getItem(KEY_NOTES)) lsSet(KEY_NOTES, {});
  if (!localStorage.getItem(KEY_SCORES)) lsSet(KEY_SCORES, []);
  if (!localStorage.getItem(KEY_WRONG)) lsSet(KEY_WRONG, []);
  if (!localStorage.getItem(KEY_FLASHCARDS)) lsSet(KEY_FLASHCARDS, []);
  if (!localStorage.getItem(KEY_POMO_SESSION)) {
    const s: PomodoroSession = {
      phase: "idle",
      endAt: null,
      pausedPhase: null,
      remainingMs: null,
      focusMin: defaultSettings().pomodoroFocusMin,
      breakMin: defaultSettings().pomodoroBreakMin,
      startedAt: null,
    };
    lsSet(KEY_POMO_SESSION, s);
  }
  localStorage.setItem(KEY_VERSION, String(SCHEMA_VERSION));
}

export function useIELTSStore() {
  const [ready, setReady] = useState(false);
  const scheduleDefault = useMemo(() => generateDefaultSchedule(), []);

  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [override, setOverride] = useState<Overrides>({});
  const [completion, setCompletion] = useState<Completion>({});
  const [notes, setNotes] = useState<Notes>({});
  const [scores, setScores] = useState<MockScore[]>([]);
  const [wrongItems, setWrongItems] = useState<WrongItem[]>([]);
  const [pomo, setPomo] = useState<PomodoroSession>({
    phase: "idle",
    endAt: null,
    pausedPhase: null,
    remainingMs: null,
    focusMin: settings.pomodoroFocusMin,
    breakMin: settings.pomodoroBreakMin,
    startedAt: null,
  });
  /** Bumps on each tick while focus/break runs so remaining sec (from Date.now vs endAt) recomputes. */
  const [pomoDisplayTick, setPomoDisplayTick] = useState(0);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const flashcardsRef = useRef<Flashcard[]>([]);
  flashcardsRef.current = flashcards;
  const [flashcardReviewQueue, setFlashcardReviewQueue] = useState<string[]>([]);
  const [swRecords, setSwRecords] = useState<SpeakingWritingEntry[]>([]);

  /** 從 localStorage 重新載入（雲端拉取寫入 LS 後呼叫，與初次 hydrate 邏輯相同） */
  const reloadFromLocalStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    migrateIfNeeded();
    if (localStorage.getItem(KEY_FLASHCARDS) === null) lsSet(KEY_FLASHCARDS, []);
    if (localStorage.getItem(KEY_FLASHCARD_REVIEW_QUEUE) === null) lsSet(KEY_FLASHCARD_REVIEW_QUEUE, []);
    if (localStorage.getItem(IELTS_SW_RECORDS_KEY) === null) lsSet(IELTS_SW_RECORDS_KEY, []);
    const rawSettings = lsGet<Record<string, unknown>>(KEY_SETTINGS);
    let mergedSettings: Settings = defaultSettings();
    if (rawSettings) {
      const cleaned = { ...(sanitizeSettingsRaw(rawSettings) as Record<string, unknown>) };
      const cats = parseFlashcardCategories(cleaned.flashcardCategories);
      delete cleaned.flashcardCategories;
      mergedSettings = { ...defaultSettings(), ...cleaned, flashcardCategories: cats } as Settings;
    }
    setSettings(mergedSettings);
    const validCat = new Set(mergedSettings.flashcardCategories.map((c) => c.id));
    setOverride(lsGet<Overrides>(KEY_OVERRIDE) ?? {});
    setCompletion(lsGet<Completion>(KEY_COMPLETION) ?? {});
    setNotes(lsGet<Notes>(KEY_NOTES) ?? {});
    setScores(lsGet<MockScore[]>(KEY_SCORES) ?? []);
    setWrongItems(lsGet<WrongItem[]>(KEY_WRONG) ?? []);
    setPomo(lsGet<PomodoroSession>(KEY_POMO_SESSION) ?? {
      phase: "idle",
      endAt: null,
      pausedPhase: null,
      remainingMs: null,
      focusMin: (lsGet<Settings>(KEY_SETTINGS) ?? defaultSettings()).pomodoroFocusMin,
      breakMin: (lsGet<Settings>(KEY_SETTINGS) ?? defaultSettings()).pomodoroBreakMin,
      startedAt: null,
    });
    const loadedCards = dedupeFlashcardsById(lsGet<Flashcard[]>(KEY_FLASHCARDS) ?? []).map((c) =>
      validCat.has(c.category)
        ? c
        : { ...c, category: coerceFlashcardCategoryId(mergedSettings.flashcardCategories, c.category) },
    );
    const validIds = new Set(loadedCards.map((c) => c.id));
    setFlashcards(loadedCards);
    setFlashcardReviewQueue(normalizeFlashcardReviewQueue(lsGet<unknown>(KEY_FLASHCARD_REVIEW_QUEUE), validIds));
    setSwRecords(migrateSwRecords(lsGet<unknown>(IELTS_SW_RECORDS_KEY) ?? []));
    setReady(true);
  }, []);

  useEffect(() => {
    reloadFromLocalStorage();
  }, [reloadFromLocalStorage]);

  useEffect(() => {
    if (!ready) return;
    lsSet(KEY_SETTINGS, settings);
  }, [ready, settings]);
  useEffect(() => {
    if (!ready) return;
    lsSet(KEY_OVERRIDE, override);
  }, [ready, override]);
  useEffect(() => {
    if (!ready) return;
    lsSet(KEY_COMPLETION, completion);
  }, [ready, completion]);
  useEffect(() => {
    if (!ready) return;
    lsSet(KEY_NOTES, notes);
  }, [ready, notes]);
  useEffect(() => {
    if (!ready) return;
    lsSet(KEY_SCORES, scores);
  }, [ready, scores]);
  useEffect(() => {
    if (!ready) return;
    lsSet(KEY_WRONG, wrongItems);
  }, [ready, wrongItems]);
  useEffect(() => {
    if (!ready) return;
    lsSet(KEY_POMO_SESSION, pomo);
  }, [ready, pomo]);
  useEffect(() => {
    if (!ready) return;
    lsSet(KEY_FLASHCARDS, flashcards);
  }, [ready, flashcards]);
  useEffect(() => {
    if (!ready) return;
    lsSet(KEY_FLASHCARD_REVIEW_QUEUE, flashcardReviewQueue);
  }, [ready, flashcardReviewQueue]);
  useEffect(() => {
    if (!ready) return;
    lsSet(IELTS_SW_RECORDS_KEY, swRecords);
  }, [ready, swRecords]);

  useEffect(() => {
    if (!ready) return;
    const valid = new Set(flashcards.map((c) => c.id));
    setFlashcardReviewQueue((prev) => {
      const next = prev.filter((id) => valid.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [ready, flashcards]);

  const getDayPlan = useCallback((day: number): DayPlan => {
    const base = scheduleDefault.find((p) => p.day === day) ?? scheduleDefault[0];
    const tasks = override[day] ?? base.tasks;
    return { ...base, day, tasks };
  }, [override, scheduleDefault]);

  const currentDay = useMemo(() => {
    const d = dayDiff(settings.startDate, todayIso()) + 1;
    return clamp(d, 1, 25);
  }, [settings.startDate]);
  const daysLeft = useMemo(() => {
    return Math.max(0, dayDiff(todayIso(), settings.examDate));
  }, [settings.examDate]);

  const toggleTask = useCallback((day: number, taskId: string) => {
    const key = `${day}_${taskId}`;
    setCompletion((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setDayNote = useCallback((day: number, text: string) => {
    setNotes((prev) => ({ ...prev, [day]: text }));
  }, []);

  const setOverrideTasks = useCallback((day: number, tasks: DayTask[] | null) => {
    setOverride((prev) => {
      const next = { ...prev };
      if (!tasks) delete next[day];
      else next[day] = tasks;
      return next;
    });
  }, []);

  /** 在指定日新增一筆任務（會寫入 schedule override；若該日尚無 override 會先複製預設任務再追加） */
  const addDayTask = useCallback(
    (day: number, fields: Partial<Pick<DayTask, "time" | "icon" | "label" | "task" | "tip">>) => {
      setOverride((prevOverride) => {
        const base = scheduleDefault.find((p) => p.day === day)?.tasks ?? [];
        const current = prevOverride[day] ?? base.map((t) => ({ ...t }));
        const newTask: DayTask = {
          id: `custom-${crypto.randomUUID()}`,
          time: fields.time?.trim() || "30 分",
          icon: fields.icon?.trim() || "✨",
          label: fields.label?.trim() || "自訂任務",
          task: fields.task?.trim() || "（請補充說明）",
          tip: fields.tip?.trim() ?? "",
        };
        return { ...prevOverride, [day]: [...current, newTask] };
      });
    },
    [scheduleDefault],
  );

  const removeDayTask = useCallback(
    (day: number, taskId: string) => {
      setOverride((prevOverride) => {
        const base = scheduleDefault.find((p) => p.day === day)?.tasks ?? [];
        const current = prevOverride[day] ?? base.map((t) => ({ ...t }));
        const next = current.filter((t) => t.id !== taskId);
        return { ...prevOverride, [day]: next };
      });
      setCompletion((prev) => {
        const k = `${day}_${taskId}`;
        if (!(k in prev)) return prev;
        const next = { ...prev };
        delete next[k];
        return next;
      });
    },
    [scheduleDefault],
  );

  const updateDayTask = useCallback(
    (day: number, taskId: string, patch: Partial<Pick<DayTask, "time" | "icon" | "label" | "task" | "tip">>) => {
      setOverride((prevOverride) => {
        const base = scheduleDefault.find((p) => p.day === day)?.tasks ?? [];
        const current = prevOverride[day] ?? base.map((x) => ({ ...x }));
        let found = false;
        const next = current.map((task) => {
          if (task.id !== taskId) return task;
          found = true;
          const n = { ...task };
          if (patch.icon !== undefined) n.icon = patch.icon.trim() || n.icon;
          if (patch.time !== undefined) n.time = patch.time.trim() || n.time;
          if (patch.label !== undefined) n.label = patch.label.trim() || n.label;
          if (patch.task !== undefined) n.task = patch.task.trim() || n.task;
          if (patch.tip !== undefined) n.tip = patch.tip.trim();
          return n;
        });
        if (!found) return prevOverride;
        return { ...prevOverride, [day]: next };
      });
    },
    [scheduleDefault],
  );

  const addMockScore = useCallback((row: Omit<MockScore, "id">) => {
    setScores((prev) => [{ ...row, id: crypto.randomUUID() }, ...prev]);
  }, []);

  const removeMockScore = useCallback((id: string) => {
    setScores((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addWrongItem = useCallback((item: Omit<WrongItem, "id">) => {
    setWrongItems((prev) => [{ ...item, id: crypto.randomUUID() }, ...prev]);
  }, []);

  const toggleWrongMastered = useCallback((id: string) => {
    setWrongItems((prev) => prev.map((w) => (w.id === id ? { ...w, mastered: !w.mastered } : w)));
  }, []);

  const bumpWrongNextReview = useCallback((id: string, days: number) => {
    setWrongItems((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const d = new Date(`${w.nextReview}T00:00:00`);
        d.setDate(d.getDate() + days);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return { ...w, nextReview: `${yyyy}-${mm}-${dd}`, reviewStage: w.reviewStage + 1 };
      }),
    );
  }, []);

  const dueWrongItems = useMemo(() => {
    const today = todayIso();
    return wrongItems.filter((w) => !w.mastered && w.nextReview <= today);
  }, [wrongItems]);

  // Pomodoro (endAt-based)
  const pomoRemainingSec = useMemo(() => {
    if (pomo.phase === "pause" && pomo.remainingMs != null) return Math.max(0, Math.ceil(pomo.remainingMs / 1000));
    if ((pomo.phase === "focus" || pomo.phase === "break") && pomo.endAt) return Math.max(0, Math.ceil((pomo.endAt - Date.now()) / 1000));
    return 0;
  }, [pomo, pomoDisplayTick]);

  useEffect(() => {
    if (!ready) return;
    if (pomo.phase !== "focus" && pomo.phase !== "break") return;
    const t = setInterval(() => {
      setPomoDisplayTick((n) => n + 1);
      setPomo((prev) => {
        if (prev.phase !== "focus" && prev.phase !== "break") return prev;
        if (!prev.endAt) return prev;
        if (prev.endAt <= Date.now()) {
          if (prev.phase === "focus") {
            const breakMs = prev.breakMin * 60_000;
            return { ...prev, phase: "break", endAt: Date.now() + breakMs, startedAt: Date.now(), pausedPhase: null, remainingMs: null };
          }
          return { ...prev, phase: "idle", endAt: null, startedAt: null, pausedPhase: null, remainingMs: null };
        }
        return prev;
      });
    }, 500);
    return () => clearInterval(t);
  }, [ready, pomo.phase]);

  const pomoStartFocus = useCallback(() => {
    const focusMs = settings.pomodoroFocusMin * 60_000;
    setPomo({
      phase: "focus",
      endAt: Date.now() + focusMs,
      pausedPhase: null,
      remainingMs: null,
      focusMin: settings.pomodoroFocusMin,
      breakMin: settings.pomodoroBreakMin,
      startedAt: Date.now(),
    });
  }, [settings.pomodoroBreakMin, settings.pomodoroFocusMin]);

  const pomoPause = useCallback(() => {
    setPomo((prev) => {
      if (prev.phase !== "focus" && prev.phase !== "break") return prev;
      const remaining = prev.endAt ? Math.max(0, prev.endAt - Date.now()) : 0;
      return { ...prev, phase: "pause", pausedPhase: prev.phase, remainingMs: remaining, endAt: null };
    });
  }, []);

  const pomoResume = useCallback(() => {
    setPomo((prev) => {
      if (prev.phase !== "pause" || !prev.pausedPhase || prev.remainingMs == null) return prev;
      return { ...prev, phase: prev.pausedPhase, endAt: Date.now() + prev.remainingMs, pausedPhase: null };
    });
  }, []);

  const pomoReset = useCallback(() => {
    setPomo({
      phase: "idle",
      endAt: null,
      pausedPhase: null,
      remainingMs: null,
      focusMin: settings.pomodoroFocusMin,
      breakMin: settings.pomodoroBreakMin,
      startedAt: null,
    });
  }, [settings.pomodoroBreakMin, settings.pomodoroFocusMin]);

  const addFlashcard = useCallback(
    (item: Omit<Flashcard, "id" | "createdAt" | "mastered">) => {
      const cats = settings.flashcardCategories;
      const valid = new Set(cats.map((c) => c.id));
      const category = valid.has(item.category) ? item.category : coerceFlashcardCategoryId(cats, item.category);
      const iso = todayIso();
      setFlashcards((prev) => [
        {
          ...item,
          category,
          id: crypto.randomUUID(),
          createdAt: iso,
          mastered: false,
        },
        ...prev,
      ]);
    },
    [settings.flashcardCategories],
  );

  const removeFlashcard = useCallback((id: string) => {
    setFlashcards((prev) => prev.filter((c) => c.id !== id));
    setFlashcardReviewQueue((prev) => prev.filter((x) => x !== id));
  }, []);

  const addFlashcardToReviewQueue = useCallback((id: string) => {
    setFlashcardReviewQueue((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const removeFlashcardFromReviewQueue = useCallback((id: string) => {
    setFlashcardReviewQueue((prev) => prev.filter((x) => x !== id));
  }, []);

  const toggleFlashcardMastered = useCallback((id: string) => {
    setFlashcards((prev) => prev.map((c) => (c.id === id ? { ...c, mastered: !c.mastered } : c)));
  }, []);

  const setFlashcardMastered = useCallback((id: string, mastered: boolean) => {
    setFlashcards((prev) => prev.map((c) => (c.id === id ? { ...c, mastered } : c)));
  }, []);

  const updateFlashcard = useCallback(
    (
      id: string,
      data: Pick<Flashcard, "word" | "meaning" | "category" | "mastered"> & { example?: string },
    ) => {
      const word = data.word.trim();
      if (!word) return;
      const meaning = data.meaning.trim();
      const example = data.example?.trim() ? data.example.trim() : undefined;
      setFlashcards((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, word, meaning, example, category: data.category, mastered: data.mastered }
            : c,
        ),
      );
    },
    [],
  );

  const addFlashcardCategory = useCallback((label: string) => {
    const t = label.trim();
    if (!t) return;
    const id = `cat_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    setSettings((s) => ({
      ...s,
      flashcardCategories: [...s.flashcardCategories, { id, label: t }],
    }));
  }, []);

  const renameFlashcardCategory = useCallback((id: string, label: string) => {
    const t = label.trim();
    if (!t) return;
    setSettings((s) => ({
      ...s,
      flashcardCategories: s.flashcardCategories.map((c) => (c.id === id ? { ...c, label: t } : c)),
    }));
  }, []);

  const removeFlashcardCategory = useCallback((id: string, moveCardsToId: string) => {
    let didRemove = false;
    setSettings((s) => {
      if (s.flashcardCategories.length <= 1) return s;
      if (!s.flashcardCategories.some((c) => c.id === id)) return s;
      if (!s.flashcardCategories.some((c) => c.id === moveCardsToId) || moveCardsToId === id) return s;
      didRemove = true;
      return { ...s, flashcardCategories: s.flashcardCategories.filter((c) => c.id !== id) };
    });
    if (didRemove) {
      setFlashcards((prev) => prev.map((c) => (c.category === id ? { ...c, category: moveCardsToId } : c)));
    }
  }, []);

  const addSwRecord = useCallback((item: Pick<SpeakingWritingEntry, "type" | "prompt"> & { notes?: string }): string | null => {
    const iso = todayIso();
    const prompt = item.prompt.trim();
    if (!prompt) return null;
    const notes = item.notes?.trim() ? item.notes.trim() : undefined;
    const id = crypto.randomUUID();
    const nextRec: SpeakingWritingEntry = {
      id,
      type: item.type,
      prompt,
      myAnswer: "",
      improvedAnswer: "",
      notes,
      createdAt: iso,
      updatedAt: iso,
    };
    setSwRecords((prev) => [nextRec, ...prev]);
    // 立即寫入 localStorage：避免新增後立刻跳轉詳情頁時讀不到
    try {
      const cur = migrateSwRecords(lsGet<unknown>(IELTS_SW_RECORDS_KEY) ?? []);
      lsSet(IELTS_SW_RECORDS_KEY, [nextRec, ...cur]);
    } catch {
      /* */
    }
    return id;
  }, []);

  const updateSwRecord = useCallback(
    (id: string, item: Pick<SpeakingWritingEntry, "type" | "prompt" | "myAnswer" | "improvedAnswer"> & { notes?: string }) => {
      const iso = todayIso();
      const prompt = item.prompt.trim();
      const myAnswer = item.myAnswer;
      const improvedAnswer = item.improvedAnswer;
      if (!prompt) return;
      const notes = item.notes?.trim() ? item.notes.trim() : undefined;
      setSwRecords((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, type: item.type, prompt, myAnswer, improvedAnswer, notes, updatedAt: iso } : r,
        );
        // 立即寫入 localStorage：避免詳情頁刷新或快速返回時丟資料
        try {
          lsSet(IELTS_SW_RECORDS_KEY, next);
        } catch {
          /* */
        }
        return next;
      });
    },
    [],
  );

  const removeSwRecord = useCallback((id: string) => {
    setSwRecords((prev) => {
      const next = prev.filter((r) => r.id !== id);
      try {
        lsSet(IELTS_SW_RECORDS_KEY, next);
      } catch {
        /* */
      }
      return next;
    });
  }, []);

  const clearAllLocalData = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      IELTS_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem("ielts_api_key");
      localStorage.removeItem(IELTS_GOOGLE_AI_KEY_LS);
      localStorage.removeItem("ielts_openai_key");
    } catch {
      /* */
    }
    setSettings(defaultSettings());
    setOverride({});
    setCompletion({});
    setNotes({});
    setScores([]);
    setWrongItems([]);
    setFlashcards([]);
    setFlashcardReviewQueue([]);
    setSwRecords([]);
    setPomo({
      phase: "idle",
      endAt: null,
      pausedPhase: null,
      remainingMs: null,
      focusMin: defaultSettings().pomodoroFocusMin,
      breakMin: defaultSettings().pomodoroBreakMin,
      startedAt: null,
    });
    try {
      localStorage.setItem(KEY_VERSION, String(SCHEMA_VERSION));
      lsSet(KEY_SETTINGS, defaultSettings());
      lsSet(KEY_OVERRIDE, {});
      lsSet(KEY_COMPLETION, {});
      lsSet(KEY_NOTES, {});
      lsSet(KEY_SCORES, []);
      lsSet(KEY_WRONG, []);
      lsSet(KEY_FLASHCARDS, []);
      lsSet(KEY_FLASHCARD_REVIEW_QUEUE, []);
      lsSet(IELTS_SW_RECORDS_KEY, []);
      lsSet(KEY_POMO_SESSION, {
        phase: "idle",
        endAt: null,
        pausedPhase: null,
        remainingMs: null,
        focusMin: defaultSettings().pomodoroFocusMin,
        breakMin: defaultSettings().pomodoroBreakMin,
        startedAt: null,
      });
    } catch {
      /* */
    }
  }, []);

  const exportAll = useCallback(() => {
    return {
      schemaVersion: SCHEMA_VERSION,
      settings,
      scheduleOverride: override,
      completion,
      notes,
      mockScores: scores,
      wrongItems,
      pomodoroSession: pomo,
      flashcards,
      flashcardReviewQueue,
      swRecords,
      exportedAt: new Date().toISOString(),
    };
  }, [completion, flashcardReviewQueue, flashcards, notes, override, pomo, scores, settings, swRecords, wrongItems]);

  const applyFlashcardWordPatch = useCallback((patch: FlashcardWordPatchV1) => {
    const map = patch.map ?? {};
    const patchMap = new Map<string, string>();
    for (const [id, w] of Object.entries(map)) {
      if (typeof id !== "string") continue;
      if (typeof w !== "string") continue;
      const next = w.trim();
      if (!next) continue;
      patchMap.set(id, next);
    }
    if (patchMap.size === 0) return { updated: 0, missing: 0 };

    let updated = 0;
    let missing = 0;

    setFlashcards((prev) => {
      const valid = new Set(prev.map((c) => c.id));
      for (const id of patchMap.keys()) {
        if (!valid.has(id)) missing++;
      }
      return prev.map((c) => {
        const nextWord = patchMap.get(c.id);
        if (!nextWord) return c;
        if (nextWord === c.word) return c;
        updated++;
        return { ...c, word: nextWord };
      });
    });

    return { updated, missing };
  }, []);

  const applyFlashcardTextPatch = useCallback((patch: FlashcardTextPatchV1) => {
    const map = patch.map ?? {};
    const patchMap = new Map<string, { word?: string; meaning?: string }>();
    for (const [id, v] of Object.entries(map)) {
      if (typeof id !== "string") continue;
      if (!v || typeof v !== "object") continue;
      const vv = v as { word?: unknown; meaning?: unknown };
      const nextWord = typeof vv.word === "string" ? vv.word.trim() : undefined;
      const nextMeaning = typeof vv.meaning === "string" ? vv.meaning.trim() : undefined;
      if (!nextWord && !nextMeaning) continue;
      patchMap.set(id, { word: nextWord || undefined, meaning: nextMeaning || undefined });
    }
    if (patchMap.size === 0) return { updated: 0, missing: 0 };

    let updated = 0;
    let missing = 0;

    setFlashcards((prev) => {
      const valid = new Set(prev.map((c) => c.id));
      for (const id of patchMap.keys()) {
        if (!valid.has(id)) missing++;
      }
      return prev.map((c) => {
        const p = patchMap.get(c.id);
        if (!p) return c;
        const w = p.word ?? c.word;
        const m = p.meaning ?? c.meaning;
        if (w === c.word && m === c.meaning) return c;
        updated++;
        return { ...c, word: w, meaning: m };
      });
    });

    return { updated, missing };
  }, []);

  const importAll = useCallback((json: unknown) => {
    if (isFlashcardWordPatchV1(json)) {
      const { updated, missing } = applyFlashcardWordPatch(json);
      return { mode: "flashcard_word_patch" as const, updated, missing };
    }
    if (isFlashcardTextPatchV1(json)) {
      const { updated, missing } = applyFlashcardTextPatch(json);
      return { mode: "flashcard_text_patch" as const, updated, missing };
    }
    if (!json || typeof json !== "object") throw new Error("Invalid JSON");
    const raw = json as Record<string, unknown>;
    /** 僅把 `flashcards` 接到現有字卡最前（與新增字卡順序一致），不覆寫其他備份欄位 */
    const mergeFlashcards = raw.mergeFlashcards === true;
    const queueFromImport = raw.flashcardReviewQueue;
    const obj = json as Partial<{
      settings: Settings;
      scheduleOverride: Overrides;
      completion: Completion;
      notes: Notes;
      mockScores: MockScore[];
      wrongItems: WrongItem[];
      pomodoroSession: PomodoroSession;
      flashcards: Flashcard[];
      swRecords: SpeakingWritingEntry[];
    }>;
    if (obj.settings) {
      const rawS = { ...(obj.settings as Record<string, unknown>) };
      delete rawS.targetOverallBand;
      const cats = parseFlashcardCategories(rawS.flashcardCategories);
      delete rawS.flashcardCategories;
      setSettings({ ...defaultSettings(), ...rawS, flashcardCategories: cats, schemaVersion: SCHEMA_VERSION } as Settings);
    }
    if (obj.scheduleOverride) setOverride(obj.scheduleOverride);
    if (obj.completion) setCompletion(obj.completion);
    if (obj.notes) setNotes(obj.notes);
    if (obj.mockScores) setScores(obj.mockScores);
    if (obj.wrongItems) setWrongItems(obj.wrongItems);
    if (obj.pomodoroSession) setPomo(obj.pomodoroSession);
    if (obj.flashcards && Array.isArray(obj.flashcards)) {
      const incoming = dedupeFlashcardsById(obj.flashcards as Flashcard[]);
      if (mergeFlashcards) {
        setFlashcards((prev) => {
          const base = dedupeFlashcardsById(prev);
          const seen = new Set(base.map((x) => x.id));
          const add = incoming.filter((x) => !seen.has(x.id));
          const merged = [...add, ...base];
          if (queueFromImport !== undefined) {
            queueMicrotask(() =>
              setFlashcardReviewQueue(normalizeFlashcardReviewQueue(queueFromImport, new Set(merged.map((x) => x.id)))),
            );
          }
          return merged;
        });
      } else {
        setFlashcards(incoming);
        if (queueFromImport !== undefined) {
          setFlashcardReviewQueue(normalizeFlashcardReviewQueue(queueFromImport, new Set(incoming.map((x) => x.id))));
        }
      }
    } else if (queueFromImport !== undefined) {
      setFlashcardReviewQueue(
        normalizeFlashcardReviewQueue(queueFromImport, new Set(flashcardsRef.current.map((c) => c.id))),
      );
    }
    if (obj.swRecords) setSwRecords(obj.swRecords);
    return { mode: "backup" as const };
  }, []);

  return {
    ready,
    scheduleDefault,
    settings,
    setSettings,
    currentDay,
    daysLeft,
    getDayPlan,
    completion,
    toggleTask,
    notes,
    setDayNote,
    override,
    setOverrideTasks,
    addDayTask,
    removeDayTask,
    updateDayTask,
    scores,
    addMockScore,
    removeMockScore,
    wrongItems,
    addWrongItem,
    toggleWrongMastered,
    bumpWrongNextReview,
    dueWrongItems,
    pomo,
    pomoRemainingSec,
    pomoStartFocus,
    pomoPause,
    pomoResume,
    pomoReset,
    flashcards,
    flashcardReviewQueue,
    addFlashcardToReviewQueue,
    removeFlashcardFromReviewQueue,
    addFlashcard,
    removeFlashcard,
    toggleFlashcardMastered,
    setFlashcardMastered,
    updateFlashcard,
    swRecords,
    addSwRecord,
    updateSwRecord,
    removeSwRecord,
    clearAllLocalData,
    reloadFromLocalStorage,
    exportAll,
    importAll,
    applyFlashcardWordPatch,
    applyFlashcardTextPatch,
    addFlashcardCategory,
    renameFlashcardCategory,
    removeFlashcardCategory,
  };
}

