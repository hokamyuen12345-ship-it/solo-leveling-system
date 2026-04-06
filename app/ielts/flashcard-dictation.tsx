"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { speakEnglish, stopSpeaking } from "./speech";
import { buildStudySessionOrder } from "./study-order";
import { flashcardCategoryLabel, type Flashcard, type FlashcardCategoryDef } from "./store";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normAnswer(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

const DICTATION_HARD_MODE_KEY = "ielts_dictation_hard_mode_v1";

function charMatches(wordChar: string, inputChar: string | undefined): boolean {
  if (inputChar === undefined) return false;
  if (wordChar === " ") return inputChar === " ";
  return wordChar.toLowerCase() === inputChar.toLowerCase();
}

/** 輸入前 len 個字元是否與字卡前 len 個字元一致（由左而右默書）。 */
function prefixFullyMatches(wordChars: string[], inputChars: string[], len: number): boolean {
  if (len > inputChars.length) return false;
  for (let k = 0; k < len; k++) {
    if (!charMatches(wordChars[k]!, inputChars[k])) return false;
  }
  return true;
}

type Props = {
  open: boolean;
  onClose: () => void;
  cards: Flashcard[];
  categoryDefs: FlashcardCategoryDef[];
  onKnow: (id: string) => void;
  onDontKnow: (id: string) => void;
  onReviewAgain?: (id: string) => void;
  themeDark?: boolean;
  accentPink?: boolean;
};

/** 默寫：只看字卡「解釋」，輸入對應英文；逐字母提示格會隨正確輸入變暗。 */
export function FlashcardDictation({
  open,
  onClose,
  cards,
  categoryDefs,
  onKnow,
  onDontKnow,
  onReviewAgain,
  themeDark,
  accentPink,
}: Props) {
  const [order, setOrder] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">("idle");
  const [reviewHint, setReviewHint] = useState(false);
  const [hardMode, setHardMode] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reviewHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || cards.length === 0) return;
    setOrder(buildStudySessionOrder(cards));
    setIdx(0);
    setInput("");
    setFeedback("idle");
    try {
      const v = localStorage.getItem(DICTATION_HARD_MODE_KEY);
      if (v === "1") setHardMode(true);
      else if (v === "0") setHardMode(false);
    } catch {
      /* */
    }
    // 僅開啟時排程，避免作答中父層 cards 參考變動而重開一輪
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      localStorage.setItem(DICTATION_HARD_MODE_KEY, hardMode ? "1" : "0");
    } catch {
      /* */
    }
  }, [hardMode, open]);

  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  useEffect(() => {
    return () => {
      if (reviewHintTimerRef.current !== null) window.clearTimeout(reviewHintTimerRef.current);
    };
  }, []);

  const current = order[idx] ?? null;

  useEffect(() => {
    if (!current) return;
    setInput("");
    setFeedback("idle");
    setReviewHint(false);
    if (reviewHintTimerRef.current !== null) {
      window.clearTimeout(reviewHintTimerRef.current);
      reviewHintTimerRef.current = null;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(t);
  }, [current?.id, idx]);

  const total = order.length;
  const progress = total ? (idx / total) * 100 : 0;

  const wordChars = useMemo(() => (current ? Array.from(current.word) : []), [current?.word]);
  const inputChars = useMemo(() => Array.from(input), [input]);
  const inputWidthCh = Math.max(10, Math.min(40, wordChars.length + 5));

  /** 字母格打亂顯示；每格仍對應字卡中的位置 origIndex，打對前綴時該格變暗。 */
  const shuffledLetterTiles = useMemo(() => {
    if (!current || wordChars.length === 0) return [];
    const base = wordChars.map((char, origIndex) => ({ origIndex, char }));
    return shuffle(base);
  }, [current?.id, current?.word]);

  const goNext = useCallback(
    (known: boolean) => {
      if (!current) return;
      if (known) onKnow(current.id);
      else onDontKnow(current.id);
      setFeedback("idle");
      setInput("");
      if (idx + 1 >= order.length) onClose();
      else setIdx((i) => i + 1);
    },
    [current, idx, onClose, onDontKnow, onKnow, order.length],
  );

  const goPrev = useCallback(() => {
    if (idx <= 0) return;
    setIdx((i) => i - 1);
  }, [idx]);

  const goSkipNext = useCallback(() => {
    if (!current || idx + 1 >= order.length) return;
    setFeedback("idle");
    setInput("");
    setIdx((i) => i + 1);
  }, [current, idx, order.length]);

  const triggerReviewAgain = useCallback(() => {
    if (!onReviewAgain || !current) return;
    onReviewAgain(current.id);
    if (reviewHintTimerRef.current !== null) window.clearTimeout(reviewHintTimerRef.current);
    setReviewHint(true);
    reviewHintTimerRef.current = window.setTimeout(() => {
      reviewHintTimerRef.current = null;
      setReviewHint(false);
    }, 1600);
  }, [current, onReviewAgain]);

  const submit = useCallback(() => {
    if (!current || feedback !== "idle") return;
    if (normAnswer(input) === normAnswer(current.word)) {
      setFeedback("correct");
      window.setTimeout(() => goNext(true), 450);
    } else {
      setFeedback("wrong");
    }
  }, [current, feedback, goNext, input]);

  const portalReady = typeof document !== "undefined";

  if (!open || !portalReady || !current) return null;

  const reviewAgainBtnStyle: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(202, 138, 4, 0.35)",
    background: "linear-gradient(180deg, #fefce8 0%, #fef9c3 100%)",
    color: "#713f12",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: "var(--ielts-shadow-sm)",
  };

  const body = (
    <div
      className="ielts-root"
      data-theme={themeDark ? "dark" : undefined}
      data-accent={accentPink ? "pink" : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        background: "var(--ielts-bg-base)",
        display: "flex",
        flexDirection: "column",
        padding: "12px 16px",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      }}
    >
      <div style={{ height: 4, borderRadius: 999, background: "var(--ielts-progress-track)", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", width: `${Math.min(100, progress)}%`, background: "var(--ielts-progress-fill)", transition: "width 0.25s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button
          type="button"
          className="ielts-btn"
          onClick={onClose}
          style={{ border: "none", background: "transparent", color: "var(--ielts-text-2)", fontWeight: 600, fontSize: 15, cursor: "pointer" }}
        >
          關閉
        </button>
        <span className="ielts-text-caption" style={{ fontWeight: 700 }}>
          默寫 {idx + 1} / {total}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <span className="ielts-text-caption" style={{ color: "var(--ielts-text-2)", fontWeight: 700 }}>
          困難模式（隱藏字母卡）
        </span>
        <button
          type="button"
          className="ielts-toggle"
          data-on={hardMode ? "true" : "false"}
          role="switch"
          aria-checked={hardMode}
          aria-label={hardMode ? "困難模式已開啟" : "困難模式已關閉"}
          onClick={() => setHardMode((v) => !v)}
        >
          <div className="ielts-toggle-knob" />
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className="ielts-btn"
          disabled={idx === 0}
          onClick={goPrev}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--ielts-border-light)",
            background: "var(--ielts-bg-hover)",
            color: "var(--ielts-text-2)",
            fontWeight: 800,
            fontSize: 14,
            cursor: idx === 0 ? "not-allowed" : "pointer",
            opacity: idx === 0 ? 0.45 : 1,
          }}
        >
          上一題
        </button>
        <button
          type="button"
          className="ielts-btn"
          disabled={idx >= total - 1}
          onClick={goSkipNext}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--ielts-border-light)",
            background: "var(--ielts-bg-hover)",
            color: "var(--ielts-text-2)",
            fontWeight: 800,
            fontSize: 14,
            cursor: idx >= total - 1 ? "not-allowed" : "pointer",
            opacity: idx >= total - 1 ? 0.45 : 1,
          }}
        >
          下一題（跳過）
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 16,
          maxWidth: 420,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <span
          style={{
            alignSelf: "flex-start",
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 999,
            background: "var(--ielts-accent-light)",
            color: "var(--ielts-accent)",
          }}
        >
          {flashcardCategoryLabel(current.category, categoryDefs)}
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", alignSelf: "stretch" }}>
          <div
            className="ielts-card-static"
            style={{
              padding: "20px 18px",
              border: "2px solid rgba(245, 158, 11, 0.45)",
              background: "rgba(245, 158, 11, 0.08)",
              borderRadius: 14,
              textAlign: "center",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div
              className="ielts-text-heading"
              style={{ fontSize: 20, lineHeight: 1.55, color: "var(--ielts-text-1)", fontWeight: 800, textAlign: "center" }}
            >
              {current.meaning}
            </div>
          </div>
        </div>

        {!hardMode && wordChars.length > 0 ? (
          <div
            role="group"
            aria-label="拼字提示：字母已打亂；依聽寫由左而右輸入，對應位置打對時該格變暗"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              justifyContent: "center",
              width: "100%",
              marginTop: 10,
              boxSizing: "border-box",
            }}
          >
            {shuffledLetterTiles.map(({ char: ch, origIndex: j }) => {
              const matched = prefixFullyMatches(wordChars, inputChars, j + 1);
              const display = ch === " " ? "·" : ch;
              return (
                <span
                  key={`${current.id}-tile-${j}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: ch === " " ? 22 : 28,
                    height: 32,
                    padding: "0 5px",
                    borderRadius: 8,
                    border: "1px solid var(--ielts-border-light)",
                    fontSize: ch === " " ? 12 : 15,
                    fontWeight: 800,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    background: matched ? "var(--ielts-bg-hover)" : "var(--ielts-bg-base)",
                    color: matched ? "var(--ielts-text-3)" : "var(--ielts-text-1)",
                    opacity: matched ? 0.42 : 1,
                    transition: "opacity 0.12s ease, background 0.12s ease, color 0.12s ease",
                    boxSizing: "border-box",
                  }}
                >
                  {display}
                </span>
              );
            })}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
          <input
            ref={inputRef}
            className="ielts-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (feedback === "wrong") setFeedback("idle");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="輸入英文…"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{
              fontSize: 16,
              padding: "10px 12px",
              minHeight: 44,
              maxHeight: 48,
              width: `min(100%, ${inputWidthCh}ch)`,
              maxWidth: "100%",
              boxSizing: "border-box",
            }}
          />
        </div>

        {feedback === "correct" && (
          <p className="ielts-text-body" style={{ margin: 0, color: "var(--ielts-success)", fontWeight: 800 }}>
            ✓ 正確
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, width: "100%", alignItems: "flex-start" }}>
          <button
            type="button"
            className="ielts-btn"
            onClick={() => speakEnglish(current.word)}
            style={{
              flexShrink: 0,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1px solid var(--ielts-border-light)",
              background: "var(--ielts-bg-hover)",
              color: "var(--ielts-text-2)",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            🔊 聽發音
          </button>
          <div style={{ flex: "1 1 160px", minWidth: 120, display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              className="ielts-btn"
              disabled={feedback !== "idle"}
              onClick={submit}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: 12,
                border: "none",
                background: feedback === "idle" ? "var(--ielts-accent)" : "var(--ielts-border-light)",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
                cursor: feedback === "idle" ? "pointer" : "default",
                opacity: feedback === "idle" ? 1 : 0.7,
                boxSizing: "border-box",
              }}
            >
              確認答案
            </button>
            {onReviewAgain ? (
              <>
                {reviewHint ? (
                  <p className="ielts-text-caption" style={{ margin: 0, textAlign: "center", color: "var(--ielts-success)", fontWeight: 700 }}>
                    已加入待複習清單
                  </p>
                ) : null}
                <button
                  type="button"
                  className="ielts-btn"
                  onClick={triggerReviewAgain}
                  style={{
                    ...reviewAgainBtnStyle,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  再測試
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
