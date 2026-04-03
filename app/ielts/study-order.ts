import type { Flashcard } from "./store";

/** 依字卡 id 去重，保留先出現的一張（單次測驗／默寫／填空內不重複同一張） */
export function uniqueFlashcardsById(cards: Flashcard[]): Flashcard[] {
  const seen = new Set<string>();
  const out: Flashcard[] = [];
  for (const c of cards) {
    const id = typeof c.id === "string" && c.id.trim() ? c.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(c);
  }
  return out;
}

/**
 * 未掌握較常出現、已掌握較少出現：加權無放回抽樣排序。
 * 權重比約 1 : 0.32 → 兩池都還有牌時，已掌握被抽中的相對機率約為未掌握的三分之一（仍會出現，符合複習週期）。
 */
const WEIGHT_UNMASTERED = 1;
const WEIGHT_MASTERED = 0.32;

function pickWeightedIndex(weights: number[]): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function weightedStudyOrder(cards: Flashcard[]): Flashcard[] {
  const pool = [...cards];
  if (pool.length <= 1) return pool;
  const result: Flashcard[] = [];
  while (pool.length > 0) {
    const weights = pool.map((c) => (c.mastered ? WEIGHT_MASTERED : WEIGHT_UNMASTERED));
    const i = pickWeightedIndex(weights);
    result.push(pool.splice(i, 1)[0]!);
  }
  return result;
}

/** 去重 + 加權排序，供測驗／默寫／AI 填空開局使用 */
export function buildStudySessionOrder(cards: Flashcard[]): Flashcard[] {
  return weightedStudyOrder(uniqueFlashcardsById(cards));
}
