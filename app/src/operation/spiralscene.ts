// The parts and steps of a spiral bevel gear (`dec_spiral_bevel_gears`, `in_836`), made from a gear record by `gearscene.ts` as those of a straight bevel gear are (`bevelscene.ts`): the gear's plane is the plane of the heel's pitch point, its axis the plane's normal, the apex along it
// (`+n`). The body is a loft through seven planes across the axis (the tooth outline there, `spiral.ts`: lines of arcs, smooth between the planes: the tooth is curved), cut by the blank of the two back cones (a revolved piece of its own); a bore is a hole in every plane.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Step, Figure } from "./scene.ts";
import { figureParams } from "./scene.ts";
import type { Part } from "./part.ts";
import type { GearRecord } from "./gearscene.ts";
import { bevelFrame } from "./bevel.ts";
import { spiralFor, spiralBody } from "./spiral.ts";
import type { SpiralBody } from "./spiral.ts";
import { boreLoop } from "./bore.ts";

const ref = (id: string, name: string): Ref => drawnRef(`${id}.${name}`);
/** the body of a spiral gear record, or null if it makes none */
export function spiralOf(rec: GearRecord): SpiralBody | null {
  const sp = spiralFor(rec.spec);
  if (!sp.ok) return null;
  const b = spiralBody(sp.value.pair, sp.value.which);
  return b.ok ? b.value : null;
}
export interface SpiralRefs { sections: Ref[][]; planes: Ref[]; bores: string[]; blank: Ref[]; blankPlane: Ref }
export function spiralRefs(rec: GearRecord): SpiralRefs {
  const b = spiralOf(rec);
  const loop = (rec.spec.bore ?? 0) > 0 ? boreLoop(rec.spec) : null;
  const n = b ? b.sections.length : 0;
  return {
    sections: b ? b.sections.map((s, q) => s.points.map((_, i) => ref(rec.id, `v${q}s${i}`))) : [], planes: Array.from({ length: n }, (_, q) => ref(rec.id, `v${q}q`)),
    bores: (rec.spec.bore ?? 0) > 0 ? Array.from({ length: n }, (_, q) => (loop ? loop.points.map((_, k) => ref(rec.id, `v${q}bs${k}`)).join(",") : ref(rec.id, `v${q}b`))) : [],
    blank: b ? b.blank.map((_, i) => ref(rec.id, `kns${i}`)) : [], blankPlane: ref(rec.id, "knq"),
  };
}
export function spiralParts(s: Scene, rec: GearRecord): Part[] {
  const pl = s.parts[rec.plane], b = spiralOf(rec);
  if (!pl || pl.kind !== "plane" || !b) return [];
  const f = bevelFrame(pl.u, pl.v, rec.spec, rec.turn ?? 0);
  const [u, v] = rec.spec.bevel?.frame ?? [pl.u, pl.v];
  const at = (x: number, y: number, h: number): Vec3 => [rec.at[0] + f.X[0] * x + f.Y[0] * y + f.n[0] * h, rec.at[1] + f.X[1] * x + f.Y[1] * y + f.n[1] * h, rec.at[2] + f.X[2] * x + f.Y[2] * y + f.n[2] * h];
  const loop = (rec.spec.bore ?? 0) > 0 ? boreLoop(rec.spec) : null;
  const out: Part[] = [];
  b.sections.forEach(({ x, points, bulges }, q) => {
    const h = b.big - x;
    const plane = ref(rec.id, `v${q}q`);
    out.push({ ref: plane, origin: "drawn", plane: null, movable: false, kind: "plane", at: at(0, 0, h), u, v });
    const base = { origin: "drawn" as const, plane, movable: false as const };
    const m = points.length;
    points.forEach((p, i) => out.push({ ...base, ref: ref(rec.id, `v${q}p${i}`), kind: "corner", at: at(p[0], p[1], h) }));
    for (let i = 0; i < m; i++) out.push({ ...base, ref: ref(rec.id, `v${q}s${i}`), kind: "line", a: ref(rec.id, `v${q}p${i}`), b: ref(rec.id, `v${q}p${(i + 1) % m}`), ...(bulges[i] ? { bulge: bulges[i]! } : {}) });
    if (loop) {
      loop.points.forEach((p, i) => out.push({ ...base, ref: ref(rec.id, `v${q}bp${i}`), kind: "corner", at: at(p[0], p[1], h) }));
      loop.points.forEach((_, i) => out.push({ ...base, ref: ref(rec.id, `v${q}bs${i}`), kind: "line", a: ref(rec.id, `v${q}bp${i}`), b: ref(rec.id, `v${q}bp${(i + 1) % loop.points.length}`), ...(loop.bulges[i] ? { bulge: loop.bulges[i]! } : {}) }));
    } else if ((rec.spec.bore ?? 0) > 0) {
      out.push({ ...base, ref: ref(rec.id, `v${q}c`), kind: "corner", at: at(0, 0, h) });
      out.push({ ...base, ref: ref(rec.id, `v${q}b`), kind: "circle", center: ref(rec.id, `v${q}c`), radius: rec.spec.bore! / 2 });
    }
  });
  // the blank: a shape revolved about the axis, drawn on a plane through the axis (radius along the first direction, height along the axis)
  const bp = ref(rec.id, "knq");
  out.push({ ref: bp, origin: "drawn", plane: null, movable: false, kind: "plane", at: rec.at, u: f.X, v: f.n });
  const bb = { origin: "drawn" as const, plane: bp, movable: false as const };
  const nb = b.blank.length;
  b.blank.forEach(([a, h], i) => out.push({ ...bb, ref: ref(rec.id, `knp${i}`), kind: "corner", at: at(a, 0, h) }));
  for (let i = 0; i < nb; i++) out.push({ ...bb, ref: ref(rec.id, `kns${i}`), kind: "line", a: ref(rec.id, `knp${i}`), b: ref(rec.id, `knp${(i + 1) % nb}`) });
  return out;
}
export function spiralSteps(s: Scene, rec: GearRecord): Omit<Step, "id">[] | null {
  const pl = s.parts[rec.plane];
  if (!pl || pl.kind !== "plane" || !spiralOf(rec)) return null;
  const { sections, bores, blank } = spiralRefs(rec);
  const f = bevelFrame(pl.u, pl.v, rec.spec, rec.turn ?? 0);
  const figs: Figure[] = sections.map((lines, q) => ({ outer: lines, holes: bores[q] ? [bores[q]!.split(",") as Ref[]] : [] }));
  // the prism of the tooth sections (a smooth loft, a piece of its own), the blank (a piece of its own) and the two intersected
  return [
    { type: "loft", parts: sections[0]!, params: { ...figureParams(figs), mode: "new", gear: rec.id } },
    { type: "revolve", parts: blank, params: { angle: 360, advance: 0, ax: rec.at[0], ay: rec.at[1], az: rec.at[2], dx: f.n[0], dy: f.n[1], dz: f.n[2], mode: "new", gear: rec.id } },
    { type: "combine", parts: ["b/x_$0/o" as Ref, "b/x_$1/o" as Ref], params: { mode: "intersect", gear: rec.id } },
  ];
}
