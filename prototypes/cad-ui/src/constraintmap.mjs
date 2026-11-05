// Who owns and who uses each constraint (`in_085`): a pure map from constraints to the sketch parts they refer to, and back.
//
// A constraint is stored with ONE sketch (its owner: the sketch whose solve it takes part in), and refers to parts by name: "e_001.p1" (a corner), "e_001.s0" (a line),
// "e_002.r" (a radius), "e_002.c" (a centre). The map answers, without touching the UI:
//   - what constraints touch this part (so they can be shown when it is clicked)?
//   - what would be affected if this shape is deleted?
//   - which constraints point at something that no longer exists (broken)?
// A part is addressed by { key, ref } where `key` is the sketch ("XY", "F1", "feat:f_001"). Later, parts of the body can be addressed the same way (stage 2 of `dec_no_sketch_isolation`).
import { refsOf, shapeOfRef, modelOf } from "./sketchsolve.mjs";

/** Does this part (corner, line, radius, centre or whole shape) exist in these entities? */
export function partExists(entities, ref) {
  const m = modelOf(entities);
  return ref in m.points || ref in m.segments || ref in m.scalars || entities.some((e) => e.id === ref);
}

/**
 * Build the map. sketches: [{ key, entities, constraints }].
 * Returns { constraints: Map(id -> { id, key, type, uses: [{ ref, shape, exists }], broken }), byPart: Map("key|ref" -> [constraint id]), byShape: Map("key|shape" -> [constraint id]) }.
 */
export function buildMap(sketches) {
  const constraints = new Map();
  const byPart = new Map();
  const byShape = new Map();
  const add = (m, k, id) => m.set(k, [...(m.get(k) ?? []), id]);
  for (const sk of sketches) {
    for (const c of sk.constraints ?? []) {
      const uses = refsOf(c).map((ref) => ({ ref, shape: shapeOfRef(ref), exists: partExists(sk.entities, ref) }));
      constraints.set(c.id, { id: c.id, key: sk.key, type: c.type, uses, broken: uses.some((u) => !u.exists) });
      for (const u of uses) {
        add(byPart, `${sk.key}|${u.ref}`, c.id);
        if (!(byShape.get(`${sk.key}|${u.shape}`) ?? []).includes(c.id)) add(byShape, `${sk.key}|${u.shape}`, c.id);
      }
    }
  }
  return { constraints, byPart, byShape };
}

/** The constraints that touch one part, with what else each one ties it to: [{ id, type, others: [ref] }]. A shape (a whole line chain, a circle) includes all its parts. */
export function constraintsOn(map, key, ref) {
  const ids = new Set([...(map.byPart.get(`${key}|${ref}`) ?? []), ...(map.byShape.get(`${key}|${ref}`) ?? [])]);
  return [...ids].map((id) => {
    const c = map.constraints.get(id);
    return { id, type: c.type, others: c.uses.map((u) => u.ref).filter((r) => r !== ref && shapeOfRef(r) !== ref) };
  });
}

/** What deleting a shape would take with it: the constraints that use any of its parts. */
export const dependentsOfShape = (map, key, shapeId) => map.byShape.get(`${key}|${shapeId}`) ?? [];

/** Constraints that refer to something that is gone. */
export const brokenConstraints = (map) => [...map.constraints.values()].filter((c) => c.broken);
