/** 任務覆寫／自訂任務 EXP 上限（舊版 9999 會截斷大額獎勵） */
export const MAX_QUEST_EXP = 99_999_999;

export function formatExpValue(n: number): string {
  const x = Number.isFinite(n) ? Math.trunc(n) : 0;
  return Math.abs(x).toLocaleString("en-US");
}

/** 今日淨增 EXP（可為負）：帶正負號與千分位 */
export function formatSignedTodayExp(n: number): string {
  if (!Number.isFinite(n)) return "+0";
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${formatExpValue(n)}`;
}
