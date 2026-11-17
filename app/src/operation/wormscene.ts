// The parts and steps of a worm and of its wheel (`dec_worm_gears`, `in_608`), made from a gear record by `gearscene.ts` as those of any gear are.
// The gear's frame: X along the plane's first direction turned by the record's turn, Y at right angles to it in the plane, n the plane's normal.
//  - A worm lies along X through the record's centre. Its thread's figure, one trapezoid for each start, is drawn in the plane at the +Y side of the axis (the section through the axis); its core is a circle on a plane across the axis at
//    the worm's start. Steps: the core extruded along the axis, then each start's figure carried along a helix about the axis (`dec_spiral_extrude`) and joined to it.
//  - A worm wheel lies in the plane about its centre, with the worm's axis along X at -cd in Y. Its sections (`wheelsections.ts`) are drawn on SECTIONS planes parallel to the plane, at heights across n; the step is a loft through them.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Step, Figure } from "./scene.ts";
import { figureParams } from "./scene.ts";
import type { Part } from "./part.ts";
import type { GearRecord } from "./gearscene.ts";
import { wormOf, wormLayout, wheelOf } from "./worm.ts";
import { boreLoop } from "./bore.ts";
import { wheelSections, SECTIONS } from "./wheelsections.ts";

const [cross, sub] = [(a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]];
void sub;
interface Frame { X: Vec3; Y: Vec3; n: Vec3; u: Vec3; v: Vec3 }
function frameOf(s: Scene, rec: GearRecord): Frame | null {
  const pl = s.parts[rec.plane];
  if (!pl || pl.kind !== "plane") return null;
  const [c, sn] = [Math.cos(rec.turn ?? 0), Math.sin(rec.turn ?? 0)];
  const [u, v] = [pl.u, pl.v];
  const X: Vec3 = [u[0] * c + v[0] * sn, u[1] * c + v[1] * sn, u[2] * c + v[2] * sn];
  const Y: Vec3 = [-u[0] * sn + v[0] * c, -u[1] * sn + v[1] * c, -u[2] * sn + v[2] * c];
  const n = cross(X, Y), len = Math.hypot(...n) || 1;
  return { X, Y, n: [n[0] / len, n[1] / len, n[2] / len], u, v };
}
const along = (at: Vec3, f: Frame, x: number, y: number, h = 0): Vec3 => [at[0] + f.X[0] * x + f.Y[0] * y + f.n[0] * h, at[1] + f.X[1] * x + f.Y[1] * y + f.n[1] * h, at[2] + f.X[2] * x + f.Y[2] * y + f.n[2] * h];
const ref = (id: string, name: string): Ref => drawnRef(`${id}.${name}`);

// ---- the worm ----
export interface WormRefs { threads: Ref[][]; core: Ref[]; plane: Ref }
export function wormRefs(rec: GearRecord): WormRefs {
  const k = Math.round(rec.spec.teeth);
  return { threads: Array.from({ length: k }, (_, j) => [0, 1, 2, 3].map((i) => ref(rec.id, `t${j}s${i}`))), core: [0, 1, 2, 3].map((i) => ref(rec.id, `c${i}s`)), plane: ref(rec.id, "cq") };
}
export function wormParts(s: Scene, rec: GearRecord): Part[] {
  const f = frameOf(s, rec), g = wormOf(rec.spec);
  if (!f || !g.ok) return [];
  const lay = wormLayout(g.value, rec.spec.worm!);
  const base = { origin: "drawn" as const, plane: rec.plane, movable: false };
  const out: Part[] = [];
  const k = Math.round(rec.spec.teeth);
  for (let j = 0; j < k; j++) {
    lay.figure.forEach(([a, r], i) => out.push({ ...base, ref: ref(rec.id, `t${j}p${i}`), kind: "corner", at: along(rec.at, f, lay.a0 + j * g.value.px + a, r) }));
    for (let i = 0; i < 4; i++) out.push({ ...base, ref: ref(rec.id, `t${j}s${i}`), kind: "line", a: ref(rec.id, `t${j}p${i}`), b: ref(rec.id, `t${j}p${(i + 1) % 4}`) });
  }
  // the core: a rectangle (its inner side the bore's radius, or on the axis) drawn on a second plane through the axis, a quarter turn from the sheet, and turned about the axis: a cylinder (a tube with a bore)
  const L = lay.core, q = ref(rec.id, "cq"), loop = (rec.spec.bore ?? 0) > 0 ? boreLoop(rec.spec) : null, r0 = loop ? 0 : (rec.spec.bore ?? 0) / 2;
  out.push({ ref: q, origin: "drawn", plane: null, movable: false, kind: "plane", at: rec.at, u: f.X, v: f.n });
  const qb = { origin: "drawn" as const, plane: q, movable: false };
  const rect: [number, number][] = [[-L / 2, r0], [L / 2, r0], [L / 2, g.value.rRoot], [-L / 2, g.value.rRoot]];
  rect.forEach(([a, r], i) => out.push({ ...qb, ref: ref(rec.id, `c${i}p`), kind: "corner", at: along(rec.at, f, a, 0, r) }));
  for (let i = 0; i < 4; i++) out.push({ ...qb, ref: ref(rec.id, `c${i}s`), kind: "line", a: ref(rec.id, `c${i}p`), b: ref(rec.id, `c${(i + 1) % 4}p`) });
  lay.cuts.forEach((poly, k) => { // (the figures cut away after the threads: the two run-outs, or what is beyond a flat end, on the same plane as the core)
    poly.forEach(([a, r], i) => out.push({ ...qb, ref: ref(rec.id, `x${k}p${i}`), kind: "corner", at: along(rec.at, f, a, 0, r) }));
    for (let i = 0; i < poly.length; i++) out.push({ ...qb, ref: ref(rec.id, `x${k}s${i}`), kind: "line", a: ref(rec.id, `x${k}p${i}`), b: ref(rec.id, `x${k}p${(i + 1) % poly.length}`) });
  });
  if (loop) { // a flat or a keyway: the loop of the bore on a plane across the axis, just before the worm's start, cut along the whole of it (a revolved core can only have a round bore)
    const bq = ref(rec.id, "bq");
    out.push({ ref: bq, origin: "drawn", plane: null, movable: false, kind: "plane", at: along(rec.at, f, -L / 2 - 1, 0, 0), u: f.Y, v: f.n });
    const bb = { origin: "drawn" as const, plane: bq, movable: false };
    loop.points.forEach((p, i) => out.push({ ...bb, ref: ref(rec.id, `bp${i}`), kind: "corner", at: along(rec.at, f, -L / 2 - 1, p[0], p[1]) }));
    loop.points.forEach((_, i) => out.push({ ...bb, ref: ref(rec.id, `bs${i}`), kind: "line", a: ref(rec.id, `bp${i}`), b: ref(rec.id, `bp${(i + 1) % loop.points.length}`), ...(loop.bulges[i] ? { bulge: loop.bulges[i]! } : {}) }));
  }
  return out;
}
export function wormSteps(s: Scene, rec: GearRecord): Omit<Step, "id">[] | null {
  const f = frameOf(s, rec), g = wormOf(rec.spec);
  if (!f || !g.ok) return null;
  const { threads, core } = wormRefs(rec);
  const lay = wormLayout(g.value, rec.spec.worm!), L = lay.core;
  const axis = { ax: rec.at[0], ay: rec.at[1], az: rec.at[2], dx: f.X[0], dy: f.X[1], dz: f.X[2] };
  const steps: Omit<Step, "id">[] = [{ type: "revolve", parts: core, params: { angle: 360, advance: 0, ...axis, mode: "new", gear: rec.id } }]; // (a piece of its own: it stands beside the wheel it drives and does not cut or join it)
  for (const lines of threads) steps.push({ type: "revolve", parts: lines, params: { angle: (360 * lay.sweep) / g.value.lead, advance: lay.sweep, ...axis, mode: "add", gear: rec.id } });
  lay.cuts.forEach((poly, k) => steps.push({ type: "revolve", parts: poly.map((_, i) => ref(rec.id, `x${k}s${i}`)), params: { angle: 360, advance: 0, ...axis, mode: "cut", gear: rec.id } })); // (a revolve that takes away: the run-outs, or the ends)
  const loop = (rec.spec.bore ?? 0) > 0 ? boreLoop(rec.spec) : null;
  if (loop) steps.push({ type: "extrude", parts: loop.points.map((_, i) => ref(rec.id, `bs${i}`)), params: { depth: String(L + 2), mode: "cut", gear: rec.id } }); // (a flat or a keyway: cut along the axis after the threads are on)
  return steps;
}

// ---- the wheel ----
export interface WheelRefs { sections: Ref[][]; planes: Ref[]; /** the hole of each section as the lines (or the circle) it is made of, joined by commas */ bores: string[] }
export function wheelRefs(rec: GearRecord): WheelRefs {
  const w = wheelSections(rec.spec);
  const sides = w.ok ? w.value[0]!.points.length : 0;
  return { sections: Array.from({ length: SECTIONS }, (_, q) => Array.from({ length: sides }, (_, i) => ref(rec.id, `w${q}s${i}`))), planes: Array.from({ length: SECTIONS }, (_, q) => ref(rec.id, `w${q}q`)), bores: (rec.spec.bore ?? 0) > 0 ? Array.from({ length: SECTIONS }, (_, q) => { const l = boreLoop(rec.spec); return l ? l.points.map((_, k) => ref(rec.id, `w${q}bs${k}`)).join(",") : ref(rec.id, `w${q}b`); }): [] };
}
export function wheelParts(s: Scene, rec: GearRecord): Part[] {
  const f = frameOf(s, rec), g = wheelOf(rec.spec), w = wheelSections(rec.spec);
  if (!f || !g.ok || !w.ok) return [];
  const out: Part[] = [];
  w.value.forEach((sec, q) => {
    const pl = ref(rec.id, `w${q}q`);
    out.push({ ref: pl, origin: "drawn", plane: null, movable: false, kind: "plane", at: along(rec.at, f, 0, 0, sec.h), u: f.u, v: f.v });
    const base = { origin: "drawn" as const, plane: pl, movable: false };
    const n = sec.points.length;
    sec.points.forEach((p, i) => out.push({ ...base, ref: ref(rec.id, `w${q}p${i}`), kind: "corner", at: along(rec.at, f, p[0], p[1], sec.h) }));
    for (let i = 0; i < n; i++) out.push({ ...base, ref: ref(rec.id, `w${q}s${i}`), kind: "line", a: ref(rec.id, `w${q}p${i}`), b: ref(rec.id, `w${q}p${(i + 1) % n}`), ...(sec.bulges[i] ? { bulge: sec.bulges[i]! } : {}) });
    const loop = (rec.spec.bore ?? 0) > 0 ? boreLoop(rec.spec) : null;
    if (loop) { // (a flat or a keyway: the bore is a loop of its own, as a plain gear's is)
      loop.points.forEach((p, i) => out.push({ ...base, ref: ref(rec.id, `w${q}bp${i}`), kind: "corner", at: along(rec.at, f, p[0], p[1], sec.h) }));
      loop.points.forEach((_, i) => out.push({ ...base, ref: ref(rec.id, `w${q}bs${i}`), kind: "line", a: ref(rec.id, `w${q}bp${i}`), b: ref(rec.id, `w${q}bp${(i + 1) % loop.points.length}`), ...(loop.bulges[i] ? { bulge: loop.bulges[i]! } : {}) }));
    } else if ((rec.spec.bore ?? 0) > 0) {
      out.push({ ...base, ref: ref(rec.id, `w${q}c`), kind: "corner", at: along(rec.at, f, 0, 0, sec.h) });
      out.push({ ...base, ref: ref(rec.id, `w${q}b`), kind: "circle", center: ref(rec.id, `w${q}c`), radius: rec.spec.bore! / 2 });
    }
  });
  const land = rec.spec.wheel?.land ?? 0;
  if (land > 0) for (const q of [0, SECTIONS - 1]) { // (the round shoulder at each face that the land is made from, `in_783`)
    const [sec, pl] = [w.value[q]!, ref(rec.id, `w${q}q`)];
    out.push({ origin: "drawn", plane: pl, movable: false, ref: ref(rec.id, `w${q}kc`), kind: "corner", at: along(rec.at, f, 0, 0, sec.h) });
    out.push({ origin: "drawn", plane: pl, movable: false, ref: ref(rec.id, `w${q}k`), kind: "circle", center: ref(rec.id, `w${q}kc`), radius: g.value.landRadius });
  }
  return out;
}
export function wheelSteps(s: Scene, rec: GearRecord): Omit<Step, "id">[] | null {
  if (!frameOf(s, rec) || !wheelOf(rec.spec).ok || !wheelSections(rec.spec).ok) return null;
  const { sections, bores } = wheelRefs(rec);
  const figs: Figure[] = sections.map((lines, q) => ({ outer: lines, holes: bores[q] ? [bores[q]!.split(",") as Ref[]] : [] }));
  const steps: Omit<Step, "id">[] = [{ type: "loft", parts: sections[0]!, params: { ...figureParams(figs), mode: "new", gear: rec.id } }]; // (a piece of its own, beside the worm it meshes with)
  const land = rec.spec.wheel?.land ?? 0;
  if (land > 0) for (const [q, depth] of [[0, -land], [SECTIONS - 1, land]] as const) steps.push({ type: "extrude", parts: [ref(rec.id, `w${q}k`)], params: { depth, ...(bores[q] ? { holes: bores[q]! } : {}), mode: "add", gear: rec.id } }); // (a round shoulder at each face, as wide as clears the worm's thread: a land, `in_783`)
  return steps;
}
