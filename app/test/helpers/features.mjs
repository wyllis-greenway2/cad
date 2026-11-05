// The model as an operation graph, built from the feature list (pure). The graph is the JSON the geometry worker compiles.
// One feature = one sketch op + one extrude op. Positive distance adds; negative cuts when there is a body, else adds the
// other way. Features carry a copy of the shape, so editing a sketch later does not change an existing extrusion (for now).
// Test helper for the kernel conformance suite: builds an operation graph from a short list of features (ported from the prototype's features.mjs).
const r6 = (v) => Math.round(v * 1e6) / 1e6;
/** A shape of the old tests ({ type: "rect", x0, y0, x1, y1 } or { type: "circle", cx, cy, r }) as a sketch op. */
function regionToSketchOp(shape, id, plane) {
  const base = { id, type: "sketch", plane, origin: 0 };
  if (shape.type === "rect") return { ...base, shape: "rect", w: r6(shape.x1 - shape.x0), d: r6(shape.y1 - shape.y0), at: [r6((shape.x0 + shape.x1) / 2), r6((shape.y0 + shape.y1) / 2)] };
  if (shape.type === "circle") return { ...base, shape: "circle", radius: r6(shape.r), at: [r6(shape.cx), r6(shape.cy)] };
  throw new Error(`unknown shape ${shape.type}`);
}

export const featureMode = (distance, hasBody) => (distance < 0 && hasBody ? "cut" : "add");

/** features: [{ id, plane, shape, distance, frame? }]. Returns { params, ops } for the worker. Features with a bad shape are skipped. */
export function buildGraph(features) {
  const ops = [];
  let prev = null;
  for (const f of features) {
    if (f.kind === "transform") {
      if (!prev) continue; // nothing to transform yet
      const xid = `x_${f.id}`;
      ops.push({ id: xid, type: "transform", target: prev, mode: f.mode, axis: f.axis, value: f.distance });
      prev = xid;
      continue;
    }
    if (f.kind === "clear") {
      if (!prev) continue; // nothing to delete
      ops.push({ id: `x_${f.id}`, type: "clear" });
      prev = null;
      continue;
    }
    if (f.kind === "edge") {
      if (!prev) continue;
      const xid = `x_${f.id}`;
      ops.push({ id: xid, type: "edgeMod", target: prev, ref: f.ref, mode: f.mode, value: f.distance });
      prev = xid;
      continue;
    }
    if (f.kind === "cylRadius" || f.kind === "cylDraft") {
      if (!prev) continue;
      const xid = `x_${f.id}`;
      ops.push(f.kind === "cylRadius" ? { id: xid, type: "cylRadius", target: prev, ref: f.ref, radius: f.distance } : { id: xid, type: "cylDraft", target: prev, ref: f.ref, angle: f.distance });
      prev = xid;
      continue;
    }
    if (f.kind === "faceTilt") {
      if (!prev) continue;
      const xid = `x_${f.id}`;
      ops.push({ id: xid, type: "faceTilt", target: prev, ref: f.ref, axis: f.axis, angle: f.distance });
      prev = xid;
      continue;
    }
    if (f.kind === "face") {
      if (!prev) continue; // nothing to push or pull yet
      const xid = `x_${f.id}`;
      ops.push({ id: xid, type: "faceExtrude", target: prev, ref: f.ref, distance: f.distance });
      prev = xid;
      continue;
    }
    const sk = regionToSketchOp(f.shape, `s_${f.id}`, f.plane);
    if (f.frame) sk.frame = f.frame; // an explicit plane (a body face, or the base plane's own numbers) wins over the plane's name
    const xid = `x_${f.id}`;
    ops.push(sk, { id: xid, type: "extrude", profile: sk.id, distance: f.distance, ...(prev ? { target: prev } : {}), mode: featureMode(f.distance, !!prev) });
    prev = xid;
  }
  return { params: {}, ops };
}
