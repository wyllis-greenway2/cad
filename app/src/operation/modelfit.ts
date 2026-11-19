// One way for every model to meet the numbers a person types (`in_1241`): the numbers that were not typed are moved, as little as they can be, until the model can be made; the numbers typed are never moved here (when they cannot all be met
// the box takes the one being typed back to the nearest value that works, `modeltool.ts`). The model says only what it cannot be made with (`Def.problem`); the search is the same for all. Pure.
import type { ModelField, Nums } from "./modelkinds.ts";

type Problem = (n: Nums) => string | null;
const memo = new WeakMap<Problem, Map<string, Nums>>();
const RATIOS = [0.95, 1.05, 0.9, 1.1, 0.8, 1.25, 0.65, 1.5, 0.5, 2, 0.35, 3, 0.2, 5];
const STEPS = [1, 2, 3, 4, 6, 8, 12, 16];
const ZERO_UP = [0.1, 0.2, 0.5, 1, 2];

/** the values a field is tried at, nearest to the one it has first */
function moves(v: number, f: ModelField): number[] {
  if (f.whole) return STEPS.flatMap((k) => [v + k, v - k]).filter((x) => x >= (f.zero ? 0 : 1));
  if (v === 0) return ZERO_UP;
  return RATIOS.map((r) => Math.round(v * r * 1000) / 1000);
}
const cost = (from: number, to: number): number => (from === 0 || to === 0 ? 1 : Math.abs(Math.log(to / from)));

/**
 * `nums` made so that `problem` says nothing, by moving the numbers not in `locked`: first the one move of one number (or the one scaling of all the sizes together) that makes it, the smallest; failing that, the smallest move that
 * changes what is wrong, and again. The numbers as they were if it cannot be done (the caller says what is wrong).
 */
export function fitNumbers(problem: Problem, nums: Nums, locked: ReadonlySet<string>, fields: readonly ModelField[]): Nums {
  if (problem(nums) === null) return nums;
  const cache = memo.get(problem) ?? new Map<string, Nums>();
  memo.set(problem, cache);
  const key = JSON.stringify([nums, [...locked].sort()]);
  const hit = cache.get(key);
  if (hit) return hit;
  const free = fields.filter((f) => !locked.has(f.key) && !f.hidden && !f.choices && Number.isFinite(nums[f.key]));
  const sizes = free.filter((f) => f.scaled);
  let cur = nums;
  for (let round = 0; round < 10; round++) {
    const here = problem(cur);
    if (here === null) break;
    let valid: { n: Nums; c: number } | null = null, step: { n: Nums; c: number } | null = null;
    const consider = (n: Nums, c: number): void => {
      const p = problem(n);
      if (p === null) { if (!valid || c < valid.c) valid = { n, c }; }
      else if (p !== here && (!step || c < step.c)) step = { n, c };
    };
    for (const f of free) for (const v of moves(cur[f.key]!, f)) consider({ ...cur, [f.key]: v }, cost(cur[f.key]!, v));
    if (sizes.length > 1) for (const r of RATIOS) consider({ ...cur, ...Object.fromEntries(sizes.map((f) => [f.key, Math.round(cur[f.key]! * r * 1000) / 1000])) }, Math.abs(Math.log(r)));
    const pick = (valid ?? step) as { n: Nums; c: number } | null;
    if (!pick) break;
    cur = pick.n;
  }
  const out = problem(cur) === null ? cur : nums;
  if (cache.size > 400) cache.clear();
  cache.set(key, out);
  return out;
}
