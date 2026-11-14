// Facts about parts the controller, the tools and the operations all need: where the model is, which plane a part lies on, which object it belongs to.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Part, Plane, Lookup } from "../operation/part.ts";
import type { Scene } from "../operation/scene.ts";
import type { Session } from "./session.ts";
import { BODY_OBJECT } from "../compiler/body.ts";

/**
 * What the view turns about: the middle of the model, and with several bodies the middle of the one nearest in view (`in_291`: turning about the point between two bodies far apart threw the one you were looking at out
 * of the screen). `near` is where the screen's middle is looking, as the body's distance from the line of sight: the body whose middle is nearest it is the one in view.
 */
export function pivotOf(s: Session, sight?: { from: Vec3; dir: Vec3 }): Vec3 | undefined {
  const bodies = Object.values(s.history.scene.parts).filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body" && !!p.bbox);
  if (sight && bodies.length > 1) {
    const mid = (b: Extract<Part, { kind: "body" }>): Vec3 => [0, 1, 2].map((i) => (b.bbox!.min[i]! + b.bbox!.max[i]!) / 2) as unknown as Vec3;
    const off = (b: Extract<Part, { kind: "body" }>): number => {
      const q = mid(b);
      const rel: Vec3 = [q[0] - sight.from[0], q[1] - sight.from[1], q[2] - sight.from[2]];
      const t = rel[0] * sight.dir[0] + rel[1] * sight.dir[1] + rel[2] * sight.dir[2];
      return Math.hypot(rel[0] - t * sight.dir[0], rel[1] - t * sight.dir[1], rel[2] - t * sight.dir[2]) + (t < 0 ? 1e6 : 0); // (a body behind the camera is not in view)
    };
    return mid([...bodies].sort((a, b) => off(a) - off(b))[0]!);
  }
  const b = s.outcome.kernel?.bbox;
  return b ? [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] : undefined;
}
/** The plane a part lies on or is: a pane or flat face is its own plane, a face or a drawn part has the plane it is drawn on. Null for a body and for loose parts. */
export function planeOf(get: Lookup, ref: Ref): Plane | null {
  const p = get(ref);
  if (!p) return null;
  if (p.kind === "plane") return p.curved || p.rounded ? null : p; // a curved face has no flat plane to draw on
  const pl = p.plane ? get(p.plane) : undefined;
  return pl && pl.kind === "plane" ? pl : null;
}
/** The whole object a part belongs to: the body for a body part, the closed shape's face for a drawn part (else the part itself). */
export function objectOf(sc: Scene, ref: Ref): Ref {
  const p = sc.parts[ref];
  if (!p) return ref;
  if (p.kind === "body") return ref;
  if (p.origin === "body") return p.of && p.of in sc.parts ? p.of : BODY_OBJECT in sc.parts ? BODY_OBJECT : ref; // (the body it is in: one of several, `dec_independent_bodies`)
  const faces = Object.values(sc.parts).filter((f): f is Extract<Part, { kind: "face" }> => f.kind === "face");
  const f = faces.find((x) => x.loop.includes(ref) || x.corners.includes(ref) || x.disk === ref || (p.kind === "circle" && x.disk === p.ref));
  return f ? f.ref : ref;
}


/** The middle of the body from its corners (the box that holds them), or null with no body. Rotating and moving handles start here. */
export function bodyCentre(sc: Scene, ref: Ref = BODY_OBJECT): Vec3 | null {
  const body = sc.parts[ref];
  if (body?.kind === "body" && body.bbox) return [(body.bbox.min[0] + body.bbox.max[0]) / 2, (body.bbox.min[1] + body.bbox.max[1]) / 2, (body.bbox.min[2] + body.bbox.max[2]) / 2]; // (the kernel's own box: a round body's corners do not reach its sides)
  const pts = Object.values(sc.parts).filter((p): p is Extract<Part, { kind: "corner" }> => p.kind === "corner" && p.origin === "body").map((p) => p.at);
  if (!pts.length) return null;
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i]!, p[i]!); hi[i] = Math.max(hi[i]!, p[i]!); }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}

/** The parts of a drawn closed figure that move with it: its corners and lines, the centres of its arcs; a circle and its centre. */
export function figurePartsOf(scene: Scene, face: Extract<Part, { kind: "face" }>): Ref[] {
  if (face.disk) { const c = scene.parts[face.disk]; return c?.kind === "circle" ? [c.ref, c.center] : []; }
  const centres = face.loop.map((r) => scene.parts[r]).flatMap((l) => (l?.kind === "line" && l.center ? [l.center] : []));
  return [...new Set([...face.corners, ...centres, ...face.loop])];
}
