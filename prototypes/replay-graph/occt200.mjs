// Where does one long OCCT chain slow down? Steps one by one, timing each part (the boolean, the validity check, the volume).
import * as K from "../lineage-occt/lib.mjs";
import { makeBox, makeCylinder } from "replicad";
const { oc } = K;
const pr = () => new oc.Message_ProgressRange();
let a = 7; const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let body = makeBox([0, 0, 0], [300, 300, 10]).wrapped;
const N = Number(process.argv[2] ?? 200), fuzzy = process.argv[3] === "fuzzy";
let tb = 0, tv = 0, tf = 0, t0 = performance.now();
for (let j = 1; j < N; j++) {
  const tool = j % 3 === 0 ? makeBox([5 + rnd() * 280, 5 + rnd() * 280, 10], [0, 0, 0].map(() => 0)).wrapped : null; void tool;
  const x = 5 + rnd() * 280, y = 5 + rnd() * 280, r = 1 + rnd() * 2;
  const isBoss = j % 3 === 0;
  const tl = isBoss ? makeBox([x, y, 10], [x + 6, y + 6, 12]).wrapped : makeCylinder(r, 12, [x, y, -1], [0, 0, 1]).wrapped;
  let s = performance.now();
  const op = new oc[isBoss ? "BRepAlgoAPI_Fuse" : "BRepAlgoAPI_Cut"](body, tl, pr());
  if (fuzzy) { /* the boolean takes its tolerance at construction in this build; not varied here */ }
  tb += performance.now() - s;
  if (!op.IsDone()) { console.log("step", j, "boolean failed"); break; }
  s = performance.now(); const next = op.Shape(); tf += performance.now() - s;
  s = performance.now(); const ok = new oc.BRepCheck_Analyzer(next, true, false).IsValid(); tv += performance.now() - s;
  if (!ok) { console.log("step", j, "invalid solid"); break; }
  body = next;
  if (j % 10 === 0) console.log(`step ${String(j).padStart(3)}  total ${((performance.now() - t0) / 1000).toFixed(1)} s   boolean ${(tb / 1000).toFixed(1)} s  validity check ${(tv / 1000).toFixed(1)} s   faces ${K.facesOf(body).length}`);
}
console.log("done", ((performance.now() - t0) / 1000).toFixed(1), "s");
