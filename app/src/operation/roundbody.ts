// What a round body is (`dec_hub_spoke`, Cut spokes): the axis, the outside, the bore and the thickness of a body that is a disc, a cylinder, a ring or a gear, read from the circles its edges make. The wheel that cuts spokes into it keeps
// the bore and the outside edge it finds here. Pure: a scene in, numbers out.
import type { Scene } from "./scene.ts";
import type { Part } from "./part.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Ref } from "../shared/ref.ts";
import { gearOutline } from "./gear.ts";

export interface RoundBody {
  /** the middle of the body, on its axis, half way along it */
  center: Vec3;
  /** the direction of the axis (unit) */
  normal: Vec3;
  /** the radius of the outside: the biggest circle about the axis (a gear's tips) */
  outer: number;
  /** the radius of the hole through the middle (a whole circle, smaller than the outside): 0 for none */
  bore: number;
  /** how long the body is along its axis */
  thickness: number;
  /** the smallest circle that is only part of one (the roots between a gear's teeth): the rim of a wheel cut into the body must stay inside it; 0 when the outside is whole */
  root: number;
  body: Ref;
}
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
/** how far the point `p` is from the line through `c` along the unit `axis` */
const distFromAxis = (p: Vec3, c: Vec3, axis: Vec3): number => { const d = sub(p, c), s = dot(d, axis); return len([d[0] - axis[0] * s, d[1] - axis[1] * s, d[2] - axis[2] * s]); };

/** The body a selected part belongs to: the body itself, the body a face or an edge is of, or the only body there is */
export function bodyOfPart(scene: Scene, ref: Ref): Ref | null {
  const p = scene.parts[ref] as Part | undefined;
  if (p?.kind === "body") return p.ref;
  if (p && "of" in p && p.of) return p.of;
  const bodies = Object.values(scene.parts).filter((q) => q.kind === "body");
  return bodies.length === 1 ? bodies[0]!.ref : null;
}

/** The round body `body` is, or why it is not one */
export function roundBodyOf(scene: Scene, body: Ref): RoundBody | string {
  const b = scene.parts[body];
  if (!b || b.kind !== "body" || !b.bbox) return "select a round body first: a gear, a disc or a ring";
  const { min, max } = b.bbox, inBox = (p: Vec3): boolean => [0, 1, 2].every((k) => p[k]! >= min[k]! - 1e-3 && p[k]! <= max[k]! + 1e-3);
  const several = Object.values(scene.parts).filter((q) => q.kind === "body").length > 1;
  const circles = Object.values(scene.parts).flatMap((p) => {
    if (p.kind !== "line" || p.origin !== "body" || !p.circle) return [];
    if (several ? p.of !== body : !inBox(p.circle.center)) return [];
    const whole = p.a === p.b || !!p.twin;
    return [{ c: p.circle.center, n: p.circle.normal, r: p.circle.radius, whole }];
  });
  if (!circles.length) return "the body has no round edge: select a gear, a disc or a ring";
  const big = circles.reduce((m, x) => (x.r > m.r ? x : m));
  const l = len(big.n) || 1, axis: Vec3 = [big.n[0] / l, big.n[1] / l, big.n[2] / l];
  const coaxial = circles.filter((x) => Math.abs(Math.abs(dot(x.n, axis)) / (len(x.n) || 1) - 1) < 1e-3 && distFromAxis(x.c, big.c, axis) < 0.05);
  if (coaxial.length < 2) return "the body is not round about one axis: select a gear, a disc or a ring";
  // a gear body has only its bore and its two faces as edges (its teeth are not edges of circles): its tips and its roots come from the gear that made it
  const rec = (scene.gears ?? []).find((g) => inBox(g.at) && !g.spec.rack && !g.spec.internal && !g.spec.worm && !g.spec.cam), teeth = rec ? gearOutline(rec.spec) : null;
  const outer = teeth?.ok ? teeth.value.tipRadius : Math.max(...coaxial.map((x) => x.r));
  const wholes = coaxial.filter((x) => x.whole && x.r < outer * 0.9).map((x) => x.r), parts = teeth?.ok ? [teeth.value.rootRadius] : coaxial.filter((x) => !x.whole).map((x) => x.r);
  const projections = [0, 1, 2, 3, 4, 5, 6, 7].map((m) => dot([m & 1 ? max[0] : min[0], m & 2 ? max[1] : min[1], m & 4 ? max[2] : min[2]], axis));
  const [lowZ, highZ] = [Math.min(...projections), Math.max(...projections)], mid = (lowZ + highZ) / 2, off = mid - dot(big.c, axis);
  return { center: [big.c[0] + axis[0] * off, big.c[1] + axis[1] * off, big.c[2] + axis[2] * off], normal: axis, outer, bore: wholes.length ? Math.min(...wholes) : 0, thickness: highZ - lowZ, root: parts.length && Math.min(...parts) < outer - 1e-3 ? Math.min(...parts) : 0, body };
}

/** What a tool that cuts into a round body needs of the part `ref` (the body, a face or an edge of it): the middle and the axis, and the numbers read from the body, or why it is not a round body */
export function cutFillOf(scene: Scene, ref: Ref): { center: Vec3; normal: Vec3; cut: { outer: number; bore: number; thickness: number; root: number; /** the id of the body (`x_<step>`): the keyway maker remembers what it keyed */ host?: string } } | string {
  const body = bodyOfPart(scene, ref);
  const rb = body ? roundBodyOf(scene, body) : "select a round body first: a gear, a disc, a cylinder or a ring";
  return typeof rb === "string" ? rb : { center: rb.center, normal: rb.normal, cut: { outer: rb.outer, bore: rb.bore, thickness: rb.thickness, root: rb.root, ...(((scene.parts[body!] as { id?: string } | undefined)?.id) ? { host: (scene.parts[body!] as { id: string }).id } : {}) } };
}
