// Several bodies in one answer (E38 to E43; `dec_independent_bodies`). A step that names a face, an edge or a body works on **that body alone**: the others pass through with the same faces, the same names
// and the same geometry; what the step makes goes into the body it worked on, even where it runs into another body (bodies may overlap; only a combine joins or cuts bodies). A combine takes bodies by name
// (`targets` of the first input, `tools` of the second; all of them when not said) and can keep them apart (`mode: "keep"`). With one body in the answer nothing here runs and the steps are as they were.
import * as K from "./kernel.ts";
import { type Id } from "./id.ts";
import { Body, type BodyRec, type FaceRec, bodyOf } from "./lineage.ts";
import { type Ctx, type Value, kinds } from "./steps.ts";
import { idKey, piece } from "./id.ts";

/** the solid each body of a scene is, by the order of the scene's faces */
function solidsOfBodies(scene: Body, parts: readonly BodyRec[]): K.Solid[] {
  const index = K.solidIndexOfFaces(scene.solid), all = K.solidsOf(scene.solid), chosen = parts.map((r) => all[index[scene.faces.indexOf(r.faces[0]!)]!]!);
  for (const s of all) if (!chosen.includes(s)) s.release();
  return chosen;
}
/** a body holding only some of a scene's bodies: the same faces, the same names (what a step sees when it works on those alone) */
export function viewOf(scene: Body, parts: readonly BodyRec[]): Body {
  const solids = solidsOfBodies(scene, parts), solid = K.compoundOf(solids);
  for (const s of solids) s.release();
  return new Body(solid, parts.flatMap((r) => r.faces), scene.notes, scene.kept, [...parts]);
}
/** what a step made from some bodies, put back among the bodies it did not touch */
export function recombine(made: Body | null, rest: readonly { scene: Body; rec: BodyRec }[], notes: Body["notes"] = []): Body {
  const restSolids: K.Solid[] = []; for (const r of rest) restSolids.push(...solidsOfBodies(r.scene, [r.rec]));
  const comp = K.compoundOf([...(made ? [made.solid] : []), ...restSolids]); for (const s of restSolids) s.release();
  const pool: FaceRec[] = [...(made ? made.faces : []), ...rest.flatMap((r) => r.rec.faces)], copy = new Map<FaceRec, FaceRec>(), recs: FaceRec[] = [];
  for (const h of comp.faces()) {
    const src = pool.find((f) => K.sameFace(f.h, h)); if (!src) throw new Error("a face was lost on the way back into the scene");
    const c = { id: src.id, alias: [...src.alias], h, defect: src.defect }; copy.set(src, c); recs.push(c);
  }
  const taken = new Set<string>(), bodies: BodyRec[] = [];
  for (const b of [...(made ? made.bodies : []), ...rest.map((r) => r.rec)]) {
    let id = b.id; while (taken.has(idKey(id))) id = piece(id, 1 + taken.size); taken.add(idKey(id));
    bodies.push({ id, alias: [...b.alias], faces: b.faces.map((f) => copy.get(f)!).filter(Boolean) });
  }
  const kept = new Set<string>([...(made?.kept ?? []), ...rest.flatMap((r) => [...r.scene.kept])]);
  return new Body(comp, recs, [...(made?.notes ?? []), ...notes], kept, bodies);
}

export function scopeKinds(): void {
  for (const [name, k] of Object.entries(kinds)) {
    const ref = k.scope; if (!ref || (k as { scoped?: boolean }).scoped) continue; const run = k.run.bind(k); (k as { scoped?: boolean }).scoped = true;
    k.run = (inputs: Value[], ctx: Ctx): Value => {
      const scene = inputs[0];
      if (!(scene instanceof Body) || scene.bodies.length < 2) return run(inputs, ctx);
      const id = ref(ctx.step.params, inputs);
      if (!id) { // a step that works on a whole body but names none: with several bodies it is not clear which, so it is refused (to move everything, name `body: "all"`)
        if (k.bodyRequired) { if (ctx.step.params.body === "all") return run(inputs, ctx); throw new Error(`there are ${scene.bodies.length} bodies: say which one to ${name} (a body name, or "all")`); }
        return run(inputs, ctx);
      }
      const target = bodyOf(scene, id), view = viewOf(scene, [target]);
      const out = run([view, ...inputs.slice(1)], ctx) as Body;
      if (out === view) { view.solid.release(); return scene; }
      const back = recombine(out, scene.bodies.filter((b) => b !== target).map((rec) => ({ scene, rec })));
      view.solid.release(); if (out !== view) out.release();
      return back;
    };
  }
  // combine: the bodies named (or all) of each input; the rest pass through; "keep" joins nothing
  const combine = kinds["combine"]!, original = combine.run.bind(combine);
  combine.run = (inputs: Value[], ctx: Ctx): Value => {
    const a = inputs[0], b = inputs[1], p = ctx.step.params;
    if (!(a instanceof Body) || !(b instanceof Body)) return original(inputs, ctx);
    if (a.bodies.length < 2 && b.bodies.length < 2 && !p.targets && !p.tools && p.mode !== "keep") return original(inputs, ctx);
    const pick = (scene: Body, ids: Id[] | undefined): BodyRec[] => ids ? [...new Set(ids.map((id) => bodyOf(scene, id)))] : [...scene.bodies];
    const targets = pick(a, p.targets), tools = pick(b, p.tools);
    const restA = a.bodies.filter((r) => !targets.includes(r)).map((rec) => ({ scene: a, rec })), restB = b.bodies.filter((r) => !tools.includes(r)).map((rec) => ({ scene: b, rec }));
    if (p.mode === "keep") return recombine(null, [...targets.map((rec) => ({ scene: a, rec })), ...tools.map((rec) => ({ scene: b, rec })), ...restA, ...restB]);
    const va = viewOf(a, targets), vb = viewOf(b, tools), out = original([va, vb, ...inputs.slice(2)], ctx) as Body;
    const back = recombine(out, [...restA, ...restB]); va.solid.release(); vb.solid.release(); out.release();
    return back;
  };
}

/** the volume of each body of a scene, in the order of `scene.bodies` */
export function bodyVolumes(scene: Body): number[] {
  const index = K.solidIndexOfFaces(scene.solid), all = K.solidsOf(scene.solid);
  const out = scene.bodies.map((r) => K.volume(all[index[scene.faces.indexOf(r.faces[0]!)]!]!));
  for (const s of all) s.release(); return out;
}
