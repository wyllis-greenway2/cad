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
import { chamferOf } from "./gear.ts";
import { wheelEnds } from "./wheelinset.ts";
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
  if (land > 0) for (const side of [-1, 1] as const) { // (the worm's envelope beyond each face: the figure of the cylinder about the worm's axis that is past the plane of the face, drawn across the worm's axis, `in_790`)
    const t = envelope(rec, g.value, side);
    out.push({ ref: t.plane, origin: "drawn", plane: null, movable: false, kind: "plane", at: along(rec.at, f, -t.ext, 0, 0), u: f.Y, v: f.n });
    const base = { origin: "drawn" as const, plane: t.plane, movable: false };
    t.points.forEach(([y, h], i) => out.push({ ...base, ref: t.corners[i]!, kind: "corner", at: along(rec.at, f, -t.ext, y, h) }));
    t.points.forEach((_, i) => out.push({ ...base, ref: t.lines[i]!, kind: "line", a: t.corners[i]!, b: t.corners[(i + 1) % 2]!, ...(t.bulges[i] ? { bulge: t.bulges[i]! } : {}) }));
  }
  return out;
}
export function wheelSteps(s: Scene, rec: GearRecord): Omit<Step, "id">[] | null {
  if (!frameOf(s, rec) || !wheelOf(rec.spec).ok || !wheelSections(rec.spec).ok) return null;
  const { sections, bores } = wheelRefs(rec);
  const figs: Figure[] = sections.map((lines, q) => ({ outer: lines, holes: bores[q] ? [bores[q]!.split(",") as Ref[]] : [] }));
  const steps: Omit<Step, "id">[] = [{ type: "loft", parts: sections[0]!, params: { ...figureParams(figs), mode: "new", gear: rec.id } }]; // (a piece of its own, beside the worm it meshes with)
  const land = rec.spec.wheel?.land ?? 0;
  if (land > 0) {
    // a land (`in_790`): the end sections carried straight out to the faces as pieces of their own; the worm's envelope (the cylinder about its axis, as far as it lies past the face) cut out of each, so that the teeth of the land stand
    // where the thread is not and the wheel can turn with the worm; then the three pieces joined. `@sN` is the body of this gear's Nth step, named when the steps are (`resolveOwnRefs`).
    const g = wheelOf(rec.spec);
    if (!g.ok) return null;
    const [lo, hi] = [envelope(rec, g.value, -1), envelope(rec, g.value, 1)];
    const f = frameOf(s, rec)!;
    const own = { gear: rec.id };
    // the pieces first joined by sewing their faces (the end sections are the same outlines: no boolean), then the worm's envelope cut out of the whole (`in_814`: the fuse of the lands took eleven seconds)
    // an edge chamfer (`in_828`): each land is a body of the kernel's own, a ruled loft from the section pulled in by the chamfer at the face to the full section a chamfer in, and the rest straight
    const ends = (rec.spec.edge ?? 0) > 0 ? wheelEnds(rec.spec) : null;
    if (ends && !ends.ok) return null;
    const text = (o: { points: [number, number][]; bulges: number[] }) => o.points.map((p, i) => `${+p[0].toFixed(7)} ${+p[1].toFixed(7)} ${+(o.bulges[i] ?? 0).toFixed(9)}`).join(";");
    const chamfered = (end: "lo" | "hi"): Omit<Step, "id"> => {
      const e = ends!.ok ? ends!.value[end] : null!;
      const o = along(rec.at, f, 0, 0, end === "lo" ? -g.value.width / 2 - land : g.value.width / 2);
      return { type: "chamferBody", parts: sections[end === "lo" ? 0 : SECTIONS - 1]!, params: { full: text(e.full), inset: text(e.inset), edge: rec.spec.edge!, width: land, one: end === "lo" ? -1 : 1, bore: rec.spec.bore ?? 0, wall: 0, cx: o[0], cy: o[1], cz: o[2], dx: f.n[0], dy: f.n[1], dz: f.n[2], ux: f.X[0], uy: f.X[1], uz: f.X[2], ...(bores[end === "lo" ? 0 : SECTIONS - 1] ? { holes: bores[end === "lo" ? 0 : SECTIONS - 1]! } : {}), ...own } };
    };
    steps.push(
      ends ? chamfered("lo") : { type: "extrude", parts: sections[0]!, params: { depth: -land, ...(bores[0] ? { holes: bores[0]! } : {}), mode: "new", ...own } },
      ends ? chamfered("hi") : { type: "extrude", parts: sections[SECTIONS - 1]!, params: { depth: land, ...(bores[SECTIONS - 1] ? { holes: bores[SECTIONS - 1]! } : {}), mode: "new", ...own } },
      { type: "sewBodies", parts: ["@s0", "@s1", "@s2"] as Ref[], params: { cx: rec.at[0], cy: rec.at[1], cz: rec.at[2], dx: f.n[0], dy: f.n[1], dz: f.n[2], heights: `${-g.value.width / 2},${g.value.width / 2}`, ...own } },
      { type: "extrude", parts: lo.lines, params: { depth: 2 * lo.ext, mode: "new", ...own } },
      { type: "extrude", parts: hi.lines, params: { depth: 2 * hi.ext, mode: "new", ...own } },
      { type: "combine", parts: ["@s0", "@s4"] as Ref[], params: { mode: "subtract", ...own } },
      { type: "combine", parts: ["@s0", "@s5"] as Ref[], params: { mode: "subtract", ...own } },
    );
  }
  const ch = chamferOf(rec.spec), w = wheelOf(rec.spec), secs = wheelSections(rec.spec);
  if (ch && w.ok && secs.ok) { // the tips of the teeth broken at both faces (`in_826`): the kernel's wedge for each tooth, as for a gear; the tooth 0 stands where the sections' first tooth does, the tip circle is the throat's at the faces of the throated part
    const f = frameOf(s, rec)!;
    const pts = secs.value[0]!.points, per = pts.length / Math.round(rec.spec.teeth);
    const [a1, a2] = [Math.atan2(pts[per - 1]![1], pts[per - 1]![0]), Math.atan2(pts[per % pts.length]![1], pts[per % pts.length]![0])];
    const mid = a1 + Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)) / 2; // (the middle of the first tooth's tip: the arc after the gap's last point)
    const first: Vec3 = [f.X[0] * Math.cos(mid) + f.Y[0] * Math.sin(mid), f.X[1] * Math.cos(mid) + f.Y[1] * Math.sin(mid), f.X[2] * Math.cos(mid) + f.Y[2] * Math.sin(mid)];
    const c0 = along(rec.at, f, 0, 0, -ch.width / 2);
    steps.push({ type: "toothChamfer", parts: ["@s0"] as Ref[], params: { gear: rec.id, teeth: Math.round(rec.spec.teeth), tip: w.value.tipAt(w.value.width / 2), depth: ch.depth, width: ch.width, side: 1, twist: 0, cx: c0[0], cy: c0[1], cz: c0[2], dx: f.n[0], dy: f.n[1], dz: f.n[2], ux: first[0], uy: first[1], uz: first[2] } });
  }
  return steps;
}
/**
 * The worm's envelope past one face of the wheel (`in_790`): the cylinder of radius `clear` about the worm's axis (along the wheel's X at -cd in Y), as far as it lies beyond the plane of that face (at +-width/2): in the plane across the worm's axis
 * a circular segment, a chord at the face and an arc round the axis, drawn at x = -ext (wide enough for the whole wheel) and carried 2 ext along the axis. As points (y, h) and the bulge of each side, with the names of its corners, sides and plane.
 */
function envelope(rec: GearRecord, g: { cd: number; clear: number; width: number }, side: -1 | 1): { ext: number; points: [number, number][]; bulges: number[]; corners: Ref[]; lines: Ref[]; plane: Ref } {
  const k = side > 0 ? "p" : "m";
  const hc = (g.width / 2) * side;
  const q = Math.sqrt(Math.max(1e-9, g.clear * g.clear - hc * hc));
  const bulge = -(g.clear - Math.abs(hc)) / (2 * q); // (the arc bows away from the chord, to the right of the way it goes from its first corner)
  const left: [number, number] = [-g.cd - q, hc], right: [number, number] = [-g.cd + q, hc];
  // counter-clockwise in (y, h): above the face the chord is the bottom (left to right, then the arc back over the top); below it the chord is the top (the arc from the left under to the right, then the chord back)
  const points: [number, number][] = [left, right];
  const bulges = side > 0 ? [0, bulge] : [bulge, 0];
  return { ext: (rec.spec.module * rec.spec.teeth) / 2 + 3 * rec.spec.module, points, bulges, corners: [0, 1].map((i) => ref(rec.id, `w${k}tp${i}`)), lines: [0, 1].map((i) => ref(rec.id, `w${k}ts${i}`)), plane: ref(rec.id, `w${k}tq`) };
}
