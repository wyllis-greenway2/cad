// The OCCT implementation of the kernel interface (see ../README.md): an operation graph in, a plain-data result out.
// Nothing outside src/kernel/occt/ may import OCCT or replicad (inv_kernel_boundary).
import { loadOC } from "./oc.mjs";
import { compile, finalSolid, volume, bounds } from "./interpreter.mjs";

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
  const ops = graph.ops.map((o) => {
    const r = results.get(o.id);
    return { id: o.id, type: o.type, error: r.error ?? null, ms: r.ms };
  });
  const fin = finalSolid(graph, results);
  let mesh = null;
  let vol = null;
  let bbox = null;
  let faces = null;
  let edges = null;
  let vertices = null;
  if (fin) {
    const m = fin.shape.mesh({ tolerance: tess.tolerance, angularTolerance: tess.angular });
    mesh = { vertices: new Float32Array(m.vertices), normals: new Float32Array(m.normals), triangles: new Uint32Array(m.triangles) };
    vol = volume(fin.shape);
    bbox = bounds(fin.shape);
    // flat faces at any angle, and full round faces: these can be hovered, selected and sketched on (start/count are index ranges into `triangles`)
    const ranges = new Map(m.faceGroups.map((g) => [g.faceId, g]));
    faces = [];
    const round = new Map();
    for (const f of fin.shape.faces) {
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
          const have = round.get(key) ?? { type: "cyl", convex, ranges: [], turn: 0, axis, center, radius, lo: Math.round(lo[axis] * 1e4) / 1e4, hi: Math.round(hi[axis] * 1e4) / 1e4 };
          have.ranges.push({ start: g.start, count: g.count });
          have.turn += uv.uMax - uv.uMin;
          round.set(key, have);
        }
        continue;
      }
      if (!g || f.geomType !== "PLANE") continue;
      const n = f.normalAt();
      const c = f.center;
      const nv = [n.x, n.y, n.z].map((v) => Math.round(v * 1e6) / 1e6);
      const d = Math.round((nv[0] * c.x + nv[1] * c.y + nv[2] * c.z) * 1e4) / 1e4;
      const axis = nv.findIndex((v) => Math.abs(v) > 0.9999);
      // every flat face, at any angle: its unit normal n and offset d (n . p = d); axis, sign and offset also when it faces along an axis
      faces.push({ start: g.start, count: g.count, n: nv, d, ...(axis >= 0 ? { axis, sign: Math.sign(nv[axis]), offset: Math.round([c.x, c.y, c.z][axis] * 1e4) / 1e4 } : {}) });
    }
    for (const c of round.values()) if (Math.abs(c.turn - 2 * Math.PI) < 1e-6) faces.push({ type: "cyl", convex: c.convex, start: c.ranges[0].start, count: c.ranges[0].count, ranges: c.ranges, axis: c.axis, center: c.center, radius: c.radius, lo: c.lo, hi: c.hi });
    // edges as polylines, and their end points as vertices (for selecting lines and corners)
    const em = fin.shape.meshEdges({ tolerance: tess.tolerance, angularTolerance: tess.angular });
    const byHash = new Map(fin.shape.edges.map((e) => [e.hashCode, e]));
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    const seen = new Map();
    edges = [];
    for (const g of em.edgeGroups) {
      const e = byHash.get(g.edgeId);
      const pts = Float32Array.from(em.lines.slice(g.start * 3, (g.start + g.count) * 3));
      const a = e.startPoint;
      const z = e.endPoint;
      const mid = e.pointAt(0.5);
      edges.push({ type: e.geomType, pts, a: [r4(a.x), r4(a.y), r4(a.z)], b: [r4(z.x), r4(z.y), r4(z.z)], mid: [r4(mid.x), r4(mid.y), r4(mid.z)] });
      for (const v of [a, z]) seen.set(`${r4(v.x)},${r4(v.y)},${r4(v.z)}`, [r4(v.x), r4(v.y), r4(v.z)]);
    }
    vertices = [...seen.values()];
  }
  return { ops, finalId: fin?.id ?? null, volume: vol, bbox, faces, edges, vertices, totalMs: performance.now() - t0, mesh };
}
