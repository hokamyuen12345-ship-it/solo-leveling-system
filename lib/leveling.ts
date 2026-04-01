/**
 * 累積總 EXP 門檻：達到 LEVEL_TABLE[i] 時至少為 Lv.(i+1)。
 * 表外等級以遞增區間延伸，避免大額 EXP 卡在 Lv.11。
 */
export const LEVEL_TABLE = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4200] as const;

/** 從 Lv.atLevel 升到 Lv.(atLevel+1) 所需累積 EXP 增量（atLevel 為目前等級） */
function expSpanForLevel(atLevel: number): number {
  if (atLevel < 1) return LEVEL_TABLE[0];
  if (atLevel < LEVEL_TABLE.length) {
    return LEVEL_TABLE[atLevel] - LEVEL_TABLE[atLevel - 1];
  }
  const lastIdx = LEVEL_TABLE.length - 1;
  const lastSpan = LEVEL_TABLE[lastIdx] - LEVEL_TABLE[lastIdx - 1];
  const extra = atLevel - lastIdx - 1;
  return lastSpan + Math.max(0, extra) * 200;
}

/** 達到至少 `level`（1-based）所需的累積總 EXP */
export function minExpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level <= LEVEL_TABLE.length) return LEVEL_TABLE[level - 1];
  let lv = LEVEL_TABLE.length;
  let total = LEVEL_TABLE[lv - 1];
  while (lv < level) {
    total += expSpanForLevel(lv);
    lv++;
  }
  return total;
}

/** 由累積總 EXP 推算目前等級（可連續升多級） */
export function levelFromTotalExp(totalExp: number): number {
  const t = Math.max(0, totalExp);
  let level = 1;
  for (let i = 0; i < LEVEL_TABLE.length; i++) {
    if (t >= LEVEL_TABLE[i]) level = i + 1;
  }
  while (t >= minExpForLevel(level + 1)) {
    level++;
    if (level > 50_000) break;
  }
  return Math.max(1, level);
}

export function expBarFromTotal(totalExp: number): {
  level: number;
  lvExp: number;
  nextExp: number;
  expPct: number;
} {
  const t = Math.max(0, totalExp);
  const level = levelFromTotalExp(t);
  const lvExp = minExpForLevel(level);
  const nextExp = minExpForLevel(level + 1);
  const denom = nextExp - lvExp;
  const expPct = denom > 0 ? Math.min(100, ((t - lvExp) / denom) * 100) : 100;
  return { level, lvExp, nextExp, expPct };
}
