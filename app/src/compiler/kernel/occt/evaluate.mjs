// The OCCT implementation of the kernel interface (see ../README.md): an operation graph in, a plain-data result out.
// Nothing outside src/kernel/occt/ may import OCCT or replicad (inv_kernel_boundary).
import { loadOC } from "./oc.mjs";
import { compile, finalSolid, volume } from "./interpreter.mjs";
import { makeCompound, getOC, exportSTEP as writeStep } from "replicad";
import { facesOf, edgesOf } from "./topo.mjs";
import { lumpsOf, lumpsByName, solidKey } from "./bodies.mjs";
import { cornerEdges } from "../../../shared/sharp.mjs";

const described = new Map();
const lumpDescribed = new Map();
/** The angle (degrees) at which the surface turns a corner that is drawn as an edge: the page's `settings.extrude.edgeAngleDeg`, which the page checks against the answer's `sharpDeg` (it searches itself if they differ). */
const EDGE_ANGLE_DEG = 30;
const copyOf = (d) => ({
  vol: d.vol,
  bbox: d.bbox && { min: [...d.bbox.min], max: [...d.bbox.max] },
  faces: d.faces && structuredClone(d.faces),
  edges: d.edges && d.edges.map((e) => ({ ...e, pts: e.pts.slice() })),
  vertices: d.vertices && structuredClone(d.vertices),
  vertexBodies: d.vertexBodies ? [...d.vertexBodies] : null,
  bodies: d.bodies && structuredClone(d.bodies),
  mesh: d.mesh && { vertices: d.mesh.vertices.slice(), normals: d.mesh.normals.slice(), triangles: d.mesh.triangles.slice(), ...(d.mesh.sharp ? { sharp: d.mesh.sharp.slice(), sharpDeg: d.mesh.sharpDeg } : {}) },
});

export const KERNEL_NAME = "occt (replicad)";

/** Load the kernel (once). `options` is passed to the WASM loader (e.g. where to find the .wasm file). */
export const init = (options = {}) => loadOC(options);

/** The mesh, faces, edges and corners of one solid (a body), as plain data: the triangle ranges of its faces are into its own mesh, joined with the others' by `evaluate`. */
/** A box round a solid that is quick to find (not the exact one, which takes a tenth of a second for a loft): used to tell one body from another by what it looks like. */
function roughBox(shape) {
  const oc = getOC();
  const b = new oc.Bnd_Box();
  try { oc.BRepBndLib.Add(shape.wrapped, b, false); const [a, z] = [b.CornerMin(), b.CornerMax()]; const out = [a.X(), a.Y(), a.Z(), z.X(), z.Y(), z.Z()].map((v) => Math.round(v * 1e5)); a.delete(); z.delete(); return out; } finally { b.delete(); }
}

/** The faces made of an analytic surface (a plane, a cylinder, a sphere, a cone, a torus): their exact box is quick; that of a freeform face (a twisted wall, a loft) takes a millisecond each, so it is taken from the mesh (`dec_speed_rules`). */
const lumpFacts = new Map(); // (solid identity -> { volume, rough box, faces, edges })
const ANALYTIC = new Set(["PLANE", "CYLINDRE", "SPHERE", "CONE", "TORUS"]);
/** The box of the triangles `g` (a face's range of the mesh) as the corners lo and hi. */
function meshBounds(m, g) {
  const [lo, hi] = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (let k = g.start; k < g.start + g.count; k++) { const v = m.triangles[k] * 3; for (let a = 0; a < 3; a++) { const x = m.vertices[v + a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; } }
  return [lo, hi];
}
function describeSolid(shape, tess0, lite, vol0) {
    // the finer the part, the finer the mesh: the deflection allowed is a small part of the part's own size (a 2 mm post must not be a 20-sided prism: `in_165`), never coarser than `tess.tolerance`
    const free = facesOf(shape).some((f) => !ANALYTIC.has(f.geomType));
    const rb = roughBox(shape).map((v) => v / 1e5); // (a box that is quick to find: enough to size the mesh by; the exact one of a body with freeform faces is taken from the mesh)
    let [lo, hi] = free ? [[rb[0], rb[1], rb[2]], [rb[3], rb[4], rb[5]]] : shape.boundingBox.bounds;
    const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    // a draft (while a size is dragged, `in_216`): a rough mesh, quickly; the fine one is made when the pointer is let go
    const tess = tess0.draft ? { tolerance: Math.max(0.1, diag * 0.01), angular: 0.5 } : { tolerance: Math.min(tess0.tolerance, Math.max(0.002, diag * 0.002)), angular: Math.min(tess0.angular, 0.2) };
    const m = shape.mesh({ tolerance: tess.tolerance, angularTolerance: tess.angular });
    const mesh = { vertices: new Float32Array(m.vertices), normals: new Float32Array(m.normals), triangles: new Uint32Array(m.triangles) };
    mesh.sharp = Float32Array.from(cornerEdges(mesh.vertices, mesh.normals, mesh.triangles, EDGE_ANGLE_DEG)); // (once for each body, kept with its description: the page draws them and does not search the triangles, `dec_sharp_edges_once`)
    mesh.sharpDeg = EDGE_ANGLE_DEG;
    const vol = vol0 ?? volume(shape);
    if (free) { const all = meshBounds(m, { start: 0, count: m.triangles.length }); [lo, hi] = all; }
    const bbox = { min: [...lo], max: [...hi] };
    if (lite) return { mesh, vol, bbox, faces: [], edges: [], vertices: [], lite: true };
    // flat faces at any angle, and full round faces: these can be hovered, selected and sketched on (start/count are index ranges into `triangles`)
    const ranges = new Map(m.faceGroups.map((g) => [g.faceId, g]));
    const faces = [];
    const round = new Map();
    const partOf = new Map(); // hash code of a round face -> where its axis is (a piece of a cylinder keeps it, so its wall can be pushed and pulled as the radius of the circle it comes from)
    const other = [];
    for (const f of facesOf(shape)) {
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
      const [lo, hi] = g && !ANALYTIC.has(f.geomType) ? meshBounds(m, g) : f.boundingBox.bounds;
      const r4s = (v) => Math.round(v * 1e3) / 1e3;
      // a cylinder or a sphere also says how round it is (the radius is shown when it is selected)
      let radius;
      try {
        if (f.geomType === "CYLINDRE") radius = f._geomAdaptor().Cylinder().Radius();
        else if (f.geomType === "SPHERE") radius = f._geomAdaptor().Sphere().Radius();
      } catch { radius = undefined; }
      faces.push({ type: "surf", surface: String(f.geomType), start: g.start, count: g.count, lo: lo.map(r4s), hi: hi.map(r4s), ...(radius ? { radius: Math.round(radius * 1e4) / 1e4 } : {}), ...(partOf.has(f.hashCode) ? { axisOf: partOf.get(f.hashCode) } : {}) });
    }
    // edges as polylines, and their end points as vertices (for selecting lines and corners)
    const em = shape.meshEdges({ tolerance: tess.tolerance, angularTolerance: tess.angular });
    const byHash = new Map(edgesOf(shape).map((e) => [e.hashCode, e]));
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    const seen = new Map();
    const edges = [];
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
    const vertices = [...seen.values()];
    return { mesh, vol, bbox, faces, edges, vertices };
}

/**
 * Compile an operation graph and describe its final body.
 * Returns { ops: [{ id, type, error, ms }], finalId, volume, bbox: {min, max}, mesh: { vertices, normals, triangles } | null,
 *           faces, edges, vertices, totalMs }. Everything is plain numbers and arrays: no kernel objects or ids escape.
 */
export function evaluate(graph, tess = { tolerance: 0.05, angular: 0.3 }) {
  const t0 = performance.now();
  const results = compile(graph, !!tess.draft);
  const tCompile = performance.now();
  let tMesh = tCompile;
  let tFaces = tCompile;
  let tBox = 0;
  const ops = graph.ops.map((o) => {
    const r = results.get(o.id);
    return { id: o.id, type: o.type, error: r.error ?? null, ms: r.ms, ...(r.cached ? { cached: true } : {}), ...(r.checkMs >= 1 ? { checkMs: Math.round(r.checkMs) } : {}), ...(r.markMs >= 1 ? { markMs: Math.round(r.markMs) } : {}), ...(r.stages ? { stages: r.stages } : {}), ...(r.culprits ? { culprits: r.culprits } : {}), ...(r.value?.note ? { note: r.value.note } : {}), ...(r.value?.used ? { used: r.value.used } : {}), ...(r.value?.cutInto ? { cutInto: r.value.cutInto } : {}) };
  });
  const fin = finalSolid(graph, results);
  let mesh = null;
  let vol = null;
  let bbox = null;
  let faces = null;
  let edges = null;
  let vertices = null;
  let bodies = null;
  // what the final body looks like (its mesh, faces, edges, corners) is kept for the last few bodies, by what the body was worked out from: a change that leaves the body as it is (a sketch beside it, a
  // constraint, undo and redo, the kernel's answer taken in again) takes the description from here instead of making it again, which is most of the time of a body of a few hundred faces (`in_252`).
  // What goes back out is a copy: the worker hands the mesh over to the page, which empties it here.
  // a body with nothing in it (a cut that takes all of the body away) has no box: the kernel throws when it is asked for one. That is an answer, not a failure of the kernel: the step that made it cannot be made (`in_254`)
  let box = null;
  if (fin) { try { box = lumpsOf(fin.shape).length ? true : null; } catch { box = null; } } // (the exact box of the whole takes as long as of its parts: it is the union of theirs, found as each is described)
  if (fin && !box) {
    const o = ops.find((x) => x.id === fin.id);
    if (o) o.error = "nothing would be left of the body (the cut takes all of it away)";
  }
  let vertexBodies = null; // (for each corner, the place of its body in `bodies`, when there are several)
  let describeInfo = null; // (how many bodies were described again and how many were found as they were)
  const lite = !!tess.lite; // (a preview of a size being dragged: the mesh, volume and box, not the faces, edges and corners, `in_358`)
  const present = fin && box ? fin : null;
  const dkey = present?.key ? `${present.key}|${JSON.stringify(tess)}` : null;
  const known = dkey ? described.get(dkey) : undefined;
  if (known) {
    described.delete(dkey);
    described.set(dkey, known);
    ({ vol, bbox, faces, edges, vertices, mesh, bodies, vertexBodies } = copyOf(known));
    describeInfo = { bodies: bodies?.length ?? 0, reused: bodies?.length ?? 0 }; // (the whole answer was kept)
  } else if (present) {
    // each body (solid) is described on its own and the description kept by what it looks like (its volume, box and number of faces and edges): a body that a change did not touch is not meshed again, however many others are
    // (a block edited beside a loft of a thousand faces left the loft's mesh and faces to be made again at every size, `in_446`)
    const lumps = lumpsOf(fin.shape);
    const markers = fin.markers ?? [];
    const tKey = JSON.stringify([tess, lite]);
    let reused = 0, fpMs = 0, meshMs = 0;
    const parts = lumps.map((l) => {
      const tF = performance.now();
      // what a body looks like (its volume, box, number of faces and edges) is found once for the body, by its identity: a body that a change did not touch is not measured again, however many others are (`dec_per_body_checks`)
      const key = solidKey(l);
      let facts = lumpFacts.get(key);
      if (!facts) { facts = { v: volume(l), box: roughBox(l), nf: facesOf(l).length, ne: edgesOf(l).length }; lumpFacts.set(key, facts); while (lumpFacts.size > 200) lumpFacts.delete(lumpFacts.keys().next().value); }
      const v = facts.v;
      const fp = JSON.stringify([Math.round(v * 1e6), facts.box, facts.nf, facts.ne, tKey]);
      fpMs += performance.now() - tF;
      let d = lumpDescribed.get(fp);
      if (!d && tess.draft) { // (while a size is dragged a body already meshed finely keeps that mesh: a rough one would only be more work, and a body that did not change would flicker from fine to rough and back)
        const { draft: _d, ...fine } = tess;
        const fineFp = JSON.stringify([Math.round(v * 1e6), facts.box, facts.nf, facts.ne, JSON.stringify([fine, lite])]);
        d = lumpDescribed.get(fineFp);
        if (d) { lumpDescribed.delete(fineFp); lumpDescribed.set(fineFp, d); reused++; return d; }
      }
      const tD = performance.now();
      if (d) { lumpDescribed.delete(fp); reused++; } else { d = describeSolid(l, tess, lite, v); meshMs += performance.now() - tD; }
      lumpDescribed.set(fp, d);
      while (lumpDescribed.size > 40) lumpDescribed.delete(lumpDescribed.keys().next().value);
      return d;
    });
    describeInfo = { bodies: lumps.length, reused, fingerprintMs: Math.round(fpMs * 10) / 10, describedMs: Math.round(meshMs * 10) / 10 };
    tMesh = performance.now();
    // joined into one: the vertices and triangles one after the other (the triangle numbers of a body's faces and the vertex numbers of its triangles move on by what came before)
    const nV = parts.reduce((a, d) => a + d.mesh.vertices.length, 0);
    const nT = parts.reduce((a, d) => a + d.mesh.triangles.length, 0);
    mesh = { vertices: new Float32Array(nV), normals: new Float32Array(nV), triangles: new Uint32Array(nT), sharp: new Float32Array(parts.reduce((a, d) => a + d.mesh.sharp.length, 0)), sharpDeg: EDGE_ANGLE_DEG };
    let so = 0;
    faces = []; edges = []; vertices = []; 
    const seenV = new Map();
    const vertexBody = new Map(); // (the body each corner is a corner of, the first when two bodies share one place: so that a corner picked says which body it is in, `in_457`)
    let [vo, to] = [0, 0];
    const bodyOfLump = new Map(markers.map((m, bi) => [m.lump, bi]));
    parts.forEach((d, li) => {
      mesh.vertices.set(d.mesh.vertices, vo); mesh.normals.set(d.mesh.normals, vo);
      mesh.sharp.set(d.mesh.sharp, so); so += d.mesh.sharp.length;
      for (let k = 0; k < d.mesh.triangles.length; k++) mesh.triangles[to + k] = d.mesh.triangles[k] + vo / 3;
      const body = lumps.length > 1 && bodyOfLump.has(li) ? { body: bodyOfLump.get(li) } : {};
      for (const f of d.faces) faces.push({ ...structuredClone(f), start: f.start + to, ...(f.ranges ? { ranges: f.ranges.map((r) => ({ start: r.start + to, count: r.count })) } : {}), ...body });
      for (const e of d.edges) edges.push({ ...e, pts: e.pts.slice(), ...body });
      for (const v of d.vertices) { const k = v.join(","); if (!seenV.has(k)) seenV.set(k, v); if (!vertexBody.has(k) && body.body !== undefined) vertexBody.set(k, body.body); }
      vo += d.mesh.vertices.length; to += d.mesh.triangles.length;
    });
    vertices = [...seenV.values()].map((v) => [...v]);
    vertexBodies = lumps.length > 1 ? [...seenV.keys()].map((k) => vertexBody.get(k) ?? 0) : null;
    vol = parts.reduce((a, d) => a + d.vol, 0);
    bbox = { min: [0, 1, 2].map((i) => Math.min(...parts.map((d) => d.bbox.min[i]))), max: [0, 1, 2].map((i) => Math.max(...parts.map((d) => d.bbox.max[i]))) };
    bodies = markers.map((m) => { const d = parts[m.lump]; return { id: m.id, min: [...d.bbox.min], max: [...d.bbox.max], volume: lumps.length > 1 ? (lite ? NaN : d.vol) : vol }; });
    tFaces = performance.now();
    if (dkey) {
      described.set(dkey, copyOf({ vol, bbox, faces, edges, vertices, mesh, bodies, vertexBodies }));
      while (described.size > 6) described.delete(described.keys().next().value);
    }
  }
  return { ops, finalId: present?.id ?? null, ...(present?.faceNames ? { faceNames: present.faceNames.map((m) => ({ name: m.name, ...(m.kind === "cyl" ? { kind: m.kind, o: [...m.o], r: m.r } : m.kind === "surf" ? { kind: m.kind, type: m.type, lo: [...m.lo], hi: [...m.hi] } : {}), n: [...m.n], c: [...m.c] })), edgeNames: (present.edgeNames ?? []).map((m) => ({ name: m.name, a: [...m.a], b: [...m.b], mid: [...m.mid] })) } : {}), volume: vol, bbox, bodies, faces, edges, vertices, totalMs: performance.now() - t0, mesh, ...(describeInfo ? { describe: describeInfo } : {}), ...(vertexBodies ? { vertexBodies } : {}), perf: { ops: tCompile - t0, box: tBox, mesh: tMesh - tCompile - tBox, faces: tFaces - tMesh, edges: performance.now() - tFaces } };
}

/**
 * The final body of a graph as a mesh for a file (`dec_export_stl`): meshed at the quality asked for (not the screen's coarse one), as plain arrays.
 * Answers { ok: false, error } when there is nothing to export (no body, a step that failed, or a body with nothing in it).
 */
export function exportMesh(graph, quality) {
  const picked = exportShape(graph, quality.bodies);
  if (!picked.ok) return picked;
  const { shape, box } = picked;
  const m = shape.mesh({ tolerance: quality.tolerance, angularTolerance: quality.angular });
  return { ok: true, vertices: new Float32Array(m.vertices), triangles: new Uint32Array(m.triangles), volume: volume(shape), bbox: { min: [...box[0]], max: [...box[1]] } };
}

/** The final body of a graph (or only the bodies named) as a STEP file (`dec_export_formats`): the exact solid, as bytes; in millimetres or, with `unit` "in", inches. */
export async function exportStep(graph, bodies, unit) {
  const picked = exportShape(graph, bodies);
  if (!picked.ok) return picked;
  const { shape, box } = picked;
  try {
    // (the unit is a setting of the whole kernel that stays as it was left: it is set every time, millimetres too, or one export in inches would make all the next ones inches; the model is in millimetres either way)
    const blob = writeStep([{ shape, name: "model" }], { unit: unit === "in" ? "INCH" : "MM", modelUnit: "MM" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { ok: true, bytes, volume: volume(shape), bbox: { min: [...box[0]], max: [...box[1]] } };
  } catch (e) {
    return { ok: false, error: `the kernel could not write the STEP file: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** What an export is made of: the final solid of the graph, or the solids of the bodies named, and its box; or why there is nothing. */
function exportShape(graph, only) {
  const results = compile(graph);
  const failed = graph.ops.map((o) => ({ id: o.id, error: results.get(o.id)?.error ?? null })).find((o) => o.error);
  const fin = finalSolid(graph, results);
  if (!fin) return { ok: false, error: failed ? failed.error : "nothing to export yet: make a body" };
  let box = null;
  try { box = fin.shape.boundingBox.bounds; } catch { box = null; }
  if (!box) return { ok: false, error: "nothing to export: nothing is left of the body" };
  let shape = fin.shape;
  if (only?.length) {
    // only some of the bodies: their solids, as one shape
    const found = lumpsByName(shape, fin.markers ?? [], only);
    if (!found) return { ok: false, error: "that body is not there any more" };
    shape = found.picked.length === 1 ? found.picked[0] : makeCompound(found.picked);
    box = shape.boundingBox.bounds;
  }
  return { ok: true, shape, box };
}
