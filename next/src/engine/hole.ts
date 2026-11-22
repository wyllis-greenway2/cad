// Holes as a step (E76): a round hole put into a face of a body: where (on the face), how wide, how deep (a number, or through), and optionally a counterbore. The old way was a circle sketched on the face
// and a cut, two steps that the person had to keep in step; this is one step with the numbers a hole has. Its faces are named by the step (the wall, the bottom, the counterbore's wall and floor), so a later
// step can refer to the wall of the hole and an edit of the diameter keeps the names.
import * as K from "./kernel.ts";
import { type Id, mint } from "./id.ts";
import { type Body, type Claim, carry, fromClaims, unifyBody } from "./lineage.ts";
import { type Sketch, at, checked, frameOf, kinds, needBody, num, sidesFromProfile } from "./steps.ts";

type V3 = K.V3;
export interface HoleParams {
  /** the face the hole is put into */ face: Id;
  /** where, in the face's own frame (across, along) from its centre; the centre when not given */ at?: [number, number];
  diameter: number; /** a number, or "through" */ depth: number | "through";
  /** a wider, shallow step at the mouth */ counterbore?: { diameter: number; depth: number };
}
/** a cylinder of `r` from `margin` above the face's plane at `c`, down `depth + margin` along minus the normal: the claims name its wall and its bottom */
function cylinder(c: V3, n: V3, r: number, depth: number, margin: number, step: string, tag: string): { solid: K.Solid; claims: Claim[]; report: K.Report } {
  const top: V3 = [c[0] + n[0] * margin, c[1] + n[1] * margin, c[2] + n[2] * margin], face = K.profileFace({ kind: "circle", c: top, r, normal: n }), p = K.prism(face, [-n[0] * (depth + margin), -n[1] * (depth + margin), -n[2] * (depth + margin)]);
  const claims: Claim[] = [{ id: mint(step, tag, "bottom"), face: p.last }], sk: Sketch = { kind: "sketch", lines: [], normal: n, circle: { id: mint(step, tag), r, c: top, normal: n } };
  const wall: Claim[] = []; sidesFromProfile([sk], face, p.report, step, wall);
  return { solid: p.solid, claims: [...claims, ...wall.map((w) => ({ ...w, id: mint(step, tag, "wall") }))], report: p.report };
}
kinds["hole"] = { outputs: "body", run: (inputs, { step, age, temp }) => {
  const p = step.params as unknown as HoleParams, body = needBody(inputs[0]), rec = body.one(p.face);
  const d = num(step.params, "diameter"); if (!(d > 0)) throw new Error("the hole's diameter is not above nothing");
  const f = K.facts(rec.h); if (f.type !== "PLANE") throw new Error("a hole is put into a flat face (a curved face has no one direction to drill)");
  const F = frameOf(rec, null), where = p.at ?? [0, 0], c = at(F, where[0], where[1]), n = F.n;
  let reach = 0; for (const g of body.faces) { const q = K.facts(g.h); reach = Math.max(reach, Math.hypot(q.hi[0] - q.lo[0], q.hi[1] - q.lo[1], q.hi[2] - q.lo[2])); }
  const through = p.depth === "through", depth = through ? 2 * reach + 1 : num(step.params, "depth"); if (!(depth > 0)) throw new Error("the hole's depth is not above nothing");
  const margin = Math.max(1, d), cuts: { solid: K.Solid; claims: Claim[] }[] = [];
  if (p.counterbore) { const cd = p.counterbore.diameter, ch = p.counterbore.depth; if (!(cd > d) || !(ch > 0)) throw new Error("a counterbore is wider than the hole and has a depth above nothing"); if (!through && ch >= depth) throw new Error("the counterbore is as deep as the hole: it would be the hole"); cuts.push(cylinder(c, n, cd / 2, ch, margin, step.id, "cb")); }
  cuts.push(cylinder(c, n, d / 2, depth, margin, step.id, "hole"));
  let cur: Body = body;
  for (const cut of cuts) {
    const tool = temp(fromClaims(cut.solid, cut.claims, step.id, false)), m = K.cut(cur.solid, tool.solid);
    cur = temp(unifyBody(temp(carry(m.solid, m.report, [cur, tool], [], step.id, age, [cur])), step.id, age));
  }
  return checked(cur, "the hole");
} };
