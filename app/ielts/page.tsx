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
import { ScoreTrendChart } from "./score-trend-chart";
import { useIELTSStore, type DayTask, type Flashcard, type FlashcardCategory, type IELTSSection, type SpeakingWritingEntry, type SpeakingWritingType } from "./store";

const SL_HOME_FROM_IELTS = "sl_home_from_ielts_v1";

/**
 * 掛到 body：避免放在帶 transform 的 .ielts-page-panel 內時，fixed 底欄變成相對面板定位而表單被裁切／看不到。
 */
function IeltsSheetPortal({ themeDark, children }: { themeDark: boolean; children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="ielts-root"
      data-theme={themeDark ? "dark" : undefined}
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
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ielts-border-light)" strokeWidth={stroke} />
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
  const [expandedTips, setExpandedTips] = useState<Record<string, boolean>>({});
  const [expandedHeatDay, setExpandedHeatDay] = useState<number | null>(null);
  const [checkPopId, setCheckPopId] = useState<string | null>(null);
  const [clearSheetOpen, setClearSheetOpen] = useState(false);
  const [panelTick, setPanelTick] = useState(0);
  const prevTabRef = useRef<IELTSSection | null>(null);

  const store = useIELTSStore();

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

  const latest = store.scores[0];

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
    <div className="ielts-root" data-theme={themeDark ? "dark" : undefined}>
      <main
        style={{
          minHeight: "100dvh",
          maxWidth: 430,
          margin: "0 auto",
          padding: "16px 14px calc(108px + env(safe-area-inset-bottom, 0px))",
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
              <CardsPanel store={store} themeDark={themeDark} />
            ) : tab === "records" ? (
              <RecordsPanel store={store} themeDark={themeDark} />
            ) : tab === "scores" ? (
              <ScoresTab store={store} latest={latest} />
            ) : (
              <SettingsTab
                store={store}
                themeDark={themeDark}
                setThemeDark={setThemeDark}
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
        style={{ padding: 18, transition: "all 0.2s ease" }}
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
              background: "var(--ielts-border-light)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${completionRate}%`,
                borderRadius: 999,
                background: "var(--ielts-accent)",
                transition: "width 0.35s ease",
              }}
            />
          </div>
          <span className="ielts-text-caption" style={{ flexShrink: 0 }}>
            {doneCount} / {plan.tasks.length} 已完成
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                ...(done
                  ? {
                      background: "#f0fdf4",
                      borderColor: "var(--ielts-border-light)",
                    }
                  : {}),
              }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleTip(key)}
                onKeyDown={(e) => e.key === "Enter" && toggleTip(key)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "16px 16px 12px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1.2 }}>{t.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <span className="ielts-text-heading" style={{ ...(done ? { textDecoration: "line-through", color: "var(--ielts-text-3)" } : {}) }}>
                      {t.label}
                    </span>
                    <span className="ielts-text-caption" style={{ flexShrink: 0 }}>{t.time}</span>
                  </div>
                  <p className="ielts-text-body" style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ielts-text-2)", ...(done ? { textDecoration: "line-through" } : {}) }}>
                    {t.task}
                  </p>
                </div>
                <button
                  type="button"
                  className={checkPopId === key ? "ielts-check-pop" : ""}
                  aria-label={done ? "取消完成" : "標為完成"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTaskCheck(store.currentDay, t.id, key);
                  }}
                  style={{
                    width: 26,
                    height: 26,
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

      <ScoreTrendChart data={chartRows} listening="#3b82f6" reading="#10b981" writing="#f59e0b" speaking="#8b5cf6" />

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
                  border: active ? "2px solid var(--ielts-warning)" : "1px solid var(--ielts-border-light)",
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
        {expandedHeatDay != null && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 12,
              background: "var(--ielts-bg-hover)",
              border: "1px solid var(--ielts-border-light)",
            }}
          >
            <div className="ielts-text-heading" style={{ fontSize: 15, marginBottom: 8 }}>
              第 {expandedHeatDay} 天
            </div>
            <p className="ielts-text-caption" style={{ marginBottom: 10 }}>
              {store.getDayPlan(expandedHeatDay).theme}
            </p>
            {store.getDayPlan(expandedHeatDay).tasks.map((t) => {
              const ok = !!store.completion[`${expandedHeatDay}_${t.id}`];
              return (
                <div key={t.id} className="ielts-text-body" style={{ fontSize: 13, padding: "4px 0", color: ok ? "var(--ielts-success)" : "var(--ielts-text-2)" }}>
                  {ok ? "✓ " : "○ "}
                  {t.label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const CAT_COLORS: Record<FlashcardCategory, string> = {
  vocab: "var(--ielts-accent)",
  writing: "var(--ielts-writing)",
  speaking: "var(--ielts-speaking)",
  grammar: "var(--ielts-reading)",
};

function CardsPanel({ store, themeDark }: { store: ReturnType<typeof useIELTSStore>; themeDark: boolean }) {
  const [filter, setFilter] = useState<"all" | FlashcardCategory>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
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

  const editingCard = useMemo(
    () => (editId ? store.flashcards.find((c) => c.id === editId) ?? null : null),
    [editId, store.flashcards],
  );

  useEffect(() => {
    if (!editingCard) return;
    setEword(editingCard.word);
    setEmeaning(editingCard.meaning);
    setEexample(editingCard.example ?? "");
    setEcat(editingCard.category);
    setEmastered(editingCard.mastered);
  }, [editingCard]);

  useEffect(() => {
    if (editId && !store.flashcards.some((c) => c.id === editId)) setEditId(null);
  }, [editId, store.flashcards]);

  const filtered = useMemo(() => {
    if (filter === "all") return store.flashcards;
    return store.flashcards.filter((c) => c.category === filter);
  }, [store.flashcards, filter]);

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

  const saveNew = () => {
    if (!word.trim() || !meaning.trim()) {
      window.alert("請填寫單字與解釋。");
      return;
    }
    store.addFlashcard({
      word: word.trim(),
      meaning: meaning.trim(),
      example: example.trim() || undefined,
      category: newCat,
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
    if (!eword.trim() || !emeaning.trim()) {
      window.alert("請填寫單字與解釋。");
      return;
    }
    store.updateFlashcard(editingCard.id, {
      word: eword.trim(),
      meaning: emeaning.trim(),
      example: eexample.trim() || undefined,
      category: ecat,
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
        onKnow={(id) => store.setFlashcardMastered(id, true)}
        onDontKnow={(id) => store.setFlashcardMastered(id, false)}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "總詞彙", v: total, c: "var(--ielts-accent)" },
          { label: "已掌握", v: masteredN, c: "var(--ielts-success)" },
          { label: "待複習", v: dueN, c: "var(--ielts-warning)" },
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
        <button
          type="button"
          className="ielts-btn ielts-enter"
          style={{ ...outlineBtn(), flex: 1 }}
          onClick={() => {
            setEditId(null);
            setAddOpen(true);
          }}
        >
          ＋ 新增單詞
        </button>
        <button type="button" className="ielts-btn ielts-enter" style={{ ...solidBtn(), flex: 1 }} onClick={startQuiz}>
          ▶ 開始測驗
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {(
          [
            { id: "all" as const, label: "全部" },
            { id: "vocab" as const, label: "詞彙" },
            { id: "writing" as const, label: "寫作" },
            { id: "speaking" as const, label: "口說" },
            { id: "grammar" as const, label: "語法" },
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
              background: filter === p.id ? "var(--ielts-accent)" : "var(--ielts-bg-hover)",
              color: filter === p.id ? "#fff" : "var(--ielts-text-3)",
              transition: "all 0.2s ease",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {addOpen && (
        <IeltsSheetPortal themeDark={themeDark}>
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
              <select className="ielts-input" value={newCat} onChange={(e) => setNewCat(e.target.value as FlashcardCategory)}>
                <option value="vocab">詞彙</option>
                <option value="writing">寫作</option>
                <option value="speaking">口說</option>
                <option value="grammar">語法</option>
              </select>
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              單字 / 片語
              <input className="ielts-input" value={word} onChange={(e) => setWord(e.target.value)} placeholder="例如：elaborate" />
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
        <IeltsSheetPortal themeDark={themeDark}>
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
              <select className="ielts-input" value={ecat} onChange={(e) => setEcat(e.target.value as FlashcardCategory)}>
                <option value="vocab">詞彙</option>
                <option value="writing">寫作</option>
                <option value="speaking">口說</option>
                <option value="grammar">語法</option>
              </select>
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              單字 / 片語
              <input className="ielts-input" value={eword} onChange={(e) => setEword(e.target.value)} placeholder="例如：elaborate" />
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
            <div style={{ display: "flex", gap: 10 }}>
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
            尚無單詞。點「新增單詞」開始建立字卡。
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
              borderLeft: `4px solid ${CAT_COLORS[c.category]}`,
              paddingLeft: 16,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="ielts-text-heading" style={{ fontSize: 17 }}>
                  {c.word}
                </span>
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
              <button
                type="button"
                className="ielts-btn"
                style={{ fontSize: 12, color: "var(--ielts-danger)", border: "none", background: "none", cursor: "pointer", fontWeight: 600 }}
                onClick={() => {
                  if (window.confirm("確定刪除此單詞？")) store.removeFlashcard(c.id);
                }}
              >
                刪除
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function recordTypeLabel(t: SpeakingWritingType): string {
  return t === "writing" ? "Writing" : "Speaking";
}

function recordQuestions(t: SpeakingWritingType): string[] {
  if (t === "writing") {
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

function RecordsPanel({ store, themeDark }: { store: ReturnType<typeof useIELTSStore>; themeDark: boolean }) {
  const [filter, setFilter] = useState<"all" | SpeakingWritingType>("all");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [rtype, setRtype] = useState<SpeakingWritingType>("writing");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [notes, setNotes] = useState("");

  const [etype, setEtype] = useState<SpeakingWritingType>("writing");
  const [eprompt, setEprompt] = useState("");
  const [eresponse, setEresponse] = useState("");
  const [enotes, setEnotes] = useState("");

  const editing = useMemo(() => (editId ? store.swRecords.find((r) => r.id === editId) ?? null : null), [editId, store.swRecords]);
  useEffect(() => {
    if (!editing) return;
    setEtype(editing.type);
    setEprompt(editing.prompt);
    setEresponse(editing.response);
    setEnotes(editing.notes ?? "");
  }, [editing]);
  useEffect(() => {
    if (editId && !store.swRecords.some((r) => r.id === editId)) setEditId(null);
  }, [editId, store.swRecords]);

  const filtered = useMemo(() => {
    const base = filter === "all" ? store.swRecords : store.swRecords.filter((r) => r.type === filter);
    const needle = q.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((r) => `${r.prompt}\n${r.response}\n${r.notes ?? ""}`.toLowerCase().includes(needle));
  }, [filter, q, store.swRecords]);

  const openAdd = () => {
    setEditId(null);
    setAddOpen(true);
  };
  const saveAdd = () => {
    if (!prompt.trim() || !response.trim()) {
      window.alert("請填寫題目與你的回答。");
      return;
    }
    store.addSwRecord({ type: rtype, prompt: prompt.trim(), response: response.trim(), notes: notes.trim() || undefined });
    setPrompt("");
    setResponse("");
    setNotes("");
    setRtype("writing");
    setAddOpen(false);
  };
  const saveEdit = () => {
    if (!editing) return;
    if (!eprompt.trim() || !eresponse.trim()) {
      window.alert("請填寫題目與你的回答。");
      return;
    }
    store.updateSwRecord(editing.id, { type: etype, prompt: eprompt.trim(), response: eresponse.trim(), notes: enotes.trim() || undefined });
    setEditId(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "總記錄", v: store.swRecords.length, c: "var(--ielts-accent)" },
          { label: "Writing", v: store.swRecords.filter((r) => r.type === "writing").length, c: "var(--ielts-writing)" },
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
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {(
            [
              { id: "all" as const, label: "全部" },
              { id: "writing" as const, label: "Writing" },
              { id: "speaking" as const, label: "Speaking" },
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
                background: filter === p.id ? "var(--ielts-accent)" : "var(--ielts-bg-hover)",
                color: filter === p.id ? "#fff" : "var(--ielts-text-3)",
                transition: "all 0.2s ease",
              }}
            >
              {p.label}
            </button>
          ))}
          <div style={{ flex: 1, minWidth: 160 }} />
          <input
            className="ielts-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋題目／回答…"
            style={{ width: "min(240px, 100%)" }}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="ielts-card-static" style={{ padding: 32, textAlign: "center" }}>
          <p className="ielts-text-body" style={{ color: "var(--ielts-text-3)" }}>
            尚無記錄。點「新增記錄」把題目與你的回答存起來。
          </p>
        </div>
      ) : (
        filtered.map((r) => (
          <div key={r.id} className="ielts-card-static ielts-enter" style={{ padding: 16, borderLeft: `4px solid ${r.type === "writing" ? "var(--ielts-writing)" : "var(--ielts-speaking)"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="ielts-text-caption" style={{ fontWeight: 800, color: r.type === "writing" ? "var(--ielts-writing)" : "var(--ielts-speaking)" }}>
                    {recordTypeLabel(r.type)}
                  </span>
                  <span className="ielts-text-caption">· {r.updatedAt}</span>
                </div>
                <div
                  className="ielts-text-heading"
                  style={{ marginTop: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}
                >
                  {r.prompt}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  className="ielts-btn"
                  style={{ ...outlineBtn(), padding: "8px 12px", fontSize: 12, borderWidth: 2 }}
                  onClick={() => {
                    setAddOpen(false);
                    setEditId(r.id);
                  }}
                >
                  編輯
                </button>
                <button
                  type="button"
                  className="ielts-btn"
                  style={{ fontSize: 12, color: "var(--ielts-danger)", border: "none", background: "none", cursor: "pointer", fontWeight: 700 }}
                  onClick={() => {
                    if (window.confirm("確定刪除此記錄？")) store.removeSwRecord(r.id);
                  }}
                >
                  刪除
                </button>
              </div>
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div>
                <div className="ielts-text-caption" style={{ marginBottom: 6 }}>
                  你的回答
                </div>
                <div
                  className="ielts-text-body"
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", color: "var(--ielts-text-2)", fontSize: 14 }}
                >
                  {r.response}
                </div>
              </div>
              {r.notes ? (
                <div>
                  <div className="ielts-text-caption" style={{ marginBottom: 6 }}>
                    備註
                  </div>
                  <div
                    className="ielts-text-caption"
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", color: "var(--ielts-text-3)" }}
                  >
                    {r.notes}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ))
      )}

      {addOpen && (
        <IeltsSheetPortal themeDark={themeDark}>
          <div className="ielts-sheet-backdrop" role="presentation" style={{ pointerEvents: "auto" }} onClick={() => setAddOpen(false)} />
          <div className="ielts-sheet" style={{ pointerEvents: "auto", maxHeight: "85vh", overflowY: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))" }}>
            <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
              新增記錄
            </div>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              類型
              <select className="ielts-input" value={rtype} onChange={(e) => setRtype(e.target.value as SpeakingWritingType)}>
                <option value="writing">Writing</option>
                <option value="speaking">Speaking</option>
              </select>
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              題目
              <textarea className="ielts-input" style={{ minHeight: 72 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="貼上題目或問題…" />
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              你的回答
              <textarea className="ielts-input" style={{ minHeight: 140 }} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="寫下你的回答（可長文）…" />
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

      {editId && editing && (
        <IeltsSheetPortal themeDark={themeDark}>
          <div className="ielts-sheet-backdrop" role="presentation" style={{ pointerEvents: "auto" }} onClick={() => setEditId(null)} />
          <div className="ielts-sheet" style={{ pointerEvents: "auto", maxHeight: "85vh", overflowY: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))" }}>
            <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
              編輯記錄
            </div>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              類型
              <select className="ielts-input" value={etype} onChange={(e) => setEtype(e.target.value as SpeakingWritingType)}>
                <option value="writing">Writing</option>
                <option value="speaking">Speaking</option>
              </select>
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              題目
              <textarea className="ielts-input" style={{ minHeight: 72 }} value={eprompt} onChange={(e) => setEprompt(e.target.value)} />
            </label>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              你的回答
              <textarea className="ielts-input" style={{ minHeight: 140 }} value={eresponse} onChange={(e) => setEresponse(e.target.value)} />
            </label>
            <div className="ielts-card-static" style={{ padding: 14, background: "var(--ielts-bg-hover)" }}>
              <div className="ielts-text-caption" style={{ fontWeight: 800, marginBottom: 8 }}>
                引導問題（系統會問你）
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {recordQuestions(etype).map((x) => (
                  <li key={x} className="ielts-text-caption" style={{ color: "var(--ielts-text-2)" }}>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginTop: 10, marginBottom: 14 }}>
              備註（選填）
              <textarea className="ielts-input" style={{ minHeight: 72 }} value={enotes} onChange={(e) => setEnotes(e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 10 }}>
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
    </div>
  );
}

function ScoresTab({ store, latest }: { store: ReturnType<typeof useIELTSStore>; latest: (typeof store.scores)[0] | undefined }) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {skillMeta.map((s) => {
          const val = latest?.[s.k];
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
              <div className="ielts-text-display" style={{ fontSize: 28, marginTop: 4, color: s.color }}>
                {val ?? "—"}
              </div>
              {val != null && (
                <div className="ielts-text-caption" style={{ marginTop: 6, color: ok ? "var(--ielts-success)" : "var(--ielts-warning)" }}>
                  {ok ? "✓ 已達標" : `還差 ${(TARGET_BAND - val).toFixed(1)}`}
                </div>
              )}
              {val != null && (
                <div style={{ marginTop: 10, height: 6, borderRadius: 999, background: "var(--ielts-border-light)", overflow: "hidden" }}>
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
  clearSheetOpen,
  setClearSheetOpen,
}: {
  store: ReturnType<typeof useIELTSStore>;
  themeDark: boolean;
  setThemeDark: (v: boolean) => void;
  clearSheetOpen: boolean;
  setClearSheetOpen: (v: boolean) => void;
}) {
  const [importText, setImportText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

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
      const json = JSON.parse(importText);
      store.importAll(json);
      setMsg("已匯入備份。");
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
        <div className="ielts-text-heading" style={{ marginBottom: 14 }}>
          備份
        </div>
        <button type="button" className="ielts-btn" onClick={download} style={{ ...solidBtn(), width: "100%" }}>
          匯出備份（JSON）
        </button>
        <textarea
          className="ielts-input"
          style={{ marginTop: 12, minHeight: 100, fontFamily: "monospace", fontSize: 12 }}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="貼上備份 JSON…"
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

      <div className="ielts-card-static ielts-enter" style={{ padding: 18 }}>
        <button
          type="button"
          className="ielts-btn"
          onClick={() => setClearSheetOpen(true)}
          style={{ border: "none", background: "none", color: "var(--ielts-danger)", fontWeight: 700, cursor: "pointer", fontSize: 15 }}
        >
          清除所有數據…
        </button>
      </div>

      {clearSheetOpen && (
        <IeltsSheetPortal themeDark={themeDark}>
          <div
            className="ielts-sheet-backdrop"
            role="presentation"
            style={{ pointerEvents: "auto" }}
            onClick={() => setClearSheetOpen(false)}
          />
          <div
            className="ielts-sheet"
            style={{ pointerEvents: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="ielts-text-heading" style={{ marginBottom: 10 }}>
              清除所有數據？
            </div>
            <p className="ielts-text-body" style={{ color: "var(--ielts-text-2)", fontSize: 14 }}>
              將清除本機所有 IELTS 備考資料（計畫、字卡、成績、錯題、備註等），且無法還原。建議先匯出備份。
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button type="button" className="ielts-btn" style={{ ...outlineBtn(), flex: 1 }} onClick={() => setClearSheetOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="ielts-btn"
                style={{ ...solidBtn(), flex: 1, background: "var(--ielts-danger)" }}
                onClick={() => {
                  store.clearAllLocalData();
                  setClearSheetOpen(false);
                }}
              >
                確定清除
              </button>
            </div>
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
