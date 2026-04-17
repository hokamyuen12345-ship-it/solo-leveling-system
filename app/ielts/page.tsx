"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { FlashcardQuiz } from "./flashcard-quiz";
import { FlashcardCloze } from "./flashcard-cloze";
import { FlashcardDictation } from "./flashcard-dictation";
import type { ClozePayload } from "./fetch-cloze-client";
import { getStoredGoogleAIKey, setStoredGoogleAIKey } from "./llm-key-storage";
import { ScoreTrendChart } from "./score-trend-chart";
import { speakEnglish } from "./speech";
import {
  useIELTSStore,
  type DayTask,
  type Flashcard,
  type FlashcardCategory,
  type FlashcardCategoryDef,
  type IELTSSection,
  type SpeakingWritingEntry,
  type SpeakingWritingType,
  flashcardCategoryLabel,
  FLASHCARD_REVIEW_QUEUE_FILTER_ID,
  isSwRecordWriting,
} from "./store";
import { useRouter } from "next/navigation";
import { getSupabase, IELTS_SYNC_KEYS } from "@/lib/supabase";
import { fetchUserStateAndApplyToLocalStorage, pushKeysToUserState } from "@/lib/user-state-sync";

const SL_HOME_FROM_IELTS = "sl_home_from_ielts_v1";
const IELTS_ACCENT_PINK_LS = "ielts_accent_pink_v1";
const DEVICE_LOCAL_ONLY = true;

/**
 * 掛到 body：避免放在帶 transform 的 .ielts-page-panel 內時，fixed 底欄變成相對面板定位而表單被裁切／看不到。
 */
function IeltsSheetPortal({
  themeDark,
  accentPink,
  children,
}: {
  themeDark: boolean;
  accentPink: boolean;
  children: ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="ielts-root"
      data-theme={themeDark ? "dark" : undefined}
      data-accent={accentPink ? "pink" : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

const TABS: { id: IELTSSection; label: string; icon: string }[] = [
  { id: "today", label: "今日", icon: "◆" },
  { id: "calendar", label: "進度", icon: "◇" },
  { id: "cards", label: "字卡", icon: "▤" },
  { id: "records", label: "記錄", icon: "✎" },
  { id: "scores", label: "成績", icon: "▦" },
  { id: "settings", label: "設定", icon: "⚙" },
];

const TARGET_BAND = 6.5;

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function fmtHMS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(r)}`;
  return `${pad2(m)}:${pad2(r)}`;
}

function pomoPhaseZh(phase: string): string {
  switch (phase) {
    case "idle":
      return "準備中";
    case "focus":
      return "專注中";
    case "break":
      return "休息中";
    case "pause":
      return "已暫停";
    default:
      return phase;
  }
}

function taskStripClass(t: DayTask): string {
  if (t.id.startsWith("custom-")) return "ielts-strip-custom";
  if (t.id.includes("warmup")) return "ielts-strip-warmup";
  if (t.id.includes("writing")) return "ielts-strip-writing";
  if (t.id.includes("speaking")) return "ielts-strip-speaking";
  if (t.id.includes("core")) {
    const day = Number(t.id.match(/d(\d+)/)?.[1] ?? "0");
    return day % 2 === 0 ? "ielts-strip-reading" : "ielts-strip-listening";
  }
  return "ielts-strip-warmup";
}

function useCountUp(target: number, active: boolean, tickKey: string) {
  const [v, setV] = useState(0);

  useEffect(() => {
    if (!active) {
      setV(0);
      return;
    }
    setV(0);
    const steps = 30;
    const inc = Math.max(1, Math.ceil(target / steps));
    let n = 0;
    const id = window.setInterval(() => {
      n += inc;
      if (n >= target) {
        setV(target);
        window.clearInterval(id);
      } else {
        setV(n);
      }
    }, 16);
    return () => window.clearInterval(id);
  }, [active, target, tickKey]);

  return v;
}

function ProgressRing({ pct, size = 88 }: { pct: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="white"
        strokeWidth={stroke}
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
    </svg>
  );
}

function PomodoroRing({ pct, size = 100 }: { pct: number; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ielts-progress-track)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--ielts-pomodoro)"
        strokeWidth={stroke}
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.35s linear" }}
      />
    </svg>
  );
}

export default function IELTSPage() {
  const [tab, setTab] = useState<IELTSSection>("today");
  const [themeDark, setThemeDark] = useState(false);
  const [accentPink, setAccentPink] = useState(false);
  const [expandedTips, setExpandedTips] = useState<Record<string, boolean>>({});
  const [expandedHeatDay, setExpandedHeatDay] = useState<number | null>(null);
  const [checkPopId, setCheckPopId] = useState<string | null>(null);
  const [clearSheetOpen, setClearSheetOpen] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [panelTick, setPanelTick] = useState(0);
  const prevTabRef = useRef<IELTSSection | null>(null);
  const skipNextTabPersistRef = useRef(true);

  const store = useIELTSStore();
  const router = useRouter();

  const [clozePrefetchById, setClozePrefetchById] = useState<Record<string, ClozePayload>>({});
  const [clozePrefetchErrById, setClozePrefetchErrById] = useState<Record<string, string>>({});
  const [clozePrefetchNonce, setClozePrefetchNonce] = useState(0);

  /** 登入時自雲端拉取 user_state（含 IELTS）後重新 hydrate，與主頁同步 */
  useEffect(() => {
    if (DEVICE_LOCAL_ONLY) {
      store.reloadFromLocalStorage();
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    const pullAndReload = async (userId: string) => {
      // 僅在詳情頁曾寫入記錄時先上傳再拉取，避免雲端舊資料覆蓋本機；否則維持先拉（新裝置不會用空本機蓋掉雲端）
      let pushFirst = false;
      try {
        pushFirst = sessionStorage.getItem("ielts_records_edited_v1") === "1";
      } catch {
        /* */
      }
      const pullMs = 18_000;
      try {
        await Promise.race([
          (async () => {
            if (pushFirst) {
              await pushKeysToUserState(userId, IELTS_SYNC_KEYS);
              try {
                sessionStorage.removeItem("ielts_records_edited_v1");
              } catch {
                /* */
              }
            }
            await fetchUserStateAndApplyToLocalStorage(userId);
          })(),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error("cloud_pull_timeout")), pullMs);
          }),
        ]);
      } catch {
        /* Supabase 慢／Disk IO 爆：仍用本機 */
      }
      if (!cancelled) store.reloadFromLocalStorage();
    };
    void (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user && !cancelled) await pullAndReload(session.user.id);
    })();
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void pullAndReload(session.user.id);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [store.reloadFromLocalStorage]);

  /** 已登入時定期上傳 IELTS 相關 localStorage 鍵（主頁也會一併上傳） */
  useEffect(() => {
    if (DEVICE_LOCAL_ONLY) return;
    if (!store.ready) return;
    const sb = getSupabase();
    if (!sb) return;
    const tick = async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.user) return;
      await pushKeysToUserState(session.user.id, IELTS_SYNC_KEYS);
    };
    void tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [store.ready]);

  const cardsContentFingerprint = useMemo(
    () => store.flashcards.map((f) => `${f.id}\t${f.word}\t${f.meaning}`).join("\n"),
    [store.flashcards],
  );

  useEffect(() => {
    setClozePrefetchById({});
    setClozePrefetchErrById({});
  }, [cardsContentFingerprint, clozePrefetchNonce]);

  const onClozeFetched = useCallback((id: string, data: ClozePayload) => {
    setClozePrefetchById((prev) => (prev[id] ? prev : { ...prev, [id]: data }));
  }, []);

  const onClozeError = useCallback((id: string, message: string) => {
    setClozePrefetchErrById((prev) => (prev[id] ? prev : { ...prev, [id]: message }));
  }, []);

  const retryClozePrefetch = useCallback(() => setClozePrefetchNonce((x) => x + 1), []);

  // Restore last tab（從詳情返回時 session 已是 records；不可與下方 persist 同幀，否則會被初始 today 覆寫）
  useEffect(() => {
    try {
      const t = sessionStorage.getItem("ielts_last_tab_v1") as IELTSSection | null;
      if (t === "today" || t === "calendar" || t === "cards" || t === "records" || t === "scores" || t === "settings") {
        setTab(t);
      }
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    if (skipNextTabPersistRef.current) {
      skipNextTabPersistRef.current = false;
      return;
    }
    try {
      sessionStorage.setItem("ielts_last_tab_v1", tab);
    } catch {
      /* */
    }
  }, [tab]);

  useEffect(() => {
    try {
      setAccentPink(localStorage.getItem(IELTS_ACCENT_PINK_LS) === "1");
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(IELTS_ACCENT_PINK_LS, accentPink ? "1" : "0");
    } catch {
      /* */
    }
  }, [accentPink]);

  const plan = store.getDayPlan(store.currentDay);
  const doneCount = plan.tasks.filter((t) => store.completion[`${store.currentDay}_${t.id}`]).length;
  const completionRate = plan.tasks.length ? Math.round((doneCount / plan.tasks.length) * 100) : 0;

  const progressStats = useMemo(() => {
    let totalT = 0;
    let doneT = 0;
    let daysFull = 0;
    for (let d = 1; d <= 25; d++) {
      const p = store.getDayPlan(d);
      totalT += p.tasks.length;
      const dn = p.tasks.filter((t) => store.completion[`${d}_${t.id}`]).length;
      doneT += dn;
      if (p.tasks.length && dn === p.tasks.length) daysFull++;
    }
    const overallPct = totalT ? Math.round((doneT / totalT) * 100) : 0;
    let streak = 0;
    for (let d = store.currentDay; d >= 1; d--) {
      const p = store.getDayPlan(d);
      const any = p.tasks.some((t) => store.completion[`${d}_${t.id}`]);
      if (any) streak++;
      else break;
    }
    return { overallPct, streak, mockCount: store.scores.length, daysFull };
  }, [store]);

  const chartRows = useMemo(() => {
    return [...store.scores]
      .filter((s) => s.L != null || s.R != null || s.W != null || s.S != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({ date: s.date, L: s.L, R: s.R, W: s.W, S: s.S }));
  }, [store.scores]);


  const daysLeftAnimated = useCountUp(
    store.daysLeft,
    store.ready && tab === "today",
    `today-${panelTick}-${store.daysLeft}`,
  );
  const statPctAnimated = useCountUp(
    progressStats.overallPct,
    store.ready && tab === "calendar",
    `cal-pct-${panelTick}-${progressStats.overallPct}`,
  );
  const statStreakAnimated = useCountUp(
    progressStats.streak,
    store.ready && tab === "calendar",
    `cal-str-${panelTick}-${progressStats.streak}`,
  );
  const statMockAnimated = useCountUp(
    progressStats.mockCount,
    store.ready && tab === "calendar",
    `cal-mock-${panelTick}-${progressStats.mockCount}`,
  );

  useEffect(() => {
    if (prevTabRef.current === null) {
      prevTabRef.current = tab;
      return;
    }
    if (prevTabRef.current !== tab) {
      prevTabRef.current = tab;
      setPanelTick((k) => k + 1);
    }
  }, [tab]);

  const header = useMemo(() => {
    const map: Record<IELTSSection, { title: string; desc: string }> = {
      today: { title: "今日", desc: "查看計畫、記錄完成，並用計時器安排專注與休息。" },
      calendar: { title: "進度", desc: "完成率、分數趨勢與二十五天熱力圖。" },
      cards: { title: "字卡", desc: "新增單詞、分類篩選與全屏翻卡測驗。" },
      records: { title: "Writing / Speaking 記錄", desc: "把題目與你的回答存起來，隨時回看與微調。" },
      scores: { title: "成績與複習", desc: "模考紀錄、目標對照與錯題本。" },
      settings: { title: "設定", desc: "日期、計時、備份與外觀。" },
    };
    return map[tab];
  }, [tab]);

  const heroQuote = plan.tasks[0]?.tip ?? "從小的步驟開始，慢慢進入狀態就好。";

  const pomoExpanded = store.pomo.phase !== "idle";
  const focusTotalSec = store.settings.pomodoroFocusMin * 60;
  const breakTotalSec = store.settings.pomodoroBreakMin * 60;
  const pomoPct = useMemo(() => {
    if (store.pomo.phase === "focus" && focusTotalSec > 0) {
      return Math.round((1 - store.pomoRemainingSec / focusTotalSec) * 100);
    }
    if (store.pomo.phase === "break" && breakTotalSec > 0) {
      return Math.round((1 - store.pomoRemainingSec / breakTotalSec) * 100);
    }
    if (store.pomo.phase === "pause" && store.pomo.pausedPhase === "focus" && focusTotalSec > 0) {
      const rem = Math.ceil((store.pomo.remainingMs ?? 0) / 1000);
      return Math.round((1 - rem / focusTotalSec) * 100);
    }
    if (store.pomo.phase === "pause" && store.pomo.pausedPhase === "break" && breakTotalSec > 0) {
      const rem = Math.ceil((store.pomo.remainingMs ?? 0) / 1000);
      return Math.round((1 - rem / breakTotalSec) * 100);
    }
    return 0;
  }, [store.pomo, store.pomoRemainingSec, focusTotalSec, breakTotalSec]);

  const toggleTip = useCallback((key: string) => {
    setExpandedTips((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const onTaskCheck = useCallback(
    (day: number, taskId: string, key: string) => {
      setCheckPopId(key);
      window.setTimeout(() => setCheckPopId(null), 400);
      store.toggleTask(day, taskId);
    },
    [store],
  );

  const heatClass = (pct: number) => {
    if (pct <= 0) return "ielts-heat-0";
    if (pct < 34) return "ielts-heat-1";
    if (pct < 67) return "ielts-heat-2";
    if (pct < 100) return "ielts-heat-3";
    return "ielts-heat-4";
  };

  return (
    <div className="ielts-root" data-theme={themeDark ? "dark" : undefined} data-accent={accentPink ? "pink" : undefined}>
      <main
        style={{
          minHeight: "100dvh",
          maxWidth: 430,
          margin: "0 auto",
          padding: "16px 14px calc(128px + env(safe-area-inset-bottom, 0px))",
          scrollPaddingBottom: "calc(128px + env(safe-area-inset-bottom, 0px))",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
        }}
      >
        <header
          className="ielts-card-static"
          style={{
            padding: "16px 18px",
            marginBottom: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div>
            <div className="ielts-text-caption" style={{ color: "var(--ielts-text-3)" }}>
              IELTS 衝刺備考
            </div>
            <h1 className="ielts-text-title" style={{ margin: "6px 0 0", color: "var(--ielts-text-1)" }}>
              {header.title}
            </h1>
            <p className="ielts-text-body" style={{ margin: "8px 0 0", color: "var(--ielts-text-2)", fontSize: 14 }}>
              {header.desc}
            </p>
          </div>
          <Link
            href="/"
            prefetch
            onClick={() => {
              try {
                sessionStorage.setItem(SL_HOME_FROM_IELTS, "1");
              } catch {
                /* */
              }
            }}
            className="ielts-btn"
            style={{
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid var(--ielts-border-light)",
              background: "var(--ielts-bg-hover)",
              color: "var(--ielts-text-2)",
              textDecoration: "none",
              transition: "all 0.2s ease",
            }}
          >
            返回主頁
          </Link>
        </header>

        <section key={`${tab}-${panelTick}`} className="ielts-page-panel">
          {!store.ready ? (
            <div className="ielts-text-caption" style={{ padding: 24 }}>
              正在載入本機資料…
            </div>
          ) : tab === "today" ? (
            <TodayPanel
              store={store}
              plan={plan}
              completionRate={completionRate}
              doneCount={doneCount}
              daysLeftAnimated={daysLeftAnimated}
              heroQuote={heroQuote}
              pomoExpanded={pomoExpanded}
              pomoPct={pomoPct}
              expandedTips={expandedTips}
              toggleTip={toggleTip}
              checkPopId={checkPopId}
              onTaskCheck={onTaskCheck}
              setTab={setTab}
            />
          ) : tab === "calendar" ? (
            <ProgressPanel
              store={store}
              chartRows={chartRows}
              statPctAnimated={statPctAnimated}
              statStreakAnimated={statStreakAnimated}
              statMockAnimated={statMockAnimated}
              expandedHeatDay={expandedHeatDay}
              setExpandedHeatDay={setExpandedHeatDay}
              heatClass={heatClass}
            />
            ) : tab === "cards" ? (
              <CardsPanel
                store={store}
                themeDark={themeDark}
                accentPink={accentPink}
                clozePrefetchById={clozePrefetchById}
                clozePrefetchErrById={clozePrefetchErrById}
                clozePrefetchNonce={clozePrefetchNonce}
                onClozeFetched={onClozeFetched}
                onClozeError={onClozeError}
                onRetryClozePrefetch={retryClozePrefetch}
              />
            ) : tab === "records" ? (
              <RecordsPanel store={store} themeDark={themeDark} accentPink={accentPink} setNavHidden={setNavHidden} />
            ) : tab === "scores" ? (
              <ScoresTab store={store} />
            ) : (
              <SettingsTab
                store={store}
                themeDark={themeDark}
                setThemeDark={setThemeDark}
                accentPink={accentPink}
                setAccentPink={setAccentPink}
                clearSheetOpen={clearSheetOpen}
                setClearSheetOpen={setClearSheetOpen}
              />
            )}
        </section>

        <nav
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            minHeight: 80,
            paddingBottom: "max(10px, env(safe-area-inset-bottom, 0px))",
            paddingTop: 10,
            background: "var(--ielts-bg-surface)",
            borderTop: "1px solid var(--ielts-border-light)",
            boxShadow: "var(--ielts-shadow-sm)",
            zIndex: 100,
            display: navHidden ? "none" : "block",
          }}
        >
          <div
            style={{
              maxWidth: 430,
              margin: "0 auto",
              minHeight: 60,
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              alignItems: "center",
              padding: "0 6px",
            }}
          >
            {TABS.map((t) => {
              const active = t.id === tab;
              const badge = t.id === "scores" && store.dueWrongItems.length > 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`ielts-tab-btn ielts-btn ${active ? "" : ""}`}
                  data-active={active}
                  onClick={() => setTab(t.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: active ? "var(--ielts-accent)" : "var(--ielts-text-3)",
                    fontSize: 11,
                    fontWeight: 600,
                    position: "relative",
                    padding: "8px 4px",
                    minHeight: 56,
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
                  <span>{t.label}</span>
                  {active && <span className="ielts-tab-dot" />}
                  {badge && (
                    <span
                      style={{
                        position: "absolute",
                        top: 6,
                        right: "16%",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "var(--ielts-warning)",
                        boxShadow: "0 0 0 2px var(--ielts-bg-surface)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </main>
    </div>
  );
}

function TodayPanel({
  store,
  plan,
  completionRate,
  doneCount,
  daysLeftAnimated,
  heroQuote,
  pomoExpanded,
  pomoPct,
  expandedTips,
  toggleTip,
  checkPopId,
  onTaskCheck,
  setTab,
}: {
  store: ReturnType<typeof useIELTSStore>;
  plan: ReturnType<typeof store.getDayPlan>;
  completionRate: number;
  doneCount: number;
  daysLeftAnimated: number;
  heroQuote: string;
  pomoExpanded: boolean;
  pomoPct: number;
  expandedTips: Record<string, boolean>;
  toggleTip: (k: string) => void;
  checkPopId: string | null;
  onTaskCheck: (day: number, taskId: string, key: string) => void;
  setTab: (t: IELTSSection) => void;
}) {
  const daysFull = useMemo(() => {
    let n = 0;
    for (let d = 1; d <= 25; d++) {
      const p = store.getDayPlan(d);
      if (p.tasks.length && p.tasks.every((t) => store.completion[`${d}_${t.id}`])) n++;
    }
    return n;
  }, [store]);

  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [newTaskIcon, setNewTaskIcon] = useState("✨");
  const [newTaskLabel, setNewTaskLabel] = useState("自訂任務");
  const [newTaskTime, setNewTaskTime] = useState("30 分");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskTip, setNewTaskTip] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editIcon, setEditIcon] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editTaskBody, setEditTaskBody] = useState("");
  const [editTip, setEditTip] = useState("");
  const day = store.currentDay;
  const hasDayOverride = store.override[day] !== undefined;

  const openTaskEditor = (t: DayTask) => {
    setEditingTaskId(t.id);
    setEditIcon(t.icon);
    setEditTime(t.time);
    setEditLabel(t.label);
    setEditTaskBody(t.task);
    setEditTip(t.tip);
  };

  const saveTaskEdit = () => {
    if (!editingTaskId) return;
    store.updateDayTask(day, editingTaskId, {
      icon: editIcon,
      time: editTime,
      label: editLabel,
      task: editTaskBody,
      tip: editTip,
    });
    setEditingTaskId(null);
  };

  const submitNewTask = () => {
    store.addDayTask(day, {
      icon: newTaskIcon,
      label: newTaskLabel,
      time: newTaskTime,
      task: newTaskDesc,
      tip: newTaskTip,
    });
    setAddTaskOpen(false);
    setNewTaskIcon("✨");
    setNewTaskLabel("自訂任務");
    setNewTaskTime("30 分");
    setNewTaskDesc("");
    setNewTaskTip("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        className="ielts-enter"
        style={{
          borderRadius: 20,
          minHeight: 156,
          padding: "18px 20px",
          background: "var(--ielts-hero-gradient)",
          boxShadow: "var(--ielts-shadow-lg)",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "nowrap",
          }}
        >
          <div style={{ flex: "1 1 auto", minWidth: 0, maxWidth: "calc(100% - 112px)" }}>
            <div className="ielts-text-caption" style={{ color: "rgba(255,255,255,0.85)", marginBottom: 6, whiteSpace: "nowrap" }}>
              距離考試
            </div>
            <div className="ielts-text-hero" style={{ color: "#fff", lineHeight: 1.05 }}>
              {daysLeftAnimated}
            </div>
            <div className="ielts-text-caption" style={{ color: "rgba(255,255,255,0.75)", marginTop: 6, whiteSpace: "nowrap" }}>
              天後考試
            </div>
          </div>
          <div style={{ flex: "0 0 100px", width: 100, flexShrink: 0, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ProgressRing pct={completionRate} size={88} />
            </div>
            <div className="ielts-text-caption" style={{ color: "rgba(255,255,255,0.9)", marginTop: 8 }}>
              Day {store.currentDay} / 25
            </div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4, lineHeight: 1.35 }}>
              已全勤 {daysFull} 天
              <br />
              今日 {completionRate}%
            </div>
          </div>
        </div>
        <p
          className="ielts-text-body"
          style={{
            margin: 0,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.2)",
            fontSize: 13,
            color: "rgba(255,255,255,0.88)",
            lineHeight: 1.55,
          }}
        >
          <span style={{ opacity: 0.7, marginRight: 6 }}>“</span>
          {heroQuote}
        </p>
      </div>

      <div
        className={`ielts-card-static ielts-enter ${store.pomo.phase === "focus" || store.pomo.phase === "break" ? "ielts-pomo-active" : ""}`}
        style={{ padding: 18, transition: "all 0.2s ease", position: "relative", zIndex: 2 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div className="ielts-text-heading" style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🍅</span> 專注計時
            </div>
            <div className="ielts-text-caption" style={{ marginTop: 6 }}>
              {pomoPhaseZh(store.pomo.phase)} · {fmtHMS(store.pomoRemainingSec)}
            </div>
          </div>
          {store.pomo.phase === "idle" && (
            <button
              type="button"
              className="ielts-btn"
              onClick={store.pomoStartFocus}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: "none",
                background: "var(--ielts-accent)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                transition: "all 0.2s ease",
                flexShrink: 0,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              開始專注 →
            </button>
          )}
        </div>
        <div className="ielts-pomo-body" data-open={pomoExpanded ? "true" : "false"}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 16, gap: 14 }}>
            <div style={{ position: "relative", width: 100, height: 100 }}>
              <PomodoroRing pct={pomoPct} size={100} />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--ielts-text-1)",
                }}
              >
                {fmtHMS(store.pomoRemainingSec)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              {(store.pomo.phase === "focus" || store.pomo.phase === "break") && (
                <button type="button" className="ielts-btn" onClick={store.pomoPause} style={pomoSecBtn()}>
                  暫停
                </button>
              )}
              {store.pomo.phase === "pause" && (
                <button type="button" className="ielts-btn" onClick={store.pomoResume} style={pomoPrimaryBtn()}>
                  繼續
                </button>
              )}
              {store.pomo.phase !== "idle" && (
                <button type="button" className="ielts-btn" onClick={store.pomoReset} style={pomoGhostBtn()}>
                  重置
                </button>
              )}
            </div>
            {store.pomo.phase === "break" && (
              <p className="ielts-text-caption" style={{ textAlign: "center" }}>
                可以站起來走一走，喝口水。
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="ielts-card-static ielts-enter" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--ielts-accent-light)",
              color: "var(--ielts-accent)",
            }}
          >
            Day {store.currentDay}
          </span>
          <h2 className="ielts-text-title" style={{ margin: 0, flex: 1, minWidth: "60%" }}>
            {plan.theme}
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 999,
              background: "var(--ielts-progress-track)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${completionRate}%`,
                borderRadius: 999,
                background: "var(--ielts-progress-fill)",
                transition: "width 0.35s ease",
              }}
            />
          </div>
          <span className="ielts-text-caption" style={{ flexShrink: 0 }}>
            {doneCount} / {plan.tasks.length} 已完成
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            className="ielts-btn"
            onClick={() => setAddTaskOpen((o) => !o)}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid var(--ielts-border-light)",
              background: "var(--ielts-accent-light)",
              color: "var(--ielts-accent)",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {addTaskOpen ? "收起表單" : "＋ 新增任務"}
          </button>
          {hasDayOverride ? (
            <button
              type="button"
              className="ielts-btn"
              onClick={() => {
                if (window.confirm("還原為系統預設的任務清單？（自訂新增／刪除的變更會消失）")) {
                  store.setOverrideTasks(day, null);
                }
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid var(--ielts-border-light)",
                background: "var(--ielts-bg-hover)",
                color: "var(--ielts-text-2)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              還原預設任務
            </button>
          ) : null}
        </div>
        {addTaskOpen ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 12,
              border: "1px solid var(--ielts-border-light)",
              background: "var(--ielts-bg-hover)",
              display: "grid",
              gap: 10,
            }}
          >
            <span className="ielts-text-caption" style={{ fontWeight: 700 }}>
              新增「第 {day} 天」任務（僅影響今天這一天）
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                圖示
                <input className="ielts-input" value={newTaskIcon} onChange={(e) => setNewTaskIcon(e.target.value)} maxLength={8} />
              </label>
              <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                預估時間
                <input className="ielts-input" value={newTaskTime} onChange={(e) => setNewTaskTime(e.target.value)} placeholder="例：30 分" />
              </label>
            </div>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
              標題
              <input className="ielts-input" value={newTaskLabel} onChange={(e) => setNewTaskLabel(e.target.value)} />
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
              內容說明
              <textarea
                className="ielts-textarea-notes"
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                placeholder="這項任務要做什麼…"
                rows={3}
                style={{ minHeight: 72 }}
              />
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
              小提示（選填，可展開查看）
              <input className="ielts-input" value={newTaskTip} onChange={(e) => setNewTaskTip(e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="ielts-btn"
                onClick={submitNewTask}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--ielts-accent)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                加入清單
              </button>
              <button
                type="button"
                className="ielts-btn"
                onClick={() => setAddTaskOpen(false)}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid var(--ielts-border-light)",
                  background: "var(--ielts-bg-surface)",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 8 }}>
        {plan.tasks.map((t, idx) => {
          const key = `${store.currentDay}_${t.id}`;
          const done = !!store.completion[key];
          const strip = taskStripClass(t);
          const tipOpen = !!expandedTips[key];
          return (
            <div
              key={t.id}
              className={`ielts-card-static ielts-enter ${strip} ${done ? "ielts-task-done ielts-task-done-strip" : ""}`}
              style={{
                ["animationDelay" as string]: `${idx * 0.06}s`,
                padding: 0,
                overflow: "hidden",
                transition: "all 0.2s ease",
                scrollMarginBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
                ...(done
                  ? {
                      background: "#f0fdf4",
                      borderColor: "var(--ielts-border-light)",
                    }
                  : {}),
              }}
            >
              {editingTaskId === t.id ? (
                <div
                  style={{ padding: 14, display: "grid", gap: 10 }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <span className="ielts-text-caption" style={{ fontWeight: 700 }}>
                    編輯任務文字（會存成「第 {day} 天」專用內容）
                  </span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                      圖示
                      <input className="ielts-input" value={editIcon} onChange={(e) => setEditIcon(e.target.value)} maxLength={8} />
                    </label>
                    <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                      預估時間
                      <input className="ielts-input" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                    </label>
                  </div>
                  <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                    標題
                    <input className="ielts-input" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                  </label>
                  <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                    內容說明
                    <textarea
                      className="ielts-textarea-notes"
                      value={editTaskBody}
                      onChange={(e) => setEditTaskBody(e.target.value)}
                      rows={3}
                      style={{ minHeight: 72 }}
                    />
                  </label>
                  <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                    小提示（選填）
                    <input className="ielts-input" value={editTip} onChange={(e) => setEditTip(e.target.value)} />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="ielts-btn"
                      onClick={saveTaskEdit}
                      style={{
                        padding: "10px 18px",
                        borderRadius: 10,
                        border: "none",
                        background: "var(--ielts-accent)",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      儲存
                    </button>
                    <button
                      type="button"
                      className="ielts-btn"
                      onClick={() => setEditingTaskId(null)}
                      style={{
                        padding: "10px 18px",
                        borderRadius: 10,
                        border: "1px solid var(--ielts-border-light)",
                        background: "var(--ielts-bg-surface)",
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/*
                    完成鈕不可放在 role="button" 內（巢狀互動元素在行動版 WebKit 常無法點擊）
                  */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "16px 14px 12px 16px",
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleTip(key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleTip(key);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        flex: 1,
                        minWidth: 0,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 20, lineHeight: 1.2 }}>{t.icon}</span>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                          <span
                            className="ielts-text-heading"
                            style={{
                              minWidth: 0,
                              flex: 1,
                              ...(done ? { textDecoration: "line-through", color: "var(--ielts-text-3)" } : {}),
                            }}
                          >
                            {t.label}
                          </span>
                          <span className="ielts-text-caption" style={{ whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.35, paddingTop: 2 }}>
                            {t.time}
                          </span>
                        </div>
                        <p className="ielts-text-body" style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ielts-text-2)", ...(done ? { textDecoration: "line-through" } : {}) }}>
                          {t.task}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 10,
                            paddingBottom: 2,
                          }}
                        >
                          <button
                            type="button"
                            className="ielts-btn"
                            aria-label={`編輯任務：${t.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openTaskEditor(t);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 8,
                              border: "none",
                              background: "transparent",
                              color: "var(--ielts-accent)",
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              touchAction: "manipulation",
                            }}
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            className="ielts-btn"
                            aria-label={`刪除任務：${t.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`確定刪除「${t.label}」？`)) {
                                store.removeDayTask(store.currentDay, t.id);
                                if (editingTaskId === t.id) setEditingTaskId(null);
                              }
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 8,
                              border: "none",
                              background: "transparent",
                              color: "var(--ielts-danger)",
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              touchAction: "manipulation",
                            }}
                          >
                            刪除
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={checkPopId === key ? "ielts-check-pop" : ""}
                      aria-label={done ? "取消完成" : "標為完成"}
                      onClick={() => onTaskCheck(store.currentDay, t.id, key)}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        width: 32,
                        height: 32,
                        marginTop: 2,
                        borderRadius: "50%",
                        border: done ? "none" : "2px solid var(--ielts-border-medium)",
                        background: done ? "var(--ielts-accent)" : "transparent",
                        color: "#fff",
                        cursor: "pointer",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 800,
                        transition: "all 0.2s ease",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {done ? "✓" : ""}
                    </button>
                  </div>
                  {t.tip && (
                    <div
                      style={{
                        maxHeight: tipOpen ? 120 : 0,
                        overflow: "hidden",
                        transition: "max-height 0.3s ease",
                        borderTop: tipOpen ? "1px solid var(--ielts-border-light)" : "none",
                      }}
                    >
                      <p className="ielts-text-caption" style={{ padding: "10px 16px 16px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span>💡</span>
                        <span>{t.tip}</span>
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {store.dueWrongItems.length > 0 && (
        <button
          type="button"
          className="ielts-card-static ielts-btn ielts-enter"
          onClick={() => setTab("scores")}
          style={{
            width: "100%",
            textAlign: "left",
            border: "1px solid #fed7aa",
            background: "#fff7ed",
            color: "var(--ielts-warning)",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 18px",
          }}
        >
          <span className="ielts-text-heading" style={{ fontSize: 15, color: "#9a3412" }}>
            📋 今日需複習 {store.dueWrongItems.length} 題
          </span>
          <span style={{ fontWeight: 700 }}>查看 →</span>
        </button>
      )}

      <div className="ielts-card-static ielts-enter" style={{ padding: 20 }}>
        <div className="ielts-text-heading" style={{ marginBottom: 4 }}>
          📝 今日心得
        </div>
        <textarea
          className="ielts-textarea-notes"
          value={store.notes[store.currentDay] ?? ""}
          onChange={(e) => store.setDayNote(store.currentDay, e.target.value)}
          placeholder="寫下今天的想法、卡住的地方…"
        />
      </div>
    </div>
  );
}

/** 進度頁熱力圖：點選某日後可編輯該日任務（與「今日」相同寫入 schedule override） */
function HeatmapExpandedDayTasks({
  day,
  store,
}: {
  day: number;
  store: ReturnType<typeof useIELTSStore>;
}) {
  const plan = useMemo(() => store.getDayPlan(day), [store, day]);
  const hasDayOverride = store.override[day] !== undefined;
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [newTaskIcon, setNewTaskIcon] = useState("✨");
  const [newTaskLabel, setNewTaskLabel] = useState("自訂任務");
  const [newTaskTime, setNewTaskTime] = useState("30 分");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskTip, setNewTaskTip] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editIcon, setEditIcon] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editTaskBody, setEditTaskBody] = useState("");
  const [editTip, setEditTip] = useState("");
  const [expandedTips, setExpandedTips] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setEditingTaskId(null);
    setAddTaskOpen(false);
    setExpandedTips({});
  }, [day]);

  const toggleTip = (key: string) => setExpandedTips((prev) => ({ ...prev, [key]: !prev[key] }));

  const openTaskEditor = (t: DayTask) => {
    setEditingTaskId(t.id);
    setEditIcon(t.icon);
    setEditTime(t.time);
    setEditLabel(t.label);
    setEditTaskBody(t.task);
    setEditTip(t.tip);
  };

  const saveTaskEdit = () => {
    if (!editingTaskId) return;
    store.updateDayTask(day, editingTaskId, {
      icon: editIcon,
      time: editTime,
      label: editLabel,
      task: editTaskBody,
      tip: editTip,
    });
    setEditingTaskId(null);
  };

  const submitNewTask = () => {
    store.addDayTask(day, {
      icon: newTaskIcon,
      label: newTaskLabel,
      time: newTaskTime,
      task: newTaskDesc,
      tip: newTaskTip,
    });
    setAddTaskOpen(false);
    setNewTaskIcon("✨");
    setNewTaskLabel("自訂任務");
    setNewTaskTime("30 分");
    setNewTaskDesc("");
    setNewTaskTip("");
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: 12,
        background: "var(--ielts-bg-hover)",
        border: "1px solid var(--ielts-border-light)",
      }}
    >
      <div className="ielts-text-heading" style={{ fontSize: 15, marginBottom: 12 }}>
        第 {day} 天
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className="ielts-btn"
          onClick={() => setAddTaskOpen((o) => !o)}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "none",
            background: "var(--ielts-accent)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {addTaskOpen ? "收起表單" : "＋ 新增任務"}
        </button>
        {hasDayOverride ? (
          <button
            type="button"
            className="ielts-btn"
            onClick={() => {
              if (window.confirm("還原為系統預設的任務清單？（此日自訂內容會消失）")) {
                store.setOverrideTasks(day, null);
                setEditingTaskId(null);
              }
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid var(--ielts-border-light)",
              background: "var(--ielts-bg-surface)",
              color: "var(--ielts-text-2)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            還原預設任務
          </button>
        ) : null}
      </div>

      {addTaskOpen ? (
        <div
          style={{
            marginBottom: 14,
            padding: 14,
            borderRadius: 12,
            border: "1px solid var(--ielts-border-light)",
            background: "var(--ielts-bg-surface)",
            display: "grid",
            gap: 10,
          }}
        >
          <span className="ielts-text-caption" style={{ fontWeight: 700 }}>
            新增「第 {day} 天」任務
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
              圖示
              <input className="ielts-input" value={newTaskIcon} onChange={(e) => setNewTaskIcon(e.target.value)} maxLength={8} />
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
              預估時間
              <input className="ielts-input" value={newTaskTime} onChange={(e) => setNewTaskTime(e.target.value)} placeholder="例：30 分" />
            </label>
          </div>
          <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
            標題
            <input className="ielts-input" value={newTaskLabel} onChange={(e) => setNewTaskLabel(e.target.value)} />
          </label>
          <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
            內容說明
            <textarea
              className="ielts-textarea-notes"
              value={newTaskDesc}
              onChange={(e) => setNewTaskDesc(e.target.value)}
              placeholder="這項任務要做什麼…"
              rows={3}
              style={{ minHeight: 72 }}
            />
          </label>
          <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
            小提示（選填）
            <input className="ielts-input" value={newTaskTip} onChange={(e) => setNewTaskTip(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="ielts-btn"
              onClick={submitNewTask}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                background: "var(--ielts-accent)",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              加入清單
            </button>
            <button
              type="button"
              className="ielts-btn"
              onClick={() => setAddTaskOpen(false)}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "1px solid var(--ielts-border-light)",
                background: "var(--ielts-bg-surface)",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {plan.tasks.map((t, idx) => {
          const key = `${day}_${t.id}`;
          const done = !!store.completion[key];
          const strip = taskStripClass(t);
          const tipOpen = !!expandedTips[key];
          return (
            <div
              key={t.id}
              className={`ielts-card-static ${strip} ${done ? "ielts-task-done ielts-task-done-strip" : ""}`}
              style={{
                ["animationDelay" as string]: `${idx * 0.04}s`,
                padding: 0,
                overflow: "hidden",
                transition: "all 0.2s ease",
                ...(done
                  ? {
                      background: "#f0fdf4",
                      borderColor: "var(--ielts-border-light)",
                    }
                  : {}),
              }}
            >
              {editingTaskId === t.id ? (
                <div style={{ padding: 14, display: "grid", gap: 10 }} onClick={(e) => e.stopPropagation()}>
                  <span className="ielts-text-caption" style={{ fontWeight: 700 }}>
                    編輯任務（第 {day} 天）
                  </span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                      圖示
                      <input className="ielts-input" value={editIcon} onChange={(e) => setEditIcon(e.target.value)} maxLength={8} />
                    </label>
                    <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                      預估時間
                      <input className="ielts-input" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                    </label>
                  </div>
                  <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                    標題
                    <input className="ielts-input" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                  </label>
                  <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                    內容說明
                    <textarea
                      className="ielts-textarea-notes"
                      value={editTaskBody}
                      onChange={(e) => setEditTaskBody(e.target.value)}
                      rows={3}
                      style={{ minHeight: 72 }}
                    />
                  </label>
                  <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                    小提示（選填）
                    <input className="ielts-input" value={editTip} onChange={(e) => setEditTip(e.target.value)} />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="ielts-btn"
                      onClick={saveTaskEdit}
                      style={{
                        padding: "10px 18px",
                        borderRadius: 10,
                        border: "none",
                        background: "var(--ielts-accent)",
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      儲存
                    </button>
                    <button
                      type="button"
                      className="ielts-btn"
                      onClick={() => setEditingTaskId(null)}
                      style={{
                        padding: "10px 18px",
                        borderRadius: 10,
                        border: "1px solid var(--ielts-border-light)",
                        background: "var(--ielts-bg-surface)",
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "16px 14px 12px 16px",
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleTip(key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleTip(key);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        flex: 1,
                        minWidth: 0,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 20, lineHeight: 1.2 }}>{t.icon}</span>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                          <span
                            className="ielts-text-heading"
                            style={{
                              minWidth: 0,
                              flex: 1,
                              ...(done ? { textDecoration: "line-through", color: "var(--ielts-text-3)" } : {}),
                            }}
                          >
                            {t.label}
                          </span>
                          <span className="ielts-text-caption" style={{ whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.35, paddingTop: 2 }}>
                            {t.time}
                          </span>
                        </div>
                        <p
                          className="ielts-text-body"
                          style={{
                            margin: "6px 0 0",
                            fontSize: 14,
                            color: "var(--ielts-text-2)",
                            ...(done ? { textDecoration: "line-through" } : {}),
                          }}
                        >
                          {t.task}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 10,
                            paddingBottom: 2,
                          }}
                        >
                          <button
                            type="button"
                            className="ielts-btn"
                            aria-label={`編輯任務：${t.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openTaskEditor(t);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 8,
                              border: "none",
                              background: "transparent",
                              color: "var(--ielts-accent)",
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              touchAction: "manipulation",
                            }}
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            className="ielts-btn"
                            aria-label={`刪除任務：${t.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`確定刪除「${t.label}」？`)) {
                                store.removeDayTask(day, t.id);
                                if (editingTaskId === t.id) setEditingTaskId(null);
                              }
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 8,
                              border: "none",
                              background: "transparent",
                              color: "var(--ielts-danger)",
                              fontWeight: 700,
                              fontSize: 12,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                              touchAction: "manipulation",
                            }}
                          >
                            刪除
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={done ? "取消完成" : "標為完成"}
                      onClick={() => store.toggleTask(day, t.id)}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        width: 32,
                        height: 32,
                        marginTop: 2,
                        borderRadius: "50%",
                        border: done ? "none" : "2px solid var(--ielts-border-medium)",
                        background: done ? "var(--ielts-accent)" : "transparent",
                        color: "#fff",
                        cursor: "pointer",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 800,
                        transition: "all 0.2s ease",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                      }}
                    >
                      {done ? "✓" : ""}
                    </button>
                  </div>
                  {t.tip ? (
                    <div
                      style={{
                        maxHeight: tipOpen ? 120 : 0,
                        overflow: "hidden",
                        transition: "max-height 0.3s ease",
                        borderTop: tipOpen ? "1px solid var(--ielts-border-light)" : "none",
                      }}
                    >
                      <p className="ielts-text-caption" style={{ padding: "10px 16px 16px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span>💡</span>
                        <span>{t.tip}</span>
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressPanel({
  store,
  chartRows,
  statPctAnimated,
  statStreakAnimated,
  statMockAnimated,
  expandedHeatDay,
  setExpandedHeatDay,
  heatClass,
}: {
  store: ReturnType<typeof useIELTSStore>;
  chartRows: { date: string; L?: number; R?: number; W?: number; S?: number }[];
  statPctAnimated: number;
  statStreakAnimated: number;
  statMockAnimated: number;
  expandedHeatDay: number | null;
  setExpandedHeatDay: (d: number | null) => void;
  heatClass: (pct: number) => string;
}) {
  const cells = useMemo(() => {
    return Array.from({ length: 25 }, (_, i) => {
      const day = i + 1;
      const p = store.getDayPlan(day);
      const done = p.tasks.filter((t) => store.completion[`${day}_${t.id}`]).length;
      const pct = p.tasks.length ? Math.round((done / p.tasks.length) * 100) : 0;
      return { day, pct, p, done, total: p.tasks.length };
    });
  }, [store]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        className="ielts-enter"
        style={{
          borderRadius: 16,
          padding: "20px 16px",
          background: "var(--ielts-banner-dark)",
          color: "#fff",
          boxShadow: "var(--ielts-shadow-lg)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
          <div style={{ borderRight: "1px solid rgba(255,255,255,0.15)" }}>
            <div className="ielts-text-display" style={{ color: "#fff" }}>
              {statPctAnimated}%
            </div>
            <div className="ielts-text-caption" style={{ color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
              完成率
            </div>
          </div>
          <div style={{ borderRight: "1px solid rgba(255,255,255,0.15)" }}>
            <div className="ielts-text-display" style={{ color: "#fff" }}>
              {statStreakAnimated}
              <span style={{ fontSize: 18 }}> 天</span>🔥
            </div>
            <div className="ielts-text-caption" style={{ color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
              連續有進度
            </div>
          </div>
          <div>
            <div className="ielts-text-display" style={{ color: "#fff" }}>
              {statMockAnimated}
            </div>
            <div className="ielts-text-caption" style={{ color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
              模考次數
            </div>
          </div>
        </div>
      </div>

      <ScoreTrendChart data={chartRows} listening="#56ccf2" reading="#6fcf97" writing="#f2c94c" speaking="#8b5cf6" />

      <div className="ielts-card-static ielts-enter" style={{ padding: 18 }}>
        <h3 className="ielts-text-heading" style={{ margin: "0 0 14px" }}>
          學習熱力圖
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 8,
            maxWidth: 320,
            margin: "0 auto",
          }}
        >
          {cells.map(({ day, pct }) => {
            const active = day === store.currentDay;
            const expanded = expandedHeatDay === day;
            return (
              <button
                key={day}
                type="button"
                className={`ielts-btn ${heatClass(pct)}`}
                onClick={() => setExpandedHeatDay(expandedHeatDay === day ? null : day)}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  maxWidth: 52,
                  maxHeight: 52,
                  margin: "0 auto",
                  borderRadius: 10,
                  border: expanded
                    ? "2px solid var(--ielts-accent)"
                    : active
                      ? "2px solid var(--ielts-warning)"
                      : "1px solid var(--ielts-border-light)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  transition: "transform 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {day === 25 ? "🎯" : day}
              </button>
            );
          })}
        </div>
        {expandedHeatDay != null ? <HeatmapExpandedDayTasks day={expandedHeatDay} store={store} /> : null}
      </div>
    </div>
  );
}

function looksReadingFlashcardCat(c: FlashcardCategoryDef): boolean {
  const id = c.id.toLowerCase();
  const lab = c.label.trim();
  const labLo = lab.toLowerCase();
  if (id === "reading" || /\breading\b/.test(id)) return true;
  if (/閱讀|阅读/.test(lab)) return true;
  return labLo === "reading" || /\breading\b/i.test(lab);
}

function looksListeningFlashcardCat(c: FlashcardCategoryDef): boolean {
  const id = c.id.toLowerCase();
  const lab = c.label.trim();
  if (id === "listening" || /\blistening\b/.test(id)) return true;
  return /聆聽|聽力|听力|Listening|LISTENING|IELTS\s*L\b/i.test(lab);
}

function looksWritingFlashcardCat(c: FlashcardCategoryDef): boolean {
  const id = c.id.toLowerCase();
  const lab = c.label.trim();
  if (id === "writing" || /\bwriting\b/.test(id)) return true;
  return /寫作|写作|Writing|WRITING/i.test(lab);
}

function looksSpeakingFlashcardCat(c: FlashcardCategoryDef): boolean {
  const id = c.id.toLowerCase();
  const lab = c.label.trim();
  if (id === "speaking") return true;
  if (/\b(speaking|spoken)\b/.test(id) || /_speak|speak_/.test(id)) return true;
  return /口說|口语|口語|說話|Speaking|SPEAKING|IELTS\s*S\b|Oral/i.test(lab);
}

/**
 * 篩選列第二行：固定順序 閱讀 → 聆聽 → 寫作 → 口說；其餘自訂類別（如詞彙、語法）接在後面。
 */
function partitionFlashcardCategoriesForFilterRow(cats: FlashcardCategoryDef[]): {
  skillsInRLWSOrder: FlashcardCategoryDef[];
  rest: FlashcardCategoryDef[];
} {
  const consumed = new Set<string>();
  const pick = (pred: (x: FlashcardCategoryDef) => boolean) => {
    const hit = cats.find((x) => !consumed.has(x.id) && pred(x));
    if (hit) consumed.add(hit.id);
    return hit;
  };
  const reading = pick(looksReadingFlashcardCat);
  const listening = pick(looksListeningFlashcardCat);
  const writing = pick(looksWritingFlashcardCat);
  const speaking = pick(looksSpeakingFlashcardCat);
  const skillsInRLWSOrder = [reading, listening, writing, speaking].filter(
    (x): x is FlashcardCategoryDef => Boolean(x),
  );
  const rest = cats.filter((c) => !consumed.has(c.id));
  return { skillsInRLWSOrder, rest };
}

/** 字卡列表左框：與上方統計色一致——待複習清單（紫）優先，其次已掌握（綠）、未掌握（黃） */
function flashcardListBorderColor(cardId: string, mastered: boolean, reviewQueueIds: Set<string>): string {
  if (reviewQueueIds.has(cardId)) return "var(--ielts-speaking)";
  if (mastered) return "var(--ielts-success)";
  return "var(--ielts-warning)";
}

function CardsPanel({
  store,
  themeDark,
  accentPink,
  clozePrefetchById,
  clozePrefetchErrById,
  clozePrefetchNonce,
  onClozeFetched,
  onClozeError,
  onRetryClozePrefetch,
}: {
  store: ReturnType<typeof useIELTSStore>;
  themeDark: boolean;
  accentPink: boolean;
  clozePrefetchById: Record<string, ClozePayload>;
  clozePrefetchErrById: Record<string, string>;
  clozePrefetchNonce: number;
  onClozeFetched: (id: string, data: ClozePayload) => void;
  onClozeError: (id: string, message: string) => void;
  onRetryClozePrefetch: () => void;
}) {
  const cats = store.settings.flashcardCategories;
  const [filter, setFilter] = useState<"all" | string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [catManageOpen, setCatManageOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [dictationOpen, setDictationOpen] = useState(false);
  const [clozeOpen, setClozeOpen] = useState(false);
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [example, setExample] = useState("");
  const [newCat, setNewCat] = useState<FlashcardCategory>("vocab");
  const [editId, setEditId] = useState<string | null>(null);
  const [eword, setEword] = useState("");
  const [emeaning, setEmeaning] = useState("");
  const [eexample, setEexample] = useState("");
  const [ecat, setEcat] = useState<FlashcardCategory>("vocab");
  const [emastered, setEmastered] = useState(false);
  const [catLabelDrafts, setCatLabelDrafts] = useState<Record<string, string>>({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [deleteMoveToId, setDeleteMoveToId] = useState<Record<string, string>>({});

  const editingCard = useMemo(
    () => (editId ? store.flashcards.find((c) => c.id === editId) ?? null : null),
    [editId, store.flashcards],
  );

  useEffect(() => {
    if (!editingCard) return;
    setEword(editingCard.word);
    setEmeaning(editingCard.meaning);
    setEexample(editingCard.example ?? "");
    setEcat(cats.some((c) => c.id === editingCard.category) ? editingCard.category : (cats[0]?.id ?? "vocab"));
    setEmastered(editingCard.mastered);
  }, [editingCard, cats]);

  useEffect(() => {
    if (editId && !store.flashcards.some((c) => c.id === editId)) setEditId(null);
  }, [editId, store.flashcards]);

  const displayFilter = useMemo(() => {
    if (filter === FLASHCARD_REVIEW_QUEUE_FILTER_ID) return filter;
    if (filter === "all" || cats.some((c) => c.id === filter)) return filter;
    return "all";
  }, [filter, cats]);
  const newCatResolved = cats.some((c) => c.id === newCat) ? newCat : (cats[0]?.id ?? "vocab");
  const ecatResolved = cats.some((c) => c.id === ecat) ? ecat : (cats[0]?.id ?? "vocab");

  const { skillsInRLWSOrder, rest: filterRestCats } = useMemo(
    () => partitionFlashcardCategoriesForFilterRow(cats),
    [cats],
  );

  const openCategoryManager = () => {
    const d: Record<string, string> = {};
    for (const c of cats) d[c.id] = c.label;
    setCatLabelDrafts(d);
    const m: Record<string, string> = {};
    for (const c of cats) {
      const other = cats.find((x) => x.id !== c.id);
      if (other) m[c.id] = other.id;
    }
    setDeleteMoveToId(m);
    setCatManageOpen(true);
  };

  const focusCategory = useCallback((id: string) => {
    if (id === FLASHCARD_REVIEW_QUEUE_FILTER_ID) return;
    if (id === "all") return;
    if (!cats.some((c) => c.id === id)) return;
    setFilter(id);
    setNewCat(id);
    if (editId) setEcat(id);
  }, [cats, editId]);

  const filtered = useMemo(() => {
    if (displayFilter === "all") return store.flashcards;
    if (displayFilter === FLASHCARD_REVIEW_QUEUE_FILTER_ID) {
      const byId = new Map(store.flashcards.map((c) => [c.id, c]));
      return store.flashcardReviewQueue.map((id) => byId.get(id)).filter((c): c is Flashcard => Boolean(c));
    }
    return store.flashcards.filter((c) => c.category === displayFilter);
  }, [store.flashcardReviewQueue, store.flashcards, displayFilter]);

  const reviewQueueIdSet = useMemo(() => new Set(store.flashcardReviewQueue), [store.flashcardReviewQueue]);

  const total = store.flashcards.length;
  const masteredN = store.flashcards.filter((c) => c.mastered).length;
  const dueN = total - masteredN;

  const startQuiz = () => {
    if (filtered.length === 0) {
      window.alert("目前沒有可測驗的單詞，請先新增或換個分類。");
      return;
    }
    setQuizOpen(true);
  };

  const startDictation = () => {
    if (filtered.length === 0) {
      window.alert("目前沒有可默寫的單詞，請先新增或換個分類。");
      return;
    }
    setDictationOpen(true);
  };

  const startCloze = () => {
    if (filtered.length === 0) {
      window.alert("目前沒有可練習的單詞，請先新增或換個分類。");
      return;
    }
    setClozeOpen(true);
  };

  const saveNew = () => {
    if (!word.trim() || !meaning.trim()) {
      window.alert("請填寫單字與解釋。");
      return;
    }
    store.addFlashcard({
      word: word.trim(),
      meaning: meaning.trim(),
      example: example.trim() || undefined,
      category: newCatResolved,
    });
    setWord("");
    setMeaning("");
    setExample("");
    setAddOpen(false);
  };

  const openEdit = (c: Flashcard) => {
    setAddOpen(false);
    setEditId(c.id);
  };

  const saveEdit = () => {
    if (!editingCard) return;
    if (!eword.trim()) {
      window.alert("請填寫單字或片語。");
      return;
    }
    store.updateFlashcard(editingCard.id, {
      word: eword.trim(),
      meaning: emeaning.trim(),
      example: eexample.trim() || undefined,
      category: ecatResolved,
      mastered: emastered,
    });
    setEditId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <FlashcardQuiz
        open={quizOpen}
        onClose={() => setQuizOpen(false)}
        cards={filtered}
        themeDark={themeDark}
        accentPink={accentPink}
        categoryDefs={cats}
        onKnow={(id) => store.setFlashcardMastered(id, true)}
        onDontKnow={(id) => store.setFlashcardMastered(id, false)}
        onReviewAgain={store.addFlashcardToReviewQueue}
      />
      <FlashcardDictation
        open={dictationOpen}
        onClose={() => setDictationOpen(false)}
        cards={filtered}
        themeDark={themeDark}
        accentPink={accentPink}
        categoryDefs={cats}
        onKnow={(id) => store.setFlashcardMastered(id, true)}
        onDontKnow={(id) => store.setFlashcardMastered(id, false)}
        onReviewAgain={store.addFlashcardToReviewQueue}
      />
      <FlashcardCloze
        open={clozeOpen}
        onClose={() => setClozeOpen(false)}
        cards={filtered}
        themeDark={themeDark}
        accentPink={accentPink}
        categoryDefs={cats}
        clozeById={clozePrefetchById}
        clozeErrById={clozePrefetchErrById}
        clozeResetNonce={clozePrefetchNonce}
        onClozeFetched={onClozeFetched}
        onClozeError={onClozeError}
        onRetryClozePrefetch={onRetryClozePrefetch}
        onKnow={(id) => store.setFlashcardMastered(id, true)}
        onDontKnow={(id) => store.setFlashcardMastered(id, false)}
        onReviewAgain={store.addFlashcardToReviewQueue}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: "總詞彙", v: total, c: "var(--ielts-accent)" },
          { label: "已掌握", v: masteredN, c: "var(--ielts-success)" },
          { label: "未掌握", v: dueN, c: "var(--ielts-warning)" },
          { label: "待複習", v: store.flashcardReviewQueue.length, c: "var(--ielts-speaking)" },
        ].map((x, i) => (
          <div key={x.label} className="ielts-card-static ielts-enter" style={{ padding: 14, textAlign: "center", animationDelay: `${i * 0.06}s` }}>
            <div className="ielts-text-display" style={{ color: x.c, fontSize: 28 }}>
              {x.v}
            </div>
            <div className="ielts-text-caption" style={{ marginTop: 6 }}>
              {x.label}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          type="button"
          className="ielts-btn ielts-enter"
          style={{ ...outlineBtn(), width: "100%" }}
          onClick={() => {
            setEditId(null);
            setAddOpen(true);
          }}
        >
          ＋ 新增單詞
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <button type="button" className="ielts-btn ielts-enter" style={{ ...solidBtn(), padding: "12px 8px", fontSize: 13 }} onClick={startQuiz}>
            ▶ 測驗
          </button>
          <button
            type="button"
            className="ielts-btn ielts-enter"
            style={{
              padding: "12px 8px",
              borderRadius: 12,
              border: "2px solid var(--ielts-accent)",
              background: "var(--ielts-accent-light)",
              color: "var(--ielts-accent)",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            onClick={startDictation}
          >
            ✎ 默寫
          </button>
          <button
            type="button"
            className="ielts-btn ielts-enter"
            style={{
              padding: "12px 8px",
              borderRadius: 12,
              border: "2px solid var(--ielts-accent-cloze)",
              background: "var(--ielts-accent-cloze-light)",
              color: "var(--ielts-accent-cloze)",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            onClick={startCloze}
          >
            AI 填空
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {(
            [
              { id: "all" as const, label: "全部" },
              { id: FLASHCARD_REVIEW_QUEUE_FILTER_ID, label: "待複習" },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              className="ielts-btn"
              onClick={() => setFilter(p.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: displayFilter === p.id ? "var(--ielts-accent)" : "var(--ielts-bg-hover)",
                color: displayFilter === p.id ? "#fff" : "var(--ielts-text-3)",
                transition: "all 0.2s ease",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {[...skillsInRLWSOrder, ...filterRestCats].map((c) => (
            <button
              key={c.id}
              type="button"
              className="ielts-btn"
              onClick={() => setFilter(c.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: displayFilter === c.id ? "var(--ielts-accent)" : "var(--ielts-bg-hover)",
                color: displayFilter === c.id ? "#fff" : "var(--ielts-text-3)",
                transition: "all 0.2s ease",
              }}
            >
              {c.label}
            </button>
          ))}
          <button
            type="button"
            className="ielts-btn"
            onClick={openCategoryManager}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px dashed var(--ielts-border-medium)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              background: "transparent",
              color: "var(--ielts-text-2)",
            }}
          >
            ⚙ 管理類別
          </button>
        </div>
      </div>

      {catManageOpen && (
        <IeltsSheetPortal themeDark={themeDark} accentPink={accentPink}>
          <div
            className="ielts-sheet-backdrop"
            role="presentation"
            style={{ pointerEvents: "auto" }}
            onClick={() => setCatManageOpen(false)}
          />
          <div
            className="ielts-sheet"
            style={{
              pointerEvents: "auto",
              maxHeight: "85vh",
              overflowY: "auto",
              paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="ielts-text-heading" style={{ marginBottom: 10 }}>
              管理字卡類別
            </div>
            <p className="ielts-text-caption" style={{ marginBottom: 14, color: "var(--ielts-text-3)", lineHeight: 1.5 }}>
              可更改顯示名稱、新增類別；刪除類別時，該類字卡會移到你所選的另一類別。至少須保留一個類別。
            </p>
            {cats.map((c) => (
              <div key={c.id} className="ielts-card-static" style={{ padding: 12, marginBottom: 10, display: "grid", gap: 8 }}>
                <label className="ielts-text-caption" style={{ display: "grid", gap: 4 }}>
                  顯示名稱
                  <input
                    className="ielts-input"
                    value={catLabelDrafts[c.id] ?? c.label}
                    onChange={(e) => setCatLabelDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                  />
                </label>
                <span className="ielts-text-caption" style={{ fontSize: 11, color: "var(--ielts-text-4)" }}>
                  內部 id：{c.id}
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    className="ielts-btn"
                    style={solidBtn()}
                    onClick={() => store.renameFlashcardCategory(c.id, catLabelDrafts[c.id] ?? c.label)}
                  >
                    儲存名稱
                  </button>
                  {cats.length > 1 ? (
                    <>
                      <span className="ielts-text-caption" style={{ fontSize: 12 }}>
                        刪除時字卡移至
                      </span>
                      <select
                        className="ielts-input"
                        style={{ maxWidth: 200 }}
                        value={deleteMoveToId[c.id] ?? ""}
                        onChange={(e) => setDeleteMoveToId((m) => ({ ...m, [c.id]: e.target.value }))}
                      >
                        {cats
                          .filter((x) => x.id !== c.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.label}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="ielts-btn"
                        style={{
                          border: "1px solid var(--ielts-danger)",
                          color: "var(--ielts-danger)",
                          background: "rgba(220, 38, 38, 0.06)",
                          padding: "8px 12px",
                          borderRadius: 10,
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                        onClick={() => {
                          const to = deleteMoveToId[c.id];
                          if (!to) return;
                          const toLabel = flashcardCategoryLabel(to, cats);
                          if (window.confirm(`刪除類別「${catLabelDrafts[c.id] ?? c.label}」，該類字卡將移至「${toLabel}」？`)) {
                            store.removeFlashcardCategory(c.id, to);
                          }
                        }}
                      >
                        刪除此類別
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
            <div className="ielts-card-static" style={{ padding: 12, marginBottom: 14, background: "var(--ielts-accent-light)" }}>
              <div className="ielts-text-caption" style={{ fontWeight: 800, marginBottom: 8 }}>
                新增類別
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
                <input
                  className="ielts-input"
                  style={{ flex: 1, minWidth: 140 }}
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="例如：同義替換"
                />
                <button
                  type="button"
                  className="ielts-btn"
                  style={solidBtn()}
                  onClick={() => {
                    const t = newCategoryName.trim();
                    if (!t) return;
                    const id = store.addFlashcardCategory(t);
                    if (id) focusCategory(id);
                    setNewCategoryName("");
                  }}
                >
                  新增
                </button>
              </div>
            </div>
            <button type="button" className="ielts-btn" style={{ ...outlineBtn(), width: "100%" }} onClick={() => setCatManageOpen(false)}>
              完成
            </button>
          </div>
        </IeltsSheetPortal>
      )}

      {addOpen && (
        <IeltsSheetPortal themeDark={themeDark} accentPink={accentPink}>
          <div
            className="ielts-sheet-backdrop"
            role="presentation"
            style={{ pointerEvents: "auto" }}
            onClick={() => setAddOpen(false)}
          />
          <div
            className="ielts-sheet"
            style={{
              pointerEvents: "auto",
              maxHeight: "85vh",
              overflowY: "auto",
              paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
              新增單詞
            </div>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              分類
              <select className="ielts-input" value={newCatResolved} onChange={(e) => setNewCat(e.target.value)}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              單字 / 片語
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <input
                  className="ielts-input"
                  style={{ flex: 1, minWidth: 0 }}
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="例如：elaborate"
                />
                <button
                  type="button"
                  className="ielts-btn"
                  title="朗讀單字（英式英文語音）"
                  style={{
                    flexShrink: 0,
                    padding: "0 14px",
                    borderRadius: 10,
                    border: "1px solid var(--ielts-accent)",
                    background: "var(--ielts-accent-light)",
                    color: "var(--ielts-accent)",
                    fontWeight: 800,
                    fontSize: 16,
                    cursor: "pointer",
                  }}
                  onClick={() => speakEnglish(word)}
                >
                  🔊
                </button>
              </div>
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              解釋
              <input className="ielts-input" value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="中文或英文釋義" />
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 14 }}>
              例句（選填）
              <textarea className="ielts-input" style={{ minHeight: 72 }} value={example} onChange={(e) => setExample(e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="ielts-btn" style={{ ...outlineBtn(), flex: 1 }} onClick={() => setAddOpen(false)}>
                取消
              </button>
              <button type="button" className="ielts-btn" style={{ ...solidBtn(), flex: 1 }} onClick={saveNew}>
                儲存
              </button>
            </div>
          </div>
        </IeltsSheetPortal>
      )}

      {editId && editingCard && (
        <IeltsSheetPortal themeDark={themeDark} accentPink={accentPink}>
          <div
            className="ielts-sheet-backdrop"
            role="presentation"
            style={{ pointerEvents: "auto" }}
            onClick={() => setEditId(null)}
          />
          <div
            className="ielts-sheet"
            style={{
              pointerEvents: "auto",
              maxHeight: "85vh",
              overflowY: "auto",
              paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
              字卡設定
            </div>
            <p className="ielts-text-caption" style={{ marginBottom: 12, color: "var(--ielts-text-3)" }}>
              修改此張字卡內容；儲存後會立即套用在列表與測驗。
            </p>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              分類
              <select className="ielts-input" value={ecatResolved} onChange={(e) => setEcat(e.target.value)}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              單字 / 片語
              <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                <input
                  className="ielts-input"
                  style={{ flex: 1, minWidth: 0 }}
                  value={eword}
                  onChange={(e) => setEword(e.target.value)}
                  placeholder="例如：elaborate"
                />
                <button
                  type="button"
                  className="ielts-btn"
                  title="朗讀單字（英式英文語音）"
                  style={{
                    flexShrink: 0,
                    padding: "0 14px",
                    borderRadius: 10,
                    border: "1px solid var(--ielts-accent)",
                    background: "var(--ielts-accent-light)",
                    color: "var(--ielts-accent)",
                    fontWeight: 800,
                    fontSize: 16,
                    cursor: "pointer",
                  }}
                  onClick={() => speakEnglish(eword)}
                >
                  🔊
                </button>
              </div>
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              解釋
              <input className="ielts-input" value={emeaning} onChange={(e) => setEmeaning(e.target.value)} placeholder="中文或英文釋義" />
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              例句（選填）
              <textarea className="ielts-input" style={{ minHeight: 72 }} value={eexample} onChange={(e) => setEexample(e.target.value)} />
            </label>
            <label
              className="ielts-text-caption"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input type="checkbox" checked={emastered} onChange={(e) => setEmastered(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--ielts-accent)" }} />
              標記為已掌握
            </label>
            <div
              style={{
                marginTop: 18,
                paddingTop: 16,
                borderTop: "1px solid var(--ielts-border-light)",
              }}
            >
              <button
                type="button"
                className="ielts-btn"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(220, 38, 38, 0.35)",
                  background: "rgba(220, 38, 38, 0.06)",
                  color: "var(--ielts-danger)",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
                onClick={() => {
                  if (!editingCard) return;
                  if (window.confirm("確定刪除此單詞？此操作無法復原。")) {
                    store.removeFlashcard(editingCard.id);
                    setEditId(null);
                  }
                }}
              >
                刪除此單詞
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button type="button" className="ielts-btn" style={{ ...outlineBtn(), flex: 1 }} onClick={() => setEditId(null)}>
                取消
              </button>
              <button type="button" className="ielts-btn" style={{ ...solidBtn(), flex: 1 }} onClick={saveEdit}>
                儲存
              </button>
            </div>
          </div>
        </IeltsSheetPortal>
      )}

      {filtered.length === 0 ? (
        <div className="ielts-card-static" style={{ padding: 32, textAlign: "center" }}>
          <p className="ielts-text-body" style={{ color: "var(--ielts-text-3)" }}>
            {displayFilter === FLASHCARD_REVIEW_QUEUE_FILTER_ID
              ? "待複習清單尚無項目。可在測驗、默寫或 AI 填空中按「再測試」加入。"
              : "尚無單詞。點「新增單詞」開始建立字卡。"}
          </p>
        </div>
      ) : (
        filtered.map((c) => (
          <div
            key={c.id}
            className="ielts-card-static ielts-enter"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              borderLeftWidth: 4,
              borderLeftStyle: "solid",
              borderLeftColor: flashcardListBorderColor(c.id, c.mastered, reviewQueueIdSet),
              paddingLeft: 16,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="ielts-text-heading" style={{ fontSize: 17 }}>
                  {c.word}
                </span>
                <button
                  type="button"
                  className="ielts-btn"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid var(--ielts-accent)",
                    color: "var(--ielts-accent)",
                    background: "var(--ielts-accent-light)",
                    padding: "4px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    flexShrink: 0,
                    lineHeight: 1.2,
                  }}
                  title="朗讀單字"
                  onClick={() => speakEnglish(c.word)}
                >
                  🔊 朗讀
                </button>
                {c.mastered && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ielts-success)" }}>✓ 已掌握</span>
                )}
              </div>
              <p className="ielts-text-body" style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ielts-text-2)" }}>
                {c.meaning}
              </p>
              {c.example ? (
                <p className="ielts-text-caption" style={{ marginTop: 8, fontStyle: "italic" }}>
                  {c.example}
                </p>
              ) : null}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
              {displayFilter === FLASHCARD_REVIEW_QUEUE_FILTER_ID ? (
                <button
                  type="button"
                  className="ielts-btn"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    border: "1px solid var(--ielts-border-medium)",
                    color: "var(--ielts-text-2)",
                    background: "var(--ielts-bg-hover)",
                    padding: "6px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                  onClick={() => store.removeFlashcardFromReviewQueue(c.id)}
                >
                  移出清單
                </button>
              ) : null}
              <button
                type="button"
                className="ielts-btn"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  border: "1px solid var(--ielts-accent)",
                  color: "var(--ielts-accent)",
                  background: "transparent",
                  padding: "6px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
                onClick={() => openEdit(c)}
              >
                設定
              </button>
              <button
                type="button"
                className="ielts-btn"
                style={{ fontSize: 12, fontWeight: 600, border: "none", background: "var(--ielts-bg-hover)", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}
                onClick={() => store.toggleFlashcardMastered(c.id)}
              >
                {c.mastered ? "取消掌握" : "已掌握"}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function recordTypeLabel(t: SpeakingWritingType): string {
  if (t === "writing_part1") return "Writing Part 1";
  if (t === "writing_part2" || t === "writing") return "Writing Part 2";
  return "Speaking";
}

function bandMeta(band: number): { label: string; bg: string; fg: string; border: string; weight: number } {
  const b0 = Math.max(1, Math.min(9, Math.round(band * 2) / 2));
  const label = Number.isInteger(b0) ? `${b0}` : b0.toFixed(1);

  // Color rules:
  // 1.0–5.5 => red
  // 6.0     => yellow
  // >= 6.5  => green
  if (b0 <= 5.5) return { label, bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca", weight: 900 };
  if (b0 === 6) return { label, bg: "#fffbeb", fg: "#b45309", border: "#fde68a", weight: 900 };
  return { label, bg: "#ecfdf5", fg: "#047857", border: "#a7f3d0", weight: 950 };
}

function recordQuestions(t: SpeakingWritingType): string[] {
  if (t === "writing_part1") {
    return [
      "圖表／圖片整體趨勢或主要特徵是什麼？試用一句話概述。",
      "你要分幾段寫？每段想寫哪幾個重點或數據？",
      "有沒有需要對比、排序或極值的項目？",
      "開頭概述與結尾，你打算怎麼寫才清楚又不重複？",
    ];
  }
  if (t === "writing_part2" || t === "writing") {
    return [
      "你的立場/主論點是什麼？一句話說清楚。",
      "你會用哪兩個主要理由支撐？各自的例子是什麼？",
      "有沒有可能的反方觀點？你如何回應？",
      "最後一段的結論句你想怎麼收束？",
    ];
  }
  return [
    "你想先用哪一句開場？（重述題目＋立場）",
    "你會用哪一個生活例子？為什麼能說服人？",
    "如果被追問『為什麼』，你的下一句會怎麼說？",
    "你想用什麼一句話結尾？",
  ];
}

// Highlight / preview moved to standalone detail page (/ielts/records/[id])

function RecordsPanel({
  store,
  themeDark,
  accentPink,
  setNavHidden,
}: {
  store: ReturnType<typeof useIELTSStore>;
  themeDark: boolean;
  accentPink: boolean;
  setNavHidden: (v: boolean) => void;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | SpeakingWritingType>(() => {
    if (typeof window === "undefined") return "all";
    try {
      const raw = sessionStorage.getItem("ielts_records_filter_v1");
      if (raw === "all" || raw === "writing_part1" || raw === "writing_part2" || raw === "speaking") return raw;
    } catch {
      /* */
    }
    return "all";
  });
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  // 列表頁已改成獨立路由 /ielts/records/[id]，此 state 僅保留相容（不再用於顯示詳情）
  const [activeId, setActiveId] = useState<string | null>(null);

  const [rtype, setRtype] = useState<SpeakingWritingType>("writing_part2");
  const [prompt, setPrompt] = useState("");
  const [notes, setNotes] = useState("");

  const [recordSettingsId, setRecordSettingsId] = useState<string | null>(null);
  const [editRecordType, setEditRecordType] = useState<SpeakingWritingType>("writing_part2");
  const [editRecordPrompt, setEditRecordPrompt] = useState("");
  const [editRecordNotes, setEditRecordNotes] = useState("");
  const [editRecordBand, setEditRecordBand] = useState("");

  const openRecordSettings = (r: SpeakingWritingEntry) => {
    setEditRecordType(r.type);
    setEditRecordPrompt(r.prompt);
    setEditRecordNotes(r.notes ?? "");
    setEditRecordBand(typeof r.band === "number" ? String(r.band) : "");
    setRecordSettingsId(r.id);
  };

  const closeRecordSettings = () => setRecordSettingsId(null);

  const saveRecordSettings = () => {
    if (!recordSettingsId) return;
    const cur = store.swRecords.find((x) => x.id === recordSettingsId);
    if (!cur) return;
    if (!editRecordPrompt.trim()) {
      window.alert("請填寫題目。");
      return;
    }
    store.updateSwRecord(recordSettingsId, {
      type: editRecordType,
      prompt: editRecordPrompt.trim(),
      myAnswer: cur.myAnswer,
      improvedAnswer: cur.improvedAnswer,
      commonMistakes: cur.commonMistakes ?? "",
      band:
        editRecordBand.trim() === ""
          ? (cur.band ?? undefined)
          : (() => {
              const n = Number(editRecordBand);
              return Number.isFinite(n) ? Math.max(1, Math.min(9, Math.round(n * 2) / 2)) : (cur.band ?? undefined);
            })(),
      notes: editRecordNotes.trim() || undefined,
    });
    closeRecordSettings();
  };

  // Keep for backward compatibility; detail UI is now a standalone route
  const active = useMemo(() => (activeId ? store.swRecords.find((r) => r.id === activeId) ?? null : null), [activeId, store.swRecords]);

  const filtered = useMemo(() => {
    const base =
      filter === "all"
        ? store.swRecords
        : filter === "writing_part2"
          ? store.swRecords.filter((r) => r.type === "writing_part2" || r.type === "writing")
          : store.swRecords.filter((r) => r.type === filter);
    const needle = q.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((r) =>
      `${r.prompt}\n${r.myAnswer}\n${r.improvedAnswer}\n${r.commonMistakes ?? ""}\n${r.notes ?? ""}`.toLowerCase().includes(needle),
    );
  }, [filter, q, store.swRecords]);

  useEffect(() => {
    try {
      sessionStorage.setItem("ielts_records_filter_v1", filter);
    } catch {
      /* */
    }
  }, [filter]);

  const openAdd = () => {
    if (filter === "writing_part1" || filter === "writing_part2" || filter === "speaking") {
      setRtype(filter);
    }
    setAddOpen(true);
  };
  const saveAdd = () => {
    if (!prompt.trim()) {
      window.alert("請先填寫題目。");
      return;
    }
    const id = store.addSwRecord({ type: rtype, prompt: prompt.trim(), notes: notes.trim() || undefined });
    setPrompt("");
    setNotes("");
    setRtype("writing_part2");
    setAddOpen(false);
    if (id) {
      setActiveId(id);
      try { sessionStorage.setItem("ielts_last_tab_v1", "records"); } catch {}
      // Best-effort: push records immediately so reload on another device won't lose it.
      if (!DEVICE_LOCAL_ONLY) {
        void (async () => {
          try {
            const sb = getSupabase();
            if (!sb) return;
            const { data: { session } } = await sb.auth.getSession();
            if (!session?.user) return;
            await pushKeysToUserState(session.user.id, IELTS_SYNC_KEYS);
          } catch {
            /* offline / payload too large: periodic push will retry */
          }
        })();
      }
      router.push(`/ielts/records/${id}`);
    }
  };

  // 列表頁不需要隱藏 nav；獨立詳情頁會自然不顯示此 nav
  useEffect(() => {
    setNavHidden(false);
  }, [setNavHidden]);

  useEffect(() => {
    if (!recordSettingsId) return;
    if (!store.swRecords.some((x) => x.id === recordSettingsId)) setRecordSettingsId(null);
  }, [recordSettingsId, store.swRecords]);

  // 詳情頁邏輯移到 /ielts/records/[id]


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: "總記錄", v: store.swRecords.length, c: "var(--ielts-accent)" },
          {
            label: "Writing P1",
            v: store.swRecords.filter((r) => r.type === "writing_part1").length,
            c: "var(--ielts-writing)",
          },
          {
            label: "Writing P2",
            v: store.swRecords.filter((r) => r.type === "writing_part2" || r.type === "writing").length,
            c: "var(--ielts-writing)",
          },
          { label: "Speaking", v: store.swRecords.filter((r) => r.type === "speaking").length, c: "var(--ielts-speaking)" },
        ].map((x, i) => (
          <div key={x.label} className="ielts-card-static ielts-enter" style={{ padding: 14, textAlign: "center", animationDelay: `${i * 0.06}s` }}>
            <div className="ielts-text-display" style={{ color: x.c, fontSize: 28 }}>
              {x.v}
            </div>
            <div className="ielts-text-caption" style={{ marginTop: 6 }}>
              {x.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="ielts-btn ielts-enter" style={{ ...outlineBtn(), flex: 1 }} onClick={openAdd}>
          ＋ 新增記錄
        </button>
      </div>

      <div className="ielts-card-static" style={{ padding: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", width: "100%" }}>
            <button
              type="button"
              className="ielts-btn"
              onClick={() => setFilter("all")}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: filter === "all" ? "var(--ielts-accent)" : "var(--ielts-bg-hover)",
                color: filter === "all" ? "#fff" : "var(--ielts-text-3)",
                transition: "all 0.2s ease",
                flexShrink: 0,
              }}
            >
              全部
            </button>
            <div style={{ flex: "1 1 80px", minWidth: 0 }} />
            <input
              className="ielts-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋題目／回答…"
              style={{ width: "min(240px, 100%)", flex: "1 1 160px", minWidth: 0, boxSizing: "border-box" }}
            />
          </div>
          <div
            role="toolbar"
            aria-label="寫作與口說類型"
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "nowrap",
              gap: 8,
              alignItems: "center",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              paddingBottom: 2,
              marginLeft: -2,
              marginRight: -2,
              paddingLeft: 2,
              paddingRight: 2,
            }}
          >
            {(
              [
                { id: "writing_part1" as const, label: "Writing Part 1" },
                { id: "writing_part2" as const, label: "Writing Part 2" },
                { id: "speaking" as const, label: "Speaking" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                className="ielts-btn"
                onClick={() => setFilter(p.id)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: filter === p.id ? "var(--ielts-accent)" : "var(--ielts-bg-hover)",
                  color: filter === p.id ? "#fff" : "var(--ielts-text-3)",
                  transition: "all 0.2s ease",
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="ielts-card-static" style={{ padding: 32, textAlign: "center" }}>
          <p className="ielts-text-body" style={{ color: "var(--ielts-text-3)" }}>
            尚無記錄。點「新增記錄」先輸入題目，之後點題目進去寫答案。
          </p>
        </div>
      ) : (
        filtered.map((r) => (
          <div
            key={r.id}
            className="ielts-card-static ielts-enter"
            role="button"
            tabIndex={0}
            onClick={() => {
              try { sessionStorage.setItem("ielts_last_tab_v1", "records"); } catch {}
              router.push(`/ielts/records/${r.id}`);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                try { sessionStorage.setItem("ielts_last_tab_v1", "records"); } catch {}
                router.push(`/ielts/records/${r.id}`);
              }
            }}
            style={{
              padding: 16,
              borderLeft: `4px solid ${isSwRecordWriting(r.type) ? "var(--ielts-writing)" : "var(--ielts-speaking)"}`,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="ielts-text-caption" style={{ fontWeight: 900, color: isSwRecordWriting(r.type) ? "var(--ielts-writing)" : "var(--ielts-speaking)" }}>
                    {recordTypeLabel(r.type)}
                  </span>
                  <span className="ielts-text-caption">· {r.updatedAt}</span>
                </div>
                <div className="ielts-text-heading" style={{ marginTop: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                  {r.prompt}
                </div>
                <div className="ielts-text-caption" style={{ marginTop: 8 }}>
                  點擊進入，寫「我的答案 / 進階版本」
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                {typeof r.band === "number" ? (
                  <span
                    className="ielts-text-caption"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 44,
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 999,
                      border: `1px solid ${bandMeta(r.band).border}`,
                      background: bandMeta(r.band).bg,
                      color: bandMeta(r.band).fg,
                      fontWeight: bandMeta(r.band).weight,
                      letterSpacing: 0.2,
                    }}
                    title="Banding"
                  >
                    {bandMeta(r.band).label}
                  </span>
                ) : (
                  <span
                    className="ielts-text-caption"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 44,
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 999,
                      border: "1px dashed var(--ielts-border-light)",
                      background: "transparent",
                      color: "var(--ielts-text-3)",
                      fontWeight: 700,
                    }}
                    title="尚未設定 Banding"
                  >
                    ——
                  </span>
                )}
                <button
                  type="button"
                  className="ielts-btn"
                  aria-label="記錄設定"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openRecordSettings(r);
                  }}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--ielts-border-light)",
                    background: "var(--ielts-bg-hover)",
                    color: "var(--ielts-text-2)",
                    cursor: "pointer",
                  }}
                >
                  設定
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {recordSettingsId && (
        <IeltsSheetPortal themeDark={themeDark} accentPink={accentPink}>
          <div className="ielts-sheet-backdrop" role="presentation" style={{ pointerEvents: "auto" }} onClick={closeRecordSettings} />
          <div
            className="ielts-sheet"
            style={{ pointerEvents: "auto", maxHeight: "85vh", overflowY: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
              記錄設定
            </div>
            <p className="ielts-text-caption" style={{ margin: "0 0 12px", lineHeight: 1.55, color: "var(--ielts-text-2)" }}>
              可修改題目（列表顯示標題）、類型與備註；答案請在詳情頁編輯。
            </p>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              類型
              <select
                className="ielts-input"
                value={editRecordType}
                onChange={(e) => setEditRecordType(e.target.value as SpeakingWritingType)}
              >
                <option value="writing_part1">Writing Part 1</option>
                <option value="writing_part2">Writing Part 2</option>
                <option value="writing">Writing（舊版，等同 Part 2）</option>
                <option value="speaking">Speaking</option>
              </select>
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              Banding（1–9，可 0.5）
              <input
                className="ielts-input"
                inputMode="decimal"
                value={editRecordBand}
                onChange={(e) => setEditRecordBand(e.target.value)}
                placeholder="例如：6.5"
              />
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              題目（重新命名／編輯）
              <textarea
                className="ielts-input"
                style={{ minHeight: 88 }}
                value={editRecordPrompt}
                onChange={(e) => setEditRecordPrompt(e.target.value)}
                placeholder="題目或主題文字…"
              />
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 14 }}>
              備註（選填）
              <textarea className="ielts-input" style={{ minHeight: 72 }} value={editRecordNotes} onChange={(e) => setEditRecordNotes(e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <button type="button" className="ielts-btn" style={{ ...outlineBtn(), flex: 1 }} onClick={closeRecordSettings}>
                取消
              </button>
              <button type="button" className="ielts-btn" style={{ ...solidBtn(), flex: 1 }} onClick={saveRecordSettings}>
                儲存
              </button>
            </div>
            <button
              type="button"
              className="ielts-btn"
              style={{
                width: "100%",
                border: "1px solid var(--ielts-danger)",
                color: "var(--ielts-danger)",
                background: "transparent",
                fontWeight: 800,
                padding: "10px 14px",
                borderRadius: 12,
                cursor: "pointer",
              }}
              onClick={() => {
                if (!recordSettingsId) return;
                if (window.confirm("確定刪除此記錄？此操作無法復原。")) {
                  store.removeSwRecord(recordSettingsId);
                  closeRecordSettings();
                }
              }}
            >
              刪除此記錄
            </button>
          </div>
        </IeltsSheetPortal>
      )}

      {addOpen && (
        <IeltsSheetPortal themeDark={themeDark} accentPink={accentPink}>
          <div className="ielts-sheet-backdrop" role="presentation" style={{ pointerEvents: "auto" }} onClick={() => setAddOpen(false)} />
          <div className="ielts-sheet" style={{ pointerEvents: "auto", maxHeight: "85vh", overflowY: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))" }}>
            <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
              新增記錄
            </div>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              類型
              <select className="ielts-input" value={rtype} onChange={(e) => setRtype(e.target.value as SpeakingWritingType)}>
                <option value="writing_part1">Writing Part 1</option>
                <option value="writing_part2">Writing Part 2</option>
                <option value="speaking">Speaking</option>
              </select>
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              題目
              <textarea className="ielts-input" style={{ minHeight: 72 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="貼上題目或問題…" />
            </label>
            <div className="ielts-card-static" style={{ padding: 14, background: "var(--ielts-bg-hover)" }}>
              <div className="ielts-text-caption" style={{ fontWeight: 800, marginBottom: 8 }}>
                引導問題（系統會問你）
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {recordQuestions(rtype).map((x) => (
                  <li key={x} className="ielts-text-caption" style={{ color: "var(--ielts-text-2)" }}>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginTop: 10, marginBottom: 14 }}>
              備註（選填）
              <textarea className="ielts-input" style={{ minHeight: 72 }} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="ielts-btn" style={{ ...outlineBtn(), flex: 1 }} onClick={() => setAddOpen(false)}>
                取消
              </button>
              <button type="button" className="ielts-btn" style={{ ...solidBtn(), flex: 1 }} onClick={saveAdd}>
                儲存
              </button>
            </div>
          </div>
        </IeltsSheetPortal>
      )}
    </div>
  );
}

function skillAverageAndCount(
  scores: { L?: number; R?: number; W?: number; S?: number }[],
  k: "L" | "R" | "W" | "S",
): { avg: number; count: number } | undefined {
  const nums = scores.map((r) => r[k]).filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (nums.length === 0) return undefined;
  const sum = nums.reduce((a, b) => a + b, 0);
  return { avg: Math.round((sum / nums.length) * 10) / 10, count: nums.length };
}

function ScoresTab({ store }: { store: ReturnType<typeof useIELTSStore> }) {
  const [date, setDate] = useState("");
  const [day, setDay] = useState(String(store.currentDay));
  const [L, setL] = useState("");
  const [R, setR] = useState("");
  const [W, setW] = useState("");
  const [S_, setS_] = useState("");
  const [wrongType, setWrongType] = useState<"L" | "R" | "W" | "S">("R");
  const [wrongDesc, setWrongDesc] = useState("");

  const add = () => {
    const toNum = (v: string) => (v.trim() === "" ? undefined : Number(v));
    store.addMockScore({
      date: date || new Date().toISOString().slice(0, 10),
      day: day.trim() ? Number(day) : undefined,
      L: toNum(L),
      R: toNum(R),
      W: toNum(W),
      S: toNum(S_),
    });
    setDate("");
    setL("");
    setR("");
    setW("");
    setS_("");
  };

  const skillMeta = [
    { k: "L" as const, label: "聽力", icon: "📘", color: "var(--ielts-listening)" },
    { k: "R" as const, label: "閱讀", icon: "📗", color: "var(--ielts-reading)" },
    { k: "W" as const, label: "寫作", icon: "📙", color: "var(--ielts-writing)" },
    { k: "S" as const, label: "口說", icon: "📕", color: "var(--ielts-speaking)" },
  ];

  const skillStats = useMemo(() => {
    return {
      L: skillAverageAndCount(store.scores, "L"),
      R: skillAverageAndCount(store.scores, "R"),
      W: skillAverageAndCount(store.scores, "W"),
      S: skillAverageAndCount(store.scores, "S"),
    };
  }, [store.scores]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {skillMeta.map((s) => {
          const stat = skillStats[s.k];
          const val = stat?.avg;
          const count = stat?.count ?? 0;
          const ok = val != null && val >= TARGET_BAND;
          return (
            <div
              key={s.k}
              className="ielts-card-static ielts-enter"
              style={{
                padding: 16,
                border: `2px solid ${ok ? "var(--ielts-success)" : "rgba(245, 158, 11, 0.6)"}`,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                {s.icon} {s.label}
              </div>
              <div className="ielts-text-caption">目標 {TARGET_BAND}</div>
              {count > 0 ? (
                <div className="ielts-text-caption" style={{ marginTop: 4, color: "var(--ielts-text-3)", fontSize: 11 }}>
                  歷史平均 · 共 {count} 筆有分
                </div>
              ) : (
                <div className="ielts-text-caption" style={{ marginTop: 4, color: "var(--ielts-text-3)", fontSize: 11 }}>
                  尚無該科分數
                </div>
              )}
              <div className="ielts-text-display" style={{ fontSize: 28, marginTop: 4, color: s.color }}>
                {val ?? "—"}
              </div>
              {val != null && (
                <div className="ielts-text-caption" style={{ marginTop: 6, color: ok ? "var(--ielts-success)" : "var(--ielts-warning)" }}>
                  {ok ? "✓ 已達標" : `還差 ${(TARGET_BAND - val).toFixed(1)}`}
                </div>
              )}
              {val != null && (
                <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: "var(--ielts-progress-track)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (val / 9) * 100)}%`, height: "100%", background: s.color, borderRadius: 999 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ielts-text-heading">新增模考紀錄</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input className="ielts-input" value={date} onChange={(e) => setDate(e.target.value)} placeholder="日期 YYYY-MM-DD" />
        <input className="ielts-input" value={day} onChange={(e) => setDay(e.target.value)} placeholder="計畫第幾天" />
        <input className="ielts-input" value={L} onChange={(e) => setL(e.target.value)} placeholder="聽力 L" />
        <input className="ielts-input" value={R} onChange={(e) => setR(e.target.value)} placeholder="閱讀 R" />
        <input className="ielts-input" value={W} onChange={(e) => setW(e.target.value)} placeholder="寫作 W" />
        <input className="ielts-input" value={S_} onChange={(e) => setS_(e.target.value)} placeholder="口說 S" />
      </div>
      <button type="button" className="ielts-btn" onClick={add} style={solidBtn()}>
        儲存紀錄
      </button>

      <div className="ielts-card-static" style={{ padding: 0, overflow: "hidden" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
            fontSize: 13,
          }}
        >
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "var(--ielts-accent-light)", color: "var(--ielts-accent)" }}>
              {(["日期", "L", "R", "W", "S", ""] as const).map((label, i) => (
                <th
                  key={i}
                  style={{
                    padding: "12px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    textAlign: i === 0 ? "left" : "center",
                    borderBottom: "1px solid var(--ielts-border-light)",
                    verticalAlign: "middle",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {store.scores.length === 0 ? (
              <tr>
                <td colSpan={6} className="ielts-text-body" style={{ padding: 24, color: "var(--ielts-text-3)", textAlign: "center" }}>
                  尚無紀錄
                </td>
              </tr>
            ) : (
              store.scores.map((row) => (
                <tr key={row.id} style={{ borderTop: "1px solid var(--ielts-border-light)" }}>
                  <td
                    style={{
                      padding: "10px 8px",
                      fontWeight: 600,
                      verticalAlign: "middle",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.date}
                  </td>
                  {[row.L, row.R, row.W, row.S].map((v, i) => (
                    <td key={i} style={{ padding: "8px 4px", textAlign: "center", verticalAlign: "middle" }}>
                      <span
                        style={{
                          display: "inline-block",
                          minWidth: 36,
                          padding: "4px 6px",
                          borderRadius: 6,
                          fontWeight: 600,
                          ...(v == null
                            ? { color: "var(--ielts-text-3)" }
                            : v < 5.5
                              ? { background: "#fef2f2", color: "var(--ielts-danger)" }
                              : v < 6.5
                                ? { background: "#fffbeb", color: "var(--ielts-warning)" }
                                : { background: "#f0fdf4", color: "var(--ielts-success)" }),
                        }}
                      >
                        {v ?? "—"}
                      </span>
                    </td>
                  ))}
                  <td style={{ padding: "8px 4px", textAlign: "center", verticalAlign: "middle" }}>
                    <button
                      type="button"
                      className="ielts-btn"
                      onClick={() => store.removeMockScore(row.id)}
                      style={{ fontSize: 12, color: "var(--ielts-danger)", border: "none", background: "none", cursor: "pointer", padding: "4px 8px" }}
                    >
                      刪
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 className="ielts-text-heading" style={{ margin: 0 }}>
          📋 錯題本
        </h3>
        {store.dueWrongItems.length > 0 && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 999,
              background: "#fff7ed",
              color: "#c2410c",
            }}
          >
            今日 {store.dueWrongItems.length} 題待複習
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {(["L", "R", "W", "S"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className="ielts-btn"
            onClick={() => setWrongType(k)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "none",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              background: wrongType === k ? skillMeta.find((s) => s.k === k)?.color : "var(--ielts-bg-hover)",
              color: wrongType === k ? "#fff" : "var(--ielts-text-2)",
            }}
          >
            {k === "L" ? "聽" : k === "R" ? "閱" : k === "W" ? "寫" : "說"}
          </button>
        ))}
        <input
          className="ielts-input"
          style={{ flex: 1, minWidth: 160 }}
          value={wrongDesc}
          onChange={(e) => setWrongDesc(e.target.value)}
          placeholder="簡短描述錯因…"
        />
      </div>
      <button
        type="button"
        className="ielts-btn"
        onClick={() => {
          const iso = new Date().toISOString().slice(0, 10);
          if (!wrongDesc.trim()) return;
          store.addWrongItem({
            type: wrongType,
            description: wrongDesc.trim(),
            createdDate: iso,
            nextReview: iso,
            mastered: false,
            reviewStage: 0,
          });
          setWrongDesc("");
        }}
        style={outlineBtn()}
      >
        加入複習清單
      </button>

      {store.wrongItems.length === 0 ? (
        <p className="ielts-text-caption">還沒有複習項目。</p>
      ) : (
        store.wrongItems.map((w) => {
          const due = !w.mastered && w.nextReview <= new Date().toISOString().slice(0, 10);
          const col = skillMeta.find((s) => s.k === w.type)?.color ?? "var(--ielts-text-3)";
          return (
            <div key={w.id} className="ielts-card-static" style={{ display: "flex", gap: 12, alignItems: "flex-start", borderLeft: `4px solid ${col}` }}>
              <div style={{ flex: 1 }}>
                <div className="ielts-text-body" style={{ fontWeight: 600 }}>
                  {skillZh(w.type)} · {w.mastered ? "已掌握" : due ? "建議今天複習" : "待安排"}
                </div>
                <div className="ielts-text-caption" style={{ marginTop: 4 }}>
                  下次複習：{w.nextReview}
                </div>
                <p className="ielts-text-body" style={{ marginTop: 8, fontSize: 14 }}>
                  {w.description}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button type="button" className="ielts-btn" style={outlineBtn()} onClick={() => store.bumpWrongNextReview(w.id, 1)}>
                  延後一天
                </button>
                <button type="button" className="ielts-btn" style={{ ...outlineBtn(), color: "var(--ielts-success)", borderColor: "var(--ielts-success)" }} onClick={() => store.toggleWrongMastered(w.id)}>
                  {w.mastered ? "取消已掌握" : "✓ 已複習"}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function skillZh(t: "L" | "R" | "W" | "S"): string {
  return { L: "聽力", R: "閱讀", W: "寫作", S: "口說" }[t];
}

function SettingsTab({
  store,
  themeDark,
  setThemeDark,
  accentPink,
  setAccentPink,
  clearSheetOpen,
  setClearSheetOpen,
}: {
  store: ReturnType<typeof useIELTSStore>;
  themeDark: boolean;
  setThemeDark: (v: boolean) => void;
  accentPink: boolean;
  setAccentPink: (v: boolean) => void;
  clearSheetOpen: boolean;
  setClearSheetOpen: (v: boolean) => void;
}) {
  const CLEAR_DATA_PHRASE = "確認清除全部";
  const [importText, setImportText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [googleKeyDraft, setGoogleKeyDraft] = useState("");
  const [dangerZoneOpen, setDangerZoneOpen] = useState(false);
  const [clearConfirmStep, setClearConfirmStep] = useState<1 | 2>(1);
  const [clearPhrase, setClearPhrase] = useState("");

  useEffect(() => {
    setGoogleKeyDraft(getStoredGoogleAIKey());
  }, []);

  const closeClearSheet = () => {
    setClearSheetOpen(false);
    setClearConfirmStep(1);
    setClearPhrase("");
  };

  const openClearSheet = () => {
    setClearConfirmStep(1);
    setClearPhrase("");
    setClearSheetOpen(true);
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(store.exportAll(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ielts-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = () => {
    try {
      const json = JSON.parse(importText) as { mergeFlashcards?: boolean };
      const res = store.importAll(json);
      if (res && typeof res === "object" && (res as { mode?: string }).mode === "flashcard_word_patch") {
        const r = res as { updated: number; missing: number };
        setMsg(`已更新 ${r.updated} 張字卡的 word（未找到 id：${r.missing}）。`);
        return;
      }
      if (res && typeof res === "object" && (res as { mode?: string }).mode === "flashcard_text_patch") {
        const r = res as { updated: number; missing: number };
        setMsg(`已更新 ${r.updated} 張字卡的文字（未找到 id：${r.missing}）。`);
        return;
      }
      setMsg(json && typeof json === "object" && json.mergeFlashcards === true ? "已合併字卡到現有清單（其他資料未變更）。" : "已匯入備份。");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "匯入失敗。");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="ielts-card-static ielts-enter" style={{ padding: 18 }}>
        <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
          外觀
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="ielts-text-body" style={{ fontSize: 15 }}>
            深色模式
          </span>
          <button type="button" className="ielts-toggle" data-on={themeDark ? "true" : "false"} onClick={() => setThemeDark(!themeDark)} aria-label="切換深色模式">
            <div className="ielts-toggle-knob" />
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--ielts-border-light)" }}>
          <div>
            <div className="ielts-text-body" style={{ fontSize: 15 }}>
              粉紅主題色
            </div>
            <p className="ielts-text-caption" style={{ margin: "6px 0 0", maxWidth: 260 }}>
              重點色、頂部漸層與 Tab 強調改為粉紅色調（與深色模式可同時使用）
            </p>
          </div>
          <button
            type="button"
            className="ielts-toggle"
            data-on={accentPink ? "true" : "false"}
            onClick={() => setAccentPink(!accentPink)}
            aria-label="切換粉紅主題色"
          >
            <div className="ielts-toggle-knob" />
          </button>
        </div>
      </div>

      <div className="ielts-card-static ielts-enter" style={{ padding: 18 }}>
        <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
          計畫與計時
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <label className="ielts-text-caption" style={{ display: "grid", gap: 6 }}>
            計畫開始日
            <input className="ielts-input" value={store.settings.startDate} onChange={(e) => store.setSettings((s) => ({ ...s, startDate: e.target.value }))} />
          </label>
          <label className="ielts-text-caption" style={{ display: "grid", gap: 6 }}>
            考試日期
            <input className="ielts-input" value={store.settings.examDate} onChange={(e) => store.setSettings((s) => ({ ...s, examDate: e.target.value }))} />
          </label>
          <label className="ielts-text-caption" style={{ display: "grid", gap: 6 }}>
            專注（分鐘）
            <input
              className="ielts-input"
              value={String(store.settings.pomodoroFocusMin)}
              onChange={(e) => store.setSettings((s) => ({ ...s, pomodoroFocusMin: Number(e.target.value) || 25 }))}
            />
          </label>
          <label className="ielts-text-caption" style={{ display: "grid", gap: 6 }}>
            休息（分鐘）
            <input
              className="ielts-input"
              value={String(store.settings.pomodoroBreakMin)}
              onChange={(e) => store.setSettings((s) => ({ ...s, pomodoroBreakMin: Number(e.target.value) || 5 }))}
            />
          </label>
        </div>
      </div>

      <div className="ielts-card-static ielts-enter" style={{ padding: 18 }}>
        <div className="ielts-text-heading" style={{ marginBottom: 10 }}>
          帳號同步
        </div>
        <p className="ielts-text-caption" style={{ margin: 0, lineHeight: 1.55, color: "var(--ielts-text-2)" }}>
          在首頁使用與主系統相同的 Supabase 登入時，備考資料會與雲端{" "}
          <code style={{ fontSize: 11 }}>user_state</code> 同步：進入本頁會先下載合併，之後約每 1 分鐘上傳變更（減輕資料庫負載）。主頁開啟時也會一併上傳。Google
          AI 金鑰僅存本機、不會上傳。
        </p>
        <p className="ielts-text-caption" style={{ margin: "10px 0 0", lineHeight: 1.5, color: "var(--ielts-text-3)", fontSize: 12 }}>
          附圖或大量字卡可能使資料過大導致同步失敗，可改用下方「匯出備份」手動轉移。
        </p>
      </div>

      <div className="ielts-card-static ielts-enter" style={{ padding: 18 }}>
        <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
          AI 句子填空
        </div>
        <p className="ielts-text-caption" style={{ margin: "0 0 12px", lineHeight: 1.55 }}>
          僅支援 <strong>Google AI Studio（Gemini）</strong>。在{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ielts-accent)" }}>
            Google AI Studio
          </a>{" "}
          建立 API 金鑰（以 <code style={{ fontSize: 12 }}>AIza</code> 開頭），貼上後點別處即存本機。部署到雲端時請在主機設定環境變數{" "}
          <code style={{ fontSize: 12 }}>GEMINI_API_KEY</code>。金鑰不會寫入備份 JSON。
        </p>
        <label className="ielts-text-caption" style={{ display: "grid", gap: 6 }}>
          Google AI Studio API 金鑰
          <input
            className="ielts-input"
            type="password"
            autoComplete="off"
            value={googleKeyDraft}
            onChange={(e) => setGoogleKeyDraft(e.target.value)}
            onBlur={() => {
              setStoredGoogleAIKey(googleKeyDraft);
              setGoogleKeyDraft(getStoredGoogleAIKey());
            }}
            placeholder="AIza…（貼上後點別處即儲存，會自動去掉空格與換行）"
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />
        </label>
      </div>

      <div className="ielts-card-static ielts-enter" style={{ padding: 18 }}>
        <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
          備份
        </div>
        <p className="ielts-text-caption" style={{ marginBottom: 12, lineHeight: 1.45 }}>
          與主頁「LOCAL BACKUP」相同理念：匯出為 JSON；匯入會與本機合併，字卡／口寫筆紀等以 id 去重，避免重複舊紀錄。
        </p>
        <button type="button" className="ielts-btn" onClick={download} style={{ ...solidBtn(), width: "100%" }}>
          匯出備份（JSON）
        </button>
        <textarea
          className="ielts-input"
          style={{ marginTop: 12, minHeight: 100, fontFamily: "monospace", fontSize: 12 }}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="貼上備份 JSON…（或貼上 flashcard_word_patch / flashcard_text_patch 只更新字卡文字；若備份 JSON 含 mergeFlashcards: true 與 flashcards，只會把字卡接到現有清單前，其餘不變）"
        />
        <button type="button" className="ielts-btn" style={{ ...outlineBtn(), width: "100%", marginTop: 10 }} onClick={doImport}>
          匯入
        </button>
        {msg && (
          <p className="ielts-text-caption" style={{ marginTop: 10 }}>
            {msg}
          </p>
        )}
      </div>

      <div className="ielts-card-static ielts-enter" style={{ padding: 16 }}>
        {!dangerZoneOpen ? (
          <button
            type="button"
            onClick={() => setDangerZoneOpen(true)}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              color: "var(--ielts-text-3)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
              padding: "6px 2px",
            }}
          >
            顯示危險區域…
          </button>
        ) : (
          <div>
            <p className="ielts-text-caption" style={{ margin: "0 0 12px", lineHeight: 1.5 }}>
              以下為不可逆操作。建議先使用上方「匯出備份」。
            </p>
            <button
              type="button"
              className="ielts-btn"
              onClick={openClearSheet}
              style={{ border: "none", background: "none", color: "var(--ielts-danger)", fontWeight: 700, cursor: "pointer", fontSize: 15, padding: "4px 0" }}
            >
              清除所有數據…
            </button>
            <button
              type="button"
              onClick={() => setDangerZoneOpen(false)}
              style={{
                display: "block",
                marginTop: 10,
                border: "none",
                background: "transparent",
                color: "var(--ielts-text-3)",
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
              }}
            >
              收起
            </button>
          </div>
        )}
      </div>

      {clearSheetOpen && (
        <IeltsSheetPortal themeDark={themeDark} accentPink={accentPink}>
          <div className="ielts-sheet-backdrop" role="presentation" style={{ pointerEvents: "auto" }} onClick={closeClearSheet} />
          <div
            className="ielts-sheet"
            style={{ pointerEvents: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))" }}
          >
            {clearConfirmStep === 1 ? (
              <>
                <div className="ielts-text-heading" style={{ marginBottom: 10 }}>
                  清除資料（第一次確認）
                </div>
                <p className="ielts-text-body" style={{ color: "var(--ielts-text-2)", fontSize: 14, lineHeight: 1.55 }}>
                  即將進入最後一步。清除後會刪除本機所有 IELTS 備考資料（計畫、任務自訂、字卡、成績、錯題、備註、口說／寫作記錄等），無法還原。
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button type="button" className="ielts-btn" style={{ ...outlineBtn(), flex: 1 }} onClick={closeClearSheet}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="ielts-btn"
                    style={{ ...solidBtn(), flex: 1, background: "var(--ielts-danger)" }}
                    onClick={() => setClearConfirmStep(2)}
                  >
                    我了解，繼續
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="ielts-text-heading" style={{ marginBottom: 10 }}>
                  清除資料（第二次確認）
                </div>
                <p className="ielts-text-body" style={{ color: "var(--ielts-text-2)", fontSize: 14, lineHeight: 1.55, marginBottom: 12 }}>
                  請在下方輸入「<strong style={{ color: "var(--ielts-text-1)" }}>{CLEAR_DATA_PHRASE}</strong>」後再按確定清除。
                </p>
                <input
                  className="ielts-input"
                  value={clearPhrase}
                  onChange={(e) => setClearPhrase(e.target.value)}
                  placeholder={CLEAR_DATA_PHRASE}
                  autoComplete="off"
                  style={{ width: "100%" }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button type="button" className="ielts-btn" style={{ ...outlineBtn(), flex: 1 }} onClick={closeClearSheet}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="ielts-btn"
                    disabled={clearPhrase.trim() !== CLEAR_DATA_PHRASE}
                    style={{
                      ...solidBtn(),
                      flex: 1,
                      background: clearPhrase.trim() === CLEAR_DATA_PHRASE ? "var(--ielts-danger)" : "var(--ielts-border-medium)",
                      opacity: clearPhrase.trim() === CLEAR_DATA_PHRASE ? 1 : 0.7,
                      cursor: clearPhrase.trim() === CLEAR_DATA_PHRASE ? "pointer" : "not-allowed",
                    }}
                    onClick={() => {
                      if (clearPhrase.trim() !== CLEAR_DATA_PHRASE) return;
                      store.clearAllLocalData();
                      closeClearSheet();
                      setDangerZoneOpen(false);
                    }}
                  >
                    確定清除
                  </button>
                </div>
              </>
            )}
          </div>
        </IeltsSheetPortal>
      )}
    </div>
  );
}

function pomoPrimaryBtn(): CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    background: "var(--ielts-accent)",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s ease",
  };
}
function pomoSecBtn(): CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid var(--ielts-border-medium)",
    background: "var(--ielts-bg-surface)",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s ease",
  };
}
function pomoGhostBtn(): CSSProperties {
  return { ...pomoSecBtn(), color: "var(--ielts-text-3)" };
}
function solidBtn(): CSSProperties {
  return {
    padding: "12px 18px",
    borderRadius: 12,
    border: "none",
    background: "var(--ielts-accent)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    transition: "all 0.2s ease",
  };
}
function outlineBtn(): CSSProperties {
  return {
    padding: "12px 18px",
    borderRadius: 12,
    border: "2px solid var(--ielts-accent)",
    background: "transparent",
    color: "var(--ielts-accent)",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    transition: "all 0.2s ease",
  };
}
