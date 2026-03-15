# 按鈕／介面音效編碼一覽

所有音效相關程式碼都在 **`app/page.tsx`**。以下依「聲效系統定義」與「使用位置」兩部分列出。

---

## 一、聲效系統定義（`app/page.tsx`）

### 1. 全域 AudioContext 與取得函式（約第 7–12 行）

```tsx
let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  return audioCtx;
}
```

### 2. `useSound()` Hook（約第 13–173 行）

- **playHover** — 導航 Hover（約 15–24 行）
- **playClick** — 導航／按鈕 Click（約 27–37 行）
- **playMissionStart** — 任務啟動（約 40–63 行）
- **playTimerInit** — 計時器啟動（約 66–76 行）
- **playMinuteTick** — 每分鐘脈衝（約 79–88 行）
- **playCountdownTick(intensity)** — 最後 10 秒倒數（約 91–101 行）
- **playMissionCleared** — 任務完成（約 104–130 行）
- **playExpTick** — EXP 條滾動（約 132–141 行）
- **playCancel** — 取消／失敗（約 144–154 行）
- **playDisabled** — 無效點擊（約 156–165 行）
- **playSuccess** = playMissionCleared（約 167 行）
- **playAlert** = playCancel（約 168 行）
- **return** 對外暴露的 API（約 169–172 行）

完整程式碼區段：**第 6 行註解起 ～ 第 173 行 `};` 為止**（整段 `// ===== 聲效系統...` 到 `useSound` 的 `return { ... };`）。

---

## 二、`useSound` 的取得與傳遞

### 主元件取得 `sound`（約第 1443 行）

```tsx
const sound = useSound();
```

---

## 三、各音效的「使用位置」（按鈕／介面）

### playClick（按鈕點擊）

| 行號（約） | 用途說明 | 程式碼片段 |
|-----------|----------|------------|
| 1483 | 鍵盤 Space 開始第一個未完成任務 | `sound.playClick();` 後 `toggle(firstUnfinished.id)` |
| 1816 | MissionTimer 取消按鈕（關閉計時彈窗） | `onCancel={()=>{ sound.playCancel(); setActiveTimer(null); }}` |
| 1819 | MissionTimer 內各按鈕 | `onPlayClick={sound.playClick}` |
| 2013 | 緊急任務「今日不再顯示」按鈕 | `onClick={() => { sound.playClick(); setMeta(...); ... }}` |
| 2041 | BGM 開關按鈕 | `onClick={()=>{ sound.playClick(); ... a.play() / a.pause() ... }}` |
| ~2371 | 開啟 Analytics 分頁的按鈕 | `<button onClick={() => { sound.playClick(); setTab("analytics"); }} ...>` |
| 2303 | 分頁按鈕（DAILY TASKS / SUMMARY） | `onClick={()=>{ sound.playClick(); setTab(t); }}` |
| 2346–2347 | Daily Quest 區塊的 QuestCard | `onHoverSound={sound.playHover}`、`onClickSound={sound.playClick}` |
| 2369–2370 | Challenge Quest 區塊的 QuestCard | 同上 |
| 2388 | 每週 Boss 的 QuestCard | `onHoverSound={sound.playHover} onClickSound={sound.playClick}` |
| 2404 | Daily 清單內每個 QuestCard | 同上 |
| 2420 | AI 建議任務每個 QuestCard | 同上 |
| 2439 | Debuff 區塊點擊（切換 debuff） | `onClick={()=>{ sound.playClick(); ...; if (next.length > debuffs.length) sound.playAlert(); ... }}` |

### playHover（滑過）

- **2346, 2369, 2388, 2404, 2420**：各區塊的 `QuestCard` 傳入 `onHoverSound={sound.playHover}`。
- **QuestCard 內**（約 919 行）：`onMouseEnter={() => { setHover(true); onHoverSound?.(); }}`。

### playSuccess（任務完成／復原成功）

| 行號（約） | 用途 |
|-----------|------|
| 1605 | 連續天數達 7 的倍數（Shadow 解鎖）時 |
| 1688 | 任務完成時（`handleTimerComplete` 內） |
| 1994 | 懲罰復原「確認已完成復原」按鈕 |

### playAlert（警示，等同 playCancel）

| 行號（約） | 用途 |
|-----------|------|
| 1466 | 懲罰模式觸發時（`penaltyModeActive && !penaltyShakeDone`） |
| 2441 | 新增一個 debuff 時（`if (next.length > debuffs.length) sound.playAlert();`） |

### playCancel（取消／關閉）

| 行號（約） | 用途 |
|-----------|------|
| 1474 | 鍵盤 Esc 關閉計時器 |
| 1816 | MissionTimer 的 onCancel（關閉計時彈窗） |
| 1819 | MissionTimer 內取消鈕回呼 | `onPlayCancel={sound.playCancel}` |

### playMissionStart / playTimerInit / playMinuteTick / playCountdownTick

- **1817–1819**：傳入 `MissionTimer`：
  - `onPlayMissionStart={sound.playMissionStart}`
  - `onPlayTimerInit={sound.playTimerInit}`
  - `onPlayMinuteTick={sound.playMinuteTick}`
  - `onPlayCountdownTick={sound.playCountdownTick}`

- **MissionTimer 內實際呼叫**：
  - **1107**：開始倒數時 `onPlayMissionStart?.();`
  - **1046**：計時器顯示後約 200ms `onPlayTimerInit?.();`
  - **1055**：每分鐘 `onPlayMinuteTick?.();`
  - **1061**：最後 10 秒每秒 `onPlayCountdownTick?.(10 - sec);`

### playExpTick（EXP 條滾動）

- **1498**：任務完成動效時，連打 8 次（每 55ms）：  
  `ids.push(setTimeout(() => { sound.playExpTick(); }, i * 55));`

### QuestCard 的 onClickSound / onHoverSound

- **約 919**：`onMouseEnter={() => { setHover(true); onHoverSound?.(); }}`
- **約 966**：START MISSION 按鈕 `onClick={() => { onClickSound?.(); onStart(); }}`

---

## 四、MissionTimer 內按鈕與音效對應（約 1297–1398 行）

| 按鈕 | 行號（約） | 音效 |
|------|-----------|------|
| 自訂時間「套用」 | 1297 | `onPlayClick?.()` |
| 自訂時間「編輯」 | 1303 | `onPlayClick?.()` |
| 取消（CANCEL） | 1339 | `onPlayCancel?.()` |
| 領取完成（CLAIM） | 1398 | `onPlayClick?.()` |

---

## 五、快速對照：音效名稱 ↔ 行號（定義）

| 音效名稱 | 定義約略行號 |
|----------|--------------|
| getCtx | 8–12 |
| playHover | 15–24 |
| playClick | 27–37 |
| playMissionStart | 40–63 |
| playTimerInit | 66–76 |
| playMinuteTick | 79–88 |
| playCountdownTick | 91–101 |
| playMissionCleared | 104–130 |
| playExpTick | 132–141 |
| playCancel | 144–154 |
| playDisabled | 156–165 |
| playSuccess / playAlert | 167–168 |
| useSound return | 169–172 |

以上即為目前所有「按鈕／介面音效」相關的編碼位置與對應行為。
