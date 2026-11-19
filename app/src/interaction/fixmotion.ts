// "Fix constraints" (`dec_collision_to_constraints`, `in_1122`): a motion that runs on collision is slow, and where a body that is pushed aside in fact turns about one fixed axis (or slides along one line) the same motion is a joint, which costs nothing.
// From the places the push kept (`pathPlaces`: for each whole step of the driver, where each body with no joint stands: a move of its middle and a turn about it) this works out, body by body, what joint fits, how well, and whether the turn is a
// constant ratio of the driver's (then a link would drive it with no contact at all). Pure: a scene, a motion and its kept places in; the offers and the commands out. It never changes the push; the person applies each offer, one at a time.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { cross, dot, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import { pathPlaces, placesExtent } from "./contact.ts";
import type { Motion } from "./motion.ts";
import { mateCommand } from "./mate.ts";
import { carriedBy as carriedByMotion } from "./motion.ts";
import { holeAndPin } from "./pinhole.ts";

/** How far a body may be from the joint's own path, mm, and how far a turn may be from a constant ratio, degrees: the joint has to be the push to within these, or it is not offered. */
const FIT_MM = 1;
export const FIT_DEG = 3;
/** Fewest whole steps of the play that a fit is made from (the offer waits for them), and the least a body must have moved for there to be anything to fix. */
const FIT_STEPS = 20, MOVED_MM = 1, MOVED_DEG = 1;

export interface Sample { a: number; t: Vec3; spin: number }
export type Joint =
  | { kind: "turn"; point: Vec3; dir: Vec3; err: number; /** degrees the body turns for a degree of the driver, when that is a constant to within `FIT_DEG`; else null */ ratio: number | null; ratioErr: number }
  | { kind: "slide"; dir: Vec3; err: number; ratio: number | null; ratioErr: number }
  | { kind: "none"; why: string };

/** The in-plane axes (u, v) and the normal n of the plane the bodies with no joint move in, as `contact.ts` takes them. */
const planeAxes = (across: Vec3): { n: Vec3; u: Vec3; v: Vec3 } => {
  const n = normalize(across), u = normalize(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), v = cross(n, u);
  return { n, u, v };
};

/**
 * What one joint fits a body's samples (the move of its middle, `t`, and its turn about it, `spin` degrees, at each driver amount `a`): a turn about one fixed axis across the plane (the centre q of each sample is (I - R)^-1 t; the least squares
 * centre is the sum of A^T t over the sum of 2(1 - cos spin), A = I - R), when the middle's moves are all within `FIT_MM` of what that centre gives; or, when the body never turns, a slide along one line.
 */
export function fitJoint(samples: Sample[], middle: Vec3, across: Vec3): Joint {
  const { n, u, v } = planeAxes(across);
  const moved = samples.filter((s) => Math.hypot(...s.t) > 1e-9 || Math.abs(s.spin) > 1e-9);
  if (!moved.length) return { kind: "none", why: "it did not move" };
  const ratioOf = (f: (s: Sample) => number): { ratio: number | null; ratioErr: number } => {
    let [num, den] = [0, 0];
    for (const s of samples) { num += f(s) * s.a; den += s.a * s.a; }
    const k = den > 1e-12 ? num / den : 0;
    const e = samples.reduce((m, s) => Math.max(m, Math.abs(f(s) - k * s.a)), 0);
    return { ratio: Math.abs(k) > 1e-9 && e <= FIT_DEG ? k : null, ratioErr: e };
  };
  const turned = samples.some((s) => Math.abs(s.spin) > MOVED_DEG);
  if (turned) {
    let [ax, ay, w] = [0, 0, 0];
    for (const s of samples) {
      const r = (s.spin * Math.PI) / 180, [c, sn] = [Math.cos(r), Math.sin(r)];
      const [tu, tv] = [dot(s.t, u), dot(s.t, v)];
      ax += (1 - c) * tu - sn * tv; ay += sn * tu + (1 - c) * tv; w += 2 * (1 - c); // (A^T t, A = [[1-c, s], [-s, 1-c]])
    }
    if (!(w > 1e-9)) return { kind: "none", why: "it turned too little to tell where about" };
    const q: [number, number] = [ax / w, ay / w];
    let err = 0, along = 0;
    for (const s of samples) {
      const r = (s.spin * Math.PI) / 180, [c, sn] = [Math.cos(r), Math.sin(r)];
      const [tu, tv] = [dot(s.t, u), dot(s.t, v)];
      err = Math.max(err, Math.hypot(tu - ((1 - c) * q[0] + sn * q[1]), tv - (-sn * q[0] + (1 - c) * q[1])), Math.abs(dot(s.t, n)));
      along += dot(s.t, n) / samples.length;
    }
    if (err > FIT_MM) return { kind: "none", why: `it does not turn about one axis (it is off by ${err.toFixed(1)} mm at worst): it slides and turns by what it meets` };
    const point: Vec3 = [middle[0] + u[0] * q[0] + v[0] * q[1] + n[0] * along, middle[1] + u[1] * q[0] + v[1] * q[1] + n[1] * along, middle[2] + u[2] * q[0] + v[2] * q[1] + n[2] * along];
    return { kind: "turn", point, dir: n, err, ...ratioOf((s) => s.spin) };
  }
  // never turned: a slide along one line
  let big = moved[0]!;
  for (const s of moved) if (Math.hypot(...s.t) > Math.hypot(...big.t)) big = s;
  const d = normalize(big.t);
  const err = samples.reduce((m, s) => Math.max(m, Math.hypot(...[0, 1, 2].map((i) => s.t[i]! - dot(s.t, d) * d[i]!))), 0);
  if (err > FIT_MM) return { kind: "none", why: `it slides, but not along one line (off by ${err.toFixed(1)} mm at worst)` };
  return { kind: "slide", dir: d, err, ...ratioOf((s) => dot(s.t, d)) };
}

/** One offer: what a body that is pushed would be as a joint, and the commands that make it so. */
export interface Fix {
  body: Ref;
  name: string;
  joint: Joint & { kind: "turn" | "slide" };
  /** what applying it does, in words (it is also what the bar says while the offer is shown) */
  text: string;
  /** what is made: a pin and its hole made coaxial, or a pivot about the axis found */
  how: "mate" | "pivot";
  /** the pin it hangs on goes round in this motion: only a coaxial mate is right (it is carried by the pin, `dec_carried_joint`), not a pivot at the pin's place now */
  carried?: true;
  /** where the push left the body at the end of the play it was fitted from: the driver's amount, and how far the body had turned (degrees); the joint made is played to the same amount and has to be there too (`FIT_DEG`) */
  expect: { amount: number; spin: number };
}
export interface Unfixed { body: Ref; name: string; why: string }
export interface FixPlan { fixes: Fix[]; left: Unfixed[]; steps: number }

const nameOf = (scene: Scene, r: Ref): string => { const p = scene.parts[r]; return p?.kind === "body" && p.id ? p.id : r; };
const fmt = (x: number): string => String(Math.round(x * 100) / 100);

/**
 * The offers for the bodies of a motion that are pushed with no joint, from the places the push has kept so far; null when there is not yet enough of the play to go by (`FIT_STEPS` whole steps) or no body has moved. A body that turns about one
 * fixed axis is offered a joint on it: the coaxial mate of its hole and the pin it is on, when the model has them (`holeAndPin`), else a pivot about the axis found. A body that slides along one line is not offered one (a slider needs a rod to
 * slide on): it is said so.
 */
export function planFixes(scene: Scene, outcome: CompileOutcome | undefined, m: Motion): FixPlan | null {
  const c = m.contact;
  if (!c) return null;
  const kept = pathPlaces(scene, outcome, m);
  if (!kept) return null;
  const top = Math.round(placesExtent(kept) / kept.step);
  if (top < FIT_STEPS) return null;
  const across: Vec3 = m.kind === "turn" ? m.dir : [0, 0, 1];
  const fixes: Fix[] = [], left: Unfixed[] = [];
  let any = false;
  c.pushables.forEach((p, i) => {
    if (!p.free) return;
    const samples: Sample[] = [];
    const expect = { amount: top * kept.step, spin: kept.places.get(top)?.work[i]?.spin ?? 0 };
    for (let g = 0; g <= top; g++) { const e = kept.places.get(g)?.work[i]; if (e?.free) samples.push({ a: g * kept.step, t: e.free, spin: e.spin ?? 0 }); }
    if (!samples.some((s) => Math.hypot(...s.t) > MOVED_MM || Math.abs(s.spin) > MOVED_DEG)) return; // (it stayed where it was: nothing to fix)
    any = true;
    const name = nameOf(scene, p.body);
    const j: Joint = fitJoint(samples, p.point, across);
    if (!(scene.parts[p.body] as { id?: string } | undefined)?.id) { left.push({ body: p.body, name, why: "it is not a body of the model" }); return; }
    if (j.kind !== "turn") { // the push's own path is not one axis (it slides and turns by what it meets), but the model may still say what holds it: a hole of the body on a pin of another
      const on = holeAndPin(scene, p.body);
      const rides = !!on && (on.on === m.body || m.follows.some((f) => f.body === on.on) || c.pushables.some((q) => q.body === on.on)); // (the pin is on a body that moves in this motion: its axis goes round with it)
      if (on && rides && !carriedByMotion(m, on.on)) { left.push({ body: p.body, name, why: `${name} hangs on a pin of ${nameOf(scene, on.on)}, which is carried by something that is itself moved (a planet, a cam, a table): no joint is made for it; it stays with the push` }); return; }
      if (on) { fixes.push({ body: p.body, name, joint: { kind: "turn", point: on.center, dir: on.axis, err: 0, ratio: null, ratioErr: 0 }, how: "mate", expect, ...(rides ? { carried: true as const } : {}), text: rides ? `${name} hangs on a pin of ${nameOf(scene, on.on)}, which goes round: mate its hole to the pin, coaxial (the pin carries it round and it turns on the pin only where something stops it)` : `${name} is on a pin of ${nameOf(scene, on.on)}: mate its hole to the pin, coaxial (the push also slid it${j.kind === "none" ? "" : " along a line"}, which the mate will not)` }); return; }
      left.push({ body: p.body, name, why: j.kind === "none" ? j.why : `${name} slides along one line, but a slider needs a rod to slide on: make a rod, or leave it to the push` });
      return;
    }
    const found = holeAndPin(scene, p.body, j.point, j.dir);
    fixes.push(found
      ? { body: p.body, name, joint: j, how: "mate", expect, text: `${name} turns about one axis (it fits within ${fmt(j.err)} mm): mate its hole to the pin, coaxial (the pin is the axis; the hole moves to it)` }
      : { body: p.body, name, joint: j, how: "pivot", expect, text: `${name} turns about one axis (it fits within ${fmt(j.err)} mm): make it a pivot about that axis` });
  });
  return any ? { fixes, left, steps: top } : null;
}

/**
 * The commands that would make a fix, worked out on the scene as it stands now (an earlier fix of the walk may have changed it), best first: the coaxial mate of the hole and the pin, when there are such and the mate can be made, then a pivot about the
 * axis found. The mate holds the hole on the pin, which can turn the body differently from the push (the push turned it about where it was, within the room the hole leaves), so the one that is made is the first that, played to where the fit ended, turns the
 * body as far as the push did (`FIT_DEG`): the caller plays each (`doMotionFix`). `why` is set on a mate that could not be made.
 */
export function fixCommands(scene: Scene, f: Fix): { command: Command; how: "mate" | "pivot"; why?: string }[] {
  const id = (scene.parts[f.body] as { id?: string } | undefined)?.id;
  if (!id || f.joint.kind !== "turn") return [];
  const out: { command: Command; how: "mate" | "pivot"; why?: string }[] = [];
  let why: string | undefined;
  if (f.how === "mate") {
    const found = holeAndPin(scene, f.body, f.joint.point, f.joint.dir);
    if (found) { const made = mateCommand(scene, "coaxial", found.hole, found.pin); if ("command" in made) out.push({ command: made.command, how: "mate" }); else why = made.why; }
  }
  if (f.carried) { if (!out.length && why) out.push({ command: { type: "pivot", body: id, point: f.joint.point, dir: f.joint.dir }, how: "pivot", why }); return out.filter((o) => o.how === "mate"); } // (a pivot at the pin's place now would be left behind by the pin)
  out.push({ command: { type: "pivot", body: id, point: f.joint.point, dir: f.joint.dir }, how: "pivot", ...(why ? { why } : {}) });
  return out;
}

/** Whether a motion has a pushed body with no joint that has moved: there is something the offer could be made for (cheap: it is asked every frame; the fit itself is made when the offer is taken). */
export const canFix = (m: Motion): boolean => !!m.contact && m.contact.pushables.some((p) => p.free && (Math.hypot(...p.free) > MOVED_MM || Math.abs(p.spin ?? 0) > MOVED_DEG));

const offered = new WeakMap<object, { at: number; ok: boolean }>();
/**
 * Whether the offer is shown: only when the fit has at least one joint to make (otherwise there is nothing to say, and the person is not asked a question with no answer). The fit is made again only when the driver has moved 30 more on, not every frame.
 */
export function fixOffered(scene: Scene, outcome: CompileOutcome | undefined, m: Motion): boolean {
  if (!canFix(m)) return false;
  const seen = offered.get(scene);
  if (seen && Math.abs(m.amount - seen.at) < 30) return seen.ok;
  const ok = !!planFixes(scene, outcome, m)?.fixes.length;
  offered.set(scene, { at: m.amount, ok });
  return ok;
}
