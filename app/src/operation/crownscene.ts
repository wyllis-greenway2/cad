// The parts and steps of a crown gear (`dec_crown_gears`, `in_802`), made from a gear record by `gearscene.ts` as those of a bevel gear are. The gear's plane is its pitch plane; its axis is the plane's normal and the teeth stand on the `+n` side.
// The body: a loft of the whole toothed ring between two sections (the tip and the root, ruled: the flanks are planes, so two sections hold them exactly) cut by a revolved blank (no raised hub inside the teeth),
// and a plate under it (an extruded disc, a thickness thick), the two joined.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Step, Figure } from "./scene.ts";
import { figureParams } from "./scene.ts";
import type { Part } from "./part.ts";
import type { GearRecord } from "./gearscene.ts";
import { bevelFrame } from "./bevel.ts";
import { crownOf, crownSection } from "./crown.ts";
import { boreLoop } from "./bore.ts";

const ref = (id: string, name: string): Ref => drawnRef(`${id}.${name}`);
const SECTIONS = 2;
/** the heights of the loft's sections: the tip and a little under the root (the flanks are planes: the flank's offset is straight in the height, so two sections hold them exactly) */
const heights = (g: { tip: number; root: number }, m: number): number[] => [g.tip, -(g.root + 0.3 * m)];
export interface CrownRefs { sections: Ref[][]; planes: Ref[]; blank: Ref[]; blankPlane: Ref; plate: Ref; platePlane: Ref; plateBore: string | undefined }
export function crownRefs(rec: GearRecord): CrownRefs {
  const c = crownOf(rec.spec);
  const sides = c.ok ? crownSection(rec.spec, c.value, 0).points.length : 0;
  const loop = (rec.spec.bore ?? 0) > 0 ? boreLoop(rec.spec) : null;
  const bore = (q: string): string | undefined => ((rec.spec.bore ?? 0) > 0 ? (loop ? loop.points.map((_, k) => ref(rec.id, `${q}bs${k}`)).join(",") : ref(rec.id, `${q}b`)) : undefined);
  return {
    sections: Array.from({ length: SECTIONS }, (_, q) => Array.from({ length: sides }, (_, i) => ref(rec.id, `v${q}s${i}`))), planes: Array.from({ length: SECTIONS }, (_, q) => ref(rec.id, `v${q}q`)),
    blank: Array.from({ length: 6 }, (_, i) => ref(rec.id, `kns${i}`)), blankPlane: ref(rec.id, "knq"),
    plate: ref(rec.id, "pk"), platePlane: ref(rec.id, "pq"), plateBore: bore("p"),
  };
}
/** the inner radius of the thin hub that joins the teeth: clear of the bore (its keyway or flat too) by a millimetre, or 0 with no bore */
const hubInner = (rec: GearRecord): number => { if (!((rec.spec.bore ?? 0) > 0)) return 0; const l = boreLoop(rec.spec); return 1 + (l ? Math.max(...l.points.map((p) => Math.hypot(p[0], p[1]))) : rec.spec.bore! / 2); };
export function crownParts(s: Scene, rec: GearRecord): Part[] {
  const pl = s.parts[rec.plane], c = crownOf(rec.spec);
  if (!pl || pl.kind !== "plane" || !c.ok) return [];
  const g = c.value, m = rec.spec.module;
  const f = bevelFrame(pl.u, pl.v, rec.spec, rec.turn ?? 0);
  const [u, v] = rec.spec.bevel?.frame ?? [pl.u, pl.v];
  const at = (x: number, y: number, h: number): Vec3 => [rec.at[0] + f.X[0] * x + f.Y[0] * y + f.n[0] * h, rec.at[1] + f.X[1] * x + f.Y[1] * y + f.n[1] * h, rec.at[2] + f.X[2] * x + f.Y[2] * y + f.n[2] * h];
  const loop = (rec.spec.bore ?? 0) > 0 ? boreLoop(rec.spec) : null;
  const out: Part[] = [];
  const addBore = (q: string, base: { origin: "drawn"; plane: Ref; movable: false }, h: number) => {
    if (loop) {
      loop.points.forEach((p, i) => out.push({ ...base, ref: ref(rec.id, `${q}bp${i}`), kind: "corner", at: at(p[0], p[1], h) }));
      loop.points.forEach((_, i) => out.push({ ...base, ref: ref(rec.id, `${q}bs${i}`), kind: "line", a: ref(rec.id, `${q}bp${i}`), b: ref(rec.id, `${q}bp${(i + 1) % loop.points.length}`), ...(loop.bulges[i] ? { bulge: loop.bulges[i]! } : {}) }));
    } else if ((rec.spec.bore ?? 0) > 0) {
      out.push({ ...base, ref: ref(rec.id, `${q}c`), kind: "corner", at: at(0, 0, h) });
      out.push({ ...base, ref: ref(rec.id, `${q}b`), kind: "circle", center: ref(rec.id, `${q}c`), radius: rec.spec.bore! / 2 });
    }
  };
  heights(g, m).forEach((h, q) => {
    const plane = ref(rec.id, `v${q}q`);
    out.push({ ref: plane, origin: "drawn", plane: null, movable: false, kind: "plane", at: at(0, 0, h), u, v });
    const base = { origin: "drawn" as const, plane, movable: false as const };
    const { points, bulges } = crownSection(rec.spec, g, h);
    const n = points.length;
    points.forEach((p, i) => out.push({ ...base, ref: ref(rec.id, `v${q}p${i}`), kind: "corner", at: at(p[0], p[1], h) }));
    for (let i = 0; i < n; i++) out.push({ ...base, ref: ref(rec.id, `v${q}s${i}`), kind: "line", a: ref(rec.id, `v${q}p${i}`), b: ref(rec.id, `v${q}p${(i + 1) % n}`), ...(bulges[i] ? { bulge: bulges[i]! } : {}) });
  });
  // the blank: a shape revolved about the axis, on a plane through it (radius along the first direction, height along the axis): no hub inside the teeth, the bottom a little under the plate's top
  const bp = ref(rec.id, "knq");
  out.push({ ref: bp, origin: "drawn", plane: null, movable: false, kind: "plane", at: rec.at, u: f.X, v: f.n });
  const bb = { origin: "drawn" as const, plane: bp, movable: false as const };
  const top = g.tip + m, bottom = -(g.root + 0.2 * m), hub = -(g.root + 0.1 * m);
  const rh = hubInner(rec); // (the hub: a thin ring inside the roots joining the teeth, wholly inside the plate, clear of the bore)
  const blank: [number, number][] = [[rh, bottom], [g.outer + m, bottom], [g.outer + m, top], [g.inner, top], [g.inner, hub], [rh, hub]];
  blank.forEach(([a, h], i) => out.push({ ...bb, ref: ref(rec.id, `knp${i}`), kind: "corner", at: at(a, 0, h) }));
  for (let i = 0; i < 6; i++) out.push({ ...bb, ref: ref(rec.id, `kns${i}`), kind: "line", a: ref(rec.id, `knp${i}`), b: ref(rec.id, `knp${(i + 1) % 6}`) });
  // the plate: a disc on a plane a thickness below the root, drawn there and carried up to it
  const pq = ref(rec.id, "pq");
  out.push({ ref: pq, origin: "drawn", plane: null, movable: false, kind: "plane", at: at(0, 0, -(g.root + g.thick)), u, v });
  const pb = { origin: "drawn" as const, plane: pq, movable: false as const };
  out.push({ ...pb, ref: ref(rec.id, "pc"), kind: "corner", at: at(0, 0, -(g.root + g.thick)) });
  out.push({ ...pb, ref: ref(rec.id, "pk"), kind: "circle", center: ref(rec.id, "pc"), radius: g.outer + 0.5 * m }); // (a little wider than the tips: the cylinder of the tips and the plate's would coincide)
  addBore("p", pb, -(g.root + g.thick));
  return out;
}
export function crownSteps(s: Scene, rec: GearRecord): Omit<Step, "id">[] | null {
  const pl = s.parts[rec.plane], c = crownOf(rec.spec);
  if (!pl || pl.kind !== "plane" || !c.ok) return null;
  const r = crownRefs(rec), g = c.value;
  const f = bevelFrame(pl.u, pl.v, rec.spec, rec.turn ?? 0);
  const figs: Figure[] = r.sections.map((lines) => ({ outer: lines, holes: [] }));
  const all: Omit<Step, "id">[] = [
    { type: "loft", parts: r.sections[0]!, params: { ...figureParams(figs), ruled: 1, mode: "new", gear: rec.id } },
    { type: "revolve", parts: r.blank, params: { angle: 360, advance: 0, ax: rec.at[0], ay: rec.at[1], az: rec.at[2], dx: f.n[0], dy: f.n[1], dz: f.n[2], mode: "new", gear: rec.id } },
    { type: "combine", parts: ["b/x_$0/o" as Ref, "b/x_$1/o" as Ref], params: { mode: "intersect", gear: rec.id } },
    { type: "extrude", parts: [r.plate], params: { depth: g.thick, ...(r.plateBore ? { holes: r.plateBore } : {}), mode: "new", gear: rec.id } },
    { type: "combine", parts: ["b/x_$0/o" as Ref, "b/x_$3/o" as Ref], params: { mode: "add", gear: rec.id } },
  ];
  return all;
}
