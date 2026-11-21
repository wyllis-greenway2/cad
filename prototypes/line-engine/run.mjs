import { makeEngine } from "../replay-graph/engine.mjs";
import * as L from "../lineage-occt/lib.mjs";
import { kernel, recipe, P0, linesOf, suggest } from "./recipe.mjs";
const near = (a, b) => Math.abs(a - b) < 1e-2;

function build(P) {
  const steps = recipe(P), e = makeEngine(kernel, steps); e.buildAll();
  return { e, steps };
}
const get = (e, id) => e.res.get(id);
const finalOf = (e) => get(e, "E").held.v;
// predicates are read in the body's own frame: a turned body's numbers are turned back first
const R = (P) => { const th = (-P.turn * Math.PI) / 180, a = [0.3, 0.5, 0.8], l = Math.hypot(...a), k = a.map((v) => v / l), c = Math.cos(th), s = Math.sin(th);
  return (v) => { if (!P.turn) return v; const kv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]], d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2]; return [0, 1, 2].map((i) => v[i] * c + kv[i] * s + k[i] * d * (1 - c)); }; };
let un = (v) => v;
const refs = [
  ["topLeft A:end.0", (M, P) => face(M, "A:end.0", (f) => near(f.n[2], 1) && near(f.c[2], P.d) && f.c[0] < P.w - P.off + 1e-2)],
  ["towerTop C:end", (M, P) => face(M, "C:end", (f) => near(f.n[2], 1) && near(f.c[2], P.d + P.t))],
  ["rightWall A:side:e1", (M, P) => face(M, "A:side:e1", (f) => near(f.n[0], 1) && near(f.c[0], P.width))],
  ["leftWall A:side:e3", (M, P) => face(M, "A:side:e3", (f) => near(f.n[0], -1) && near(f.c[0], 0))],
  ["round E:round", (M, P) => { const k = M.entries.filter((x) => x.id.startsWith("E:round")); return !k.length ? "LOST" : k.every((x) => L.facts(x.raw).type !== "PLANE") ? "ok" : "WRONG"; }],
  // the line you drew is an edge of the body: where the top-left face meets the tower's wall that grew from it
  ["drawn line (an edge)", (M, P) => { const all = L.edgeIndex(M).filter((x) => x.faces.some((i) => i === "A:end.0" || i.startsWith("A:end.0.")) && x.faces.some((i) => i.startsWith("C:side:"))); const e = all.find((x) => near(un(x.mid)[0], P.w - P.off)); return !all.length ? "LOST" : e ? "ok" : "WRONG"; }],
];
// a reference names a face, or the face's children when it has since split (the rule: a parent id resolves to a set); every piece must satisfy the meaning
function face(M, id, ok) { const es = M.entries.filter((x) => x.id === id || x.id.startsWith(id + ".") || x.alias?.includes(id)); if (!es.length) return "LOST"; return es.every((e) => { const f = L.facts(e.raw); return ok({ ...f, n: un(f.n), c: un(f.c) }); }) ? "ok" : "WRONG"; }

const base0 = (P) => (P.turn ? "T" : "A");
const edits = [
  ["original", {}],
  ["wider w 60 (the dimension still says 50)", { w: 60 }],
  ["narrower w 30 (the dimension widens it to 50)", { w: 30 }],
  ["deeper h 44", { h: 44 }],
  ["taller d 12", { d: 12 }],
  ["line moved: off 20", { off: 20 }],
  ["line moved: off 6", { off: 6 }],
  ["tower t 9", { t: 9 }],
  ["dimension 50 -> 70", { width: 70 }],
  ["dimension 50 -> 35", { width: 35 }],
  ["fillet r 3", { r: 3 }],
  ["everything: w 55 h 36 d 10 off 15 t 7 width 62 r 2", { w: 55, h: 36, d: 10, off: 15, t: 7, width: 62, r: 2 }],
  ["line off the face: off 45", { off: 45 }],
  ["line at the edge: off 0", { off: 0 }],
  ["fillet too big r 12", { r: 12 }],
];
let ok = 0, wrong = 0, lost = 0;
for (const [turn, second] of [[0, 0], [37, 0], [0, 5], [37, 5]]) {
 console.log(`\n######## body turned ${turn} degrees; second line ${second ? second + " mm from the first line's seam edge (splits the top-left face again)" : "none"}`);
for (const [label, d] of edits) {
  const P = { ...P0, ...d, turn, second }; un = R(P);
  const { e, steps } = build(P);
  const status = steps.map((s) => `${s.id}:${get(e, s.id).flagged ? "FLAG" : "ok"}`).join(" ");
  const M = finalOf(e);
  const row = refs.map(([n, f]) => { const r = f(M, P); if (r === "ok") ok++; else if (r === "WRONG") wrong++; else lost++; return `${r === "ok" ? "✓" : r === "LOST" ? "∅" : "✗"} ${n.split(" ")[0]}`; });
  console.log(`${label.padEnd(50)} ${status}  valid ${L.valid(M.shape)}\n    ${row.join("  ")}`);
  for (const s of steps) if (get(e, s.id).flagged) console.log(`      ${s.id}: ${get(e, s.id).note}`);
  if (label.startsWith("line off the face")) {
    const B = get(e, base0(P)).held.v, old = { n: [0, 0, 1], c: [20, 15, 8] };
    console.log("      rebind offer for the region A:end.1 (a +z face near where it was):", JSON.stringify(suggest(B, old)));
  }
  e.dispose();
}
}
console.log(`\nTOTAL refs ok ${ok}, wrong ${wrong}, lost ${lost}`);

// the unified line list for the UI: sketch lines and body edges
{
  const { e } = build(P0);
  const sk = linesOf(get(e, "sk1").held.v), body = linesOf(get(e, "E").held.v), sk0 = linesOf(get(e, "sk0").held.v);
  console.log(`\nunified lines: sketch0 ${sk0.length}, sketch1 ${sk.length}, final body edges ${body.length}; e.g. ${body.slice(0, 4).map((l) => l.id).join(" ; ")}`);
  // edit cost through the graph
  const t0 = performance.now(); e.byId.get("sk1").params.lines[0].from.dist = 18; const r = e.edit("sk1", "cutoff");
  console.log(`edit of the line's offset through the graph: ${r.computes} of ${e.steps.length} steps, ${(performance.now() - t0).toFixed(0)} ms`);
}
