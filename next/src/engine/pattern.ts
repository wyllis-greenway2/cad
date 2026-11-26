// Copies of a body (E44 to E47): a linear or circular `pattern`, and a `mirror`. Each copy is a body of its own (E38) and every one of its faces has an id made from the face it copies and the number of the copy
// (`mint(step, "copy", faceId, i)`), so a later step can name a face of the third copy, and an edit of the count removes exactly the copies that are no longer there (a reference to one is lost, E10).
// A feature repeated (a hole, a boss) needs no step of its own: pattern the tool body, then combine with `tools` all of them.
import * as K from "./kernel.ts";
import { type Id, mint } from "./id.ts";
import { Body, type BodyRec, type FaceRec, bodyOf } from "./lineage.ts";
import { checked, kinds, needBody, num, type Ctx, type Value } from "./steps.ts";
import { recombine, viewOf } from "./scope.ts";

type V3 = K.V3;
const MAX_COPIES = 500;

/** the body that is copied: the one named, or the only one */
function source(scene: Body, p: Record<string, any>): BodyRec {
  if (p.body) return bodyOf(scene, p.body as Id);
  if (scene.bodies.length === 1) return scene.bodies[0]!;
  throw new Error(`there are ${scene.bodies.length} bodies: say which one to copy`);
}
/** the copies made from a body, as a body of their own: every face named from the face it copies and the number of the copy, every copy a body named from the body it copies */
function asBody(rec: BodyRec, made: { n: number; m: K.Made }[], step: string, role: string): Body {
  const recs: FaceRec[] = [],
    bodies: BodyRec[] = [];
  for (const { n, m } of made) {
    const faces: FaceRec[] = [];
    for (const r of rec.faces) {
      const mods = m.report.modified(r.h);
      if (mods.length !== 1) throw new Error(`the copy of a face of ${role} ${n} was not made (${mods.length} faces)`);
      faces.push({ id: mint(step, role, r.id, n), alias: [], h: mods[0]!, defect: false });
    }
    recs.push(...faces);
    bodies.push({ id: mint(step, "body", rec.id, n), alias: [], faces });
  }
  return new Body(K.compoundOf(made.map((x) => x.m.solid)), recs, [], new Set(), bodies);
}
function putBack(scene: Body, copies: Body, ctx: Ctx, what: string): Value {
  const out = recombine(
    copies,
    scene.bodies.map((rec) => ({ scene, rec })),
  );
  copies.release();
  return checked(out, what);
}

/** `kind: "linear"` (`by`: the step from one copy to the next, `count`: all the bodies, the original included) or `"circular"` (`axis`: a point and a direction, `count`, `deg`: the whole turn, 360 when not said) */
kinds["pattern"] = {
  outputs: "body",
  run: (inputs, ctx) => {
    const scene = needBody(inputs[0]),
      p = ctx.step.params,
      count = Math.round(num(p, "count"));
    if (!(count >= 1 && count <= MAX_COPIES) || count !== num(p, "count"))
      throw new Error(`the number of bodies must be a whole number from 1 to ${MAX_COPIES}`);
    if (count === 1) return scene;
    const rec = source(scene, p),
      view = viewOf(scene, [rec]),
      made: { n: number; m: K.Made }[] = [];
    try {
      if (p.kind === "circular") {
        const ax = p.axis as { point: V3; dir: V3 } | undefined;
        if (!ax) throw new Error("a circular pattern needs an axis (a point and a direction)");
        const total = typeof p.deg === "number" ? p.deg : 360,
          step = total >= 360 ? total / count : total / (count - 1);
        for (let n = 1; n < count; n++) made.push({ n, m: K.turn(view.solid, ax.dir, step * n, ax.point) });
      } else {
        const by = p.by as V3 | undefined;
        if (!Array.isArray(by) || by.length !== 3)
          throw new Error("a linear pattern needs the step from one body to the next (three numbers)");
        for (let n = 1; n < count; n++) made.push({ n, m: K.move(view.solid, [by[0] * n, by[1] * n, by[2] * n]) });
      }
      return putBack(scene, asBody(rec, made, ctx.step.id, "copy"), ctx, "the pattern");
    } finally {
      view.solid.release();
      for (const x of made) x.m.solid.release();
    }
  },
};

/** a copy of a body mirrored in a plane (`plane`: a point and a normal); the copy is a body of its own */
kinds["mirror"] = {
  outputs: "body",
  run: (inputs, ctx) => {
    const scene = needBody(inputs[0]),
      p = ctx.step.params,
      pl = p.plane as { point: V3; normal: V3 } | undefined;
    if (!pl) throw new Error("a mirror needs a plane (a point on it and its normal)");
    const rec = source(scene, p),
      view = viewOf(scene, [rec]),
      made = [{ n: 1, m: K.mirror(view.solid, pl.point, pl.normal) }];
    try {
      return putBack(scene, asBody(rec, made, ctx.step.id, "mirror"), ctx, "the mirror");
    } finally {
      view.solid.release();
      for (const x of made) x.m.solid.release();
    }
  },
};
