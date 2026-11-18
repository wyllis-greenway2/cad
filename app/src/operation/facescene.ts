// The parts and steps of a face gear drive's two gears (`dec_crown_gear_set`, `in_879`), made from a gear record by `gearscene.ts` as those of a crown gear are (`crownscene.ts`).
// The face gear: its plane is its pitch plane, its axis the plane's normal, the teeth stand on the `+n` side. The body: a smooth loft of the toothed ring through five heights (`face.ts`: the tooth is the pinion's envelope, curved), cut by a revolved blank (a thin hub joins the teeth) and joined to a plate.
// The spur pinion: its axis lies along a radius of the face gear; its plane is across that axis at the inner end of the teeth and it is extruded along the axis over the face (`bevel.frame` is its plane's directions, as a bevel partner's).
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Step, Figure } from "./scene.ts";
import { figureParams } from "./scene.ts";
import type { Part } from "./part.ts";
import type { GearRecord } from "./gearscene.ts";
import { bevelFrame } from "./bevel.ts";
import { faceFor, faceBody } from "./face.ts";
import type { FacePair, FaceBody } from "./face.ts";
import { gearOutline } from "./gear.ts";
import type { GearSpec } from "./gear.ts";
import { boreLoop } from "./bore.ts";

const ref = (id: string, name: string): Ref => drawnRef(`${id}.${name}`);
/** how far the pinion's plane is out from where the axes cross, in front of the teeth's inner end (mm): the pinion is a millimetre longer than the face at each end */
export const PINION_OVERHANG = 1;
/** the pinion's width: the face and the overhang at each end */
export const pinionWidth = (pr: FacePair): number => pr.outer - pr.inner + 2 * PINION_OVERHANG;
/** the pair and the body of a face gear record, or null if it makes none */
export function faceGearOf(rec: GearRecord): { pair: FacePair; body: FaceBody } | null {
  const f = faceFor(rec.spec);
  if (!f.ok || f.value.role !== "gear") return null;
  const b = faceBody(f.value.pair);
  return b.ok ? { pair: f.value.pair, body: b.value } : null;
}
/** the spur outline of a face gear drive's pinion (a plain spur gear of its teeth, module and backlash) */
function pinionOutline(spec: GearSpec) {
  const o = gearOutline({ teeth: spec.teeth, module: spec.module, ...(spec.backlash !== undefined ? { backlash: spec.backlash } : {}) });
  return o.ok ? o.value : null;
}
export interface FaceRefs { sections: Ref[][]; blank: Ref[]; plate: Ref; plateBore: string | undefined; /** the pinion's outline sides, its bore */ lines: Ref[]; bore: string | undefined }
export function faceRefs(rec: GearRecord): FaceRefs {
  const loop = (rec.spec.bore ?? 0) > 0 ? boreLoop(rec.spec) : null;
  const bore = (q: string): string | undefined => ((rec.spec.bore ?? 0) > 0 ? (loop ? loop.points.map((_, k) => ref(rec.id, `${q}bs${k}`)).join(",") : ref(rec.id, `${q}b`)) : undefined);
  if (rec.spec.bevel?.facegear === "pinion") {
    const o = pinionOutline(rec.spec);
    return { sections: [], blank: [], plate: ref(rec.id, "pk"), plateBore: undefined, lines: o ? o.points.map((_, i) => ref(rec.id, `s${i}`)) : [], bore: bore("") };
  }
  const g = faceGearOf(rec);
  return { sections: g ? g.body.sections.map((s, q) => s.points.map((_, i) => ref(rec.id, `v${q}s${i}`))) : [], blank: Array.from({ length: 6 }, (_, i) => ref(rec.id, `kns${i}`)), plate: ref(rec.id, "pk"), plateBore: bore("p"), lines: [], bore: undefined };
}
/** the inner radius of the thin hub that joins the teeth: clear of the bore (its keyway or flat too) by a millimetre, or 0 with no bore */
const hubInner = (rec: GearRecord): number => { if (!((rec.spec.bore ?? 0) > 0)) return 0; const l = boreLoop(rec.spec); return 1 + (l ? Math.max(...l.points.map((p) => Math.hypot(p[0], p[1]))) : rec.spec.bore! / 2); };
export function faceParts(s: Scene, rec: GearRecord): Part[] {
  const pl = s.parts[rec.plane];
  if (!pl || pl.kind !== "plane") return [];
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
  if (rec.spec.bevel?.facegear === "pinion") { // the spur pinion: its outline on a plane of its own across the axis
    const o = pinionOutline(rec.spec);
    if (!o) return [];
    const plane = ref(rec.id, "pq");
    out.push({ ref: plane, origin: "drawn", plane: null, movable: false, kind: "plane", at: rec.at, u, v });
    const base = { origin: "drawn" as const, plane, movable: false as const };
    const n = o.points.length;
    o.points.forEach((p, i) => out.push({ ...base, ref: ref(rec.id, `p${i}`), kind: "corner", at: at(p[0], p[1], 0) }));
    for (let i = 0; i < n; i++) out.push({ ...base, ref: ref(rec.id, `s${i}`), kind: "line", a: ref(rec.id, `p${i}`), b: ref(rec.id, `p${(i + 1) % n}`), ...(o.bulges[i] ? { bulge: o.bulges[i]! } : {}) });
    addBore("", base, 0);
    return out;
  }
  const g = faceGearOf(rec);
  if (!g) return [];
  const { pair, body } = g, m = pair.m;
  body.sections.forEach(({ h, points, bulges }, q) => {
    const plane = ref(rec.id, `v${q}q`);
    out.push({ ref: plane, origin: "drawn", plane: null, movable: false, kind: "plane", at: at(0, 0, h), u, v });
    const base = { origin: "drawn" as const, plane, movable: false as const };
    const n = points.length;
    points.forEach((p, i) => out.push({ ...base, ref: ref(rec.id, `v${q}p${i}`), kind: "corner", at: at(p[0], p[1], h) }));
    for (let i = 0; i < n; i++) out.push({ ...base, ref: ref(rec.id, `v${q}s${i}`), kind: "line", a: ref(rec.id, `v${q}p${i}`), b: ref(rec.id, `v${q}p${(i + 1) % n}`), ...(bulges[i] ? { bulge: bulges[i]! } : {}) });
  });
  // the blank: a ring from the inner radius out, a thin hub inside the roots, revolved about the axis
  const bp = ref(rec.id, "knq");
  out.push({ ref: bp, origin: "drawn", plane: null, movable: false, kind: "plane", at: rec.at, u: f.X, v: f.n });
  const bb = { origin: "drawn" as const, plane: bp, movable: false as const };
  const top = body.tip + m, bottom = -(body.root + 0.2 * m), hub = -(body.root + 0.1 * m), rh = hubInner(rec);
  const blank: [number, number][] = [[rh, bottom], [pair.outer + m, bottom], [pair.outer + m, top], [pair.inner, top], [pair.inner, hub], [rh, hub]];
  blank.forEach(([a, h], i) => out.push({ ...bb, ref: ref(rec.id, `knp${i}`), kind: "corner", at: at(a, 0, h) }));
  for (let i = 0; i < 6; i++) out.push({ ...bb, ref: ref(rec.id, `kns${i}`), kind: "line", a: ref(rec.id, `knp${i}`), b: ref(rec.id, `knp${(i + 1) % 6}`) });
  // the plate: a disc on a plane a thickness below the root, carried up to it, a little wider than the tips
  const pq = ref(rec.id, "pq");
  out.push({ ref: pq, origin: "drawn", plane: null, movable: false, kind: "plane", at: at(0, 0, -(body.root + pair.thick)), u, v });
  const pb = { origin: "drawn" as const, plane: pq, movable: false as const };
  out.push({ ...pb, ref: ref(rec.id, "pc"), kind: "corner", at: at(0, 0, -(body.root + pair.thick)) });
  out.push({ ...pb, ref: ref(rec.id, "pk"), kind: "circle", center: ref(rec.id, "pc"), radius: pair.outer + 0.5 * m });
  addBore("p", pb, -(body.root + pair.thick));
  return out;
}
export function faceSteps(s: Scene, rec: GearRecord): Omit<Step, "id">[] | null {
  const pl = s.parts[rec.plane];
  if (!pl || pl.kind !== "plane") return null;
  const f = bevelFrame(pl.u, pl.v, rec.spec, rec.turn ?? 0);
  const r = faceRefs(rec);
  if (rec.spec.bevel?.facegear === "pinion") {
    const fp = faceFor(rec.spec);
    if (!fp.ok || !r.lines.length) return null;
    return [{ type: "extrude", parts: r.lines, params: { depth: pinionWidth(fp.value.pair), ...(r.bore ? { holes: r.bore } : {}), mode: "new", gear: rec.id } }];
  }
  const g = faceGearOf(rec);
  if (!g) return null;
  const figs: Figure[] = r.sections.map((lines) => ({ outer: lines, holes: [] }));
  return [
    { type: "loft", parts: r.sections[0]!, params: { ...figureParams(figs), mode: "new", gear: rec.id } },
    { type: "revolve", parts: r.blank, params: { angle: 360, advance: 0, ax: rec.at[0], ay: rec.at[1], az: rec.at[2], dx: f.n[0], dy: f.n[1], dz: f.n[2], mode: "new", gear: rec.id } },
    { type: "combine", parts: ["b/x_$0/o" as Ref, "b/x_$1/o" as Ref], params: { mode: "intersect", gear: rec.id } },
    { type: "extrude", parts: [r.plate], params: { depth: g.pair.thick, ...(r.plateBore ? { holes: r.plateBore } : {}), mode: "new", gear: rec.id } },
    { type: "combine", parts: ["b/x_$0/o" as Ref, "b/x_$3/o" as Ref], params: { mode: "add", gear: rec.id } },
  ];
}
