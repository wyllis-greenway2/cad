// Spike 4: the line idea end to end on OCCT. A sketch line and a body edge are the same kind of thing to a constraint; a line drawn on a face is imprinted into the body (the face really splits);
// the whole thing is a dependency graph of steps replayed under edits. Throwaway (CLAUDE.md rule 9).
import * as L from "../lineage-occt/lib.mjs";
const { oc } = L;

const near = (a, b) => Math.abs(a - b) < 1e-2;
const edgeKey = (a, b) => [a, b].sort().join("|");

/** A value is a sketch ({lines}) or a body (a Model: solid + faces with lineage ids). */

/** the unified line list: sketch lines and body edges look the same to a constraint (id, two ends, where they come from) */
export function linesOf(v) {
  if (v.lines) return v.lines.map((l) => ({ id: l.id, a: l.a, b: l.b, from: "sketch" }));
  const out = [];
  for (const e of L.edgeIndex(v)) {
    const ed = new L.oc.TopoDS_Shape(); void ed;
    out.push({ id: e.key, mid: e.mid, from: "body", faces: e.faces });
  }
  return out;
}

/** a constraint names a line either as a body edge key or as a line of an earlier sketch ("sketch0.e1" is the body edge where the extruded side e1 meets the top) */
function resolveEdge(body, ref, ctx) {
  const idx = L.edgeIndex(body);
  let key = ref.key;
  if (ref.sketchLine) { // the side face that grew from that sketch line, against the face the new sketch is on
    key = edgeKey(ctx.face, `${ctx.base}:side:${ref.sketchLine}`);
  }
  const e = idx.find((x) => x.key === key);
  return e ? { ...e, key } : null;
}

/** the nearest candidates when a reference no longer resolves (the rebind offer): faces of the same direction, nearest to where it was */
export function suggest(body, old) {
  return body.entries.map((e) => ({ id: e.id, f: L.facts(e.raw) })).filter((x) => x.f.n.every((v, i) => Math.abs(v - old.n[i]) < 1e-3))
    .map((x) => ({ id: x.id, d: Math.hypot(...x.f.c.map((v, i) => v - old.c[i])) })).sort((p, q) => p.d - q.d).slice(0, 3);
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
/** the plane's own axes: the normal, u the world x (or y) taken into the plane, v across; the origin is the face's middle; extents of the face along u and v */
function frameOf(raw, align) {
  const f = L.facts(raw), n = f.ne;
  let u = [1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]]; if (Math.hypot(...u) < 1e-3) u = [-n[1] * n[0], 1 - n[1] * n[1], -n[1] * n[2]];
  u = unit3(u); let v = cross3(n, u);
  if (align) { const d = dot3(align, n); v = unit3([align[0] - n[0] * d, align[1] - n[1] * d, align[2] - n[2] * d]); u = cross3(v, n); } // a line placed from an edge is parallel to it
  const O = f.ce; // exact numbers: a rounded centre puts the line a hair off the plane and the splitter ignores it
  let lo = [1e9, 1e9], hi = [-1e9, -1e9];
  for (const ed of L.edgesOf(raw)) { const E = new L.Edge(L.downcast(ed)); for (const p of [E.startPoint, E.endPoint]) { const q = sub3([p.x, p.y, p.z], O), a = dot3(q, u), b = dot3(q, v); lo = [Math.min(lo[0], a), Math.min(lo[1], b)]; hi = [Math.max(hi[0], a), Math.max(hi[1], b)]; } }
  return { n, u, v, O, lo, hi };
}
const at = (F, x, y) => [F.O[0] + F.u[0] * x + F.v[0] * y, F.O[1] + F.u[1] * x + F.v[1] * y, F.O[2] + F.u[2] * x + F.v[2] * y];

export const kernel = {
  name: "OCCT",
  free: () => {},
  hash: (v) => (v.lines ? JSON.stringify(v.lines) : `${volume(v.shape).toFixed(4)}|${v.entries.length}`),
  run(kind, p, ins) {
    switch (kind) {
      case "sketchRect": {
        const { w, h } = p;
        return { lines: [{ id: "e0", a: [0, 0], b: [w, 0] }, { id: "e1", a: [w, 0], b: [w, h] }, { id: "e2", a: [w, h], b: [0, h] }, { id: "e3", a: [0, h], b: [0, 0] }] };
      }
      case "extrude": { // a closed loop of lines pulled up; each side keeps the id of its line
        const sk = ins[0], pts = [sk.lines[0].a, ...sk.lines.map((l) => l.b)].slice(0, -1);
        let d = L.draw(pts[0]); for (const q of pts.slice(1)) d = d.lineTo(q);
        const face = d.close().sketchOnPlane("XY").face().wrapped;
        const mids = sk.lines.map((l) => [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]);
        const idOf = (ed) => { const m = L.edgeMid(ed); const i = mids.findIndex((q) => near(q[0], m[0]) && near(q[1], m[1])); return sk.lines[i].id; };
        const pr = L.prism(face, [0, 0, p.d], idOf, p.name);
        return L.carry(pr.mk, [], pr.shape, p.name, pr.extra);
      }
      case "sketchOnFace": { // lines placed on a face of the body; a line may be placed by its distance from a body edge or from an earlier sketch's line
        const body = ins[0], raw = body.rawOf(p.face); if (!raw) throw new Error(`ref ${p.face} not found`);
        const lines = [];
        for (const ln of p.lines) {
          let x = ln.x, F = frameOf(raw);
          if (ln.from) {
            const e = resolveEdge(body, ln.from, { face: p.face, base: p.base });
            if (!e) throw new Error(`edge ${ln.from.key ?? ln.from.sketchLine} not found`);
            const E = new L.Edge(L.downcast(e.raw)); F = frameOf(raw, [E.endPoint.x - E.startPoint.x, E.endPoint.y - E.startPoint.y, E.endPoint.z - E.startPoint.z]);
            const along = dot3(sub3(e.mid, F.O), F.u), toward = Math.sign(-along) || 1; // measured from the edge towards the middle of the face
            x = along + toward * ln.from.dist; // the line follows the edge when the body changes
          }
          lines.push({ id: ln.id, a: [x, F.lo[1]], b: [x, F.hi[1]], a3: at(F, x, F.lo[1]), b3: at(F, x, F.hi[1]) });
        }
        return { lines, face: p.face };
      }
      case "imprint": { // the lines become edges of the body: the face splits (OCCT's splitter, with history)
        const body = ins[0], sk = ins[1], sp = new oc.BRepAlgoAPI_Splitter();
        const tools = sk.lines.map((l) => L.makeLine(l.a3, l.b3).wrapped);
        sp.SetArguments(L.toList([body.shape])); sp.SetTools(L.toList(tools)); sp.SetToFillHistory(true); sp.Build(L.pr());
        if (sp.HasErrors()) throw new Error("imprint failed");
        return L.carry(sp, [body.entries], sp.Shape(), p.name);
      }
      case "extrudeRegion": {
        const body = ins[0], raw = body.rawOf(p.region); if (!raw) throw new Error(`region ${p.region} not found`);
        const ei = L.edgeIndex(body), keyOf = (ed) => ei.find((e) => L.same(e.raw, ed))?.key ?? "?";
        const pr = L.prism(raw, L.facts(raw).ne.map((v) => v * p.t), keyOf, p.name);
        const tower = new L.Model(pr.shape, pr.extra.filter((x, i, a) => a.findIndex((y) => L.same(y.raw, x.raw)) === i));
        return L.unify(L.boolean("fuse", body, tower, p.name), p.name);
      }
      case "turn": {
        const body = ins[0], t = new oc.gp_Trsf(); t.SetRotation(new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0.3, 0.5, 0.8)), (p.deg * Math.PI) / 180);
        const tr = new oc.BRepBuilderAPI_Transform(body.shape, t, true); tr.Build(L.pr());
        return L.carry(tr, [body.entries], tr.Shape(), p.name);
      }
      case "push": return push(ins[0], p.face, p.dist, p.name);
      case "dimension": { // a driving dimension between two parallel faces: the second face is pushed until the distance is the value
        const body = ins[0], a = body.rawOf(p.a), b = body.rawOf(p.b); if (!a || !b) throw new Error(`face ${!a ? p.a : p.b} not found`);
        const fa = L.facts(a), fb = L.facts(b);
        const cur = Math.abs((fb.c[0] - fa.c[0]) * fb.ne[0] + (fb.c[1] - fa.c[1]) * fb.ne[1] + (fb.c[2] - fa.c[2]) * fb.ne[2]);
        const delta = p.value - cur;
        return Math.abs(delta) < 1e-9 ? body : push(body, p.b, delta, p.name);
      }
      case "fillet": {
        const body = ins[0], idx = L.edgeIndex(body);
        // a reference to a face that has since split names its children: every edge between the pieces is meant (the rule: a parent id resolves to a set)
        const expand = (id) => { const kids = body.entries.filter((x) => x.id === id || x.id.startsWith(id + ".")).map((x) => x.id); return kids; };
        const keys = new Set(); for (const x of expand(p.edge[0])) for (const y of expand(p.edge[1])) keys.add(edgeKey(x, y));
        const found = idx.filter((x) => keys.has(x.key));
        if (!found.length) throw new Error(`edge ${edgeKey(p.edge[0], p.edge[1])} not found`);
        const mk = new oc.BRepFilletAPI_MakeFillet(body.shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
        for (const e of found) mk.Add(p.r, L.downcast(e.raw));
        mk.Build(L.pr());
        if (!mk.IsDone()) throw new Error("fillet failed");
        const shape = mk.Shape(); if (!L.valid(shape)) throw new Error("fillet gave an invalid solid");
        const extra = []; for (const e of found) for (const raw of L.arr(mk.Generated(e.raw))) extra.push({ raw, c: L.facts(raw).c });
        extra.sort((s, t) => s.c[0] - t.c[0] || s.c[1] - t.c[1] || s.c[2] - t.c[2]);
        return L.carry(mk, [body.entries], shape, p.name, extra.map((x, k) => ({ id: `${p.name}:round.${k}`, raw: x.raw })));
      }
      default: throw new Error("kind " + kind);
    }
  },
};

function push(body, faceId, dist, step) {
  const raw = body.rawOf(faceId); if (!raw) throw new Error(`ref ${faceId} not found`);
  const f = L.facts(raw), out = dist >= 0 ? f.ne : f.ne.map((v) => -v), mag = Math.abs(dist);
  const pr = L.prism(raw, out.map((v) => v * mag), () => "x", step);
  // the far face carries the pushed face's id on; the walls the prism makes are new
  const entries = []; for (const x of pr.extra) if (!entries.some((e) => L.same(e.raw, x.raw))) entries.push(x.id === `${step}:end` ? { ...x, id: faceId } : x);
  const tool = new L.Model(pr.shape, entries);
  return L.unify(L.boolean(dist >= 0 ? "fuse" : "cut", body, tool, step), step);
}
const volume = (s) => { const q = new oc.GProp_GProps(); oc.BRepGProp.VolumeProperties(s, q, false, false, false); return q.Mass(); };

/** the recipe: a rectangle, extruded; a line sketched on the top, 12 from the right-hand side; imprinted; one half raised; a width dimension; a fillet */
export const P0 = { w: 40, h: 30, d: 8, off: 12, t: 5, width: 50, r: 1.5, turn: 0 };
export function recipe(P) {
  const base = P.turn ? "T" : "A";
  return [
    { id: "sk0", kind: "sketchRect", params: { w: P.w, h: P.h }, inputs: [] },
    { id: "A", kind: "extrude", params: { d: P.d, name: "A" }, inputs: ["sk0"] },
    ...(P.turn ? [{ id: "T", kind: "turn", params: { deg: P.turn, name: "T" }, inputs: ["A"] }] : []),
    { id: "sk1", kind: "sketchOnFace", params: { face: "A:end", base: "A", lines: [{ id: "l1", from: { sketchLine: "e1", dist: P.off } }] }, inputs: [base] },
    { id: "B", kind: "imprint", params: { name: "B" }, inputs: [base, "sk1"] },
    { id: "C", kind: "extrudeRegion", params: { region: "A:end.1", t: P.t, name: "C" }, inputs: ["B"] },
    ...(P.second ? [
      { id: "sk2", kind: "sketchOnFace", params: { face: "A:end.0", base: "A", lines: [{ id: "l2", from: { key: "A:end.0|C:side:A:end.0|A:end.1", dist: P.second } }] }, inputs: ["C"] },
      { id: "B2", kind: "imprint", params: { name: "B2" }, inputs: ["C", "sk2"] },
    ] : []),
    { id: "D", kind: "dimension", params: { a: "A:side:e3", b: "A:side:e1", value: P.width, name: "D" }, inputs: [P.second ? "B2" : "C"] },
    { id: "E", kind: "fillet", params: { edge: ["A:end.0", "A:side:e3"], r: P.r, name: "E" }, inputs: ["D"] },
  ];
}
