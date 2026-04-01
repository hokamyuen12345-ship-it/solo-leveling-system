"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type IELTSSection = "today" | "calendar" | "cards" | "records" | "scores" | "settings";

export type FlashcardCategory = "vocab" | "writing" | "speaking" | "grammar";

export type Flashcard = {
  id: string;
  word: string;
  meaning: string;
  example?: string;
  category: FlashcardCategory;
  mastered: boolean;
  createdAt: string;
};
export type SkillType = "L" | "R" | "W" | "S";

export type SpeakingWritingType = "writing" | "speaking";
export type SpeakingWritingEntry = {
  id: string;
  type: SpeakingWritingType;
  prompt: string;
  myAnswer: string;
  improvedAnswer: string;
  notes?: string;
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
const KEY_SW_RECORDS = "ielts_sw_records_v1";

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
  KEY_SW_RECORDS,
] as const;

const SCHEMA_VERSION = 1;

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function migrateSwRecords(raw: unknown): SpeakingWritingEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SpeakingWritingEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const obj = r as Partial<Record<string, unknown>>;
    const id = typeof obj.id === "string" ? obj.id : null;
    const type = obj.type === "writing" || obj.type === "speaking" ? obj.type : null;
    const prompt = typeof obj.prompt === "string" ? obj.prompt : null;
    const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : todayIso();
    const updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt : createdAt;
    if (!id || !type || !prompt) continue;
    const notes = typeof obj.notes === "string" ? obj.notes : undefined;
    // v1: response -> myAnswer, improvedAnswer 空白
    const response = typeof obj.response === "string" ? obj.response : "";
    const myAnswer = typeof obj.myAnswer === "string" ? obj.myAnswer : response;
    const improvedAnswer = typeof obj.improvedAnswer === "string" ? obj.improvedAnswer : "";
    out.push({
      id,
      type,
      prompt,
      myAnswer,
      improvedAnswer,
      notes,
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
  };
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
  const [swRecords, setSwRecords] = useState<SpeakingWritingEntry[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    migrateIfNeeded();
    if (localStorage.getItem(KEY_FLASHCARDS) === null) lsSet(KEY_FLASHCARDS, []);
    if (localStorage.getItem(KEY_SW_RECORDS) === null) lsSet(KEY_SW_RECORDS, []);
    setSettings(lsGet<Settings>(KEY_SETTINGS) ?? defaultSettings());
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
    setFlashcards(lsGet<Flashcard[]>(KEY_FLASHCARDS) ?? []);
    setSwRecords(migrateSwRecords(lsGet<unknown>(KEY_SW_RECORDS) ?? []));
    setReady(true);
  }, []);

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
    lsSet(KEY_SW_RECORDS, swRecords);
  }, [ready, swRecords]);

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

  const addFlashcard = useCallback((item: Omit<Flashcard, "id" | "createdAt" | "mastered">) => {
    const iso = todayIso();
    setFlashcards((prev) => [
      {
        ...item,
        id: crypto.randomUUID(),
        createdAt: iso,
        mastered: false,
      },
      ...prev,
    ]);
  }, []);

  const removeFlashcard = useCallback((id: string) => {
    setFlashcards((prev) => prev.filter((c) => c.id !== id));
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
      const meaning = data.meaning.trim();
      if (!word || !meaning) return;
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

  const addSwRecord = useCallback((item: Pick<SpeakingWritingEntry, "type" | "prompt"> & { notes?: string }): string | null => {
    const iso = todayIso();
    const prompt = item.prompt.trim();
    if (!prompt) return null;
    const notes = item.notes?.trim() ? item.notes.trim() : undefined;
    const id = crypto.randomUUID();
    setSwRecords((prev) => [
      {
        id,
        type: item.type,
        prompt,
        myAnswer: "",
        improvedAnswer: "",
        notes,
        createdAt: iso,
        updatedAt: iso,
      },
      ...prev,
    ]);
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
      setSwRecords((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, type: item.type, prompt, myAnswer, improvedAnswer, notes, updatedAt: iso }
            : r,
        ),
      );
    },
    [],
  );

  const removeSwRecord = useCallback((id: string) => {
    setSwRecords((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearAllLocalData = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      IELTS_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem("ielts_api_key");
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
      lsSet(KEY_SW_RECORDS, []);
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
      swRecords,
      exportedAt: new Date().toISOString(),
    };
  }, [completion, flashcards, notes, override, pomo, scores, settings, swRecords, wrongItems]);

  const importAll = useCallback((json: unknown) => {
    if (!json || typeof json !== "object") throw new Error("Invalid JSON");
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
    if (obj.settings) setSettings({ ...defaultSettings(), ...obj.settings, schemaVersion: SCHEMA_VERSION });
    if (obj.scheduleOverride) setOverride(obj.scheduleOverride);
    if (obj.completion) setCompletion(obj.completion);
    if (obj.notes) setNotes(obj.notes);
    if (obj.mockScores) setScores(obj.mockScores);
    if (obj.wrongItems) setWrongItems(obj.wrongItems);
    if (obj.pomodoroSession) setPomo(obj.pomodoroSession);
    if (obj.flashcards) setFlashcards(obj.flashcards);
    if (obj.swRecords) setSwRecords(obj.swRecords);
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
    exportAll,
    importAll,
  };
}

