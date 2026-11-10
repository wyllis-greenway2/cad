// The OCCT implementation of the kernel interface (see ../README.md): an operation graph in, a plain-data result out.
// Nothing outside src/kernel/occt/ may import OCCT or replicad (inv_kernel_boundary).
import { loadOC } from "./oc.mjs";
import { compile, finalSolid, volume } from "./interpreter.mjs";
import { facesOf, edgesOf } from "./topo.mjs";

const described = new Map();
const copyOf = (d) => ({
  vol: d.vol,
  bbox: d.bbox && { min: [...d.bbox.min], max: [...d.bbox.max] },
  faces: d.faces && structuredClone(d.faces),
  edges: d.edges && d.edges.map((e) => ({ ...e, pts: e.pts.slice() })),
  vertices: d.vertices && structuredClone(d.vertices),
  mesh: d.mesh && { vertices: d.mesh.vertices.slice(), normals: d.mesh.normals.slice(), triangles: d.mesh.triangles.slice() },
});

export const KERNEL_NAME = "occt (replicad)";

/** Load the kernel (once). `options` is passed to the WASM loader (e.g. where to find the .wasm file). */
export const init = (options = {}) => loadOC(options);

/**
 * Compile an operation graph and describe its final body.
 * Returns { ops: [{ id, type, error, ms }], finalId, volume, bbox: {min, max}, mesh: { vertices, normals, triangles } | null,
 *           faces, edges, vertices, totalMs }. Everything is plain numbers and arrays: no kernel objects or ids escape.
 */
export function evaluate(graph, tess = { tolerance: 0.05, angular: 0.3 }) {
  const t0 = performance.now();
  const results = compile(graph);
  const tCompile = performance.now();
  let tMesh = tCompile;
  let tFaces = tCompile;
  let tBox = 0;
  const ops = graph.ops.map((o) => {
    const r = results.get(o.id);
    return { id: o.id, type: o.type, error: r.error ?? null, ms: r.ms, ...(r.culprits ? { culprits: r.culprits } : {}) };
  });
  const fin = finalSolid(graph, results);
  let mesh = null;
  let vol = null;
  let bbox = null;
  let faces = null;
  let edges = null;
  let vertices = null;
  // what the final body looks like (its mesh, faces, edges, corners) is kept for the last few bodies, by what the body was worked out from: a change that leaves the body as it is (a sketch beside it, a
  // constraint, undo and redo, the kernel's answer taken in again) takes the description from here instead of making it again, which is most of the time of a body of a few hundred faces (`in_252`).
  // What goes back out is a copy: the worker hands the mesh over to the page, which empties it here.
  // a body with nothing in it (a cut that takes all of the body away) has no box: the kernel throws when it is asked for one. That is an answer, not a failure of the kernel: the step that made it cannot be made (`in_254`)
  let box = null;
  if (fin) { try { box = fin.shape.boundingBox.bounds; } catch { box = null; } }
  if (fin && !box) {
    const o = ops.find((x) => x.id === fin.id);
    if (o) o.error = "nothing would be left of the body (the cut takes all of it away)";
  }
  const present = fin && box ? fin : null;
  const dkey = present?.key ? `${present.key}|${JSON.stringify(tess)}` : null;
  const known = dkey ? described.get(dkey) : undefined;
  if (known) {
    described.delete(dkey);
    described.set(dkey, known);
    ({ vol, bbox, faces, edges, vertices, mesh } = copyOf(known));
  } else if (present) {
    // the finer the part, the finer the mesh: the deflection allowed is a small part of the part's own size (a 2 mm post must not be a 20-sided prism: `in_165`), never coarser than `tess.tolerance`
    const tBox0 = performance.now();
    const [lo, hi] = box; // (the exact box takes about 20 ms: asked for once and kept, `in_227`)
    tBox = performance.now() - tBox0;
    const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    // a draft (while a size is dragged, `in_216`): a rough mesh, quickly; the fine one is made when the pointer is let go
    tess = tess.draft ? { tolerance: Math.max(0.1, diag * 0.01), angular: 0.5 } : { tolerance: Math.min(tess.tolerance, Math.max(0.002, diag * 0.002)), angular: Math.min(tess.angular, 0.2) };
    const m = fin.shape.mesh({ tolerance: tess.tolerance, angularTolerance: tess.angular });
    mesh = { vertices: new Float32Array(m.vertices), normals: new Float32Array(m.normals), triangles: new Uint32Array(m.triangles) };
    vol = volume(fin.shape);
    bbox = { min: lo, max: hi };
    tMesh = performance.now();
    // flat faces at any angle, and full round faces: these can be hovered, selected and sketched on (start/count are index ranges into `triangles`)
    const ranges = new Map(m.faceGroups.map((g) => [g.faceId, g]));
    faces = [];
    const round = new Map();
    const partOf = new Map(); // hash code of a round face -> where its axis is (a piece of a cylinder keeps it, so its wall can be pushed and pulled as the radius of the circle it comes from)
    const other = [];
    for (const f of facesOf(fin.shape)) {
      const g = ranges.get(f.hashCode);
      if (g && f.geomType === "CYLINDRE") {
        // a round face (post or hole) along a world axis; a circle is often made of two halves, so the halves with the same axis, radius and height are gathered
        const uv = f.UVBounds;
        const cyl = f._geomAdaptor().Cylinder();
        const loc = cyl.Axis().Location();
        const dir = cyl.Axis().Direction();
        const d = [dir.X(), dir.Y(), dir.Z()];
        const axis = d.findIndex((v) => Math.abs(Math.abs(v) - 1) < 1e-6);
        if (axis >= 0) {
          const [lo, hi] = f.boundingBox.bounds;
          const center = [loc.X(), loc.Y(), loc.Z()].map((v) => Math.round(v * 1e4) / 1e4);
          const radius = Math.round(cyl.Radius() * 1e4) / 1e4;
          const key = JSON.stringify([axis, center.filter((_, i) => i !== axis), radius, Math.round(lo[axis] * 1e4), Math.round(hi[axis] * 1e4)]);
          const pt = f.pointOnSurface(0.25, 0.5);
          const nn = f.normalAt(pt);
          const rad = [pt.x - (axis === 0 ? pt.x : center[0]), pt.y - (axis === 1 ? pt.y : center[1]), pt.z - (axis === 2 ? pt.z : center[2])];
          const convex = nn.x * rad[0] + nn.y * rad[1] + nn.z * rad[2] > 0;
          const have = round.get(key) ?? { type: "cyl", convex, ranges: [], faces: [], turn: 0, axis, center, radius, lo: Math.round(lo[axis] * 1e4) / 1e4, hi: Math.round(hi[axis] * 1e4) / 1e4 };
          have.ranges.push({ start: g.start, count: g.count });
          have.faces.push(f);
          partOf.set(f.hashCode, { axis, center, convex });
          have.turn += uv.uMax - uv.uMin;
          round.set(key, have);
        }
        else {
          // a cylinder that is not along a world axis (a turned body): selectable, and it says where its axis is, so its wall can be pushed and pulled as the circle it comes from (`in_209`)
          const pt = f.pointOnSurface(0.25, 0.5);
          const nn = f.normalAt(pt);
          const o = [loc.X(), loc.Y(), loc.Z()];
          const along = (pt.x - o[0]) * d[0] + (pt.y - o[1]) * d[1] + (pt.z - o[2]) * d[2];
          const rad = [pt.x - o[0] - d[0] * along, pt.y - o[1] - d[1] * along, pt.z - o[2] - d[2] * along];
          const big = d.map(Math.abs).indexOf(Math.max(...d.map(Math.abs)));
          partOf.set(f.hashCode, { axis: big, center: o.map((v) => Math.round(v * 1e4) / 1e4), convex: nn.x * rad[0] + nn.y * rad[1] + nn.z * rad[2] > 0, dir: d.map((v) => Math.round(v * 1e6) / 1e6) });
          other.push(f);
        }
        continue;
      }
      if (g && f.geomType !== "PLANE") { other.push(f); continue; } // a cone, a sphere, a fillet: shown as a curved face you can select
      if (!g || f.geomType !== "PLANE") continue;
      const n = f.normalAt();
      const c = f.center;
      const nv = [n.x, n.y, n.z].map((v) => Math.round(v * 1e6) / 1e6);
      const d = Math.round((nv[0] * c.x + nv[1] * c.y + nv[2] * c.z) * 1e4) / 1e4;
      const axis = nv.findIndex((v) => Math.abs(v) > 0.9999);
      // every flat face, at any angle: its unit normal n and offset d (n . p = d); axis, sign and offset also when it faces along an axis
      faces.push({ start: g.start, count: g.count, n: nv, d, ...(axis >= 0 ? { axis, sign: Math.sign(nv[axis]), offset: Math.round([c.x, c.y, c.z][axis] * 1e4) / 1e4 } : {}) });
    }
    for (const c of round.values()) if (Math.abs(c.turn - 2 * Math.PI) >= 1e-6) other.push(...c.faces); // part of a round face (a fillet): selectable like any other curved face
    // full round faces; ones of the same radius on the same axis that touch end to end (a post pulled taller adds a face above the old one) are one wall
    const walls = [...round.values()].filter((c) => Math.abs(c.turn - 2 * Math.PI) < 1e-6).sort((x, y) => x.lo - y.lo);
    const merged = [];
    for (const c of walls) {
      const into = merged.find((m) => m.axis === c.axis && m.radius === c.radius && m.convex === c.convex && m.center.every((v, i) => i === c.axis || v === c.center[i]) && Math.abs(m.hi - c.lo) < 1e-3);
      if (into) { into.ranges.push(...c.ranges); into.hi = c.hi; } else merged.push({ ...c, ranges: [...c.ranges] });
    }
    for (const c of merged) faces.push({ type: "cyl", convex: c.convex, start: c.ranges[0].start, count: c.ranges[0].count, ranges: c.ranges, axis: c.axis, center: c.center, radius: c.radius, lo: c.lo, hi: c.hi });
    for (const f of other) {
      const g = ranges.get(f.hashCode);
      const [lo, hi] = f.boundingBox.bounds;
      const r4s = (v) => Math.round(v * 1e3) / 1e3;
      // a cylinder or a sphere also says how round it is (the radius is shown when it is selected)
      let radius;
      try {
        if (f.geomType === "CYLINDRE") radius = f._geomAdaptor().Cylinder().Radius();
        else if (f.geomType === "SPHERE") radius = f._geomAdaptor().Sphere().Radius();
      } catch { radius = undefined; }
      faces.push({ type: "surf", surface: String(f.geomType), start: g.start, count: g.count, lo: lo.map(r4s), hi: hi.map(r4s), ...(radius ? { radius: Math.round(radius * 1e4) / 1e4 } : {}), ...(partOf.has(f.hashCode) ? { axisOf: partOf.get(f.hashCode) } : {}) });
    }
    tFaces = performance.now();
    // edges as polylines, and their end points as vertices (for selecting lines and corners)
    const em = fin.shape.meshEdges({ tolerance: tess.tolerance, angularTolerance: tess.angular });
    const byHash = new Map(edgesOf(fin.shape).map((e) => [e.hashCode, e]));
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    const seen = new Map();
    edges = [];
    for (const g of em.edgeGroups) {
      const e = byHash.get(g.edgeId);
      const pts = Float32Array.from(em.lines.slice(g.start * 3, (g.start + g.count) * 3));
      const a = e.startPoint;
      const z = e.endPoint;
      const mid = e.pointAt(0.5);
      // an edge that is part of a circle (the rim of a post or a hole): its circle, so a whole rim can be picked, drawn and told from its halves
      let circle;
      if (e.geomType === "CIRCLE") {
        try {
          const ci = e._geomAdaptor().Circle();
          const [lc, ax] = [ci.Location(), ci.Axis().Direction()];
          circle = { center: [r4(lc.X()), r4(lc.Y()), r4(lc.Z())], normal: [r4(ax.X()), r4(ax.Y()), r4(ax.Z())], radius: r4(ci.Radius()) };
        } catch { circle = undefined; }
      }
      edges.push({ type: e.geomType, pts, a: [r4(a.x), r4(a.y), r4(a.z)], b: [r4(z.x), r4(z.y), r4(z.z)], mid: [r4(mid.x), r4(mid.y), r4(mid.z)], ...(circle ? { circle } : {}) });
      for (const v of [a, z]) seen.set(`${r4(v.x)},${r4(v.y)},${r4(v.z)}`, [r4(v.x), r4(v.y), r4(v.z)]);
    }
    vertices = [...seen.values()];
    if (dkey) {
      described.set(dkey, copyOf({ vol, bbox, faces, edges, vertices, mesh }));
      while (described.size > 6) described.delete(described.keys().next().value);
    }
  }
  return { ops, finalId: present?.id ?? null, volume: vol, bbox, faces, edges, vertices, totalMs: performance.now() - t0, mesh, perf: { ops: tCompile - t0, box: tBox, mesh: tMesh - tCompile - tBox, faces: tFaces - tMesh, edges: performance.now() - tFaces } };
}

/**
 * The final body of a graph as a mesh for a file (`dec_export_stl`): meshed at the quality asked for (not the screen's coarse one), as plain arrays.
 * Answers { ok: false, error } when there is nothing to export (no body, a step that failed, or a body with nothing in it).
 */
export function exportMesh(graph, quality) {
  const results = compile(graph);
  const failed = graph.ops.map((o) => ({ id: o.id, error: results.get(o.id)?.error ?? null })).find((o) => o.error);
  const fin = finalSolid(graph, results);
  if (!fin) return { ok: false, error: failed ? failed.error : "nothing to export yet: make a body" };
  let box = null;
  try { box = fin.shape.boundingBox.bounds; } catch { box = null; }
  if (!box) return { ok: false, error: "nothing to export: nothing is left of the body" };
  const m = fin.shape.mesh({ tolerance: quality.tolerance, angularTolerance: quality.angular });
  return { ok: true, vertices: new Float32Array(m.vertices), triangles: new Uint32Array(m.triangles), volume: volume(fin.shape), bbox: { min: [...box[0]], max: [...box[1]] } };
}
