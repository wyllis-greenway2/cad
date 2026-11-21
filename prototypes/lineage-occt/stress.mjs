// Harder cases for lineage: a hole breaking through a wall, a vertex blend, partial coplanar merges, a turned body, flush cuts.
import * as L from "./lib.mjs";
import { makeCylinder, makeBox } from "replicad";
const { oc } = L;
const near = (a, b) => Math.abs(a - b) < 1e-2;

function box(x0, y0, z0, x1, y1, z1, step) {
  const sh = makeBox([x0, y0, z0], [x1, y1, z1]).wrapped;
  // name the six faces by outward normal
  const entries = L.facesOf(sh).map((raw) => { const f = L.facts(raw); const k = f.n.join(","); return { id: `${step}:${{ "1,0,0": "+x", "-1,0,0": "-x", "0,1,0": "+y", "0,-1,0": "-y", "0,0,1": "+z", "0,0,-1": "-z" }[k]}`, raw }; });
  return new L.Model(sh, entries);
}
const report = (title, m, refs, p) => {
  const bad = [];
  for (const [name, id, ok] of refs) {
    const e = m.entries.find((x) => x.id === id || x.alias?.includes(id));
    bad.push(!e ? `∅ ${name}` : ok(L.facts(e.raw), p) ? `✓ ${name}` : `✗ ${name}`);
  }
  const gaps = m.entries.filter((e) => e.id.includes(":gap")).length;
  console.log(`${title.padEnd(46)} valid:${L.valid(m.shape)} faces:${m.entries.length} gaps:${gaps}  ${bad.join("  ")}`);
  const extra = m.log.filter((x) => !x.split && !x.merged && !x.deleted);
  if (extra.length) console.log("     log:", JSON.stringify(extra).slice(0, 300));
};

// S1: a hole through a plate, moved until it breaks through the side wall, or misses
console.log("--- S1 hole in a plate");
for (const [label, cx, r] of [["hole at 20", 20, 4], ["hole at 37 (breaks the wall x=40)", 37, 4], ["hole at 39 r 4", 39, 4], ["hole at 20 r 12", 20, 12], ["hole at 60 (misses)", 60, 4]]) {
  const base = box(0, 0, 0, 40, 30, 10, "A");
  const cyl = makeCylinder(r, 12, [cx, 15, -1], [0, 0, 1]).wrapped;
  const tool = new L.Model(cyl, L.facesOf(cyl).map((raw) => ({ id: "H:" + (L.facts(raw).type === "PLANE" ? (L.facts(raw).n[2] > 0 ? "top" : "bot") : "wall"), raw })));
  const out = L.boolean("cut", base, tool, "H");
  report(label, out, [
    ["top A:+z", "A:+z", (f) => f.n[2] === 1 && near(f.c[2] === undefined ? 0 : f.hi[2], 10)],
    ["wall H:wall", "H:wall", (f) => f.type === "CYLINDRE" || f.type !== "PLANE"],
    ["side A:+x", "A:+x", (f) => f.n[0] === 1 && near(f.c[0], 40)],
  ]);
}

// S2: three edges meeting at a corner filleted together (a vertex blend)
console.log("--- S2 vertex blend");
{
  const base = box(0, 0, 0, 20, 20, 10, "A");
  const ei = L.edgeIndex(base);
  const pick = (a, b) => ei.find((e) => e.key === [a, b].sort().join("|"));
  const edges = [pick("A:+z", "A:+x"), pick("A:+z", "A:+y"), pick("A:+x", "A:+y")];
  const mk = new oc.BRepFilletAPI_MakeFillet(base.shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  for (const e of edges) mk.Add(2, L.downcast(e.raw));
  mk.Build(L.pr());
  const extra = edges.flatMap((e, i) => L.arr(mk.Generated(e.raw)).map((raw) => ({ id: `F:round${i}`, raw })));
  for (const v of L.sub(base.shape, "TopAbs_VERTEX")) for (const raw of L.arr(mk.Generated(v))) extra.push({ id: `F:corner@${L.facts(raw).c.join(",")}`, raw });
  const m = L.carry(mk, [base.entries], mk.Shape(), "F", extra);
  report("3 edges at a corner, r 2", m, [["top", "A:+z", (f) => f.n[2] === 1], ["round0", "F:round0", (f) => f.type !== "PLANE"], ["round1", "F:round1", (f) => f.type !== "PLANE"], ["round2", "F:round2", (f) => f.type !== "PLANE"]]);
  console.log("     faces:", m.entries.map((e) => e.id).join(" "));
}

// S3: two boxes meeting, tops flush, partial overlap, merged by unify; then the second raised (no longer flush)
console.log("--- S3 coplanar merge, partial overlap");
for (const [label, y0, y1, h2] of [["B y5..15, flush top", 5, 15, 10], ["B y0..20 (same width)", 0, 20, 10], ["B y5..15 raised to 12", 5, 15, 12], ["B y25..35 apart in y (touching only if overlap)", 25, 35, 10]]) {
  const a = box(0, 0, 0, 20, 20, 10, "A"), b = box(20, y0, 0, 40, y1, h2, "B");
  let m;
  try { m = L.unify(L.boolean("fuse", a, b, "C"), "C"); } catch (e) { console.log(label.padEnd(46), "FLAG", e.message); continue; }
  report(label, m, [["A:+z", "A:+z", (f) => f.n[2] === 1], ["B:+z", "B:+z", (f) => f.n[2] === 1], ["A:-z", "A:-z", (f) => f.n[2] === -1], ["B:-z", "B:-z", (f) => f.n[2] === -1]]);
  const merged = m.log.filter((x) => x.merged).map((x) => x.merged.join("+")).join(" ; ");
  if (merged) console.log("     merged:", merged);
}

// S4: a body turned 37 degrees about z and y, then a push, a fillet, unify
console.log("--- S4 turned body (37 degrees)");
for (const deg of [0, 37, 90]) {
  try {
    const base = box(0, 0, 0, 20, 10, 5, "A");
    const t = new oc.gp_Trsf(); t.SetRotation(new oc.gp_Ax1(new oc.gp_Pnt(0, 0, 0), new oc.gp_Dir(0.3, 0.5, 0.8)), (deg * Math.PI) / 180);
    const tr = new oc.BRepBuilderAPI_Transform(base.shape, t, true); tr.Build(L.pr());
    const turned = L.carry(tr, [base.entries], tr.Shape(), "T");
    // push the +x wall out by 4 along its own normal
    const raw = turned.rawOf("A:+x"), f = L.facts(raw);
    const pr = L.prism(raw, f.ne.map((v) => v * 4), () => "s", "P");
    const tool = new L.Model(pr.shape, pr.extra.map((x) => x).reduce((acc, x) => (acc.some((y) => L.same(y.raw, x.raw)) ? acc : [...acc, x.id === "P:end" ? { ...x, id: "A:+x" } : x]), []));
    const pushed = L.unify(L.boolean("fuse", turned, tool, "P"), "P");
    // fillet the top / +x edge
    const ei = L.edgeIndex(pushed), key = ["A:+z", "A:+x"].sort().join("|"), e = ei.find((x) => x.key === key);
    const mk = new oc.BRepFilletAPI_MakeFillet(pushed.shape, oc.ChFi3d_FilletShape.ChFi3d_Rational); mk.Add(1, L.downcast(e.raw)); mk.Build(L.pr());
    const fil = L.carry(mk, [pushed.entries], mk.Shape(), "F", L.arr(mk.Generated(e.raw)).map((raw) => ({ id: "F:round", raw })));
    report(`turned ${deg} deg: push, unify, fillet`, fil, [["+x", "A:+x", (g) => g.type === "PLANE"], ["round", "F:round", (g) => g.type !== "PLANE"], ["+z", "A:+z", (g) => g.type === "PLANE"]]);
  } catch (e) { console.log(`turned ${deg}`.padEnd(46), "FLAG", e.message); }
}

// S5: a cut whose faces lie exactly on the body's faces (flush notch at a corner), then a second cut flush with the first
console.log("--- S5 flush cuts");
for (const [label, g] of [["notch flush with +x and +z", 0], ["notch flush, 1e-7 proud", 1e-7], ["notch 1e-7 short of the wall", -1e-7]]) {
  const base = box(0, 0, 0, 20, 20, 10, "A");
  const tool = box(15, 5, 5, 20 + g, 15, 10 + g, "N");
  try { const m = L.unify(L.boolean("cut", base, tool, "N"), "N");
    report(label, m, [["A:+z", "A:+z", (f) => f.n[2] === 1], ["A:+x", "A:+x", (f) => f.n[0] === 1], ["N:-x (now faces +x)", "N:-x", (f) => f.n[0] === 1 && f.c[0] < 20]]);
  } catch (e) { console.log(label.padEnd(46), "FLAG", e.message); }
}

// S6: a ring slot cut in a plate leaves an island coplanar with the plate's top; then a flush box is fused on (unify runs): do both top pieces keep their ids?
console.log("--- S6 island face, ring slot, then unify");
{
  const base = box(0, 0, 0, 40, 40, 10, "A");
  const outer = makeCylinder(10, 12, [20, 20, -1], [0, 0, 1]).wrapped, inner = makeCylinder(7, 12, [20, 20, -1], [0, 0, 1]).wrapped;
  const tube = new oc.BRepAlgoAPI_Cut(outer, inner, L.pr()).Shape();
  const tool = new L.Model(tube, L.facesOf(tube).map((raw) => ({ id: "R:" + L.facts(raw).c.join(","), raw })));
  const slotted = L.boolean("cut", base, tool, "R");
  console.log("     after the cut:", slotted.ids().join(" "));
  const b = box(40, 0, 0, 60, 40, 10, "B");
  const m = L.unify(L.boolean("fuse", slotted, b, "U"), "U");
  console.log("     after fuse+unify:", m.ids().join(" "));
  console.log("     log:", JSON.stringify(m.log.filter((x) => !x.split && !x.deleted)));
  report("island + outer top + merged B top", m, [["A:+z.0", "A:+z.0", (f) => f.n[2] === 1], ["A:+z.1", "A:+z.1", (f) => f.n[2] === 1], ["B:+z", "B:+z", (f) => f.n[2] === 1]]);
}
