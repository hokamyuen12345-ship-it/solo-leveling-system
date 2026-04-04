"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { speakEnglish, stopSpeaking } from "./speech";
import { buildStudySessionOrder } from "./study-order";
import { flashcardCategoryLabel, type Flashcard, type FlashcardCategoryDef } from "./store";

type Props = {
  open: boolean;
  onClose: () => void;
  cards: Flashcard[];
  categoryDefs: FlashcardCategoryDef[];
  onKnow: (id: string) => void;
  onDontKnow: (id: string) => void;
  /** 將目前字卡 id 加入字卡頁「待複習」清單 */
  onReviewAgain?: (id: string) => void;
  themeDark?: boolean;
  accentPink?: boolean;
};

export function FlashcardQuiz({
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
  const [flipped, setFlipped] = useState(false);
  const [reverseMode, setReverseMode] = useState(false);
  const [reviewHint, setReviewHint] = useState(false);
  const [slide, setSlide] = useState<"in" | "out-left" | "out-right">("in");
  const advanceTimerRef = useRef<number | null>(null);
  const reviewHintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || cards.length === 0) return;
    setOrder(buildStudySessionOrder(cards));
    setIdx(0);
    setFlipped(false);
    setReverseMode(false);
    setSlide("in");
    // 僅在開啟時排程：去重 + 未掌握加權；作答中 mastered 更新不打斷進度
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只用開啟瞬間的 cards，不依賴 cards 避免中途重排
  }, [open]);

  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  useEffect(() => {
    setReviewHint(false);
    if (reviewHintTimerRef.current !== null) {
      window.clearTimeout(reviewHintTimerRef.current);
      reviewHintTimerRef.current = null;
    }
  }, [idx]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
      if (reviewHintTimerRef.current !== null) window.clearTimeout(reviewHintTimerRef.current);
    };
  }, []);

  const current = order[idx] ?? null;
  const total = order.length;
  const progress = total ? ((idx + (flipped ? 0.5 : 0)) / total) * 100 : 0;

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const advance = useCallback(
    (dir: "left" | "right", known: boolean) => {
      if (!current) return;
      clearAdvanceTimer();
      setSlide(dir === "left" ? "out-left" : "out-right");
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null;
        if (known) onKnow(current.id);
        else onDontKnow(current.id);
        setFlipped(false);
        setSlide("in");
        if (idx + 1 >= order.length) {
          onClose();
        } else {
          setIdx((i) => i + 1);
        }
      }, 220);
    },
    [clearAdvanceTimer, current, idx, onClose, onDontKnow, onKnow, order.length],
  );

  const goPrev = useCallback(() => {
    clearAdvanceTimer();
    if (idx <= 0) return;
    setFlipped(false);
    setSlide("in");
    setIdx((i) => i - 1);
  }, [clearAdvanceTimer, idx]);

  const goSkipNext = useCallback(() => {
    clearAdvanceTimer();
    if (idx + 1 >= order.length) return;
    setFlipped(false);
    setSlide("in");
    setIdx((i) => i + 1);
  }, [clearAdvanceTimer, idx, order.length]);

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

  const portalReady = typeof document !== "undefined";

  if (!open || !portalReady || !current) return null;

  const reviewAgainBtnBase: CSSProperties = {
    padding: "12px 16px",
    borderRadius: 14,
    border: "1px solid rgba(202, 138, 4, 0.35)",
    background: "linear-gradient(180deg, #fefce8 0%, #fef9c3 100%)",
    color: "#713f12",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "var(--ielts-shadow-md)",
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
            {idx + 1} / {total}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className="ielts-btn"
            disabled={idx === 0}
            onClick={goPrev}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "10px 10px",
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
            title="跳過本題"
            style={{
              flex: 1,
              minWidth: 0,
              padding: "10px 8px",
              borderRadius: 12,
              border: "1px solid var(--ielts-border-light)",
              background: "var(--ielts-bg-hover)",
              color: "var(--ielts-text-2)",
              fontWeight: 800,
              fontSize: 13,
              lineHeight: 1.25,
              cursor: idx >= total - 1 ? "not-allowed" : "pointer",
              opacity: idx >= total - 1 ? 0.45 : 1,
            }}
          >
            下一題（跳過）
          </button>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <button
            type="button"
            className="ielts-toggle ielts-quiz-reverse-switch"
            data-on={reverseMode ? "true" : "false"}
            role="switch"
            aria-checked={reverseMode}
            aria-label={reverseMode ? "反轉測試已開啟，點一下改為一般測試" : "一般測試，點一下改為反轉測試（先看中文）"}
            onClick={() => {
              setReverseMode((r) => !r);
              setFlipped(false);
            }}
          >
            <div className="ielts-toggle-knob" />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            transform:
              slide === "out-left" ? "translateX(-28px)" : slide === "out-right" ? "translateX(28px)" : "translateX(0)",
            opacity: slide === "in" ? 1 : 0.35,
            transition: "transform 0.22s ease, opacity 0.22s ease",
          }}
        >
          <div className="ielts-flip-scene" onClick={() => setFlipped((f) => !f)} style={{ cursor: "pointer" }}>
            <div className={`ielts-flip-inner ${flipped ? "is-flipped" : ""}`}>
              <div className="ielts-flip-face">
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "var(--ielts-accent-light)",
                    color: "var(--ielts-accent)",
                    marginBottom: 16,
                  }}
                >
                  {flashcardCategoryLabel(current.category, categoryDefs)}
                </span>
                {reverseMode ? (
                  <>
                    <div className="ielts-text-heading" style={{ fontSize: "clamp(22px, 6vw, 28px)", color: "var(--ielts-text-1)", lineHeight: 1.35 }}>
                      {current.meaning}
                    </div>
                    <p className="ielts-text-caption" style={{ marginTop: 18, color: "var(--ielts-text-3)" }}>
                      想想看對應的英文單字
                    </p>
                  </>
                ) : (
                  <>
                    <div className="ielts-text-hero" style={{ fontSize: "clamp(36px, 10vw, 52px)", color: "var(--ielts-text-1)" }}>
                      {current.word}
                    </div>
                    <button
                      type="button"
                      className="ielts-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakEnglish(current.word);
                      }}
                      style={{
                        marginTop: 18,
                        padding: "10px 18px",
                        borderRadius: 12,
                        border: "1px solid var(--ielts-accent)",
                        background: "var(--ielts-accent-light)",
                        color: "var(--ielts-accent)",
                        fontWeight: 800,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      🔊 朗讀單字
                    </button>
                  </>
                )}
                <p className="ielts-text-caption" style={{ marginTop: 16 }}>
                  點一下翻面
                </p>
              </div>
              <div className="ielts-flip-face ielts-flip-back">
                {reverseMode ? (
                  <>
                    <div className="ielts-text-hero" style={{ fontSize: "clamp(32px, 9vw, 48px)", color: "var(--ielts-text-1)", marginBottom: 10 }}>
                      {current.word}
                    </div>
                    <button
                      type="button"
                      className="ielts-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakEnglish(current.word);
                      }}
                      style={{
                        marginBottom: 14,
                        padding: "10px 18px",
                        borderRadius: 12,
                        border: "1px solid var(--ielts-accent)",
                        background: "var(--ielts-accent-light)",
                        color: "var(--ielts-accent)",
                        fontWeight: 800,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      🔊 朗讀單字
                    </button>
                    <div className="ielts-text-heading" style={{ fontSize: 17, marginBottom: 8, color: "var(--ielts-text-2)" }}>
                      {current.meaning}
                    </div>
                    {current.example ? (
                      <>
                        <p className="ielts-text-body" style={{ fontSize: 14, color: "var(--ielts-text-3)", fontStyle: "italic" }}>
                          {current.example}
                        </p>
                        <button
                          type="button"
                          className="ielts-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            speakEnglish(current.example!);
                          }}
                          style={{
                            marginTop: 14,
                            padding: "8px 16px",
                            borderRadius: 12,
                            border: "1px solid var(--ielts-border-light)",
                            background: "var(--ielts-bg-hover)",
                            color: "var(--ielts-text-2)",
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          🔊 朗讀例句
                        </button>
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="ielts-text-heading" style={{ fontSize: 20, marginBottom: 12 }}>
                      {current.meaning}
                    </div>
                    {current.example ? (
                      <>
                        <p className="ielts-text-body" style={{ fontSize: 14, color: "var(--ielts-text-3)", fontStyle: "italic" }}>
                          {current.example}
                        </p>
                        <button
                          type="button"
                          className="ielts-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            speakEnglish(current.example!);
                          }}
                          style={{
                            marginTop: 14,
                            padding: "8px 16px",
                            borderRadius: 12,
                            border: "1px solid var(--ielts-border-light)",
                            background: "var(--ielts-bg-hover)",
                            color: "var(--ielts-text-2)",
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          🔊 朗讀例句
                        </button>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {flipped && (
          <div style={{ width: "100%", marginTop: 20, flexShrink: 0 }}>
            {onReviewAgain ? (
              <div style={{ position: "relative", display: "flex", justifyContent: "flex-end", width: "100%", marginBottom: 10 }}>
                {reviewHint ? (
                  <div
                    role="status"
                    className="ielts-text-caption"
                    style={{
                      position: "absolute",
                      right: 0,
                      bottom: "100%",
                      marginBottom: 6,
                      maxWidth: 220,
                      textAlign: "right",
                      color: "var(--ielts-success)",
                      fontWeight: 700,
                      fontSize: 12,
                      lineHeight: 1.35,
                      pointerEvents: "none",
                      textShadow: "0 0 8px var(--ielts-bg-base), 0 0 12px var(--ielts-bg-base)",
                    }}
                  >
                    已加入待複習清單
                  </div>
                ) : null}
                <button type="button" className="ielts-btn" onClick={triggerReviewAgain} style={reviewAgainBtnBase}>
                  再測試
                </button>
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "stretch",
                gap: 10,
                width: "100%",
              }}
            >
              <button
                type="button"
                className="ielts-btn"
                onClick={() => advance("left", false)}
                style={{
                  flex: "0 1 auto",
                  width: "min(42vw, 260px)",
                  maxWidth: "calc(50% - 5px)",
                  minWidth: 0,
                  padding: "16px 12px",
                  borderRadius: 14,
                  border: "none",
                  background: "#fef2f2",
                  color: "var(--ielts-danger)",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                ✗ 不認識
              </button>
              <button
                type="button"
                className="ielts-btn"
                onClick={() => advance("right", true)}
                style={{
                  flex: "0 1 auto",
                  width: "min(42vw, 260px)",
                  maxWidth: "calc(50% - 5px)",
                  minWidth: 0,
                  padding: "16px 12px",
                  borderRadius: 14,
                  border: "none",
                  background: "#f0fdf4",
                  color: "var(--ielts-success)",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                }}
              >
                ✓ 認識
              </button>
            </div>
          </div>
        )}

        {onReviewAgain && !flipped ? (
          <>
            {reviewHint ? (
              <div
                role="status"
                className="ielts-text-caption"
                style={{
                  position: "absolute",
                  right: 16,
                  bottom: "calc(58px + env(safe-area-inset-bottom, 0px))",
                  maxWidth: 200,
                  textAlign: "right",
                  color: "var(--ielts-success)",
                  fontWeight: 700,
                  fontSize: 12,
                  lineHeight: 1.35,
                  pointerEvents: "none",
                  textShadow: "0 0 8px var(--ielts-bg-base), 0 0 12px var(--ielts-bg-base)",
                }}
              >
                已加入待複習清單
              </div>
            ) : null}
            <button
              type="button"
              className="ielts-btn"
              onClick={triggerReviewAgain}
              style={{
                ...reviewAgainBtnBase,
                position: "absolute",
                right: 16,
                bottom: "max(14px, env(safe-area-inset-bottom, 0px))",
                zIndex: 20,
              }}
            >
              再測試
            </button>
          </>
        ) : null}
      </div>
  );

  return createPortal(body, document.body);
}
