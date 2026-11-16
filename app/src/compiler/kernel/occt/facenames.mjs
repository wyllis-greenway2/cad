// Names for the flat faces of a body that last through the steps (`dec_stable_reference_mechanism`, option C, `in_559`): each flat face of a solid has a name made when an operation first made it (`<op id>:<rank>`)
// and keeps it through the operations after, found again by matching (the same plane, and the same place on it) after the motion the operation is known to have made. Nothing here is OCCT's own history.
// Plain numbers and replicad faces; nothing leaves the kernel folder.
import { facesOf, edgesOf } from "./topo.mjs";
import { moveMarkers } from "./bodies.mjs";

const TOL = 1e-3;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The flat faces of a shape: unit normal, a point of the face's mass, and its box. */
export function planesOf(shape) {
  const out = [];
  for (const f of facesOf(shape)) {
    if (f.geomType !== "PLANE") continue;
    const q = f.normalAt();
    const l = Math.hypot(q.x, q.y, q.z) || 1;
    const c = f.center;
    const [lo, hi] = f.boundingBox.bounds;
    out.push({ n: [q.x / l, q.y / l, q.z / l], c: [c.x, c.y, c.z], lo: [...lo], hi: [...hi], face: f });
  }
  return out;
}

/**
 * The flat faces and the round (cylindrical) faces of a shape (`dec_stable_reference_mechanism`, `in_564`): a flat face has its unit normal `n`, a point of its mass `c` and its box; a round face its axis direction `n`,
 * a point `o` of the axis, its radius `r`, a point `c` on its surface and its box. Other surfaces (a cone, a sphere, a torus, a spline) have no name yet.
 */
export function surfacesOf(shape) {
  const out = [];
  for (const f of facesOf(shape)) {
    const type = f.geomType;
    if (type === "PLANE") {
      const q = f.normalAt();
      const l = Math.hypot(q.x, q.y, q.z) || 1;
      const [lo, hi] = f.boundingBox.bounds;
      // a point of the face: the middle of its box, brought onto its plane (the face's centre of mass takes an integral over its outline: 90 ms for the two faces of a 60-tooth gear)
      const n = [q.x / l, q.y / l, q.z / l];
      const p = f.pointOnSurface(0.5, 0.5);
      const m = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
      const off = dot(n, [m[0] - p.x, m[1] - p.y, m[2] - p.z]);
      out.push({ kind: "plane", n, c: m.map((v, k) => v - n[k] * off), lo: [...lo], hi: [...hi], face: f });
    } else if (type === "CYLINDRE") {
      const cyl = f._geomAdaptor().Cylinder();
      const ax = cyl.Axis();
      const loc = ax.Location();
      const dir = ax.Direction();
      const p = f.pointOnSurface(0.5, 0.5);
      const [lo, hi] = f.boundingBox.bounds;
      const d = [dir.X(), dir.Y(), dir.Z()];
      const l = Math.hypot(...d) || 1;
      out.push({ kind: "cyl", n: d.map((v) => v / l), o: [loc.X(), loc.Y(), loc.Z()], r: cyl.Radius(), c: [p.x, p.y, p.z], lo: [...lo], hi: [...hi], face: f });
      for (const x of [dir, loc, ax, cyl]) x.delete?.();
    } else {
      // any other surface (a cone, a sphere, a torus, a spline: the sides of a loft, the round of a rim): named by its kind of surface and the box it lies in
      const [lo, hi] = f.boundingBox.bounds;
      out.push({ kind: "surf", type: String(type), n: [0, 0, 1], c: [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2), lo: [...lo], hi: [...hi], face: f });
    }
  }
  return out;
}

/** A name moved with the body: the point and the end of its normal are carried by the same motion (`tf`, as `moveMarkers` takes it). */
function carried(names, tf) {
  if (!tf) return names;
  const at = moveMarkers(names.map((m) => ({ id: m.name, at: m.c })), tf);
  const tip = moveMarkers(names.map((m) => ({ id: m.name, at: [m.c[0] + m.n[0], m.c[1] + m.n[1], m.c[2] + m.n[2]] })), tf);
  return names.map((m, i) => {
    const d = [tip[i].at[0] - at[i].at[0], tip[i].at[1] - at[i].at[1], tip[i].at[2] - at[i].at[2]];
    const l = Math.hypot(...d) || 1;
    if (m.kind === "surf") { // (a surface of another kind is carried as its box: by a move or a scale it stays a box; by a turn it does not, and is not matched)
      if (tf.mode !== "move" && tf.mode !== "scale") return { name: m.name, kind: "surf", type: m.type, n: m.n, c: at[i].at, lo: [NaN, NaN, NaN], hi: [NaN, NaN, NaN] };
      const [a, b] = [moveMarkers([{ id: "lo", at: m.lo }], tf)[0].at, moveMarkers([{ id: "hi", at: m.hi }], tf)[0].at];
      return { name: m.name, kind: "surf", type: m.type, n: m.n, c: at[i].at, lo: [0, 1, 2].map((k) => Math.min(a[k], b[k])), hi: [0, 1, 2].map((k) => Math.max(a[k], b[k])) };
    }
    const q = { name: m.name, n: d.map((v) => v / l), c: at[i].at };
    if (m.kind === "cyl") { q.kind = "cyl"; q.o = moveMarkers([{ id: "o", at: m.o }], tf)[0].at; q.r = tf.mode === "scale" ? m.r * tf.v : m.r; }
    return q;
  });
}

/** How far a point is from the line through `o` along the unit vector `n`. */
const lineGap = (o, n, p) => { const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]]; const k = dot(d, n); return Math.hypot(d[0] - n[0] * k, d[1] - n[1] * k, d[2] - n[2] * k); };
const near = (p, lo, hi, t) => [0, 1, 2].every((k) => p[k] >= lo[k] - t && p[k] <= hi[k] + t);

/**
 * The names of the faces of `shape` after an operation: `prev` are the names before it (`tf`: the motion the operation made of the whole body, if it was one). A face that is on the plane of a name, with the name's
 * point inside its box, is that name's (of two, the nearer); a face that matches none is new and is named `<opId>:<rank>`, the rank by the order of its normal and then of its place, so a change of a size makes the
 * same names. Returns the names in the order of the faces of `shape`, each with its normal and a point.
 */
export function nameFaces(prev, tf, shape, opId, roles) {
  const faces = surfacesOf(shape);
  const old = carried(prev ?? [], tf);
  const diag = (() => { let m = 0; for (const f of faces) m = Math.max(m, Math.hypot(f.hi[0] - f.lo[0], f.hi[1] - f.lo[1], f.hi[2] - f.lo[2])); return m || 1; })();
  const tol = TOL + 1e-6 * diag;
  const taken = new Set();
  const given = new Array(faces.length).fill(null);
  // the names that match a face exactly, in the order they were made; the faces are looked up by their normal's main direction and the offset of their plane (a body of a thousand faces would otherwise be a million comparisons)
  const bucket = (n, d) => { const a = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2; return `${a}${n[a] < 0 ? "-" : "+"}${Math.round(d / 0.05)}`; };
  const buckets = new Map();
  // round faces are looked up by their axis (when it runs along a world axis: which, and where it stands across it), and their radius: 144 posts would otherwise be twenty thousand comparisons for each step
  const CELL = 0.5;
  const axisOf = (n) => { const a = [0, 1, 2].find((k) => Math.abs(Math.abs(n[k]) - 1) < 1e-6); return a === undefined ? -1 : a; };
  const cylKey = (a, o, r, dx, dy, dr) => { const [u, v] = a === 0 ? [1, 2] : a === 1 ? [0, 2] : [0, 1]; return `${a}|${Math.round(r / 0.05) + dr}|${Math.round(o[u] / CELL) + dx}|${Math.round(o[v] / CELL) + dy}`; };
  const cylBuckets = new Map();
  const surfs = faces.map((f, i) => (f.kind === "surf" ? i : -1)).filter((i) => i >= 0);
  const cyls = []; // (the round faces whose axis is not along a world axis: looked through all)
  faces.forEach((f, i) => { if (f.kind === "surf") return; if (f.kind === "cyl") { const a = axisOf(f.n); if (a < 0) cyls.push(i); else { const k = cylKey(a, f.o, f.r, 0, 0, 0); cylBuckets.set(k, [...(cylBuckets.get(k) ?? []), i]); } return; } const k = bucket(f.n, dot(f.n, f.c)); buckets.set(k, [...(buckets.get(k) ?? []), i]); });
  // a round face is the same surface when its axis is the same line and its radius the same
  const sameCyl = (f, m) => Math.abs(Math.abs(dot(f.n, m.n)) - 1) < 1e-6 && Math.abs(f.r - m.r) <= tol && lineGap(f.o, f.n, m.o) <= tol && lineGap(m.o, m.n, f.o) <= tol;
  for (const m of old) {
    let best = -1, bestGap = Infinity;
    if (m.kind === "surf") {
      for (const i of surfs) {
        const f = faces[i];
        if (taken.has(i) || f.type !== m.type) continue;
        const gap = Math.max(...[0, 1, 2].flatMap((k) => [Math.abs(f.lo[k] - m.lo[k]), Math.abs(f.hi[k] - m.hi[k])]));
        if (gap <= tol * 2 && gap < bestGap) { best = i; bestGap = gap; }
      }
      if (best >= 0) { taken.add(best); given[best] = m.name; }
      continue;
    }
    if (m.kind === "cyl") {
      const am = axisOf(m.n);
      const pool = am < 0 ? [...cyls, ...[...cylBuckets.values()].flat()] : [...cyls, ...[-1, 0, 1].flatMap((dr) => [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dy) => cylBuckets.get(cylKey(am, m.o, m.r, dx, dy, dr)) ?? [])))];
      for (const i of pool) {
        const f = faces[i];
        if (taken.has(i) || !sameCyl(f, m)) continue;
        const gap = Math.hypot(m.c[0] - f.c[0], m.c[1] - f.c[1], m.c[2] - f.c[2]);
        const score = near(m.c, f.lo, f.hi, tol) ? gap : gap + 1e6;
        if (score < bestGap) { best = i; bestGap = score; }
      }
      if (best >= 0) { taken.add(best); given[best] = m.name; }
      continue;
    }
    const d0 = Math.round(dot(m.n, m.c) / 0.05);
    const a0 = bucket(m.n, 0).slice(0, 2);
    for (const dk of [d0 - 1, d0, d0 + 1]) for (const i of buckets.get(`${a0}${dk}`) ?? []) {
      const f = faces[i];
      if (taken.has(i) || dot(f.n, m.n) < 1 - 1e-6) continue;
      if (Math.abs(dot(f.n, [m.c[0] - f.c[0], m.c[1] - f.c[1], m.c[2] - f.c[2]])) > tol) continue; // not on its plane
      const inBox = near(m.c, f.lo, f.hi, tol);
      const gap = Math.hypot(m.c[0] - f.c[0], m.c[1] - f.c[1], m.c[2] - f.c[2]);
      const score = inBox ? gap : gap + 1e6; // (a face the name's point is in, else the nearest on the plane: a face that was split, or grew round it)
      if (score < bestGap) { best = i; bestGap = score; }
    }
    if (best >= 0) { taken.add(best); given[best] = m.name; }
  }
  // the faces no name matched that lie on the plane of a role (the sketch's own edge, a cap): named by the role
  if (roles?.length) {
    const used = new Map(); // role index -> how many faces it has named (a round face the kernel made of two halves is two faces of one role: the second is `#1`)
    const order = faces.map((f, i) => i).filter((i) => given[i] === null).sort((a, b) => { for (let k = 0; k < 3; k++) { const d = Math.round(faces[a].c[k] * 1e3) - Math.round(faces[b].c[k] * 1e3); if (d) return d; } return 0; });
    for (const i of order) {
      const f = faces[i];
      let best = null, gap = Infinity;
      roles.forEach((r, k) => {
        if (r.kind === "near") { // a face a fillet or chamfer made along a named edge: it holds the edge's middle in its box and runs along it (a round face: along its axis; a flat one: across it)
          if (f.kind === "surf") return;
          const along = Math.abs(dot(f.n, r.t));
          if (!(f.kind === "cyl" ? along > 1 - 1e-6 : along < 1e-6) || !near(r.c, f.lo, f.hi, tol + (r.reach ?? 0))) return;
          const g = Math.hypot(r.c[0] - f.c[0], r.c[1] - f.c[1], r.c[2] - f.c[2]);
          if (g < gap) { gap = g; best = k; }
          return;
        }
        if (r.kind === "box") { // a surface of another kind that lies in the box the corners of a side make (a loft's ruled side)
          if (f.kind !== "surf" || used.has(k)) return;
          const g = Math.max(...[0, 1, 2].flatMap((q) => [Math.abs(f.lo[q] - r.lo[q]), Math.abs(f.hi[q] - r.hi[q])]));
          if (g <= tol * 4 + r.slack && g < gap) { gap = g; best = k; }
          return;
        }
        if (f.kind === "surf") return;
        if (r.kind === "dir") { // a flat face across a direction, the one nearest a point, that no other role has taken
          if (f.kind === "cyl" || used.has(k) || Math.abs(Math.abs(dot(f.n, r.n)) - 1) > 1e-6) return;
          const g = Math.hypot(r.c[0] - f.c[0], r.c[1] - f.c[1], r.c[2] - f.c[2]);
          if (g < gap) { gap = g; best = k; }
          return;
        }
        if ((r.kind === "cyl") !== (f.kind === "cyl")) return;
        if (f.kind === "cyl") { if (!sameCyl(f, r)) return; }
        else if (used.has(k) || Math.abs(Math.abs(dot(f.n, r.n)) - 1) > 1e-6 || Math.abs(dot(r.n, [r.c[0] - f.c[0], r.c[1] - f.c[1], r.c[2] - f.c[2]])) > tol) return;
        const g = Math.hypot(r.c[0] - f.c[0], r.c[1] - f.c[1], r.c[2] - f.c[2]);
        if (g < gap) { gap = g; best = k; }
      });
      if (best !== null && roles[best].kind === "near") given[i] = `${opId}:${roles[best].role}${(used.set(best, (used.get(best) ?? 0) + 1), used.get(best) > 1 ? `#${used.get(best) - 1}` : "")}`;
      else if (best !== null) { const n = used.get(best) ?? 0; used.set(best, n + 1); given[i] = `${opId}:${roles[best].role}${n ? `#${n}` : ""}`; }
    }
  }
  // the faces no name matched: new, named by the operation and their order
  const fresh = faces.map((f, i) => ({ f, i })).filter((x) => given[x.i] === null);
  const key = (f) => [f.kind === "surf" ? 2 : f.kind === "cyl" ? 1 : 0, ...f.n.map((v) => Math.round(v * 1e4)), Math.round((f.kind === "cyl" ? f.r : dot(f.n, f.c)) * 1e3), ...f.c.map((v) => Math.round(v * 1e3))];
  fresh.sort((a, b) => { const ka = key(a.f), kb = key(b.f); for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k] - kb[k]; return 0; });
  fresh.forEach((x, rank) => { given[x.i] = `${opId}:${rank}`; });
  const names = faces.map((f, i) => (f.kind === "cyl" ? { name: given[i], kind: "cyl", n: f.n, c: f.c, o: f.o, r: f.r } : f.kind === "surf" ? { name: given[i], kind: "surf", type: f.type, n: f.n, c: f.c, lo: f.lo, hi: f.hi } : { name: given[i], n: f.n, c: f.c }));
  // the edge names are worked out when somebody asks (the next step that names an edge, or the answer): most steps are followed by one that does not, and each takes a look at every face's edges
  let edges = null;
  return { faces: names, get edges() { return (edges ??= nameEdges(faces, given)); } };
}

/**
 * The names of the straight and curved edges that lie between two flat faces (`dec_stable_reference_mechanism`): an edge is named by the names of its two faces, `<a>|<b>` (sorted); where several edges lie between the
 * same two faces (a face cut in two by a hole), each also gets its rank by place, `#k`. An edge with a face beside it that has no name (a cone, a sphere, a spline) has no name. Each comes with its ends and middle as the shape has them now.
 */
function nameEdges(faces, given) {
  const sides = new Map(); // edge hash -> { edge, names }
  faces.forEach((f, i) => {
    for (const e of edgesOf(f.face)) {
      const h = e.hashCode;
      const have = sides.get(h) ?? { edge: e, names: [] };
      have.names.push(given[i]);
      sides.set(h, have);
    }
  });
  const groups = new Map();
  for (const { edge, names } of sides.values()) {
    if (names.length !== 2 || names[0] === names[1]) continue;
    const key = [...names].sort().join("|");
    const [a, b, m] = [edge.startPoint, edge.endPoint, edge.pointAt(0.5)];
    const item = { a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], mid: [m.x, m.y, m.z] };
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const out = [];
  for (const [key, list] of groups) {
    list.sort((p, q) => { for (let k = 0; k < 3; k++) { const d = Math.round(p.mid[k] * 1e3) - Math.round(q.mid[k] * 1e3); if (d) return d; } return 0; });
    list.forEach((it, k) => out.push({ name: list.length > 1 ? `${key}#${k}` : key, ...it }));
  }
  return out;
}

/** The edges a step names, as the lines they are now (`dec_stable_reference_mechanism`): a reference with a `name` takes the ends and middle the body has for that name; a name the body has lost is an error, never another edge; a body with no names leaves the reference as it is. */
export function namedEdgeRefs(names, refs) {
  if (!names) return refs;
  return refs.map((r) => {
    if (!r?.name) return r;
    const m = names.find((x) => x.name === r.name);
    if (!m) throw new Error(`line not found (${r.name} is not an edge of the body any more)`);
    const { rank: _rank, sig: _sig, ...rest } = r;
    return { ...rest, a: m.a, b: m.b, mid: m.mid };
  });
}

/** The place a name stands for in a shape now: the plane and a point of the face, as the face references of the operations take it ({ n, d, point }); null when the name is not there (it was cut away). */
export function refOfName(names, name) {
  const m = (names ?? []).find((x) => x.name === name);
  return m ? { n: m.n, d: dot(m.n, m.c), point: m.c } : null;
}

/** What the extrusion needs of a sketch to name its faces, as plain numbers, read before the extrusion uses the sketch up: its edges' ends in the order of its wire, and the direction it is extruded along. */
export function edgeEnds(sketch) {
  const d = sketch.defaultDirection;
  return { dir: [d.x, d.y, d.z], edges: sketch.wire.edges.map((e) => { const p = (v) => [v.x, v.y, v.z]; const line = e.geomType === "LINE"; return { a: p(e.startPoint), b: p(e.endPoint), line, ...(line ? {} : { mid: p(e.pointAt(0.5)), p1: p(e.pointAt(1 / 3)), p2: p(e.pointAt(2 / 3)) }) }; }) };
}

/**
 * The roles of the faces a fillet or chamfer makes (`dec_stable_reference_mechanism`, `in_565`): each edge the step names by a lasting name, as the body has it before the step (`edgeNames`), gives the role
 * `round:<the edge's name>` to the new face that holds its middle in its box and runs along it. The faces are matched in `nameFaces`; an edge with no name, or a curved one with no direction, gives none.
 */
export function edgeRoles(op, edgeNames, size) {
  const roles = [];
  for (const r of [].concat(op.ref ?? [])) {
    if (!r?.name) continue;
    const e = (edgeNames ?? []).find((x) => x.name === r.name);
    if (!e) continue;
    const t = [e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]];
    const l = Math.hypot(...t);
    if (l < 1e-9) continue; // (a closed edge: a circle has no one direction)
    roles.push({ role: `round:${r.name.replaceAll("|", "+")}`, kind: "near", c: e.mid, t: t.map((v) => v / l), reach: 0 });
  }
  return roles;
}

/** The circle through three points in space: its centre and radius; null when they are on a line. */
function circleOf(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const nx = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const n2 = dot(nx, nx);
  if (n2 < 1e-18) return null;
  const abl = dot(ab, ab), acl = dot(ac, ac);
  // centre = a + ((|ac|^2 (ab x ac) x ab) + (|ab|^2 ac x (ab x ac))) / (2 |ab x ac|^2)
  const t1 = [nx[1] * ab[2] - nx[2] * ab[1], nx[2] * ab[0] - nx[0] * ab[2], nx[0] * ab[1] - nx[1] * ab[0]];
  const t2 = [ac[1] * nx[2] - ac[2] * nx[1], ac[2] * nx[0] - ac[0] * nx[2], ac[0] * nx[1] - ac[1] * nx[0]];
  const o = [0, 1, 2].map((k) => a[k] + (acl * t1[k] + abl * t2[k]) / (2 * n2));
  return { o, r: Math.hypot(a[0] - o[0], a[1] - o[1], a[2] - o[2]) };
}

/**
 * The roles of the flat faces one figure of an extrusion makes, by the sketch's own edges (`dec_stable_reference_mechanism`, `in_561`), worked out from the sketch and the distance (no second prism): the start cap, the end
 * cap and one side for each straight edge of the sketch. A side is `side:<the id of the sketch edge>` (the sketch op's `sides`, one for each corner: the line that runs from it to the next), so it is the same face when
 * the sketch's other sides change or sides are added; it lies on the plane through the edge along the extrusion. Only the main figure's caps are named (`start`, `end`). Plain planes (`n`, `c`, `role`) for `nameFaces` to
 * find among the new faces. Nothing is returned when the sketch does not say its sides or has not as many edges as sides.
 */
export function figureRoles(ends, distance, sides, caps) {
  ends = ends ?? null;
  const roles = [];
  if (!ends || !sides || !sides.length || !Number.isFinite(distance)) return roles;
  // a circle is drawn as two halves in the wire but is one side of the sketch
  if (sides.length === 1 && ends.edges.length > 1 && ends.edges.every((e) => !e.line)) ends = { ...ends, edges: [ends.edges[0]] };
  if (ends.edges.length !== sides.length) return roles;
  const dir = ends.dir;
  const dl = Math.hypot(...dir) || 1;
  const u = dir.map((v) => v / dl);
  const half = u.map((v) => (v * distance) / 2);
  if (caps) {
    const pts = ends.edges.map((e) => e.a);
    const c0 = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
    roles.push({ role: "start", n: u, c: c0 }, { role: "end", n: u, c: c0.map((v, k) => v + u[k] * distance) });
  }
  ends.edges.forEach((e, i) => {
    if (!sides[i]) return;
    if (!e.line) { // an arc or a circle: the round face along the extrusion through its three points
      const k = circleOf(e.a, e.p1, e.p2);
      if (k) roles.push({ role: `side:${sides[i]}`, kind: "cyl", n: u, o: k.o, r: k.r, c: [0, 1, 2].map((q) => e.mid[q] + half[q]) });
      return;
    }
    const tan = [e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]];
    const n = [tan[1] * u[2] - tan[2] * u[1], tan[2] * u[0] - tan[0] * u[2], tan[0] * u[1] - tan[1] * u[0]];
    const l = Math.hypot(...n);
    if (l < 1e-9) return; // (an edge along the extrusion: no side)
    roles.push({ role: `side:${sides[i]}`, n: n.map((v) => v / l), c: [0, 1, 2].map((k) => (e.a[k] + e.b[k]) / 2 + half[k]) });
  });
  return roles;
}

/** A point turned about the axis through `a` along the unit vector `k` by `deg` degrees (the right-hand rule). */
function turned(p, a, k, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const d = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const kd = dot(k, d);
  const cr = [k[1] * d[2] - k[2] * d[1], k[2] * d[0] - k[0] * d[2], k[0] * d[1] - k[1] * d[0]];
  return [0, 1, 2].map((m) => a[m] + d[m] * c + cr[m] * s + k[m] * kd * (1 - c));
}

/**
 * The roles of the faces a plain revolve makes (`dec_stable_reference_mechanism`, `in_565`), by the profile's own edges: an edge parallel to the axis turns into a round face along it (`side:<id>`, a cylinder of
 * the edge's distance from the axis), an edge across the axis into a flat ring (`side:<id>`), and, for a turn of less than a whole one, the profile's own plane is `start` and the plane it ends in `end` (the main
 * figure only). Other edges (a slanted one: a cone; an arc: a sphere or a torus) make faces with no name yet, and so do a spiral and a twist (the axis along the plane's normal, or an advance). `A` is a point
 * of the axis and `D` its direction.
 */
export function revolveRoles(ends, A, D, angle, advance, sides, caps) {
  const roles = [];
  if (!ends || !sides || !sides.length || ends.edges.length !== sides.length || Math.abs(advance) > 1e-9) return roles;
  const dl = Math.hypot(...D) || 1;
  const k = D.map((v) => v / dl);
  const nl = Math.hypot(...ends.dir) || 1;
  const N = ends.dir.map((v) => v / nl);
  if (Math.abs(Math.abs(dot(N, k)) - 1) < 1e-6) return roles; // (the axis along the plane's normal: a twist)
  if (caps && Math.abs(angle) < 360 - 1e-6) {
    const pts = ends.edges.map((e) => e.a);
    const c0 = [0, 1, 2].map((q) => pts.reduce((s, p) => s + p[q], 0) / pts.length);
    const sgn = angle > 0 ? 1 : -1;
    const n1 = turned([N[0] + A[0], N[1] + A[1], N[2] + A[2]], A, k, sgn * Math.abs(angle)).map((v, q) => v - A[q]);
    roles.push({ role: "start", n: N, c: c0 }, { role: "end", n: n1, c: turned(c0, A, k, sgn * Math.abs(angle)) });
  }
  ends.edges.forEach((e, i) => {
    if (!sides[i] || !e.line) return;
    const t = [e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]];
    const l = Math.hypot(...t);
    if (l < 1e-9) return;
    const along = Math.abs(dot(t, k)) / l;
    const mid = [0, 1, 2].map((q) => (e.a[q] + e.b[q]) / 2);
    if (along > 1 - 1e-6) { // parallel to the axis: a cylinder at its distance
      const r = lineGap(A, k, mid);
      if (r > 1e-6) roles.push({ role: `side:${sides[i]}`, kind: "cyl", n: k, o: A, r, c: mid });
    } else if (along < 1e-6) { // across the axis: a flat ring
      roles.push({ role: `side:${sides[i]}`, n: k, c: mid });
    }
  });
  return roles;
}

/** The plane through a section's corners (Newell's normal and their middle), or null when they are not in one plane. */
function sectionPlane(edges) {
  const pts = edges.map((e) => e.a);
  if (pts.length < 3) return null;
  const n = [0, 0, 0];
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; n[0] += (p[1] - q[1]) * (p[2] + q[2]); n[1] += (p[2] - q[2]) * (p[0] + q[0]); n[2] += (p[0] - q[0]) * (p[1] + q[1]); });
  const l = Math.hypot(...n);
  if (l < 1e-12) return null;
  const u = n.map((v) => v / l);
  const c = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  const scale = Math.max(1, ...pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])));
  return pts.every((p) => Math.abs(dot(u, [p[0] - c[0], p[1] - c[1], p[2] - c[2]])) < 1e-6 * scale) ? { n: u, c } : null;
}

/**
 * The roles of the flat faces a loft makes (`dec_stable_reference_mechanism`, `in_569`), by the sketches' own edges: `sections` are the figures in order, each with its edges' ends (`edgeEnds`) and the id of each
 * edge (`sides`, kept in step with the points by the matching of the sketches). The first and the last section's planes are `start` and `end` (the main figure only); a side between edge i of one section and the same edge
 * of the next is `side:<the id of that edge in the earlier section>` when the four corners are in one plane (a ruled side of straight edges that are parallel or meet); a curved side has none. A loft that is
 * not ruled bends between three or more sections and its sides are splines, which no name is made for.
 */
export function loftRoles(sections, caps, smooth = false) {
  const roles = [];
  if (!sections || sections.length < 2 || sections.some((s) => !s.ends || !s.sides)) return roles;
  if (caps) {
    const first = sectionPlane(sections[0].ends.edges), last = sectionPlane(sections[sections.length - 1].ends.edges);
    if (first) roles.push({ role: "start", n: first.n, c: first.c });
    if (last) roles.push({ role: "end", n: last.n, c: last.c });
  }
  if (smooth && sections.length > 2) { // a loft bent through three or more sections: one spline side for each edge, from the first section to the last, in the box of that edge's corners in every section
    const first = sections[0];
    if (first.sides.length === first.ends.edges.length && sections.every((s) => s.ends.edges.length === first.ends.edges.length)) {
      first.sides.forEach((id, i) => {
        if (!id) return;
        const pts = sections.flatMap((s) => [s.ends.edges[i].a, s.ends.edges[i].b]);
        const lo = [0, 1, 2].map((q) => Math.min(...pts.map((p) => p[q]))), hi = [0, 1, 2].map((q) => Math.max(...pts.map((p) => p[q])));
        roles.push({ role: `side:${id}`, kind: "box", lo, hi, c: lo.map((v, q) => (v + hi[q]) / 2), slack: 0.1 * Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])) });
      });
    }
    return roles;
  }
  for (let j = 0; j + 1 < sections.length; j++) {
    const [A, B] = [sections[j], sections[j + 1]];
    if (A.ends.edges.length !== B.ends.edges.length || A.sides.length !== A.ends.edges.length) continue;
    A.ends.edges.forEach((e, i) => {
      const f = B.ends.edges[i];
      if (!A.sides[i] || !e.line || !f.line) return;
      const u = [e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]], v = [f.a[0] - e.a[0], f.a[1] - e.a[1], f.a[2] - e.a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      let l = Math.hypot(...n);
      if (l < 1e-9) { // (the two edges' ends run along one line from the first corner: use the other corner)
        const w = [f.b[0] - e.a[0], f.b[1] - e.a[1], f.b[2] - e.a[2]];
        const n2 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        l = Math.hypot(...n2);
        if (l < 1e-9) return;
        n[0] = n2[0]; n[1] = n2[1]; n[2] = n2[2];
      }
      const k = n.map((x) => x / l);
      const size = Math.max(1, Math.hypot(...u), Math.hypot(...v));
      const flat = Math.abs(dot(k, [f.b[0] - e.a[0], f.b[1] - e.a[1], f.b[2] - e.a[2]])) <= 1e-6 * size; // (not flat: a twisted side, a surface of another kind)
      const pts = [e.a, e.b, f.a, f.b];
      const lo = [0, 1, 2].map((q) => Math.min(...pts.map((p) => p[q]))), hi = [0, 1, 2].map((q) => Math.max(...pts.map((p) => p[q])));
      const c = [0, 1, 2].map((q) => (e.a[q] + e.b[q] + f.a[q] + f.b[q]) / 4);
      if (flat) roles.push({ role: `side:${A.sides[i]}`, n: k, c }); // (a flat side: the kernel may make it a plane)
      roles.push({ role: `side:${A.sides[i]}`, kind: "box", lo, hi, c, slack: smooth ? 0.05 * Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])) : 0 }); // (else a surface of another kind in the box of its four corners)
    });
  }
  return roles;
}

/** The roles of a sweep's flat faces that the sketch alone gives (`in_569`): the profile's own plane is `start`; the cap at the other end is the flat face standing across the path's last direction `t`, nearest the path's end `end` (a `dir` role). The sides depend on the path and are not named. */
export function endTangent(seg) {
  if (!seg.m) return [seg.b[0] - seg.a[0], seg.b[1] - seg.a[1], seg.b[2] - seg.a[2]];
  const k = circleOf(seg.a, seg.m, seg.b);
  if (!k) return [seg.b[0] - seg.a[0], seg.b[1] - seg.a[1], seg.b[2] - seg.a[2]];
  const u = [seg.m[0] - seg.a[0], seg.m[1] - seg.a[1], seg.m[2] - seg.a[2]], v = [seg.b[0] - seg.m[0], seg.b[1] - seg.m[1], seg.b[2] - seg.m[2]];
  const N = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const r = [seg.b[0] - k.o[0], seg.b[1] - k.o[1], seg.b[2] - k.o[2]];
  const t = [N[1] * r[2] - N[2] * r[1], N[2] * r[0] - N[0] * r[2], N[0] * r[1] - N[1] * r[0]];
  return dot(t, v) < 0 ? t.map((x) => -x) : t; // (the way the path is going at its end)
}
export function sweepRoles(ends, t, end, caps, sides, straight) {
  const roles = [];
  if (!ends || !caps) return roles;
  const p = sectionPlane(ends.edges);
  if (p) roles.push({ role: "start", n: p.n, c: p.c });
  const l = Math.hypot(...t);
  if (l > 1e-9) roles.push({ role: "end", kind: "dir", n: t.map((v) => v / l), c: end });
  // a path of one straight line carries each straight side of the profile along it, as an extrusion does: the same roles (`side:<id>`)
  if (straight && sides && l > 1e-9) roles.push(...figureRoles({ dir: t, edges: ends.edges }, straight, sides, false));
  return roles;
}

/**
 * How much the sides of a swept body crease where the path's curvature changes (`in_606`): a profile that is not square to the path is carried rigidly, so each of its corners goes along a curve whose direction jumps where the
 * path's curvature does (a line into an arc, two arcs of different radius, an S bend). The jump in direction is the change of curvature times how far the corner stands off the path along the path's direction (its lever),
 * about (change of curvature) x (lever). `segs` are the path's lines and arcs (`a`, `b`, and `m` for an arc), `points` the profile's points and `a0` where the path starts on it. Returns `{ deg, tilt }` (the crease in degrees
 * at the worst joint and the angle by which the profile is off square to the path's start), or null for a path that is not flat (the curvature has no one sign), one segment, or a profile that is square to it.
 */
export function creaseOf(segs, points, a0) {
  if (!segs || segs.length < 2) return null;
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : null; };
  const info = segs.map((s) => {
    if (!s.m) { const t = unit([s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]]); return t ? { t0: t, kappa: 0, n: null } : null; }
    const k = circleOf(s.a, s.m, s.b);
    if (!k || k.r < 1e-9) return null;
    const u = [s.m[0] - s.a[0], s.m[1] - s.a[1], s.m[2] - s.a[2]], v = [s.b[0] - s.m[0], s.b[1] - s.m[1], s.b[2] - s.m[2]];
    const n = unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    if (!n) return null;
    const r = [s.a[0] - k.o[0], s.a[1] - k.o[1], s.a[2] - k.o[2]];
    const t0 = unit([n[1] * r[2] - n[2] * r[1], n[2] * r[0] - n[0] * r[2], n[0] * r[1] - n[1] * r[0]]); // (counter-clockwise about n, the way the arc goes)
    return t0 ? { t0, kappa: 1 / k.r, n } : null;
  });
  if (info.some((x) => !x)) return null;
  // a flat path: every arc's plane has the same normal, up to its sign; the curvature is signed by it
  const ref = info.find((x) => x.n)?.n;
  if (!ref) return null;
  for (const x of info) if (x.n && Math.abs(Math.abs(dot(x.n, ref)) - 1) > 1e-3) return null;
  const kap = info.map((x) => (x.n ? x.kappa * Math.sign(dot(x.n, ref)) : 0));
  let dk = 0;
  for (let i = 1; i < kap.length; i++) dk = Math.max(dk, Math.abs(kap[i] - kap[i - 1]));
  const T0 = info[0].t0;
  let lever = 0;
  for (const p of points) lever = Math.max(lever, Math.abs(dot([p[0] - a0[0], p[1] - a0[1], p[2] - a0[2]], T0)));
  const deg = (dk * lever * 180) / Math.PI;
  return deg > 0 ? { deg, T0 } : null;
}
