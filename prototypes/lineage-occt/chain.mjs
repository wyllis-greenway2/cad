// The chain: sketch+extrude, split a face by a line, extrude one half, push a wall, fillet an edge. Replayed with edits.
import * as L from "./lib.mjs";
const { oc } = L;

const P0 = { w: 20, h: 10, d: 5, s: 10, t: 3, push: 4, r: 1, dir: 1 };

function rect(w, h) {
  const face = L.draw([0, 0]).lineTo([w, 0]).lineTo([w, h]).lineTo([0, h]).close().sketchOnPlane("XY").face().wrapped;
  const mids = [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
  const idOf = (ed) => { const m = L.edgeMid(ed); return "e" + mids.findIndex((q) => Math.abs(q[0] - m[0]) < 1e-3 && Math.abs(q[1] - m[1]) < 1e-3); };
  return { face, idOf };
}
const asModel = (shape, extra) => {
  const entries = []; for (const x of extra) if (!entries.some((e) => L.same(e.raw, x.raw))) entries.push(x);
  // faces the history did not name (none expected for a prism)
  return new L.Model(shape, entries);
};

/** Each step takes the model and returns a new one, or throws; a throw is contained: the step is flagged and the model passes through. */
const steps = [
  ["A", (m, p) => { const { face, idOf } = rect(p.w, p.h); const pr = L.prism(face, [0, 0, p.d], idOf, "A"); return L.carry(pr.mk, [], pr.shape, "A", pr.extra); }],
  ["B", (m, p) => {
    const sp = new oc.BRepAlgoAPI_Splitter();
    const line = p.dir > 0 ? L.makeLine([p.s, 0, p.d], [p.s, p.h, p.d]) : L.makeLine([p.s, p.h, p.d], [p.s, 0, p.d]);
    sp.SetArguments(L.toList([m.shape])); sp.SetTools(L.toList([line.wrapped])); sp.SetToFillHistory(true); sp.Build(L.pr());
    if (sp.HasErrors()) throw new Error("split failed");
    return L.carry(sp, [m.entries], sp.Shape(), "B");
  }],
  ["C", (m, p) => {
    const raw = m.rawOf("A:end.1"); if (!raw) throw new Error("ref A:end.1 not found");
    const ei = L.edgeIndex(m);
    const keyOf = (ed) => ei.find((e) => L.same(e.raw, ed))?.key ?? "?";
    const pr = L.prism(raw, [0, 0, p.t], keyOf, "C");
    return L.unify(L.boolean("fuse", m, asModel(pr.shape, pr.extra), "C"), "C");
  }],
  ["D", (m, p) => {
    const id = "A:side:e1", raw = m.rawOf(id); if (!raw) throw new Error("ref " + id + " not found");
    const f = L.facts(raw);
    const eiD = L.edgeIndex(m), keyD = (ed) => eiD.find((e) => L.same(e.raw, ed))?.key ?? "?";
    const pr = L.prism(raw, f.n.map((v) => v * p.push), keyD, "D");
    // the far face carries the wall's id on; the other faces of the pushed prism are new
    const tool = asModel(pr.shape, pr.extra.map((x) => (x.id === "D:end" ? { ...x, id } : x)));
    return L.unify(L.boolean("fuse", m, tool, "D"), "D");
  }],
  ["E", (m, p) => {
    const ei = L.edgeIndex(m), key = ["A:end.0", "A:side:e3"].sort().join("|");
    const e = ei.find((x) => x.key === key); if (!e) throw new Error("edge " + key + " not found");
    const mk = new oc.BRepFilletAPI_MakeFillet(m.shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
    mk.Add(p.r, L.downcast(e.raw)); mk.Build(L.pr());
    if (!mk.IsDone()) throw new Error("fillet failed");
    const shape = mk.Shape(); if (!L.valid(shape)) throw new Error("fillet gave an invalid solid");
    const extra = L.arr(mk.Generated(e.raw)).map((raw) => ({ id: "E:round", raw }));
    return L.carry(mk, [m.entries], shape, "E", extra);
  }],
];

/** replay with containment: a failing step is flagged and the model passes through; a later step may then miss its ref (orphaned) */
export function replay(p, upto = steps.length) {
  let m = null; const status = [];
  for (const [name, fn] of steps.slice(0, upto)) {
    try { m = fn(m, p); status.push([name, "ok"]); }
    catch (e) { status.push([name, "flagged: " + e.message]); if (!m) break; }
  }
  return { m, status };
}

const near = (a, b) => Math.abs(a - b) < 1e-2;
/** the references the chain's steps make, each with what the human would say it still means after the edit */
export const refs = [
  ["bottom (A:start)", "A:start", (f, p) => f.n[2] === -1 && near(f.c[2], 0)],
  ["wall+y (A:side:e2)", "A:side:e2", (f, p) => f.n[1] === 1 && near(f.hi[1], p.h)],
  ["wall-x (A:side:e3)", "A:side:e3", (f, p) => f.n[0] === -1 && near(f.c[0], 0)],
  ["topLeft (A:end.0)", "A:end.0", (f, p) => f.n[2] === 1 && near(f.hi[2], p.d) && f.c[0] < p.s],
  ["towerTop (C:end)", "C:end", (f, p) => f.n[2] === 1 && near(f.c[2], p.d + p.t)],
  ["wall+x-pushed (A:side:e1)", "A:side:e1", (f, p) => f.n[0] === 1 && near(f.c[0], p.w + p.push)],
  ["fillet (E:round)", "E:round", (f, p) => f.type !== "PLANE" && f.c[0] < 3 + p.r && f.c[2] > p.d - 2],
];

export function check(label, p) {
  const { m, status } = replay(p);
  const row = [];
  for (const [name, id, ok] of refs) {
    // a ref resolves through the id or an alias
    const e = m?.entries.find((x) => x.id === id || x.alias?.includes(id));
    if (!e) row.push([name, "LOST"]); else row.push([name, ok(L.facts(e.raw), p) ? "ok" : "WRONG"]);
  }
  return { label, status, row, valid: m ? L.valid(m.shape) : null, log: m?.log };
}

if (process.argv[1].endsWith("chain.mjs")) {
  const edits = [
    ["original", {}],
    ["wider  w 20->30", { w: 30 }],
    ["deeper h 10->14", { h: 14 }],
    ["taller d 5->8", { d: 8 }],
    ["line moved s 10->12", { s: 12 }],
    ["line drawn the other way", { dir: -1 }],
    ["tower taller t 3->4", { t: 4 }],
    ["push 4->6", { push: 6 }],
    ["fillet r 1->2", { r: 2 }],
    ["everything: w30 h14 d8 s12 t4 push6 r2", { w: 30, h: 14, d: 8, s: 12, t: 4, push: 6, r: 2 }],
    ["line off the face s 10->25 (kills the split)", { s: 25 }],
    ["fillet too big r 1->4", { r: 4 }],
    ["thin body d 5->0.5 with r 1", { d: 0.5 }],
  ];
  let ok = 0, wrong = 0, lost = 0;
  for (const [label, d] of edits) {
    const r = check(label, { ...P0, ...d });
    console.log(`\n== ${label}   steps: ${r.status.map((s) => s[0] + ":" + (s[1] === "ok" ? "ok" : "FLAG")).join(" ")}   valid:${r.valid}`);
    for (const [n, s] of r.status) if (s !== "ok") console.log(`   ${n} ${s}`);
    console.log("   " + r.row.map(([n, s]) => `${s === "ok" ? "✓" : s === "LOST" ? "∅" : "✗"} ${n.split(" ")[0]}`).join("  |  "));
    for (const [, s] of r.row) { if (s === "ok") ok++; else if (s === "WRONG") wrong++; else lost++; }
    if (label === "original") console.log("   log:", JSON.stringify(r.log ?? []).slice(0, 700));
  }
  console.log(`\nTOTAL refs ok ${ok}, wrong ${wrong}, lost ${lost}`);
}
