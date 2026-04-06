"use client";

import { useEffect, useRef } from "react";
import { playIeltsClick, prefetchIeltsClick, primeIeltsClick } from "./sfx";

function isClickableEl(t: Element | null): HTMLElement | null {
  if (!t) return null;
  const el = t.closest("button, [role=\"button\"], a, summary") as HTMLElement | null;
  if (!el) return null;
  // ignore disabled buttons
  if (el instanceof HTMLButtonElement && el.disabled) return null;
  // ignore text inputs / textarea / select clicks
  const tag = (t as HTMLElement).tagName?.toLowerCase?.() ?? "";
  if (tag === "input" || tag === "textarea" || tag === "select" || (t as HTMLElement).isContentEditable) return null;
  return el;
}

export function IeltsSfxProvider() {
  const lastRef = useRef(0);

  useEffect(() => {
    // prefetch mp3 early to reduce first-tap latency
    prefetchIeltsClick();

    const onPointerDown = (e: PointerEvent) => {
      // only primary button / touch
      if (typeof e.button === "number" && e.button !== 0) return;

      // prime mp3 decode inside gesture (iOS-friendly)
      primeIeltsClick();

      const target = e.target as Element | null;
      const clickable = isClickableEl(target);
      if (!clickable) return;

      const now = Date.now();
      if (now - lastRef.current < 70) return; // throttle
      lastRef.current = now;

      playIeltsClick();
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true } as unknown as boolean);
  }, []);

  return null;
}

