// The parts and steps of a straight bevel gear (`dec_bevel_gears`, `in_735`), made from a gear record by `gearscene.ts` as those of any gear are. An APPROXIMATION of the standard tooth (`bevel.ts`).
// The gear's plane is the plane of the big end; its axis is the plane's normal and the apex of the pitch cone lies along it (`+n`). The big end's outline is drawn on the plane; the small end's (the same outline scaled about the axis)
// on a plane parallel to it, `face cos delta` further along the axis. The body is a ruled loft of the two (a piece of its own), as the worm wheel's is; a bore is a hole in both.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Step, Figure } from "./scene.ts";
import { figureParams } from "./scene.ts";
import type { Part } from "./part.ts";
import type { GearRecord } from "./gearscene.ts";
import { bevelPoints, bevelFrame } from "./bevel.ts";
import { boreLoop } from "./bore.ts";

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ref = (id: string, name: string): Ref => drawnRef(`${id}.${name}`);
const ENDS = 2;
export interface BevelRefs { sections: Ref[][]; planes: Ref[]; bores: string[] }
export function bevelRefs(rec: GearRecord): BevelRefs {
  const b = bevelPoints(rec.spec);
  const sides = b.ok ? b.value.points.length : 0;
  const loop = (rec.spec.bore ?? 0) > 0 ? boreLoop(rec.spec) : null;
  return { sections: Array.from({ length: ENDS }, (_, q) => Array.from({ length: sides }, (_, i) => ref(rec.id, `v${q}s${i}`))), planes: Array.from({ length: ENDS }, (_, q) => ref(rec.id, `v${q}q`)), bores: (rec.spec.bore ?? 0) > 0 ? Array.from({ length: ENDS }, (_, q) => (loop ? loop.points.map((_, k) => ref(rec.id, `v${q}bs${k}`)).join(",") : ref(rec.id, `v${q}b`))) : [] };
}
export function bevelParts(s: Scene, rec: GearRecord): Part[] {
  const pl = s.parts[rec.plane], b = bevelPoints(rec.spec);
  if (!pl || pl.kind !== "plane" || !b.ok) return [];
  const { points, geometry: g } = b.value;
  const f = bevelFrame(pl.u, pl.v, rec.spec, rec.turn ?? 0);
  const [u, v] = rec.spec.bevel?.frame ?? [pl.u, pl.v]; // (the planes of its sections lie as it does)
  const at = (x: number, y: number, h: number): Vec3 => [rec.at[0] + f.X[0] * x + f.Y[0] * y + f.n[0] * h, rec.at[1] + f.X[1] * x + f.Y[1] * y + f.n[1] * h, rec.at[2] + f.X[2] * x + f.Y[2] * y + f.n[2] * h];
  const loop = (rec.spec.bore ?? 0) > 0 ? boreLoop(rec.spec) : null;
  const out: Part[] = [];
  [0, g.big - g.small].forEach((h, q) => {
    const k = q === 0 ? 1 : g.k;
    const plane = ref(rec.id, `v${q}q`);
    out.push({ ref: plane, origin: "drawn", plane: null, movable: false, kind: "plane", at: at(0, 0, h), u, v });
    const base = { origin: "drawn" as const, plane, movable: false };
    const m = points.length;
    points.forEach((p, i) => out.push({ ...base, ref: ref(rec.id, `v${q}p${i}`), kind: "corner", at: at(p[0] * k, p[1] * k, h) }));
    for (let i = 0; i < m; i++) out.push({ ...base, ref: ref(rec.id, `v${q}s${i}`), kind: "line", a: ref(rec.id, `v${q}p${i}`), b: ref(rec.id, `v${q}p${(i + 1) % m}`) });
    if (loop) {
      loop.points.forEach((p, i) => out.push({ ...base, ref: ref(rec.id, `v${q}bp${i}`), kind: "corner", at: at(p[0], p[1], h) }));
      loop.points.forEach((_, i) => out.push({ ...base, ref: ref(rec.id, `v${q}bs${i}`), kind: "line", a: ref(rec.id, `v${q}bp${i}`), b: ref(rec.id, `v${q}bp${(i + 1) % loop.points.length}`), ...(loop.bulges[i] ? { bulge: loop.bulges[i]! } : {}) }));
    } else if ((rec.spec.bore ?? 0) > 0) {
      out.push({ ...base, ref: ref(rec.id, `v${q}c`), kind: "corner", at: at(0, 0, h) });
      out.push({ ...base, ref: ref(rec.id, `v${q}b`), kind: "circle", center: ref(rec.id, `v${q}c`), radius: rec.spec.bore! / 2 });
    }
  });
  return out;
}
export function bevelSteps(s: Scene, rec: GearRecord): Omit<Step, "id">[] | null {
  const pl = s.parts[rec.plane];
  if (!pl || pl.kind !== "plane" || !bevelPoints(rec.spec).ok) return null;
  const { sections, bores } = bevelRefs(rec);
  const figs: Figure[] = sections.map((lines, q) => ({ outer: lines, holes: bores[q] ? [bores[q]!.split(",") as Ref[]] : [] }));
  return [{ type: "loft", parts: sections[0]!, params: { ...figureParams(figs), ruled: 1, mode: "new", gear: rec.id } }];
}
