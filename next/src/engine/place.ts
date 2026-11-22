// The `place` step (E60, `dec_body_placement`): bodies put where mates between their faces say. One step, the whole placement: it takes a scene of bodies, reads each mate's two faces (by their ids, E6) as planes and
// axes, solves the poses of the bodies that must move (`placement.ts`: the sketch solver's machinery over poses), and moves them; no face id changes. Recomputed from its inputs every time, so it replays exactly and
// an edit of a mate's number is an edit of this step. A set of mates that cannot all hold is refused and the mates named (`Refusal`, E55), never ranked; what is left free is said in a note.
import * as K from "./kernel.ts";
import { type Id, idKey, show } from "./id.ts";
import { type Body, bodyOf } from "./lineage.ts";
import { type BodyIn, type Mate, type MateKind, type Prim, place } from "./placement.ts";
import { type Ctx, Refusal, checked, kinds, needBody } from "./steps.ts";

type V3 = K.V3;
export interface MateParams { id: string; kind: MateKind; /** the face that moves with its body */ a: Id; /** the face it is placed against */ b: Id; value?: number }
export interface PlaceParams { mates: MateParams[]; /** a face of each body that must not move (a body that is only ever the second face of a mate does not move either) */ fixed?: Id[] }

/** a face as a part: a flat face is a plane (a point, its outward normal), a round one an axis (a point on it, its direction) */
function primOf(scene: Body, face: Id): { body: string; prim: Prim } {
  const rec = scene.one(face), f = K.facts(rec.h), owner = bodyOf(scene, face), body = idKey(owner.id);
  if (f.type === "PLANE") return { body, prim: { kind: "plane", p: f.ce, d: f.ne } };
  if (f.type === "CYLINDRE") { const c = K.cylinderOf(rec.h); return { body, prim: { kind: "axis", p: c.point, d: c.dir } }; }
  throw new Error(`${show(face)} is a ${f.type.toLowerCase()} face: a mate takes a flat face or a round (cylinder) one`);
}
/** the middle of a body (the point it turns about): the middle of the box its faces lie in */
function middle(scene: Body, key: string): V3 {
  const rec = scene.bodies.find((b) => idKey(b.id) === key)!; let lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const f of rec.faces) { const q = K.facts(f.h); lo = [Math.min(lo[0], q.lo[0]), Math.min(lo[1], q.lo[1]), Math.min(lo[2], q.lo[2])]; hi = [Math.max(hi[0], q.hi[0]), Math.max(hi[1], q.hi[1]), Math.max(hi[2], q.hi[2])]; }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}
kinds["place"] = { outputs: "body", run: (inputs, ctx: Ctx) => {
  let scene = needBody(inputs[0], "the bodies to place"); const first = scene; const p = ctx.step.params as unknown as PlaceParams;
  if (!Array.isArray(p.mates)) throw new Error("a placement needs its list of mates");
  if (scene.bodies.length < 2) throw new Error("a placement needs two bodies at least");
  const mates: Mate[] = p.mates.map((m) => { const a = primOf(scene, m.a), b = primOf(scene, m.b); return { id: m.id, kind: m.kind, a, b, ...(m.value !== undefined ? { value: m.value } : {}) }; });
  const fixed = new Set((p.fixed ?? []).map((f) => idKey(bodyOf(scene, f).id))), movers = new Set(mates.map((m) => m.a.body)), used = new Set(mates.flatMap((m) => [m.a.body, m.b.body]));
  const bodies: BodyIn[] = [...used].map((id) => ({ id, free: movers.has(id) && !fixed.has(id), pivot: middle(scene, id) }));
  const r = place(bodies, mates);
  if (!r.ok) throw new Refusal(r.conflict.length ? `these mates cannot all hold: ${r.conflict.join(", ")}${r.reason && !/cannot all hold/.test(r.reason) ? ` (${r.reason})` : ""}` : r.reason || "this placement cannot be made", r.conflict);
  const done: Body[] = [];
  for (const [key, pose] of Object.entries(r.poses)) {
    const rec = first.bodies.find((b) => idKey(b.id) === key)!, who = rec.faces[0]!.id, step = (params: Record<string, unknown>) => ({ ...ctx, step: { ...ctx.step, params } });
    if (pose.deg > 1e-9) scene = kinds.turn!.run([scene], step({ body: who, axis: pose.axis, deg: pose.deg, pivot: pose.pivot })) as Body;
    if (Math.hypot(...pose.by) > 1e-12) scene = kinds.move!.run([scene], step({ body: who, by: pose.by })) as Body;
    if (done.length) { /* each intermediate is a temporary of this step */ }
    done.push(scene);
  }
  for (const d of done.slice(0, -1)) ctx.temp(d);
  if (r.freedom > 0) scene.notes.push({ kind: "free", text: `${r.freedom} way${r.freedom === 1 ? "" : "s"} still free: ${Object.entries(r.free).map(([b, n]) => `${show(first.bodies.find((q) => idKey(q.id) === b)!.id)} (${n})`).join(", ")}` });
  if (r.redundant.length) scene.notes.push({ kind: "tie", text: `these mates add nothing the others do not say: ${r.redundant.join(", ")}` });
  return checked(scene, "the placement");
} };
