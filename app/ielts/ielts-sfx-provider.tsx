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
  const downRef = useRef<{
    id: number | null;
    x: number;
    y: number;
    moved: boolean;
    clickable: HTMLElement | null;
  }>({ id: null, x: 0, y: 0, moved: false, clickable: null });

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

      downRef.current = {
        id: typeof e.pointerId === "number" ? e.pointerId : null,
        x: e.clientX,
        y: e.clientY,
        moved: false,
        clickable,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      const d = downRef.current;
      if (!d.clickable) return;
      if (d.id !== null && typeof e.pointerId === "number" && e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 10) d.moved = true; // treat as scroll / drag
    };

    const onPointerUp = (e: PointerEvent) => {
      const d = downRef.current;
      const clickable = d.clickable;
      downRef.current = { id: null, x: 0, y: 0, moved: false, clickable: null };
      if (!clickable) return;
      if (d.id !== null && typeof e.pointerId === "number" && e.pointerId !== d.id) return;
      if (d.moved) return; // scrolling: don't play

      // Ensure the up happened on the same clickable element (avoid accidental sound)
      const upTarget = e.target as Element | null;
      const upClickable = isClickableEl(upTarget);
      if (!upClickable || upClickable !== clickable) return;

      const now = Date.now();
      if (now - lastRef.current < 70) return; // throttle
      lastRef.current = now;
      playIeltsClick();
    };

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("pointermove", onPointerMove, { capture: true });
    document.addEventListener("pointerup", onPointerUp, { capture: true });
    document.addEventListener("pointercancel", onPointerUp, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true } as unknown as boolean);
      document.removeEventListener("pointermove", onPointerMove, { capture: true } as unknown as boolean);
      document.removeEventListener("pointerup", onPointerUp, { capture: true } as unknown as boolean);
      document.removeEventListener("pointercancel", onPointerUp, { capture: true } as unknown as boolean);
    };
  }, []);

  return null;
}

