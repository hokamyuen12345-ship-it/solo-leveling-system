"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IELTS_SW_RECORDS_KEY, migrateSwRecords, type SpeakingWritingEntry, type SpeakingWritingType } from "@/app/ielts/store";

function recordTypeLabel(t: SpeakingWritingType): string {
  return t === "writing" ? "Writing" : "Speaking";
}

function wrapHighlightBySelection(
  el: HTMLTextAreaElement | null,
  value: string,
  setValue: (v: string) => void,
): void {
  if (!el) return;
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  if (e <= s) return;
  const head = value.slice(0, s);
  const mid = value.slice(s, e);
  const tail = value.slice(e);
  const next = `${head}==${mid}==${tail}`;
  setValue(next);
  requestAnimationFrame(() => {
    try {
      el.focus();
      el.setSelectionRange(s + 2, e + 2);
    } catch {
      /* */
    }
  });
}

function HighlightPreview({ text }: { text: string }) {
  const parts: Array<string | React.ReactNode> = [];
  const re = /==([\s\S]*?)==/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <mark
        key={`${start}-${end}`}
        style={{
          background: "rgba(47,111,237,0.22)",
          color: "var(--ielts-text-1)",
          padding: "0 3px",
          borderRadius: 4,
        }}
      >
        {m[1]}
      </mark>,
    );
    last = end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <div
      className="ielts-text-body"
      style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", fontSize: 14, color: "var(--ielts-text-2)" }}
    >
      {parts.length ? parts : text}
    </div>
  );
}

function readAll(): SpeakingWritingEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(IELTS_SW_RECORDS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return migrateSwRecords(parsed);
  } catch {
    return [];
  }
}

function writeAll(list: SpeakingWritingEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IELTS_SW_RECORDS_KEY, JSON.stringify(list));
  } catch {
    /* */
  }
}

export default function IeltsRecordDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [loaded, setLoaded] = useState(false);
  const [rec, setRec] = useState<SpeakingWritingEntry | null>(null);
  const [mode, setMode] = useState<"my" | "improved">("my");
  const [myAns, setMyAns] = useState("");
  const [improvedAns, setImprovedAns] = useState("");

  const myRef = useRef<HTMLTextAreaElement | null>(null);
  const improvedRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setLoaded(true);
    const tryLoad = () => {
      const r = readAll().find((x) => x.id === id) ?? null;
      if (r) {
        setRec(r);
        setMyAns(r.myAnswer ?? "");
        setImprovedAns(r.improvedAnswer ?? "");
        return true;
      }
      return false;
    };
    if (tryLoad()) return;
    // 新增後立刻跳轉時，localStorage 可能稍後才寫入；短暫重試避免空白
    let tries = 0;
    const t = window.setInterval(() => {
      tries++;
      if (tryLoad() || tries >= 12) window.clearInterval(t);
    }, 80);
    return () => window.clearInterval(t);
  }, [id]);

  const save = useCallback(() => {
    const r = rec;
    if (!r) return;
    const list = readAll();
    const iso = new Date().toISOString().slice(0, 10);
    const next = list.map((x) =>
      x.id === r.id ? { ...x, myAnswer: myAns, improvedAnswer: improvedAns, updatedAt: iso } : x,
    );
    writeAll(next);
    setRec((prev) => (prev ? { ...prev, myAnswer: myAns, improvedAnswer: improvedAns, updatedAt: iso } : prev));
  }, [improvedAns, myAns, rec]);

  const prompt = rec?.prompt ?? "";

  // page shell wants ielts variables; keep it inside ielts-root
  if (!loaded) return null;

  return (
    <div className="ielts-root">
      <main
        style={{
          minHeight: "100dvh",
          maxWidth: 430,
          margin: "0 auto",
          padding: "16px 14px calc(18px + env(safe-area-inset-bottom, 0px))",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
        }}
      >
        <header className="ielts-card-static" style={{ padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ielts-text-caption" style={{ fontWeight: 900, color: rec?.type === "writing" ? "var(--ielts-writing)" : "var(--ielts-speaking)" }}>
                {rec ? recordTypeLabel(rec.type) : "記錄"}
              </div>
              <div className="ielts-text-heading" style={{ marginTop: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                {prompt || "（找不到此題目）"}
              </div>
            </div>
            <Link
              href="/ielts"
              onClick={() => {
                try {
                  sessionStorage.setItem("ielts_last_tab_v1", "records");
                } catch {
                  /* */
                }
                save();
              }}
              className="ielts-btn"
              style={{
                flexShrink: 0,
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid var(--ielts-border-light)",
                background: "var(--ielts-bg-hover)",
                color: "var(--ielts-text-2)",
                textDecoration: "none",
              }}
            >
              返回
            </Link>
          </div>
        </header>

        {rec ? (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="ielts-btn"
                onClick={() => setMode("my")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--ielts-border-light)",
                  background: mode === "my" ? "var(--ielts-accent)" : "var(--ielts-bg-hover)",
                  color: mode === "my" ? "#fff" : "var(--ielts-text-2)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                我的答案
              </button>
              <button
                type="button"
                className="ielts-btn"
                onClick={() => setMode("improved")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--ielts-border-light)",
                  background: mode === "improved" ? "var(--ielts-accent)" : "var(--ielts-bg-hover)",
                  color: mode === "improved" ? "#fff" : "var(--ielts-text-2)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                進階版本
              </button>
            </div>

            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div className="ielts-text-caption" style={{ color: "var(--ielts-text-3)" }}>
                選取文字後按 Highlight（會用 <span style={{ fontWeight: 900 }}>==重點==</span> 保存）
              </div>
              <button
                type="button"
                className="ielts-btn"
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "2px solid var(--ielts-accent)",
                  background: "transparent",
                  color: "var(--ielts-accent)",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
                onClick={() => {
                  if (mode === "my") wrapHighlightBySelection(myRef.current, myAns, setMyAns);
                  else wrapHighlightBySelection(improvedRef.current, improvedAns, setImprovedAns);
                }}
              >
                Highlight
              </button>
            </div>

            {mode === "my" ? (
              <textarea
                ref={myRef}
                className="ielts-input"
                value={myAns}
                onChange={(e) => setMyAns(e.target.value)}
                placeholder="在這裡寫「我的答案」…"
                style={{ marginTop: 10, minHeight: "48vh", fontSize: 14, lineHeight: 1.6, fontFamily: "inherit" }}
              />
            ) : (
              <textarea
                ref={improvedRef}
                className="ielts-input"
                value={improvedAns}
                onChange={(e) => setImprovedAns(e.target.value)}
                placeholder="在這裡寫「進階版本」…"
                style={{ marginTop: 10, minHeight: "48vh", fontSize: 14, lineHeight: 1.6, fontFamily: "inherit" }}
              />
            )}

            <div className="ielts-card-static" style={{ padding: 14, marginTop: 12, background: "var(--ielts-bg-hover)" }}>
              <div className="ielts-text-caption" style={{ fontWeight: 900, marginBottom: 8 }}>
                預覽（highlight）
              </div>
              <HighlightPreview text={mode === "my" ? myAns : improvedAns} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="button" className="ielts-btn" style={{ padding: "12px 18px", borderRadius: 12, border: "none", background: "var(--ielts-accent)", color: "#fff", fontWeight: 800, flex: 1, cursor: "pointer" }} onClick={save}>
                儲存
              </button>
            </div>
          </>
        ) : (
          <div className="ielts-card-static" style={{ padding: 18 }}>
            <div className="ielts-text-body" style={{ color: "var(--ielts-text-2)" }}>
              找不到此記錄（可能已被刪除）。
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

