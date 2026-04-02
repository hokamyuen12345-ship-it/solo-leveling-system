"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speakEnglish, stopSpeaking } from "./speech";
import type { Flashcard, FlashcardCategory } from "./store";

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

const CAT_LABEL: Record<FlashcardCategory, string> = {
  vocab: "詞彙",
  writing: "寫作",
  speaking: "口說",
  grammar: "語法",
};

type Props = {
  open: boolean;
  onClose: () => void;
  cards: Flashcard[];
  onKnow: (id: string) => void;
  onDontKnow: (id: string) => void;
  themeDark?: boolean;
};

/** 默寫：只看字卡「解釋」，輸入對應英文；逐字母提示格會隨正確輸入變暗。 */
export function FlashcardDictation({ open, onClose, cards, onKnow, onDontKnow, themeDark }: Props) {
  const [order, setOrder] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"idle" | "correct" | "wrong">("idle");
  const [showExampleHint, setShowExampleHint] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || cards.length === 0) return;
    setOrder(shuffle(cards));
    setIdx(0);
    setInput("");
    setFeedback("idle");
    setShowExampleHint(false);
  }, [open, cards]);

  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  const current = order[idx] ?? null;

  useEffect(() => {
    if (!current) return;
    setInput("");
    setFeedback("idle");
    setShowExampleHint(false);
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
      setShowExampleHint(false);
      if (idx + 1 >= order.length) onClose();
      else setIdx((i) => i + 1);
    },
    [current, idx, onClose, onDontKnow, onKnow, order.length],
  );

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

  const hasExample = Boolean(current.example?.trim());

  const body = (
    <div
      className="ielts-root"
      data-theme={themeDark ? "dark" : undefined}
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
      <div style={{ height: 4, borderRadius: 999, background: "var(--ielts-border-light)", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ height: "100%", width: `${Math.min(100, progress)}%`, background: "var(--ielts-writing)", transition: "width 0.25s ease" }} />
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
          {CAT_LABEL[current.category]}
        </span>

        <div className="ielts-text-caption" style={{ color: "var(--ielts-writing)", fontWeight: 800, letterSpacing: "0.12em", fontSize: 11, margin: 0 }}>
          題目 · 解釋／翻譯
        </div>

        <div
          className="ielts-card-static"
          style={{
            padding: "20px 18px",
            border: "2px solid rgba(245, 158, 11, 0.45)",
            background: "rgba(245, 158, 11, 0.08)",
            borderRadius: 14,
            textAlign: "center",
          }}
        >
          <div
            className="ielts-text-heading"
            style={{ fontSize: 20, lineHeight: 1.55, color: "var(--ielts-text-1)", fontWeight: 800, textAlign: "center" }}
          >
            {current.meaning}
          </div>
        </div>

        {wordChars.length > 0 && (
          <div
            role="group"
            aria-label="拼字提示：字母已打亂；依聽寫由左而右輸入，對應位置打對時該格變暗"
            style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 2 }}
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
              {showExampleHint ? "隱藏例句提示" : "需要時顯示例句提示（含英文）"}
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

        {feedback === "wrong" && (
          <p className="ielts-text-body" style={{ margin: 0, color: "var(--ielts-danger)", fontWeight: 700 }}>
            正確答案：{current.word}
          </p>
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
            onClick={() => speakEnglish(current.word)}
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
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
