// Round edges of the body that share an axis and a centre (the rims of a ring, of a stepped post): when a size changes they move, and a step that rounds one of them has to find it again.
// Which rim it was is told by its place in the row, smallest to largest, at the time the step was made; nearness to where it was is not enough (a rim that grows past its neighbour's old size would
// be taken for the neighbour).
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "./scene.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot } from "../math/vec.ts";
import { normalOfPlane, pointOf } from "./part.ts";

/** For each line: `k/n` if it is a round rim (the k-th of n rims on one axis line, counted from the lowest and, at one height, the smallest), else `-`. Comma-joined, in the order of `refs`. */
export function rimRanks(scene: Scene, refs: readonly Ref[]): string {
  const r4 = (v: number) => Math.round(v * 1e3) / 1e3;
  // the rims of one axis line: a rim moves along its axis when the part is made taller, and across it never, so the line is what they share; their order along it is what stays
  const axisOf = (c: { center: readonly number[]; normal: readonly number[] }): number => { const a = c.normal.map(Math.abs); const m = Math.max(...a); return m > 0.9999 ? a.indexOf(m) : -1; };
  const family = (c: { center: readonly number[]; normal: readonly number[] }) => { const ax = axisOf(c); return ax < 0 ? `${c.center.map(r4).join(",")}|${c.normal.map((v) => Math.abs(r4(v))).join(",")}` : `${ax}|${c.center.filter((_, i) => i !== ax).map(r4).join(",")}`; };
  const place = (c: { center: readonly number[]; normal: readonly number[]; radius: number }) => { const ax = axisOf(c); return `${ax < 0 ? 0 : r4(c.center[ax]!)}/${r4(c.radius)}`; };
  const rows = new Map<string, Map<string, [number, number]>>();
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "line" || p.origin !== "body" || !p.circle) continue;
    const k = family(p.circle);
    const ax = axisOf(p.circle);
    rows.set(k, (rows.get(k) ?? new Map()).set(place(p.circle), [ax < 0 ? 0 : r4(p.circle.center[ax]!), r4(p.circle.radius)]));
  }
  const out = refs.map((r) => {
    const p = scene.parts[r];
    if (p?.kind !== "line" || !p.circle) return "-";
    const row = [...(rows.get(family(p.circle)) ?? new Map()).entries()].sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1]).map((e) => e[0]);
    return `${row.indexOf(place(p.circle))}/${row.length}`;
  });
  return out.every((x) => x === "-") ? "" : out.join(",");
}

/**
 * The flat faces each straight edge lies between, as a signature (their outward normals, sorted: `nx:ny:nz/nx:ny:nz`), one per ref, joined by `|` (empty where the edge is not between two flat faces).
 * A fillet or chamfer finds its edge again by it after sizes changed: the edge of a block between its +x and +y faces is that one whatever the block has grown to.
 */
export function edgeSignatures(scene: Scene, refs: readonly Ref[]): string {
  const get = (r: Ref) => scene.parts[r];
  const flats = Object.values(scene.parts).filter((p): p is Extract<typeof p, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !p.curved && !p.rounded && !!p.mesh && p.mesh.length >= 9);
  const out = refs.map((r) => {
    const l = scene.parts[r];
    if (l?.kind !== "line" || l.circle || l.mid) return "";
    const [a, b] = [pointOf(get, l.a), pointOf(get, l.b)];
    if (!a || !b) return "";
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const ns = flats.filter((f) => {
      const n = normalOfPlane(f);
      if (Math.abs(dot(n, sub(a, f.at))) > 1e-3 || Math.abs(dot(n, sub(b, f.at))) > 1e-3) return false;
      const m = f.mesh!; // the edge is on the face itself, not only in its plane
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i + 2 < m.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, m[i + k]!); hi[k] = Math.max(hi[k]!, m[i + k]!); }
      return mid.every((v, k) => v >= lo[k]! - 1e-3 && v <= hi[k]! + 1e-3);
    }).map((f) => normalOfPlane(f).map((v) => (Math.round(v * 1e3) / 1e3 || 0).toString()).join(":")).sort();
    return ns.length === 2 ? ns.join("/") : "";
  });
  return out.every((x) => !x) ? "" : out.join("|");
}
