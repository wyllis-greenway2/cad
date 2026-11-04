// The model as an operation graph, built from the feature list (pure). The graph is the JSON the geometry worker compiles.
// One feature = one sketch op + one extrude op. Positive distance adds; negative cuts when there is a body, else adds the
// other way. Features carry a copy of the shape, so editing a sketch later does not change an existing extrusion (for now).
import { regionsOf, regionToSketchOp } from "./sketch.mjs";

export const featureMode = (distance, hasBody) => (distance < 0 && hasBody ? "cut" : "add");

/** features: [{ id, plane, shape, distance }]. Returns { params, ops } for the worker. Features with a bad shape are skipped. */
export function buildGraph(features) {
  const ops = [];
  let prev = null;
  for (const f of features) {
    const region = regionsOf([{ ...f.shape, id: f.id }])[0];
    if (!region) continue;
    const sk = regionToSketchOp(region, `s_${f.id}`, 0, f.plane);
    const xid = `x_${f.id}`;
    ops.push(sk, { id: xid, type: "extrude", profile: sk.id, distance: f.distance, ...(prev ? { target: prev } : {}), mode: featureMode(f.distance, !!prev) });
    prev = xid;
  }
  return { params: {}, ops };
}
