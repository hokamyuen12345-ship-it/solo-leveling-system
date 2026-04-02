"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
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

export function FlashcardQuiz({ open, onClose, cards, onKnow, onDontKnow, themeDark }: Props) {
  const [order, setOrder] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [slide, setSlide] = useState<"in" | "out-left" | "out-right">("in");

  useEffect(() => {
    if (!open || cards.length === 0) return;
    setOrder(shuffle(cards));
    setIdx(0);
    setFlipped(false);
    setSlide("in");
    // 只在開啟測驗時洗牌；作答中若 cards 因 mastered 更新，不重設進度
  }, [open]);

  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  const current = order[idx] ?? null;
  const total = order.length;
  const progress = total ? ((idx + (flipped ? 0.5 : 0)) / total) * 100 : 0;

  const advance = useCallback(
    (dir: "left" | "right", known: boolean) => {
      if (!current) return;
      setSlide(dir === "left" ? "out-left" : "out-right");
      window.setTimeout(() => {
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
    [current, idx, onClose, onDontKnow, onKnow, order.length],
  );

  const portalReady = typeof document !== "undefined";

  if (!open || !portalReady || !current) return null;

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
          <div style={{ height: "100%", width: `${Math.min(100, progress)}%`, background: "var(--ielts-accent)", transition: "width 0.25s ease" }} />
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

        <div
          style={{
            flex: 1,
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
                  {CAT_LABEL[current.category]}
                </span>
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
                <p className="ielts-text-caption" style={{ marginTop: 16 }}>
                  點一下翻面
                </p>
              </div>
              <div className="ielts-flip-face ielts-flip-back">
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
              </div>
            </div>
          </div>
        </div>

        {flipped && (
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              type="button"
              className="ielts-btn"
              onClick={() => advance("left", false)}
              style={{
                flex: 1,
                padding: "16px 12px",
                borderRadius: 14,
                border: "none",
                background: "#fef2f2",
                color: "var(--ielts-danger)",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              ✗ 不認識
            </button>
            <button
              type="button"
              className="ielts-btn"
              onClick={() => advance("right", true)}
              style={{
                flex: 1,
                padding: "16px 12px",
                borderRadius: 14,
                border: "none",
                background: "#f0fdf4",
                color: "var(--ielts-success)",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              ✓ 認識
            </button>
          </div>
        )}
      </div>
  );

  return createPortal(body, document.body);
}
