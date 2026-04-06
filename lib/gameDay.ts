/**
 * 「帳務日」：本地時區，每日 resetHour（預設 6）起算為新的一天。
 * 用於 completed / debuffs / lastReset 等與日切換一致的鍵，格式 Y-M-D（與既有存檔相容）。
 */
const DEFAULT_RESET_HOUR = 6;

export function getGameDayKey(now = new Date(), resetHour = DEFAULT_RESET_HOUR): string {
  const x = new Date(now.getTime());
  x.setHours(x.getHours() - resetHour, x.getMinutes(), x.getSeconds(), x.getMilliseconds());
  return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
}

export function getPreviousGameDayKey(now = new Date(), resetHour = DEFAULT_RESET_HOUR): string {
  const x = new Date(now.getTime());
  x.setHours(x.getHours() - resetHour, x.getMinutes(), x.getSeconds(), x.getMilliseconds());
  x.setDate(x.getDate() - 1);
  return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
}
