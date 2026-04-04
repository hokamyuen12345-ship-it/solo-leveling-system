"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCloze, type ClozePayload } from "./fetch-cloze-client";
import { getStoredGoogleAIKey, storeGoogleAiKeyFromPaste } from "./llm-key-storage";
import { speakEnglish, stopSpeaking } from "./speech";
import { buildStudySessionOrder } from "./study-order";
import { flashcardCategoryLabel, type Flashcard, type FlashcardCategoryDef } from "./store";

function normAnswer(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

type Props = {
  open: boolean;
  onClose: () => void;
  cards: Flashcard[];
  categoryDefs: FlashcardCategoryDef[];
  onKnow: (id: string) => void;
  onDontKnow: (id: string) => void;
  themeDark?: boolean;
  accentPink?: boolean;
  /** 已由 AI 產生的填空（依字卡 id）；開啟本頁時會持續寫入 */
  clozeById: Record<string, ClozePayload>;
  clozeErrById: Record<string, string>;
  /** 父層 retry 計數：變更時清除本輪請求去重，以便重新向 API 索取 */
  clozeResetNonce: number;
  onClozeFetched: (id: string, data: ClozePayload) => void;
  onClozeError: (id: string, message: string) => void;
  onRetryClozePrefetch: () => void;
  onReviewAgain?: (id: string) => void;
};

function renderEnWithBlank(enSentence: string) {
  const parts = enSentence.split("___");
  if (parts.length !== 2) {
    return <span className="ielts-text-body">{enSentence}</span>;
  }
  return (
    <span className="ielts-text-body" style={{ lineHeight: 1.65 }}>
      {parts[0]}
      <span
        style={{
          display: "inline-block",
          minWidth: 72,
          margin: "0 4px",
          padding: "2px 8px",
          borderBottom: "2px solid var(--ielts-border-light)",
          color: "var(--ielts-text-3)",
          fontWeight: 700,
          verticalAlign: "baseline",
        }}
      >
        ＿＿＿
      </span>
      {parts[1]}
    </span>
  );
}

const CLOZE_CONCURRENCY = 4;

/**
 * AI 句子填空：開啟後依洗牌順序優先向 API 產生題目，第一題就緒即可作答；其餘題在背景並行生成並寫入 clozeById。
 */
export function FlashcardCloze({
  open,
  onClose,
  cards,
  categoryDefs,
  onKnow,
  onDontKnow,
  themeDark,
  accentPink,
  clozeById,
  clozeErrById,
  clozeResetNonce,
  onClozeFetched,
  onClozeError,
  onRetryClozePrefetch,
  onReviewAgain,
}: Props) {
  const [order, setOrder] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">("idle");
  const [showExampleHint, setShowExampleHint] = useState(false);
  const [reviewHint, setReviewHint] = useState(false);
  const [simpleMode, setSimpleMode] = useState(false);
  const [cloze, setCloze] = useState<ClozePayload | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [pasteKeyDraft, setPasteKeyDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reviewHintTimerRef = useRef<number | null>(null);

  const clozeByIdRef = useRef(clozeById);
  const clozeErrRef = useRef(clozeErrById);
  const idxRef = useRef(idx);
  const orderRef = useRef(order);
  const claimedIdsRef = useRef<Set<string>>(new Set());

  clozeByIdRef.current = clozeById;
  clozeErrRef.current = clozeErrById;
  idxRef.current = idx;
  orderRef.current = order;

  useEffect(() => {
    if (loadState === "error") setPasteKeyDraft(getStoredGoogleAIKey());
  }, [loadState]);

  useEffect(() => {
    if (!open || cards.length === 0) return;
    claimedIdsRef.current.clear();
    setOrder(buildStudySessionOrder(cards));
    setIdx(0);
    setInput("");
    setFeedback("idle");
    setShowExampleHint(false);
    setSimpleMode(false);
    setCloze(null);
    setLoadState("loading");
    setLoadError("");
    // 僅開啟時排程；避免作答中 cards 參考變動重置題序與 AI 進度
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    claimedIdsRef.current.clear();
  }, [clozeResetNonce]);

  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  const current = order[idx] ?? null;
  const currentId = current?.id ?? "";
  /** 只訂閱當前字卡的題目／錯誤，避免背景幫別張卡 prefetch 時整份 clozeById 換參考而誤觸 effect 清空 input */
  const clozeHitForCurrent = currentId ? clozeById[currentId] : undefined;
  const clozeErrForCurrent = currentId ? clozeErrById[currentId] : undefined;

  function prioritizedOrder(base: Flashcard[], fromIdx: number): Flashcard[] {
    if (base.length === 0) return [];
    const i = Math.max(0, Math.min(fromIdx, base.length - 1));
    return [...base.slice(i), ...base.slice(0, i)];
  }

  useEffect(() => {
    if (!open || simpleMode || order.length === 0) return;

    const ac = new AbortController();
    let cancelled = false;
    const inFlight = new Set<string>();

    function claimNext(): Flashcard | null {
      const ord = orderRef.current;
      const from = idxRef.current;
      for (const c of prioritizedOrder(ord, from)) {
        if (clozeByIdRef.current[c.id] || clozeErrRef.current[c.id]) continue;
        if (claimedIdsRef.current.has(c.id)) continue;
        claimedIdsRef.current.add(c.id);
        inFlight.add(c.id);
        return c;
      }
      return null;
    }

    function pendingRemaining(): number {
      const ord = orderRef.current;
      const from = idxRef.current;
      return prioritizedOrder(ord, from).filter((c) => !clozeByIdRef.current[c.id] && !clozeErrRef.current[c.id]).length;
    }

    async function worker() {
      while (!ac.signal.aborted && !cancelled) {
        const next = claimNext();
        if (!next) {
          if (inFlight.size === 0 && pendingRemaining() === 0) break;
          await new Promise((r) => setTimeout(r, 60));
          continue;
        }
        try {
          const data = await fetchCloze(next, ac.signal);
          if (ac.signal.aborted || cancelled) return;
          onClozeFetched(next.id, data);
        } catch (e) {
          if (ac.signal.aborted || cancelled || (e as Error).name === "AbortError") return;
          onClozeError(next.id, (e as Error).message || "載入失敗");
        } finally {
          inFlight.delete(next.id);
        }
      }
    }

    const n = Math.min(CLOZE_CONCURRENCY, order.length);
    void Promise.all(Array.from({ length: n }, () => worker()));

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [open, simpleMode, order, onClozeFetched, onClozeError, clozeResetNonce]);

  useEffect(() => {
    if (!open || !currentId) return;
    setInput("");
    setFeedback("idle");
    setShowExampleHint(false);

    if (simpleMode) {
      setCloze(null);
      setLoadState("ready");
      setLoadError("");
      const t = window.setTimeout(() => inputRef.current?.focus(), 180);
      return () => window.clearTimeout(t);
    }

    const err = clozeErrForCurrent;
    if (err) {
      setCloze(null);
      setLoadError(err);
      setLoadState("error");
      return;
    }
    const hit = clozeHitForCurrent;
    if (hit) {
      setCloze(hit);
      setLoadState("ready");
      setLoadError("");
      const t = window.setTimeout(() => inputRef.current?.focus(), 120);
      return () => window.clearTimeout(t);
    }
    setCloze(null);
    setLoadState("loading");
    setLoadError("");
  }, [open, currentId, simpleMode, clozeHitForCurrent, clozeErrForCurrent]);

  useEffect(() => {
    setReviewHint(false);
    if (reviewHintTimerRef.current !== null) {
      window.clearTimeout(reviewHintTimerRef.current);
      reviewHintTimerRef.current = null;
    }
  }, [currentId]);

  const total = order.length;
  const readyInRound = useMemo(() => order.filter((c) => clozeById[c.id]).length, [order, clozeById]);
  const stillGenerating = useMemo(
    () => order.filter((c) => !clozeById[c.id] && !clozeErrById[c.id]).length,
    [order, clozeById, clozeErrById],
  );
  const progress = total ? (idx / total) * 100 : 0;

  const expectedForCompare = simpleMode ? current?.word ?? "" : cloze?.expectedAnswer ?? "";
  const revealAnswer = simpleMode ? current?.word ?? "" : cloze?.expectedAnswer ?? "";
  const speakTarget = revealAnswer || (current?.word ?? "");

  const goNext = useCallback(
    (known: boolean) => {
      if (!current) return;
      if (known) onKnow(current.id);
      else onDontKnow(current.id);
      setFeedback("idle");
      setInput("");
      setShowExampleHint(false);
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
    setShowExampleHint(false);
    setIdx((i) => i + 1);
  }, [current, idx, order.length]);

  const submit = useCallback(() => {
    if (!current || feedback !== "idle" || loadState !== "ready") return;
    if (!expectedForCompare) return;
    if (normAnswer(input) === normAnswer(expectedForCompare)) {
      setFeedback("correct");
      window.setTimeout(() => goNext(true), 450);
    } else {
      setFeedback("wrong");
    }
  }, [current, expectedForCompare, feedback, goNext, input, loadState]);

  const portalReady = typeof document !== "undefined";

  if (!open || !portalReady || !current) return null;

  const hasExample = Boolean(current.example?.trim());

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
          {simpleMode ? "簡易填空" : "AI 句子填空"} {idx + 1} / {total}
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
      {onReviewAgain ? (
        <>
          <button
            type="button"
            className="ielts-btn"
            onClick={() => {
              onReviewAgain(current.id);
              if (reviewHintTimerRef.current !== null) window.clearTimeout(reviewHintTimerRef.current);
              setReviewHint(true);
              reviewHintTimerRef.current = window.setTimeout(() => {
                reviewHintTimerRef.current = null;
                setReviewHint(false);
              }, 1600);
            }}
            style={{
              width: "100%",
              marginBottom: 10,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--ielts-border-light)",
              background: "var(--ielts-bg-hover)",
              color: "var(--ielts-text-2)",
              fontWeight: 800,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            再測試（加入待複習）
          </button>
          {reviewHint ? (
            <p className="ielts-text-caption" style={{ margin: "0 0 10px", textAlign: "center", color: "var(--ielts-success)", fontWeight: 700 }}>
              已加入待複習清單
            </p>
          ) : null}
        </>
      ) : null}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 16,
          maxWidth: 440,
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

        {loadState === "loading" && (
          <div>
            <p className="ielts-text-body" style={{ margin: "0 0 6px", color: "var(--ielts-text-2)", fontWeight: 600 }}>
              正在產生本題 AI 填空…
            </p>
            {!simpleMode && total > 0 && (
              <p className="ielts-text-caption" style={{ margin: 0, color: "var(--ielts-text-3)", lineHeight: 1.5 }}>
                可先略等本題；其餘 {Math.max(0, stillGenerating - 1)} 題會在背景繼續生成（已完成 {readyInRound} / {total}）。
              </p>
            )}
          </div>
        )}

        {loadState === "error" && (
          <div
            className="ielts-card-static"
            style={{
              padding: 16,
              borderRadius: 14,
              border: "1px solid var(--ielts-border-light)",
              background: "var(--ielts-bg-hover)",
            }}
          >
            <p className="ielts-text-body" style={{ margin: "0 0 12px", color: "var(--ielts-danger)", fontWeight: 700 }}>
              {loadError}
            </p>
            <p className="ielts-text-caption" style={{ margin: "0 0 10px", lineHeight: 1.55 }}>
              <strong>方式一：</strong>到「設定」分頁貼上 <strong>Google AI Studio</strong> 金鑰（<code style={{ fontSize: 12 }}>AIza</code> 開頭），或在此貼上後按「儲存金鑰並重試」。
            </p>
            <p className="ielts-text-caption" style={{ margin: "0 0 12px", lineHeight: 1.55 }}>
              <strong>方式二：</strong>在專案根目錄 <code style={{ fontSize: 12 }}>.env.local</code> 加入{" "}
              <code style={{ fontSize: 12 }}>GEMINI_API_KEY=AIza…</code>（勿用 <code style={{ fontSize: 12 }}>NEXT_PUBLIC_</code>），存檔後<strong>完全重啟</strong>{" "}
              <code style={{ fontSize: 12 }}>npm run dev</code>。若畫面仍顯示金鑰錯誤，請讀取上方紅字（來自 Google API 的說明）。
            </p>
            <label className="ielts-text-caption" style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              貼上 Google AI Studio 金鑰（<code style={{ fontSize: 12 }}>AIza…</code>）
              <input
                className="ielts-input"
                type="password"
                autoComplete="off"
                value={pasteKeyDraft}
                onChange={(e) => setPasteKeyDraft(e.target.value)}
                placeholder="AIza…"
                style={{ fontFamily: "monospace", fontSize: 13 }}
              />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                className="ielts-btn"
                onClick={() => {
                  if (!storeGoogleAiKeyFromPaste(pasteKeyDraft)) {
                    window.alert("金鑰須為 Google AI Studio 的 API Key（以 AIza 開頭，貼上時勿含多餘空格）。");
                    return;
                  }
                  setSimpleMode(false);
                  setLoadState("loading");
                  setLoadError("");
                  onRetryClozePrefetch();
                }}
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "none",
                  background: "var(--ielts-accent)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                儲存金鑰並重試
              </button>
              <button
                type="button"
                className="ielts-btn"
                onClick={() => {
                  setSimpleMode(false);
                  setLoadState("loading");
                  setLoadError("");
                  onRetryClozePrefetch();
                }}
                style={{
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
                僅重試
              </button>
              <button
                type="button"
                className="ielts-btn"
                onClick={() => {
                  setSimpleMode(true);
                  setLoadState("ready");
                  setLoadError("");
                }}
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid var(--ielts-border-light)",
                  background: "transparent",
                  color: "var(--ielts-text-2)",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                暫用簡易填空（同默寫：對照中文打字卡英文）
              </button>
            </div>
          </div>
        )}

        {loadState === "ready" && (
          <>
            {simpleMode && (
              <div className="ielts-text-caption" style={{ color: "var(--ielts-writing)", fontWeight: 800, letterSpacing: "0.12em", fontSize: 11, margin: 0 }}>
                題目 · 字卡解釋
              </div>
            )}

            <div
              className="ielts-card-static"
              style={{
                padding: "20px 18px",
                border: "2px solid rgba(245, 158, 11, 0.45)",
                background: "rgba(245, 158, 11, 0.08)",
                borderRadius: 14,
              }}
            >
              <div className="ielts-text-heading" style={{ fontSize: 19, lineHeight: 1.55, color: "var(--ielts-text-1)", fontWeight: 800 }}>
                {simpleMode ? current.meaning : cloze?.zhContext ?? current.meaning}
              </div>
            </div>

            {!simpleMode && cloze && (
              <div
                className="ielts-card-static"
                style={{
                  padding: "18px 16px",
                  border: "1px solid var(--ielts-border-light)",
                  borderRadius: 14,
                  background: "var(--ielts-bg-hover)",
                }}
              >
                {renderEnWithBlank(cloze.enSentence)}
              </div>
            )}

            {simpleMode && (
              <p className="ielts-text-caption" style={{ color: "var(--ielts-text-3)", margin: 0, lineHeight: 1.55 }}>
                請輸入字卡上的英文單字或片語（大小寫不拘；片語請保留空格）。
              </p>
            )}

            {hasExample && (
              <div>
                <button
                  type="button"
                  className="ielts-btn"
                  onClick={() => setShowExampleHint((v) => !v)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px dashed var(--ielts-border-light)",
                    background: "transparent",
                    color: "var(--ielts-text-3)",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {showExampleHint ? "隱藏字卡例句" : "顯示字卡例句（參考用）"}
                </button>
                {showExampleHint && (
                  <p
                    className="ielts-text-body"
                    style={{
                      margin: "10px 0 0",
                      fontSize: 14,
                      color: "var(--ielts-text-2)",
                      fontStyle: "italic",
                      lineHeight: 1.55,
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "var(--ielts-bg-hover)",
                    }}
                  >
                    {current.example}
                  </p>
                )}
              </div>
            )}

            <input
              ref={inputRef}
              className="ielts-input"
              value={input}
              disabled={loadState !== "ready"}
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
              style={{ fontSize: 17, padding: "14px 14px" }}
            />

            {feedback === "wrong" && (
              <div>
                <p className="ielts-text-body" style={{ margin: "0 0 6px", color: "var(--ielts-danger)", fontWeight: 700 }}>
                  正確答案：{revealAnswer}
                </p>
                {!simpleMode && cloze?.noteZh && (
                  <p className="ielts-text-caption" style={{ margin: 0, color: "var(--ielts-text-3)", lineHeight: 1.5 }}>
                    {cloze.noteZh}
                  </p>
                )}
              </div>
            )}
            {feedback === "correct" && (
              <p className="ielts-text-body" style={{ margin: 0, color: "var(--ielts-success)", fontWeight: 800 }}>
                ✓ 正確
              </p>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                type="button"
                className="ielts-btn"
                onClick={() => speakEnglish(speakTarget)}
                style={{
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
              <button
                type="button"
                className="ielts-btn"
                disabled={feedback !== "idle"}
                onClick={submit}
                style={{
                  flex: 1,
                  minWidth: 120,
                  padding: "14px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: feedback === "idle" ? "var(--ielts-accent)" : "var(--ielts-border-light)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: feedback === "idle" ? "pointer" : "default",
                  opacity: feedback === "idle" ? 1 : 0.7,
                }}
              >
                確認答案
              </button>
            </div>

            {feedback === "wrong" && (
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className="ielts-btn"
                  onClick={() => goNext(false)}
                  style={{
                    flex: 1,
                    padding: "14px 12px",
                    borderRadius: 14,
                    border: "none",
                    background: "#fef2f2",
                    color: "var(--ielts-danger)",
                    fontWeight: 800,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  跳過（不認識）
                </button>
                <button
                  type="button"
                  className="ielts-btn"
                  onClick={() => {
                    setInput("");
                    setFeedback("idle");
                    inputRef.current?.focus();
                  }}
                  style={{
                    flex: 1,
                    padding: "14px 12px",
                    borderRadius: 14,
                    border: "none",
                    background: "var(--ielts-bg-hover)",
                    color: "var(--ielts-text-2)",
                    fontWeight: 800,
                    fontSize: 15,
                    cursor: "pointer",
                  }}
                >
                  再試
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
