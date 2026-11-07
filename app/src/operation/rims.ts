// Round edges of the body that share an axis and a centre (the rims of a ring, of a stepped post): when a size changes they move, and a step that rounds one of them has to find it again.
// Which rim it was is told by its place in the row, smallest to largest, at the time the step was made; nearness to where it was is not enough (a rim that grows past its neighbour's old size would
// be taken for the neighbour).
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "./scene.ts";

/** For each line: `k/n` if it is a round rim (the k-th of n rims with that centre and axis, counted from the smallest), else `-`. Comma-joined, in the order of `refs`. */
export function rimRanks(scene: Scene, refs: readonly Ref[]): string {
  const r4 = (v: number) => Math.round(v * 1e3) / 1e3;
  const family = (c: { center: readonly number[]; normal: readonly number[] }) => `${c.center.map(r4).join(",")}|${c.normal.map((v) => Math.abs(r4(v))).join(",")}`;
  const rows = new Map<string, Set<number>>();
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "line" || p.origin !== "body" || !p.circle) continue;
    const k = family(p.circle);
    rows.set(k, (rows.get(k) ?? new Set()).add(r4(p.circle.radius)));
  }
  const out = refs.map((r) => {
    const p = scene.parts[r];
    if (p?.kind !== "line" || !p.circle) return "-";
    const radii = [...(rows.get(family(p.circle)) ?? [])].sort((a, b) => a - b);
    return `${radii.indexOf(r4(p.circle.radius))}/${radii.length}`;
  });
  return out.every((x) => x === "-") ? "" : out.join(",");
}
