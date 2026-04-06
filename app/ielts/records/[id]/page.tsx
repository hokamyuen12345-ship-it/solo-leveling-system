"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { MutableRefObject, RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  flashcardCategoryIdForSwRecord,
  IELTS_SW_RECORDS_KEY,
  isSwRecordWriting,
  migrateSwRecords,
  useIELTSStore,
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

const HIGHLIGHT_BUTTON_SPECS = [
  { color: "blue" as const, label: "藍色", border: "rgba(47,111,237,0.85)", bg: "rgba(47,111,237,0.08)" },
  { color: "yellow" as const, label: "黃色", border: "rgba(180,130,0,0.9)", bg: "rgba(234,179,8,0.14)" },
  { color: "red" as const, label: "紅色", border: "rgba(220,70,70,0.95)", bg: "rgba(239,68,68,0.1)" },
] as const;

function highlightClassForColor(color: HighlightColor): string {
  return `ielts-hl-${color}`;
}

/**
 * 與 CSS 一致：藍色可為 .ielts-hl-blue，或僅 .ielts-hl-inline（舊資料、無黃／紅 class 時視為藍）。
 */
function markHasHighlightColor(mark: HTMLElement, color: HighlightColor): boolean {
  if (color === "yellow") return mark.classList.contains("ielts-hl-yellow");
  if (color === "red") return mark.classList.contains("ielts-hl-red");
  return (
    mark.classList.contains("ielts-hl-blue") ||
    (!mark.classList.contains("ielts-hl-yellow") && !mark.classList.contains("ielts-hl-red"))
  );
}

/** 自 root 往上找最近的標色 <mark> */
function enclosingHighlightMark(node: Node | null, root: HTMLElement): HTMLElement | null {
  let n: Node | null = node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      if (el.tagName === "MARK" && el.classList.contains("ielts-hl-inline")) return el;
    }
    n = n.parentNode;
  }
  return null;
}

function pruneEmptyHighlightMarks(root: HTMLElement): void {
  for (const m of [...root.querySelectorAll("mark.ielts-hl-inline")]) {
    if (m.childNodes.length === 0) m.remove();
  }
}

/** 跨越多段既有標色時 extractContents 會把 <mark> 包進新 mark，造成巢狀與 WebKit 選取異常；先展開成純文字／<br> */
function unwrapAllHighlightMarksInContainer(container: DocumentFragment | HTMLElement): void {
  let el: Element | null;
  while ((el = container.querySelector("mark.ielts-hl-inline"))) {
    const mark = el as HTMLElement;
    const parent = mark.parentNode;
    if (!parent) break;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  }
}

function marksSameHighlightStyle(a: HTMLElement, b: HTMLElement): boolean {
  const y = a.classList.contains("ielts-hl-yellow");
  const yr = b.classList.contains("ielts-hl-yellow");
  const r = a.classList.contains("ielts-hl-red");
  const rr = b.classList.contains("ielts-hl-red");
  if (y !== yr || r !== rr) return false;
  if (y || r) return true;
  const ab = a.classList.contains("ielts-hl-blue");
  const bb = b.classList.contains("ielts-hl-blue");
  return ab === bb;
}

/** 合併同式樣相鄰 <mark>，減少碎片 DOM、降低 iOS 選取失敗（多輪以處理 A+B+C 連鏈） */
function mergeAdjacentSameColorMarks(root: HTMLElement): void {
  let changed = true;
  while (changed) {
    changed = false;
    const marks = [...root.querySelectorAll("mark.ielts-hl-inline")] as HTMLElement[];
    for (const mark of marks) {
      if (!mark.parentNode || !root.contains(mark)) continue;
      let sib = mark.nextSibling;
      while (
        sib &&
        sib.nodeType === Node.ELEMENT_NODE &&
        (sib as HTMLElement).tagName === "MARK" &&
        (sib as HTMLElement).classList.contains("ielts-hl-inline") &&
        marksSameHighlightStyle(mark, sib as HTMLElement)
      ) {
        const sibEl = sib as HTMLElement;
        const next = sibEl.nextSibling;
        let ch: ChildNode | null;
        while ((ch = sibEl.firstChild)) mark.appendChild(ch);
        sibEl.remove();
        sib = next;
        changed = true;
      }
    }
  }
}

function rangeMatchesElementContents(range: Range, el: HTMLElement): boolean {
  const r = document.createRange();
  r.selectNodeContents(el);
  return (
    range.compareBoundaryPoints(Range.START_TO_START, r) === 0 && range.compareBoundaryPoints(Range.END_TO_END, r) === 0
  );
}

/** 部分 WebKit 選取邊界與 selectNodeContents 不完全一致時，用字串比對整段 mark 內文 */
function rangeCoversEntireMarkText(range: Range, mark: HTMLElement): boolean {
  const inner = document.createRange();
  inner.selectNodeContents(mark);
  const a = range.toString();
  const b = inner.toString();
  return a.length > 0 && a === b;
}

function restoreSelectionAroundNodes(sel: Selection, first: ChildNode | null, last: ChildNode | null): void {
  if (!first || !last) return;
  sel.removeAllRanges();
  const nr = document.createRange();
  try {
    if (first === last && first.nodeType === Node.TEXT_NODE) {
      const t = first as Text;
      nr.setStart(t, 0);
      nr.setEnd(t, t.length);
    } else {
      nr.setStartBefore(first);
      nr.setEndAfter(last);
    }
    sel.addRange(nr);
  } catch {
    /* */
  }
}

function resolveHighlightRange(
  root: HTMLElement,
  saved: Range | null | undefined,
): Range | null {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if (
      !r.collapsed &&
      root.contains(r.startContainer) &&
      root.contains(r.endContainer)
    ) {
      return r.cloneRange();
    }
  }
  if (saved && !saved.collapsed) {
    try {
      const c = saved.cloneRange();
      if (root.contains(c.startContainer) && root.contains(c.endContainer)) return c;
    } catch {
      /* detached */
    }
  }
  return null;
}

/**
 * 若選取完全落在「同一顆」且與點選顏色相同的 <mark> 內，則取消該段標色（再點同色即還原為一般文字）。
 * 否則為該選取套上該色標記。
 * syncFromDom：變更後必須同步寫入 React state，否則 useLayoutEffect 會用舊 value 覆蓋 DOM（僅 dispatch input 在 React 18 常不可靠）。
 * onRedWrapped：僅在「新套上」紅色標記成功後呼叫，傳入純文字（供加入字卡）。
 * savedSelectionRange：iOS 等環境點工具列時選取常被清掉，可傳入 selectionchange 備份的 Range。
 */
function wrapHighlightContentEditable(
  root: HTMLElement | null,
  color: HighlightColor,
  syncFromDom: (serialized: string) => void,
  options?: {
    onRedWrapped?: (plainText: string) => void;
    savedSelectionRange?: Range | null;
    clearSavedSelection?: () => void;
  },
): void {
  if (!root) return;
  const range = resolveHighlightRange(root, options?.savedSelectionRange ?? null);
  if (!range || range.collapsed) return;

  const sel = window.getSelection();
  const cls = highlightClassForColor(color);
  const markStart = enclosingHighlightMark(range.startContainer, root);
  const markEnd = enclosingHighlightMark(range.endContainer, root);

  try {
    if (
      markStart &&
      markStart === markEnd &&
      markHasHighlightColor(markStart, color) &&
      markStart.contains(range.startContainer) &&
      markStart.contains(range.endContainer)
    ) {
      if (rangeMatchesElementContents(range, markStart) || rangeCoversEntireMarkText(range, markStart)) {
        const parent = markStart.parentNode;
        if (parent) {
          const first = markStart.firstChild;
          const last = markStart.lastChild;
          while (markStart.firstChild) parent.insertBefore(markStart.firstChild, markStart);
          parent.removeChild(markStart);
          if (sel) restoreSelectionAroundNodes(sel, first, last);
        }
      } else {
        const r = range.cloneRange();
        const frag = r.extractContents();
        unwrapAllHighlightMarksInContainer(frag);
        const first = frag.firstChild;
        const last = frag.lastChild;
        r.insertNode(frag);
        if (sel) restoreSelectionAroundNodes(sel, first, last);
      }
      pruneEmptyHighlightMarks(root);
      mergeAdjacentSameColorMarks(root);
      root.normalize();
      options?.clearSavedSelection?.();
    } else {
      const mark = document.createElement("mark");
      mark.className = `ielts-hl-inline ${cls}`;
      const frag = range.extractContents();
      unwrapAllHighlightMarksInContainer(frag);
      mark.appendChild(frag);
      range.insertNode(mark);
      if (sel) {
        sel.removeAllRanges();
        const nr = document.createRange();
        nr.selectNodeContents(mark);
        nr.collapse(false);
        sel.addRange(nr);
      }
      if (color === "red") {
        const plain = mark.textContent?.replace(/\s+/g, " ").trim() ?? "";
        if (plain) options?.onRedWrapped?.(plain);
      }
      pruneEmptyHighlightMarks(root);
      mergeAdjacentSameColorMarks(root);
      root.normalize();
      options?.clearSavedSelection?.();
    }
  } catch {
    /* 選取跨越不可切節點時略過 */
  }

  const serialized = serializeHighlightRoot(root);
  syncFromDom(serialized);
  root.setAttribute("data-empty", serialized ? "false" : "true");
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
  onFocusChange,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  editorRef: RefObject<HTMLDivElement | null> | MutableRefObject<HTMLDivElement | null>;
  topMargin?: number;
  onFocusChange?: (focused: boolean) => void;
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
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
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
    try {
      sessionStorage.setItem("ielts_records_edited_v1", "1");
    } catch {
      /* */
    }
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
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [answerEditorFocused, setAnswerEditorFocused] = useState(false);
  const [hlToolbarBottomPx, setHlToolbarBottomPx] = useState(0);

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
  const answerBlurTimerRef = useRef<number | null>(null);
  /** iOS：點顏色按鈕時 contenteditable 常先失焦並清空 getSelection，改以 selectionchange 備份還原 */
  const savedHighlightRangeRef = useRef<Range | null>(null);

  const { ready: ieltsReady, settings, flashcards, addFlashcard } = useIELTSStore();

  useEffect(() => {
    if (!answerEditorFocused) {
      savedHighlightRangeRef.current = null;
      return;
    }
    const ed = mode === "my" ? myRef.current : improvedRef.current;
    if (!ed) return;

    const onSelectionChange = () => {
      const s = window.getSelection();
      if (!s || s.rangeCount === 0) return;
      const r = s.getRangeAt(0);
      if (r.collapsed) return;
      if (!ed.contains(r.startContainer) || !ed.contains(r.endContainer)) return;
      try {
        savedHighlightRangeRef.current = r.cloneRange();
      } catch {
        /* */
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [answerEditorFocused, mode]);

  useEffect(() => {
    if (!imageLightboxOpen) return;
    setLightboxZoom(1);
  }, [imageLightboxOpen]);

  const runHighlight = useCallback(
    (color: HighlightColor, refocusEditor?: boolean) => {
      const el = mode === "my" ? myRef.current : improvedRef.current;
      if (!el) return;
      const sync = (serialized: string) => {
        if (mode === "my") setMyAns(serialized);
        else setImprovedAns(serialized);
      };
      const wrapOpts: Parameters<typeof wrapHighlightContentEditable>[3] = {
        savedSelectionRange: savedHighlightRangeRef.current,
        clearSavedSelection: () => {
          savedHighlightRangeRef.current = null;
        },
      };
      if (color === "red" && rec && ieltsReady) {
        wrapOpts.onRedWrapped = (plain: string) => {
          if (!rec) return;
          const cat = flashcardCategoryIdForSwRecord(settings.flashcardCategories, rec.type);
          const word = plain.replace(/\s+/g, " ").trim();
          if (!word) return;
          const low = word.toLowerCase();
          if (flashcards.some((c) => c.category === cat && c.word.trim().toLowerCase() === low)) return;
          addFlashcard({ word, meaning: "", category: cat, example: undefined });
        };
      }
      wrapHighlightContentEditable(el, color, sync, wrapOpts);
      if (refocusEditor) el.focus();
    },
    [mode, rec, ieltsReady, settings.flashcardCategories, flashcards, addFlashcard],
  );

  const onAnswerFocusChange = useCallback((focused: boolean) => {
    if (focused) {
      if (answerBlurTimerRef.current) {
        clearTimeout(answerBlurTimerRef.current);
        answerBlurTimerRef.current = null;
      }
      setAnswerEditorFocused(true);
      return;
    }
    answerBlurTimerRef.current = window.setTimeout(() => {
      setAnswerEditorFocused(false);
      answerBlurTimerRef.current = null;
    }, 200);
  }, []);

  const cancelAnswerBlurTimer = useCallback(() => {
    if (answerBlurTimerRef.current) {
      clearTimeout(answerBlurTimerRef.current);
      answerBlurTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (answerBlurTimerRef.current) clearTimeout(answerBlurTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!answerEditorFocused || typeof window === "undefined") {
      setHlToolbarBottomPx(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const obscured = window.innerHeight - (vv.offsetTop + vv.height);
      setHlToolbarBottomPx(Math.max(0, Math.round(obscured)));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [answerEditorFocused]);

  useEffect(() => {
    setLoaded(true);
    const tryLoad = () => {
      const r = readAll().find((x) => x.id === id) ?? null;
      if (r) {
        setRec(r);
        setMyAns(r.myAnswer ?? "");
        setImprovedAns(r.improvedAnswer ?? "");
        setAttachmentImageDataUrl(r.attachmentImageDataUrl);
        // Mark hydrated immediately so the first user edit will autosave.
        skipAutoSaveUntilHydratedRef.current = id;
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
                  onFocusChange={onAnswerFocusChange}
                />
              ) : (
                <HighlightEditor
                  value={improvedAns}
                  onChange={setImprovedAns}
                  placeholder="在這裡寫「進階版本」…"
                  editorRef={improvedRef}
                  topMargin={0}
                  onFocusChange={onAnswerFocusChange}
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
        answerEditorFocused &&
        rec &&
        createPortal(
          <div
            className="ielts-root ielts-highlight-toolbar-float"
            role="toolbar"
            aria-label="標示選取文字顏色"
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: hlToolbarBottomPx,
              zIndex: 9990,
              boxSizing: "border-box",
              /* 覆蓋 .ielts-root 的 min-height:100dvh，否則 flex 子項會被拉成滿版直條 */
              minHeight: "unset",
              height: "auto",
              padding: "10px 12px calc(10px + env(safe-area-inset-bottom, 0px))",
              background: "var(--ielts-bg-surface)",
              borderTop: "1px solid var(--ielts-border-light)",
              boxShadow: "0 -8px 28px rgba(0,0,0,0.1)",
              display: "flex",
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
            onMouseDown={cancelAnswerBlurTimer}
          >
            {HIGHLIGHT_BUTTON_SPECS.map(({ color, label, border, bg }) => (
              <button
                key={color}
                type="button"
                className="ielts-btn"
                style={{
                  flex: "0 0 auto",
                  alignSelf: "center",
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: `2px solid ${border}`,
                  background: bg,
                  color: "var(--ielts-text-1)",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  touchAction: "manipulation",
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  cancelAnswerBlurTimer();
                }}
                onClick={() => runHighlight(color, true)}
              >
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )}
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
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: "max(12px, env(safe-area-inset-top))",
                left: "max(12px, env(safe-area-inset-left))",
                display: "flex",
                gap: 8,
                zIndex: 1,
              }}
            >
              <button
                type="button"
                className="ielts-btn"
                onClick={() => setLightboxZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 14,
                  cursor: "pointer",
                }}
                aria-label="縮小圖片"
              >
                −
              </button>
              <button
                type="button"
                className="ielts-btn"
                onClick={() => setLightboxZoom(1)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                }}
                aria-label="重設縮放"
              >
                100%
              </button>
              <button
                type="button"
                className="ielts-btn"
                onClick={() => setLightboxZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.35)",
                  background: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 14,
                  cursor: "pointer",
                }}
                aria-label="放大圖片"
              >
                ＋
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- lightbox 放大 data URL */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "100%",
                maxHeight: "min(92vh, 100%)",
                overflow: "auto",
                borderRadius: 10,
                WebkitOverflowScrolling: "touch",
              }}
            >
              <img
                src={attachmentImageDataUrl}
                alt=""
                style={{
                  maxWidth: "100%",
                  maxHeight: "min(92vh, 100%)",
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  borderRadius: 10,
                  cursor: "default",
                  transform: `scale(${lightboxZoom})`,
                  transformOrigin: "center center",
                  transition: "transform 0.12s ease",
                  display: "block",
                  margin: "0 auto",
                }}
              />
            </div>
            <p className="ielts-text-caption" style={{ color: "rgba(255,255,255,0.65)", marginTop: 12, textAlign: "center" }}>
              點擊暗處或按 Esc 關閉
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}

