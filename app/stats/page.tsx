"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { expBarFromTotal, levelFromTotalExp } from "@/lib/leveling";

// ===== 型別與共用工具 =====
type AttrKey = "PHY" | "INT" | "EXE" | "RES" | "SOC";
type QuestType = "daily" | "challenge" | "hidden";

interface Quest {
  id: number;
  type: QuestType;
  label: string;
  exp: number;
  attr: AttrKey;
  minutes: number;
}

interface MissionHistoryEntry {
  id: string;           // unique id
  missionId: number;    // 對應 Quest id
  label: string;
  type: QuestType;
  attr: AttrKey;
  durationMin: number;
  completed: boolean;
  date: string;         // YYYY-MM-DD
  finishedAt: string;   // ISO string
  expGained: number;
}

const HISTORY_KEY = "slq_history_v1";

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
}

function appendMissionHistory(entry: MissionHistoryEntry) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list: MissionHistoryEntry[] = raw ? JSON.parse(raw) : [];
    list.push(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // 寫入失敗就略過，不影響主流程
  }
}

const RANK_CONFIG: Record<string, {color: string, glow: string, bg: string, next: string}> = {
  "E": { color: "#888888", glow: "rgba(136,136,136,0.3)", bg: "#1a1a1a", next: "D-RANK at Lv.11" },
  "D": { color: "#A0784A", glow: "rgba(160,120,74,0.3)",  bg: "#1a1a14", next: "C-RANK at Lv.21" },
  "C": { color: "#4A9A8A", glow: "rgba(74,154,138,0.3)",  bg: "#0d1a1a", next: "B-RANK at Lv.36" },
  "B": { color: "#3A7AD4", glow: "rgba(58,122,212,0.3)",  bg: "#0d0d1a", next: "A-RANK at Lv.51" },
  "A": { color: "#9B3DD4", glow: "rgba(155,61,212,0.3)",  bg: "#1a0d1a", next: "S-RANK at Lv.71" },
  "S": { color: "#F0C030", glow: "rgba(240,192,48,0.4)",  bg: "#1a1400", next: "MAX RANK" },
};

const ATTRIBUTES = [
  { key: "PHY", label: "體能",   desc: "Physical",     stat: "STR" },
  { key: "INT", label: "學習",   desc: "Intelligence", stat: "INT" },
  { key: "EXE", label: "執行力", desc: "Execution",    stat: "STR" },
  { key: "RES", label: "抗壓力", desc: "Resilience",   stat: "VIT" },
  { key: "SOC", label: "社交",   desc: "Social",       stat: "AGI" },
];

const QUESTS: Quest[] = [
  { id: 1, type: "daily",     label: "運動 30 分鐘",   exp: 20, attr: "PHY", minutes: 30 },
  { id: 2, type: "daily",     label: "閱讀 30 分鐘",   exp: 15, attr: "INT", minutes: 30 },
  { id: 3, type: "daily",     label: "冥想或反思",     exp: 10, attr: "RES", minutes: 10 },
  { id: 4, type: "challenge", label: "完成重要工作",   exp: 40, attr: "EXE", minutes: 60 },
  { id: 5, type: "challenge", label: "學習新技能",     exp: 25, attr: "INT", minutes: 45 },
  { id: 6, type: "challenge", label: "主動與人交流",   exp: 20, attr: "SOC", minutes: 20 },
  { id: 7, type: "hidden",    label: "幫助一個陌生人", exp: 30, attr: "RES", minutes: 15 },
];

const DEBUFFS = [
  { id: 8,  label: "浪費時間滑手機", exp: -10 },
  { id: 9,  label: "熬夜破壞作息",   exp: -10 },
  { id: 10, label: "情緒失控",       exp: -5  },
  { id: 11, label: "拖延重要事情",   exp: -15 },
];

const BASE_EXP = 700;
const BASE_ATTRS: Record<AttrKey,number> = { PHY:0, INT:0, EXE:0, RES:0, SOC:0 };

function getRank(lv: number) {
  if (lv >= 71) return "S";
  if (lv >= 51) return "A";
  if (lv >= 36) return "B";
  if (lv >= 21) return "C";
  if (lv >= 11) return "D";
  return "E";
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function getStreakTitle(streak: number): string {
  if (streak >= 30) return "UNBREAKABLE";
  if (streak >= 14) return "UNSTOPPABLE";
  if (streak >= 7)  return "IRON WILL";
  if (streak >= 3)  return "DISCIPLINE INITIATE";
  return "BEGINNER";
}

function getStreakColor(streak: number): string {
  if (streak >= 30) return "#F0C030";
  if (streak >= 14) return "#9B3DD4";
  if (streak >= 7)  return "#3A7AD4";
  if (streak >= 3)  return "#2ECC71";
  return "#3A5070";
}

function pad(n: number) { return String(n).padStart(2, "0"); }

function CountUp({ target, duration = 1200, color, suffix = "" }:
  { target: number, duration?: number, color: string, suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * ease));
      if (p < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [target, duration]);
  return <span style={{ color, fontWeight: 700 }}>{display}{suffix}</span>;
}

function Particles({ color }: { color: string }) {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    size: 1 + Math.random() * 2, duration: 4 + Math.random() * 6, delay: Math.random() * 4,
  }));
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
          width: `${p.size}px`, height: `${p.size}px`,
          borderRadius: "50%", background: color, opacity: 0.4,
          animation: `float${p.id % 3} ${p.duration}s ${p.delay}s ease-in-out infinite`,
        }}/>
      ))}
    </div>
  );
}

function GlowCard({ children, color, style = {} }:
  { children: React.ReactNode, color: string, style?: React.CSSProperties }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: "10px", padding: "20px",
        background: "linear-gradient(160deg,#0a0f1a,#050810)",
        border: `1px solid ${hovered ? color + "66" : color + "22"}`,
        boxShadow: hovered ? `0 0 30px ${color}33, inset 0 0 20px ${color}08` : "none",
        transition: "all 0.3s ease", position: "relative", overflow: "hidden", ...style,
      }}>
      {hovered && <Particles color={color} />}
      <div style={{
        position: "absolute", top: 0, left: "-100%", right: 0, height: "1px",
        background: `linear-gradient(90deg, transparent, ${color}44, transparent)`,
        animation: hovered ? "scanCard 1.5s linear infinite" : "none",
      }}/>
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

interface TimerProps {
  quest: typeof QUESTS[0];
  rankColor: string;
  rankGlow: string;
  onComplete: () => void;
  onCancel: () => void;
}

function MissionTimer({ quest, rankColor, rankGlow, onComplete, onCancel }: TimerProps) {
  const [totalSecs, setTotalSecs] = useState(quest.minutes * 60);
  const [remaining, setRemaining] = useState(quest.minutes * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [customMin, setCustomMin] = useState(String(quest.minutes));
  const [editing, setEditing] = useState(false);
  const savedRef  = useRef<number>(quest.minutes * 60);
  const startRef  = useRef<number>(0);
  const rafRef    = useRef<number>(0);
  const visibleAt = useRef<number>(0);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        visibleAt.current = Date.now();
      } else {
        if (running && visibleAt.current > 0) {
          const elapsed = Math.floor((Date.now() - visibleAt.current) / 1000);
          savedRef.current = Math.max(0, savedRef.current - elapsed);
          setRemaining(savedRef.current);
          visibleAt.current = 0;
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running]);

  useEffect(() => {
    if (!running) { cancelAnimationFrame(rafRef.current); return; }
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = Math.floor((performance.now() - startRef.current) / 1000);
      const left = Math.max(0, savedRef.current - elapsed);
      setRemaining(left);
      if (left <= 0) { setFinished(true); setRunning(false); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const pct = totalSecs > 0 ? ((totalSecs - remaining) / totalSecs) * 100 : 100;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  function handleStart() { savedRef.current = remaining; setRunning(true); }
  function handlePause() { savedRef.current = remaining; setRunning(false); }
  function handleApplyCustom() {
    const m = Math.max(1, Math.min(180, parseInt(customMin) || quest.minutes));
    const s = m * 60;
    setTotalSecs(s); setRemaining(s); savedRef.current = s;
    setEditing(false); setRunning(false);
  }

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      background:"rgba(2,4,12,0.97)",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'SF Mono','Courier New',monospace",
    }}>
      <style>{`
        @keyframes timerPulse{0%,100%{box-shadow:0 0 40px ${rankColor}44}50%{box-shadow:0 0 80px ${rankColor}88}}
        @keyframes completePop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
        @keyframes expFly{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-120px) scale(0.5)}}
      `}</style>

      {!finished ? (
        <>
          <div style={{color:rankColor,fontSize:"0.65rem",letterSpacing:"6px",marginBottom:"8px",opacity:0.7}}>
            MISSION IN PROGRESS
          </div>
          <div style={{color:"#C0D4E8",fontSize:"1rem",letterSpacing:"2px",
            marginBottom:"48px",textAlign:"center",maxWidth:"320px"}}>
            {quest.label}
          </div>
          <div style={{position:"relative",width:"220px",height:"220px",marginBottom:"40px"}}>
            <svg width="220" height="220" style={{position:"absolute",top:0,left:0}}>
              <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"/>
              <circle cx="110" cy="110" r="100" fill="none" stroke={rankColor} strokeWidth="8"
                strokeDasharray={`${2*Math.PI*100}`}
                strokeDashoffset={`${2*Math.PI*100*(1-pct/100)}`}
                strokeLinecap="round"
                style={{transform:"rotate(-90deg)",transformOrigin:"110px 110px",
                  transition:"stroke-dashoffset 0.5s ease",
                  filter:`drop-shadow(0 0 8px ${rankColor})`}}/>
            </svg>
            <div style={{position:"absolute",inset:"-12px",borderRadius:"50%",
              border:`1px solid ${rankColor}22`,borderTop:`1px solid ${rankColor}66`,
              animation:running?"ringRotate 3s linear infinite":"none"}}/>
            <div style={{position:"absolute",inset:0,display:"flex",
              flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{color:rankColor,fontSize:"3.5rem",fontWeight:"700",lineHeight:1,
                textShadow:`0 0 30px ${rankColor}`,
                animation:running?"timerPulse 2s ease-in-out infinite":"none"}}>
                {pad(mins)}:{pad(secs)}
              </div>
              <div style={{color:"#3A5070",fontSize:"0.55rem",letterSpacing:"3px",marginTop:"8px"}}>
                {running?"RUNNING":remaining===totalSecs?"READY":"PAUSED"}
              </div>
            </div>
          </div>

          {!running && (
            <div style={{marginBottom:"24px",display:"flex",alignItems:"center",gap:"8px"}}>
              {editing ? (
                <>
                  <input type="number" min="1" max="180" value={customMin}
                    onChange={e=>setCustomMin(e.target.value)}
                    style={{background:"rgba(58,122,212,0.1)",border:"1px solid rgba(58,122,212,0.4)",
                      borderRadius:"4px",padding:"4px 10px",color:"#7AC0F4",
                      fontFamily:"inherit",fontSize:"0.8rem",width:"70px",textAlign:"center"}}/>
                  <span style={{color:"#7A9ABB",fontSize:"0.7rem"}}>分鐘</span>
                  <button onClick={handleApplyCustom} style={{
                    background:"rgba(58,122,212,0.2)",border:"1px solid rgba(58,122,212,0.4)",
                    borderRadius:"4px",padding:"4px 12px",color:"#7AC0F4",
                    fontSize:"0.65rem",cursor:"pointer",fontFamily:"inherit"}}>確認</button>
                </>
              ) : (
                <button onClick={()=>setEditing(true)} style={{
                  background:"transparent",border:"1px solid rgba(255,255,255,0.1)",
                  borderRadius:"4px",padding:"4px 14px",color:"#3A5070",
                  fontSize:"0.6rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:"1px"}}>
                  ✏️ 修改時間（預設 {quest.minutes} 分鐘）
                </button>
              )}
            </div>
          )}

          <div style={{display:"flex",gap:"16px"}}>
            {!running ? (
              <button onClick={handleStart} style={{
                background:`linear-gradient(135deg,${rankColor}33,${rankColor}11)`,
                border:`1px solid ${rankColor}`,borderRadius:"8px",padding:"12px 40px",
                color:rankColor,fontSize:"0.8rem",fontWeight:"700",letterSpacing:"4px",
                cursor:"pointer",fontFamily:"inherit",boxShadow:`0 0 20px ${rankColor}44`,
                transition:"all 0.2s"}}>
                {remaining===totalSecs?"▶ START MISSION":"▶ RESUME"}
              </button>
            ) : (
              <button onClick={handlePause} style={{
                background:"rgba(58,122,212,0.15)",border:"1px solid rgba(58,122,212,0.4)",
                borderRadius:"8px",padding:"12px 40px",color:"#7AC0F4",fontSize:"0.8rem",
                fontWeight:"700",letterSpacing:"4px",cursor:"pointer",fontFamily:"inherit"}}>
                ⏸ PAUSE
              </button>
            )}
            <button onClick={onCancel} style={{
              background:"rgba(231,76,60,0.1)",border:"1px solid rgba(231,76,60,0.3)",
              borderRadius:"8px",padding:"12px 24px",color:"#E74C3C",fontSize:"0.8rem",
              letterSpacing:"2px",cursor:"pointer",fontFamily:"inherit"}}>
              ✕ CANCEL
            </button>
          </div>

          <div style={{marginTop:"32px",color:"#3A5070",fontSize:"0.6rem",letterSpacing:"2px"}}>
            REWARD: <span style={{color:"#2ECC71"}}>+{quest.exp} EXP</span>
            &nbsp;·&nbsp;<span style={{color:"#7A9ABB"}}>{quest.attr} +3</span>
          </div>
        </>
      ) : (
        <div style={{textAlign:"center",animation:"completePop 0.6s ease forwards"}}>
          {[...Array(12)].map((_,i) => (
            <div key={i} style={{
              position:"absolute",left:`${30+Math.random()*40}%`,top:`${30+Math.random()*40}%`,
              color:"#2ECC71",fontSize:`${0.8+Math.random()*0.8}rem`,fontWeight:"700",
              animation:"expFly 1.5s ease forwards",animationDelay:`${Math.random()*0.8}s`,
              pointerEvents:"none",
            }}>+EXP</div>
          ))}
          <div style={{fontSize:"0.7rem",color:rankColor,letterSpacing:"8px",marginBottom:"24px"}}>
            ── SYSTEM MESSAGE ──
          </div>
          <div style={{fontSize:"2.5rem",fontWeight:"700",color:"#2ECC71",
            textShadow:"0 0 40px #2ECC71, 0 0 80px rgba(46,204,113,0.4)",
            letterSpacing:"4px",marginBottom:"16px"}}>
            MISSION COMPLETE
          </div>
          <div style={{fontSize:"1rem",color:"#C0D4E8",marginBottom:"8px",letterSpacing:"2px"}}>
            {quest.label}
          </div>
          <div style={{display:"flex",gap:"24px",justifyContent:"center",
            marginBottom:"40px",marginTop:"16px"}}>
            <div style={{textAlign:"center"}}>
              <div style={{color:"#2ECC71",fontSize:"1.5rem",fontWeight:"700"}}>+{quest.exp}</div>
              <div style={{color:"#3A5070",fontSize:"0.55rem",letterSpacing:"2px"}}>EXP</div>
            </div>
            <div style={{width:"1px",background:"rgba(255,255,255,0.1)"}}/>
            <div style={{textAlign:"center"}}>
              <div style={{color:rankColor,fontSize:"1.5rem",fontWeight:"700"}}>+3</div>
              <div style={{color:"#3A5070",fontSize:"0.55rem",letterSpacing:"2px"}}>{quest.attr}</div>
            </div>
          </div>
          <button onClick={onComplete} style={{
            background:"linear-gradient(135deg,rgba(46,204,113,0.3),rgba(46,204,113,0.1))",
            border:"1px solid #2ECC71",borderRadius:"8px",padding:"14px 48px",
            color:"#2ECC71",fontSize:"0.8rem",fontWeight:"700",letterSpacing:"4px",
            cursor:"pointer",fontFamily:"inherit",boxShadow:"0 0 24px rgba(46,204,113,0.4)"}}>
            CLAIM REWARD
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [completed, setCompleted] = useState<number[]>([]);
  const [debuffs,   setDebuffs]   = useState<number[]>([]);
  const [totalExp,  setTotalExp]  = useState(BASE_EXP);
  const [streak,    setStreak]    = useState(0);
  const [tab, setTab]             = useState<"tasks"|"summary">("tasks");
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpRange, setLevelUpRange] = useState<{ from: number; to: number } | null>(null);
  const [loaded, setLoaded]       = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTimer, setActiveTimer] = useState<typeof QUESTS[0] | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const today = getToday();
    const yesterday = getYesterday();
    const saved = localStorage.getItem("slq_v2");
    if (saved) {
      const d = JSON.parse(saved);
      const savedTotal   = d.totalExp   ?? BASE_EXP;
      const savedStreak  = d.streak     ?? 0;
      const savedLast    = d.lastReset  ?? "";
      const savedComp    = d.completed  ?? [];
      if (d.lastReset !== today) {
        setTotalExp(savedTotal);
        setCompleted([]);
        setDebuffs([]);
        // Streak 計算
        if (savedLast === yesterday && savedComp.length > 0) {
          setStreak(savedStreak); // 昨天有完成，保持
        } else {
          setStreak(0); // 斷了
        }
      } else {
        setTotalExp(savedTotal);
        setCompleted(savedComp);
        setDebuffs(d.debuffs ?? []);
        setStreak(savedStreak);
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const today = getToday();
    const todayGain = QUESTS.filter(q=>completed.includes(q.id)).reduce((s,q)=>s+q.exp,0)
      + DEBUFFS.filter(d=>debuffs.includes(d.id)).reduce((s,d)=>s+d.exp,0);
    const newTotal = Math.max(0, BASE_EXP + todayGain);
    setTotalExp(newTotal);
    // Streak: 今天有完成至少1個任務就+1（只在第一次完成時更新）
    const newStreak = completed.length > 0 ? Math.max(streak, 1) : streak;
    localStorage.setItem("slq_v2", JSON.stringify({
      totalExp: newTotal, completed, debuffs, lastReset: today, streak: newStreak,
    }));
  }, [completed, debuffs, loaded]);

  const todayExp = QUESTS.filter(q=>completed.includes(q.id)).reduce((s,q)=>s+q.exp,0)
    + DEBUFFS.filter(d=>debuffs.includes(d.id)).reduce((s,d)=>s+d.exp,0);
  const currentExp = Math.max(0, BASE_EXP + todayExp);
  const { level, lvExp, nextExp, expPct } = expBarFromTotal(currentExp);
  const rank = getRank(level);
  const rc = RANK_CONFIG[rank];

  const attrs = Object.entries(BASE_ATTRS).map(([k,v]) => {
    const bonus = QUESTS.filter(q=>completed.includes(q.id) && q.attr===k).length * 3;
    return { ...ATTRIBUTES.find(a=>a.key===k)!, value: Math.min(100, v+bonus) };
  });

  function handleTimerComplete() {
    if (!activeTimer) return;
    const q = activeTimer;
    setActiveTimer(null);
    const next = [...completed, q.id];
    setCompleted(next);
    // Update streak
    const newStreak = streak === 0 ? 1 : streak;
    setStreak(newStreak);
    const nx = BASE_EXP + QUESTS.filter(x=>next.includes(x.id)).reduce((s,x)=>s+x.exp,0)
      + DEBUFFS.filter(d=>debuffs.includes(d.id)).reduce((s,d)=>s+d.exp,0);
    const newLv = levelFromTotalExp(nx);
    if (newLv > level)
      setTimeout(() => {
        setLevelUpRange({ from: level, to: newLv });
        setShowLevelUp(true);
        setTimeout(() => {
          setShowLevelUp(false);
          setLevelUpRange(null);
        }, 3000);
      }, 100);

    // 寫入任務歷史紀錄（完成）
    appendMissionHistory({
      id: `${Date.now()}-${q.id}`,
      missionId: q.id,
      label: q.label,
      type: q.type,
      attr: q.attr,
      durationMin: q.minutes,
      completed: true,
      date: getToday(),
      finishedAt: new Date().toISOString(),
      expGained: q.exp,
    });
  }

  function toggle(id: number) {
    const was = completed.includes(id);
    if (was) {
      setCompleted(completed.filter(x=>x!==id));
    } else {
      const q = QUESTS.find(x=>x.id===id)!;
      setActiveTimer(q);
    }
  }

  if (!loaded) return (
    <main style={{background:"#050810",minHeight:"100vh",display:"flex",alignItems:"center",
      justifyContent:"center",fontFamily:"'SF Mono',monospace",color:"#5A7A9A"}}>
      SYSTEM LOADING...
    </main>
  );

  return (
    <main style={{background:"#050810",minHeight:"100vh",
      fontFamily:"'SF Mono','Courier New',monospace",padding:"24px"}}>

      <audio ref={audioRef} src="/bgm.mp3" loop preload="auto" style={{display:"none"}}/>

      {activeTimer && (
        <MissionTimer quest={activeTimer} rankColor={rc.color} rankGlow={rc.glow}
          onComplete={handleTimerComplete} onCancel={()=>setActiveTimer(null)}/>
      )}

      <style>{`
        @keyframes scanH{0%{transform:translateY(-100%)}100%{transform:translateY(800px)}}
        @keyframes scanCard{0%{left:-100%}100%{left:200%}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes lvUp{0%{opacity:0;transform:translate(-50%,-50%) scale(0.5)}40%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.1)}}
        @keyframes bgPulse{0%{opacity:0}20%{opacity:1}80%{opacity:1}100%{opacity:0}}
        @keyframes particle{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-100px) scale(0)}}
        @keyframes glowPulse{0%,100%{opacity:0.6}50%{opacity:1}}
        @keyframes float0{0%,100%{transform:translate(0,0)}50%{transform:translate(3px,-8px)}}
        @keyframes float1{0%,100%{transform:translate(0,0)}50%{transform:translate(-4px,-6px)}}
        @keyframes float2{0%,100%{transform:translate(0,0)}50%{transform:translate(2px,-10px)}}
        @keyframes ringRotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes streakGlow{0%,100%{opacity:0.7}50%{opacity:1}}
        .scan{position:absolute;top:0;left:0;right:0;height:2px;
          background:linear-gradient(transparent,rgba(58,122,212,0.15),transparent);
          animation:scanH 6s linear infinite;pointer-events:none}
        .fade-in{animation:fadeUp 0.6s ease forwards}
        .task-row{transition:all 0.2s;border-radius:6px;cursor:pointer}
        .task-row:hover{background:rgba(58,122,212,0.08)!important;box-shadow:0 0 12px rgba(58,122,212,0.1)}
        .nav-link{transition:all 0.2s;opacity:0.7}
        .nav-link:hover{opacity:1}
        .start-btn:hover{transform:scale(1.05);filter:brightness(1.2)}
      `}</style>

      {showLevelUp && (
        <div style={{position:"fixed",inset:0,zIndex:100,pointerEvents:"none",overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,
            background:`radial-gradient(circle at center, ${rc.glow} 0%, transparent 60%)`,
            animation:"bgPulse 3s ease forwards"}}/>
          {[...Array(30)].map((_,i)=>(
            <div key={i} style={{position:"absolute",
              left:`${5+Math.random()*90}%`,top:`${5+Math.random()*90}%`,
              width:`${2+Math.random()*4}px`,height:`${2+Math.random()*4}px`,
              borderRadius:"50%",background:rc.color,
              animation:`particle ${0.8+Math.random()*1.5}s ease forwards`,
              animationDelay:`${Math.random()*0.6}s`}}/>
          ))}
          <div style={{position:"absolute",top:"50%",left:"50%",textAlign:"center",
            animation:"lvUp 3s ease forwards"}}>
            <div style={{fontSize:"0.7rem",color:rc.color,letterSpacing:"6px",marginBottom:"16px"}}>
              ── SYSTEM ALERT ──
            </div>
            <div style={{fontSize:"3.5rem",fontWeight:"700",color:rc.color,
              textShadow:`0 0 40px ${rc.color}, 0 0 80px ${rc.glow}`,letterSpacing:"6px"}}>
              LEVEL UP
            </div>
            <div style={{fontSize:"1.5rem",color:"#ffffff",marginTop:"12px",letterSpacing:"2px"}}>
              Lv.{levelUpRange?.from ?? level} → Lv.{levelUpRange?.to ?? level}
            </div>
            <div style={{fontSize:"0.65rem",color:rc.color,marginTop:"20px",letterSpacing:"4px"}}>
              {rc.next}
            </div>
          </div>
        </div>
      )}

      <div style={{maxWidth:"1100px",margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          marginBottom:"32px",paddingBottom:"16px",
          borderBottom:"1px solid rgba(58,122,212,0.15)"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
            <div style={{width:"6px",height:"6px",borderRadius:"50%",background:"#3A7AD4",
              animation:"glowPulse 2s ease-in-out infinite",boxShadow:"0 0 8px #3A7AD4"}}/>
            <span style={{color:"#3A7AD4",fontSize:"0.65rem",letterSpacing:"4px"}}>
              SOLO LEVELING EQUATION
            </span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"20px"}}>
            <button onClick={()=>{
              const a = audioRef.current;
              if (!a) return;
              if (a.paused) { a.volume=0.25; a.play().catch(()=>{}); setIsPlaying(true); }
              else { a.pause(); setIsPlaying(false); }
            }} style={{
              background:"transparent",
              border:`1px solid ${isPlaying?"rgba(58,122,212,0.6)":"rgba(58,122,212,0.3)"}`,
              borderRadius:"4px",padding:"3px 10px",
              color:isPlaying?"#7AC0F4":"#3A7AD4",
              fontSize:"0.55rem",letterSpacing:"2px",cursor:"pointer",fontFamily:"inherit",
              boxShadow:isPlaying?"0 0 8px rgba(58,122,212,0.3)":"none",transition:"all 0.3s"}}>
              {isPlaying?"⏸ BGM":"♪ BGM"}
            </button>
            <Link href="/stats" style={{textDecoration:"none"}}>
              <span className="nav-link" style={{color:"#3A7AD4",fontSize:"0.65rem",letterSpacing:"2px"}}>
                ANALYTICS →
              </span>
            </Link>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:"28px",alignItems:"start"}}>

          {/* Profile */}
          <div className="fade-in" style={{
            background:"linear-gradient(160deg,#0a0f1a 0%,#050810 100%)",
            border:`1px solid ${rc.color}44`,borderRadius:"12px",padding:"28px",
            position:"relative",overflow:"hidden",boxShadow:`0 0 60px ${rc.glow}`}}>
            <div className="scan"/>
            <Particles color={rc.color}/>
            <div style={{position:"relative",zIndex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:"24px"}}>
                <span style={{color:"#7A9ABB",fontSize:"0.6rem",letterSpacing:"3px"}}>HUNTER PROFILE</span>
                <div style={{background:rc.bg,border:`1px solid ${rc.color}`,
                  borderRadius:"4px",padding:"2px 10px",boxShadow:`0 0 14px ${rc.glow}`}}>
                  <span style={{color:rc.color,fontSize:"0.75rem",fontWeight:"700",letterSpacing:"2px"}}>
                    {rank}-RANK
                  </span>
                </div>
              </div>

              <div style={{textAlign:"center",marginBottom:"20px",position:"relative"}}>
                <div style={{display:"inline-block",position:"relative"}}>
                  <div style={{position:"absolute",inset:"-8px",borderRadius:"50%",
                    border:`1px solid ${rc.color}33`,borderTop:`1px solid ${rc.color}`,
                    animation:"ringRotate 4s linear infinite"}}/>
                  <div style={{borderRadius:"50%",padding:"3px",
                    background:`linear-gradient(135deg,${rc.color},transparent)`,
                    boxShadow:`0 0 30px ${rc.glow}`}}>
                    <div style={{borderRadius:"50%",overflow:"hidden",
                      width:"90px",height:"90px",background:"#0a0f1a"}}>
                      <Image src="/avatar.jpg" alt="avatar" width={90} height={90}
                        style={{objectFit:"cover",width:"100%",height:"100%",filter:"brightness(0.95)"}}/>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{textAlign:"center",marginBottom:"24px"}}>
                <div style={{color:"#E0EAF4",fontSize:"1.1rem",letterSpacing:"4px",
                  fontWeight:"600",marginBottom:"4px",textShadow:`0 0 20px ${rc.color}44`}}>何錦沅</div>
                <div style={{color:"#7A9ABB",fontSize:"0.6rem",letterSpacing:"2px"}}>HO KAM YUEN · TOMMY</div>
              </div>

              <GlowCard color={rc.color} style={{marginBottom:"16px",padding:"16px"}}>
                <div style={{display:"flex",justifyContent:"space-between",
                  alignItems:"baseline",marginBottom:"10px"}}>
                  <span style={{color:"#7A9ABB",fontSize:"0.6rem",letterSpacing:"2px"}}>LEVEL</span>
                  <span style={{fontSize:"2rem",lineHeight:1,textShadow:`0 0 20px ${rc.glow}`}}>
                    <CountUp target={level} color={rc.color}/>
                  </span>
                </div>
                <div style={{background:"rgba(255,255,255,0.06)",borderRadius:"3px",height:"4px",marginBottom:"8px"}}>
                  <div style={{background:`linear-gradient(90deg,${rc.color}66,${rc.color})`,
                    width:`${expPct}%`,height:"100%",borderRadius:"3px",
                    boxShadow:`0 0 8px ${rc.color}`,transition:"width 1s ease"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{color:"#7A9ABB",fontSize:"0.55rem"}}>EXP {Math.round(currentExp-lvExp)}</span>
                  <span style={{color:"#7A9ABB",fontSize:"0.55rem"}}>{nextExp-lvExp} REQUIRED</span>
                </div>
              </GlowCard>

              <div style={{marginBottom:"16px"}}>
                <div style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"3px",marginBottom:"12px"}}>ATTRIBUTES</div>
                {attrs.map(a => (
                  <div key={a!.key} style={{marginBottom:"10px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                      <span style={{color:"#A0BCD4",fontSize:"0.65rem"}}>{a!.desc}</span>
                      <CountUp target={a!.value} color={a!.value>0?"#3A7AD4":"#7A9ABB"} duration={800}/>
                    </div>
                    <div style={{background:"rgba(255,255,255,0.06)",borderRadius:"2px",height:"3px"}}>
                      <div style={{
                        background:a!.value>0?"linear-gradient(90deg,#1a4a7a,#3A7AD4)":"transparent",
                        width:`${a!.value}%`,height:"100%",borderRadius:"2px",
                        transition:"width 1s ease",
                        boxShadow:a!.value>0?"0 0 6px rgba(58,122,212,0.5)":"none"
                      }}/>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{borderTop:"1px solid rgba(58,122,212,0.15)",paddingTop:"14px",marginBottom:"12px"}}>
                <div style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"2px",marginBottom:"6px"}}>NEXT MILESTONE</div>
                <div style={{color:rc.color,fontSize:"0.7rem",letterSpacing:"1px"}}>{rc.next}</div>
              </div>

              {/* 🔥 Streak */}
              <div style={{
                background:`rgba(${streak>=7?"58,122,212":streak>=3?"46,204,113":"58,90,112"},0.06)`,
                border:`1px solid ${getStreakColor(streak)}33`,
                borderRadius:"8px",padding:"12px",
                boxShadow:streak>=3?`0 0 16px ${getStreakColor(streak)}22`:"none",
                transition:"all 0.5s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                  <span style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"2px"}}>STREAK</span>
                  <span style={{color:getStreakColor(streak),fontSize:"0.55rem",letterSpacing:"1px",
                    animation:streak>=3?"streakGlow 2s ease-in-out infinite":"none"}}>
                    {getStreakTitle(streak)}
                  </span>
                </div>
                <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginBottom:"8px"}}>
                  <span style={{color:getStreakColor(streak),fontSize:"2rem",fontWeight:"700",
                    textShadow:streak>0?`0 0 16px ${getStreakColor(streak)}`:"none"}}>
                    {streak}
                  </span>
                  <span style={{color:"#3A5070",fontSize:"0.65rem"}}>
                    {streak===1?"DAY":"DAYS"} {streak>0?"🔥":""}
                  </span>
                </div>
                <div style={{background:"rgba(255,255,255,0.04)",borderRadius:"2px",height:"3px"}}>
                  <div style={{
                    background:`linear-gradient(90deg,${getStreakColor(streak)}66,${getStreakColor(streak)})`,
                    width:`${Math.min(100,(streak/30)*100)}%`,height:"100%",borderRadius:"2px",
                    boxShadow:`0 0 6px ${getStreakColor(streak)}`,transition:"width 1s ease",
                  }}/>
                </div>
                <div style={{color:"#3A5070",fontSize:"0.5rem",marginTop:"4px",textAlign:"right"}}>
                  {streak>=30?"MAX STREAK 🏆":`${30-streak} days to UNBREAKABLE`}
                </div>
              </div>
            </div>
          </div>

          {/* 右：任務面板 */}
          <div className="fade-in">
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px",marginBottom:"20px"}}>
              {[
                {label:"TODAY EXP", value:todayExp, color:"#2ECC71", sub:todayExp>=0?"Keep going!":"Debuffs active"},
                {label:"LEVEL",     value:level,    color:rc.color,  sub:rc.next},
                {label:"STREAK",    value:streak,   color:getStreakColor(streak), sub:getStreakTitle(streak)},
              ].map(s => (
                <GlowCard key={s.label} color={s.color}>
                  <div style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"2px",marginBottom:"8px"}}>{s.label}</div>
                  <div style={{fontSize:"1.8rem",marginBottom:"4px"}}>
                    {s.label==="TODAY EXP"
                      ? <span style={{color:s.color,fontWeight:700}}>{todayExp>=0?"+":""}{todayExp}</span>
                      : <CountUp target={s.value} color={s.color} duration={1000}/>
                    }
                    {s.label==="STREAK" && streak>0 && <span style={{fontSize:"1.2rem"}}> 🔥</span>}
                  </div>
                  <div style={{color:"#3A5070",fontSize:"0.55rem",letterSpacing:"1px"}}>{s.sub}</div>
                </GlowCard>
              ))}
            </div>

            <div style={{display:"flex",gap:"4px",marginBottom:"20px",
              background:"rgba(58,122,212,0.05)",borderRadius:"8px",padding:"4px"}}>
              {(["tasks","summary"] as const).map(t => (
                <button key={t} onClick={()=>setTab(t)} style={{
                  flex:1,padding:"8px",borderRadius:"6px",border:"none",cursor:"pointer",
                  background:tab===t?"rgba(58,122,212,0.2)":"transparent",
                  color:tab===t?"#7AC0F4":"#7A9ABB",
                  fontSize:"0.65rem",letterSpacing:"2px",fontFamily:"inherit",transition:"all 0.3s",
                  boxShadow:tab===t?"0 0 12px rgba(58,122,212,0.2)":"none",
                }}>
                  {t==="tasks"?"DAILY TASKS":"SUMMARY"}
                </button>
              ))}
            </div>

            {tab==="tasks" && (
              <div>
                {[
                  {type:"daily",     label:"DAILY QUEST",     color:"#3A7AD4"},
                  {type:"challenge", label:"CHALLENGE QUEST", color:"#9B3DD4"},
                  {type:"hidden",    label:"HIDDEN QUEST",    color:"#4A9A8A"},
                ].map(section => (
                  <div key={section.type} style={{marginBottom:"20px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px"}}>
                      <div style={{width:"3px",height:"12px",background:section.color,
                        borderRadius:"2px",boxShadow:`0 0 6px ${section.color}`}}/>
                      <span style={{color:section.color,fontSize:"0.6rem",letterSpacing:"3px"}}>{section.label}</span>
                    </div>
                    {QUESTS.filter(q=>q.type===section.type).map(q => {
                      const done = completed.includes(q.id);
                      return (
                        <div key={q.id} style={{
                          display:"flex",alignItems:"center",gap:"12px",
                          padding:"12px 14px",marginBottom:"4px",borderRadius:"6px",
                          background:done?"rgba(58,122,212,0.08)":"rgba(255,255,255,0.02)",
                          border:`1px solid ${done?"rgba(58,122,212,0.25)":"rgba(255,255,255,0.05)"}`,
                          transition:"all 0.2s",
                        }}>
                          <div style={{width:"16px",height:"16px",borderRadius:"3px",flexShrink:0,
                            border:`1px solid ${done?section.color:"#2A4A6A"}`,
                            background:done?`${section.color}22`:"transparent",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            boxShadow:done?`0 0 8px ${section.color}44`:"none"}}>
                            {done && <span style={{color:section.color,fontSize:"10px"}}>✓</span>}
                          </div>
                          <span style={{flex:1,color:done?"#5A7A9A":"#C0D4E8",fontSize:"0.82rem",
                            textDecoration:done?"line-through":"none",letterSpacing:"0.5px"}}>
                            {q.label}
                          </span>
                          <span style={{color:"#3A5070",fontSize:"0.6rem",marginRight:"4px"}}>⏱ {q.minutes}m</span>
                          <span style={{color:done?"#2a4a2a":"#2ECC71",fontSize:"0.65rem",
                            letterSpacing:"1px",marginRight:"8px"}}>+{q.exp}</span>
                          {!done && (
                            <button className="start-btn" onClick={()=>toggle(q.id)} style={{
                              background:`linear-gradient(135deg,${section.color}33,${section.color}11)`,
                              border:`1px solid ${section.color}88`,borderRadius:"4px",
                              padding:"3px 10px",color:section.color,fontSize:"0.6rem",
                              fontWeight:"700",letterSpacing:"2px",cursor:"pointer",
                              fontFamily:"inherit",transition:"all 0.2s",
                              boxShadow:`0 0 8px ${section.color}33`}}>
                              ▶ START
                            </button>
                          )}
                          {done && (
                            <button onClick={()=>setCompleted(completed.filter(x=>x!==q.id))} style={{
                              background:"transparent",border:"1px solid rgba(231,76,60,0.2)",
                              borderRadius:"4px",padding:"3px 8px",color:"#E74C3C",
                              fontSize:"0.55rem",cursor:"pointer",fontFamily:"inherit",opacity:0.5}}>
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                <div style={{marginBottom:"20px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px"}}>
                    <div style={{width:"3px",height:"12px",background:"#E74C3C",
                      borderRadius:"2px",boxShadow:"0 0 6px #E74C3C"}}/>
                    <span style={{color:"#E74C3C",fontSize:"0.6rem",letterSpacing:"3px"}}>DEBUFF</span>
                  </div>
                  {DEBUFFS.map(d => {
                    const active = debuffs.includes(d.id);
                    return (
                      <div key={d.id} className="task-row"
                        onClick={()=>setDebuffs(p=>p.includes(d.id)?p.filter(x=>x!==d.id):[...p,d.id])}
                        style={{
                          display:"flex",alignItems:"center",gap:"12px",
                          padding:"12px 14px",marginBottom:"4px",
                          background:active?"rgba(231,76,60,0.08)":"rgba(255,255,255,0.02)",
                          border:`1px solid ${active?"rgba(231,76,60,0.25)":"rgba(255,255,255,0.05)"}`,
                        }}>
                        <div style={{width:"16px",height:"16px",borderRadius:"3px",flexShrink:0,
                          border:`1px solid ${active?"#E74C3C":"#2A4A6A"}`,
                          background:active?"rgba(231,76,60,0.2)":"transparent",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          boxShadow:active?"0 0 8px rgba(231,76,60,0.4)":"none"}}>
                          {active && <span style={{color:"#E74C3C",fontSize:"10px"}}>✓</span>}
                        </div>
                        <span style={{flex:1,color:"#C0D4E8",fontSize:"0.82rem"}}>{d.label}</span>
                        <span style={{color:"#E74C3C",fontSize:"0.65rem"}}>{d.exp}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab==="summary" && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                {[
                  {label:"CURRENT LEVEL", value:level,            color:rc.color},
                  {label:"TOTAL EXP",     value:totalExp,         color:"#7AC0F4"},
                  {label:"TASKS DONE",    value:completed.length, color:"#3A7AD4"},
                  {label:"STREAK DAYS",   value:streak,           color:getStreakColor(streak)},
                ].map(s=>(
                  <GlowCard key={s.label} color={s.color}>
                    <div style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"2px",marginBottom:"8px"}}>{s.label}</div>
                    <div style={{fontSize:"1.8rem"}}>
                      <CountUp target={s.value} color={s.color} duration={800}/>
                    </div>
                  </GlowCard>
                ))}
                {completed.length>0 && (
                  <div style={{gridColumn:"1/-1",background:"rgba(58,122,212,0.04)",
                    border:"1px solid rgba(58,122,212,0.15)",borderRadius:"10px",padding:"20px"}}>
                    <div style={{color:"#7A9ABB",fontSize:"0.55rem",letterSpacing:"2px",marginBottom:"12px"}}>COMPLETED TODAY</div>
                    {QUESTS.filter(q=>completed.includes(q.id)).map(q=>(
                      <div key={q.id} style={{color:"#2ECC71",fontSize:"0.75rem",marginBottom:"6px",
                        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span>✓ {q.label}</span>
                        <span style={{color:"#2a5a2a",fontSize:"0.65rem"}}>+{q.exp} EXP</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{marginTop:"32px",paddingTop:"16px",
          borderTop:"1px solid rgba(58,122,212,0.08)",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#2A4A6A",fontSize:"0.55rem",letterSpacing:"3px"}}>
            SOLO LEVELING EQUATION · SYSTEM v2.0
          </span>
          <span style={{color:"#2A4A6A",fontSize:"0.55rem",animation:"blink 3s ease-in-out infinite"}}>■</span>
        </div>
      </div>
    </main>
  );
}