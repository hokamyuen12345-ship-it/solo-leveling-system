"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { MutableRefObject, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IELTS_SW_RECORDS_KEY,
  isSwRecordWriting,
  migrateSwRecords,
  type SpeakingWritingEntry,
  type SpeakingWritingType,
} from "@/app/ielts/store";

function recordTypeLabel(t: SpeakingWritingType): string {
  if (t === "writing_part1") return "Writing Part 1";
  if (t === "writing_part2" || t === "writing") return "Writing Part 2";
  return "Speaking";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 儲存：藍 ==…==、黃 %%…%%、紅 !!…!! → innerHTML */
function stringToHighlightHtml(s: string): string {
  if (!s) return "";
  const re = /==([\s\S]*?)==|%%([\s\S]*?)%%|!!([\s\S]*?)!!/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out += escapeHtml(s.slice(last, m.index)).replace(/\n/g, "<br>");
    let inner: string;
    let cls: string;
    if (m[1] !== undefined) {
      inner = m[1];
      cls = "ielts-hl-blue";
    } else if (m[2] !== undefined) {
      inner = m[2];
      cls = "ielts-hl-yellow";
    } else {
      inner = m[3] ?? "";
      cls = "ielts-hl-red";
    }
    out += `<mark class="ielts-hl-inline ${cls}">${escapeHtml(inner).replace(/\n/g, "<br>")}</mark>`;
    last = m.index + m[0].length;
  }
  if (last < s.length) out += escapeHtml(s.slice(last)).replace(/\n/g, "<br>");
  return out;
}

function serializeHighlightNodes(nodes: NodeList | Node[]): string {
  let out = "";
  const list = Array.from(nodes);
  for (const n of list) {
    if (n.nodeType === Node.TEXT_NODE) {
      out += n.textContent ?? "";
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      const tag = el.tagName;
      if (tag === "MARK" && el.classList.contains("ielts-hl-inline")) {
        const inner = serializeHighlightNodes(el.childNodes);
        if (el.classList.contains("ielts-hl-yellow")) out += `%%${inner}%%`;
        else if (el.classList.contains("ielts-hl-red")) out += `!!${inner}!!`;
        else out += `==${inner}==`;
      } else if (tag === "BR") {
        out += "\n";
      } else if (tag === "DIV") {
        if (out.length && !out.endsWith("\n")) out += "\n";
        out += serializeHighlightNodes(el.childNodes);
        if (!out.endsWith("\n")) out += "\n";
      } else {
        out += serializeHighlightNodes(el.childNodes);
      }
    }
  }
  return out;
}

function serializeHighlightRoot(root: HTMLElement): string {
  return serializeHighlightNodes(root.childNodes).replace(/\n+$/, "");
}

type HighlightColor = "blue" | "yellow" | "red";

function wrapHighlightContentEditable(root: HTMLElement | null, color: HighlightColor): void {
  if (!root) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  try {
    const mark = document.createElement("mark");
    mark.className = `ielts-hl-inline ielts-hl-${color}`;
    const frag = range.extractContents();
    mark.appendChild(frag);
    range.insertNode(mark);
    sel.removeAllRanges();
    const nr = document.createRange();
    nr.selectNodeContents(mark);
    nr.collapse(false);
    sel.addRange(nr);
  } catch {
    /* 選取跨越不可切節點時略過 */
  }
  root.dispatchEvent(new Event("input", { bubbles: true }));
}

const HIGHLIGHT_EDITOR_MIN_HEIGHT_PX = 132;

/** 單層 contenteditable：底色即 <mark>，無 textarea 疊字；高度隨內容伸長。 */
function HighlightEditor({
  value,
  onChange,
  placeholder,
  editorRef,
  topMargin = 10,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  editorRef: RefObject<HTMLDivElement | null> | MutableRefObject<HTMLDivElement | null>;
  topMargin?: number;
}) {
  const flushFromDom = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = serializeHighlightRoot(el);
    onChange(next);
    el.setAttribute("data-empty", next ? "false" : "true");
  }, [editorRef, onChange]);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const cur = serializeHighlightRoot(el);
    if (cur !== value) {
      el.innerHTML = value ? stringToHighlightHtml(value) : "";
      el.setAttribute("data-empty", value ? "false" : "true");
    }
  }, [value, editorRef]);

  return (
    <div
      ref={editorRef}
      className="ielts-input ielts-hl-editor"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      data-empty={value ? "false" : "true"}
      spellCheck={false}
      style={{
        marginTop: topMargin,
        minHeight: HIGHLIGHT_EDITOR_MIN_HEIGHT_PX,
        fontSize: 15,
        lineHeight: 1.6,
        fontFamily: "inherit",
      }}
      onInput={flushFromDom}
      onPaste={(e) => {
        e.preventDefault();
        const t = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, t);
      }}
    />
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

function paramIdToString(v: string | string[] | undefined): string {
  const raw = typeof v === "string" ? v : Array.isArray(v) && v[0] ? v[0] : "";
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const MAX_ATTACHMENT_DATA_URL_CHARS = 2_200_000;

/** 縮圖並轉成 JPEG data URL，避免塞爆 localStorage */
function imageFileToCompressedDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxW = 1000;
        const maxH = 1400;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w <= 0 || h <= 0) {
          resolve(null);
          return;
        }
        const scale = Math.min(1, maxW / w, maxH / h);
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, cw, ch);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        if (dataUrl.length > MAX_ATTACHMENT_DATA_URL_CHARS) resolve(null);
        else resolve(dataUrl);
      };
      img.onerror = () => resolve(null);
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export default function IeltsRecordDetailPage() {
  const params = useParams();
  const id = paramIdToString(params?.id);
  const [loaded, setLoaded] = useState(false);
  const [rec, setRec] = useState<SpeakingWritingEntry | null>(null);
  const [mode, setMode] = useState<"my" | "improved">("my");
  const [myAns, setMyAns] = useState("");
  const [improvedAns, setImprovedAns] = useState("");
  const [attachmentImageDataUrl, setAttachmentImageDataUrl] = useState<string | undefined>(undefined);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);

  const myRef = useRef<HTMLDivElement | null>(null);
  const improvedRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const persistAnswersRef = useRef<() => void>(() => {});
  const flushSnapshotRef = useRef({
    routeId: "",
    recId: null as string | null,
    my: "",
    imp: "",
    img: undefined as string | undefined,
  });
  const skipAutoSaveUntilHydratedRef = useRef<string | null>(null);

  useEffect(() => {
    setLoaded(true);
    const tryLoad = () => {
      const r = readAll().find((x) => x.id === id) ?? null;
      if (r) {
        setRec(r);
        setMyAns(r.myAnswer ?? "");
        setImprovedAns(r.improvedAnswer ?? "");
        setAttachmentImageDataUrl(r.attachmentImageDataUrl);
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

  useEffect(() => {
    skipAutoSaveUntilHydratedRef.current = null;
  }, [id]);

  const persistAnswers = useCallback(() => {
    const r = rec;
    if (!r || r.id !== id) return;
    const iso = new Date().toISOString().slice(0, 10);
    const list = readAll();
    const next = list.map((x) =>
      x.id === r.id
        ? {
            ...x,
            myAnswer: myAns,
            improvedAnswer: improvedAns,
            ...(attachmentImageDataUrl ? { attachmentImageDataUrl } : { attachmentImageDataUrl: undefined }),
            updatedAt: iso,
          }
        : x,
    );
    writeAll(next);
    setRec((prev) =>
      prev && prev.id === r.id
        ? {
            ...prev,
            myAnswer: myAns,
            improvedAnswer: improvedAns,
            attachmentImageDataUrl,
            updatedAt: iso,
          }
        : prev,
    );
  }, [attachmentImageDataUrl, improvedAns, myAns, rec, id]);

  persistAnswersRef.current = persistAnswers;

  useLayoutEffect(() => {
    flushSnapshotRef.current = {
      routeId: id,
      recId: rec?.id ?? null,
      my: myAns,
      imp: improvedAns,
      img: attachmentImageDataUrl,
    };
  }, [attachmentImageDataUrl, id, rec?.id, myAns, improvedAns]);

  useEffect(() => {
    if (!rec || rec.id !== id) return;
    if (skipAutoSaveUntilHydratedRef.current !== id) {
      skipAutoSaveUntilHydratedRef.current = id;
      return;
    }
    const t = window.setTimeout(() => persistAnswersRef.current(), 450);
    return () => window.clearTimeout(t);
  }, [attachmentImageDataUrl, myAns, improvedAns, rec, id]);

  const writeSnapshotToStorage = useCallback(() => {
    const s = flushSnapshotRef.current;
    if (!s.recId || s.recId !== s.routeId) return;
    const iso = new Date().toISOString().slice(0, 10);
    const list = readAll();
    const next = list.map((x) =>
      x.id === s.recId
        ? {
            ...x,
            myAnswer: s.my,
            improvedAnswer: s.imp,
            ...(s.img ? { attachmentImageDataUrl: s.img } : { attachmentImageDataUrl: undefined }),
            updatedAt: iso,
          }
        : x,
    );
    writeAll(next);
  }, []);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") writeSnapshotToStorage();
    };
    const onPageHide = () => writeSnapshotToStorage();
    const onBeforeUnload = () => writeSnapshotToStorage();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [writeSnapshotToStorage]);

  useEffect(() => {
    return () => writeSnapshotToStorage();
  }, [writeSnapshotToStorage]);

  useEffect(() => {
    if (!imageLightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImageLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [imageLightboxOpen]);

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
              <div
                className="ielts-text-caption"
                style={{ fontWeight: 900, color: rec && isSwRecordWriting(rec.type) ? "var(--ielts-writing)" : "var(--ielts-speaking)" }}
              >
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
                persistAnswers();
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

            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}>
              {(
                [
                  { color: "blue" as const, label: "藍色", border: "rgba(47,111,237,0.85)", bg: "rgba(47,111,237,0.08)" },
                  { color: "yellow" as const, label: "黃色", border: "rgba(180,130,0,0.9)", bg: "rgba(234,179,8,0.14)" },
                  { color: "red" as const, label: "紅色", border: "rgba(220,70,70,0.95)", bg: "rgba(239,68,68,0.1)" },
                ] as const
              ).map(({ color, label, border, bg }) => (
                <button
                  key={color}
                  type="button"
                  className="ielts-btn"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: `2px solid ${border}`,
                    background: bg,
                    color: "var(--ielts-text-1)",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const el = mode === "my" ? myRef.current : improvedRef.current;
                    wrapHighlightContentEditable(el, color);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 14 }}>
              <input
                ref={attachmentInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f || !f.type.startsWith("image/")) return;
                  const dataUrl = await imageFileToCompressedDataUrl(f);
                  if (!dataUrl) {
                    window.alert("無法處理此圖片，請換一張較小的檔案。");
                    return;
                  }
                  setAttachmentImageDataUrl(dataUrl);
                }}
              />
              {attachmentImageDataUrl ? (
                <div
                  className="ielts-card-static"
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid var(--ielts-border-light)",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setImageLightboxOpen(true)}
                    aria-label="放大查看附圖"
                    style={{
                      padding: 0,
                      margin: 0,
                      border: "none",
                      background: "transparent",
                      width: "100%",
                      cursor: "zoom-in",
                      borderRadius: 8,
                      display: "block",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL 使用者附圖預覽 */}
                    <img
                      src={attachmentImageDataUrl}
                      alt=""
                      style={{ width: "100%", height: "auto", display: "block", borderRadius: 8, verticalAlign: "middle" }}
                    />
                  </button>
                  <div className="ielts-text-caption" style={{ marginTop: 6, color: "var(--ielts-text-3)", textAlign: "center" }}>
                    點擊圖片可放大檢視
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="ielts-btn"
                      onClick={() => attachmentInputRef.current?.click()}
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
                      更換圖片
                    </button>
                    <button
                      type="button"
                      className="ielts-btn"
                      onClick={() => setAttachmentImageDataUrl(undefined)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 10,
                        border: "1px solid var(--ielts-border-light)",
                        background: "var(--ielts-bg-hover)",
                        color: "var(--ielts-danger, #b91c1c)",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      移除圖片
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="ielts-btn"
                  onClick={() => attachmentInputRef.current?.click()}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px dashed var(--ielts-border-light)",
                    background: "var(--ielts-bg-hover)",
                    color: "var(--ielts-text-2)",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  上傳附圖（顯示在答案區上方）
                </button>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              {mode === "my" ? (
                <HighlightEditor
                  value={myAns}
                  onChange={setMyAns}
                  placeholder="在這裡寫「我的答案」…"
                  editorRef={myRef}
                  topMargin={0}
                />
              ) : (
                <HighlightEditor
                  value={improvedAns}
                  onChange={setImprovedAns}
                  placeholder="在這裡寫「進階版本」…"
                  editorRef={improvedRef}
                  topMargin={0}
                />
              )}
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
      {typeof document !== "undefined" &&
        imageLightboxOpen &&
        attachmentImageDataUrl &&
        createPortal(
          <div
            className="ielts-root"
            role="presentation"
            onClick={() => setImageLightboxOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              background: "rgba(0,0,0,0.9)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
            }}
          >
            <button
              type="button"
              className="ielts-btn"
              onClick={() => setImageLightboxOpen(false)}
              style={{
                position: "absolute",
                top: "max(12px, env(safe-area-inset-top))",
                right: "max(12px, env(safe-area-inset-right))",
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
                zIndex: 1,
              }}
            >
              關閉
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- lightbox 放大 data URL */}
            <img
              src={attachmentImageDataUrl}
              alt=""
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "100%",
                maxHeight: "min(92vh, 100%)",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                borderRadius: 10,
                cursor: "default",
              }}
            />
            <p className="ielts-text-caption" style={{ color: "rgba(255,255,255,0.65)", marginTop: 12, textAlign: "center" }}>
              點擊暗處或按 Esc 關閉
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}

