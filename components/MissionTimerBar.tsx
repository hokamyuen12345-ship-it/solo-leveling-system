"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  MISSION_TIMER_SESSION_KEY,
  SL_SKIP_BOOT_RETURN_MISSION_TIMER_V1,
  type MissionTimerSession,
  clearMissionTimerSession,
  writePendingExpire,
} from "@/lib/missionTimerSession";

function readSession(): MissionTimerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MISSION_TIMER_SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as MissionTimerSession;
    if (!p || typeof p.endTimeMs !== "number" || !p.quest?.label) return null;
    return p;
  } catch {
    return null;
  }
}

/** 在 /ielts（等子頁）頂部顯示：主系統任務背景倒數；「返回計時」略過 Boot 回首頁 */
export function MissionTimerBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [snap, setSnap] = useState<MissionTimerSession | null>(null);
  const [left, setLeft] = useState(0);

  const showOnIelts = pathname === "/ielts" || pathname?.startsWith("/ielts/");

  useEffect(() => {
    const open = showOnIelts && readSession() !== null;
    if (open) document.body.setAttribute("data-sl-mission-bar-open", "1");
    else document.body.removeAttribute("data-sl-mission-bar-open");
    return () => document.body.removeAttribute("data-sl-mission-bar-open");
  }, [showOnIelts, snap]);

  useEffect(() => {
    const tick = () => {
      const s = readSession();
      if (!s) {
        setSnap(null);
        return;
      }
      const sec = Math.max(0, Math.ceil((s.endTimeMs - Date.now()) / 1000));
      if (sec <= 0) {
        writePendingExpire(s.quest);
        clearMissionTimerSession();
        setSnap(null);
        try {
          sessionStorage.setItem(SL_SKIP_BOOT_RETURN_MISSION_TIMER_V1, "1");
        } catch {
          /* */
        }
        router.push("/");
        return;
      }
      setSnap(s);
      setLeft(sec);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [pathname, router]);

  if (!showOnIelts || !snap) return null;

  const mm = Math.floor(left / 60);
  const ss = left % 60;
  const label = snap.quest.label.length > 28 ? `${snap.quest.label.slice(0, 26)}…` : snap.quest.label;

  const goReturnTimer = () => {
    try {
      sessionStorage.setItem(SL_SKIP_BOOT_RETURN_MISSION_TIMER_V1, "1");
    } catch {
      /* */
    }
    router.push("/");
  };

  return (
    <div
      style={{
        position: "fixed",
        left: "max(10px, env(safe-area-inset-left))",
        right: "max(10px, env(safe-area-inset-right))",
        top: "max(10px, env(safe-area-inset-top))",
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid rgba(56,189,248,0.45)",
        background: "rgba(8,12,24,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
        fontFamily: "var(--font-system, ui-sans-serif, system-ui)",
      }}
    >
      <div style={{ flex: "1 1 140px", minWidth: 0 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "#38bdf8", fontWeight: 800, marginBottom: 4 }}>
          主系統任務 · 背景計時
        </div>
        <div style={{ fontSize: 12, color: "#E2E8F0", fontWeight: 600, lineHeight: 1.35 }}>{label}</div>
      </div>
      <div
        className="font-mono-num"
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: "#38bdf8",
          letterSpacing: "0.06em",
          flexShrink: 0,
        }}
      >
        {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
      </div>
      <button
        type="button"
        onClick={goReturnTimer}
        style={{
          flexShrink: 0,
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid rgba(56,189,248,0.55)",
          background: "rgba(56,189,248,0.15)",
          color: "#E0F2FE",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        返回計時
      </button>
    </div>
  );
}
