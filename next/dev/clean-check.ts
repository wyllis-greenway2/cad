// A dev check (not a test, `in_1444`) for "clean" and "something happened" and the automatic cleanup (E27, E29, E33, `in_1518`): a sliver is said, a step that changed nothing is said, the cleanup moves a number by under the
// smallest feature, as a change in the history that undo takes back and that is not made again.
//   node --experimental-strip-types dev/clean-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { slivers } from "../src/engine/clean.ts";
import { autoClean, propose } from "../src/engine/cleanup.ts";
import * as D from "../src/engine/document.ts";
import { edgeRef, idKey, mint } from "../src/engine/id.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
import { check, fail, failureCount, near } from "./lib.ts";
const st = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string };
const body = (e: Engine, id: string) => e.result(id).value as Body;
const poly = (id: string, x0: number, x1: number): Step => ({
  id,
  kind: "sketchPolygon",
  params: {
    points: [
      [x0, 0],
      [x1, 0],
      [x1, 10],
      [x0, 10],
    ],
  },
  inputs: [],
});
// a block 20 x 10 x 10 with a block 10 x 10 x 15 on its right half: a step in the top, the low top face is x 0..10 at z = 10
const stepped = (): Step[] => [
  poly("a", 0, 20),
  { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["a"] },
  poly("b", 10, 20),
  { id: "B", kind: "extrude", params: { d: 15 }, inputs: ["b"] },
  { id: "U", kind: "combine", params: { mode: "add" }, inputs: ["A", "B"] },
];
const lowTop = (e: Engine) =>
  body(e, "U").faces.find((f) => {
    const q = K.facts(f.h);
    return q.type === "PLANE" && q.ne[2] > 0.99 && Math.abs(q.ce[2] - 10) < 1e-6;
  })!.id;

console.log("1. a sliver is a face thinner than the smallest feature, and is said");
{
  const base = new Engine(stepped());
  base.build();
  const face = lowTop(base);
  base.release();
  const push = (d: number): Step[] => [
    ...stepped(),
    { id: "P", kind: "push", params: { face, dist: d }, inputs: ["U"] },
  ];
  const e = new Engine(push(4.997));
  e.build();
  const notes = e.result("P").notes.filter((n) => n.kind === "sliver");
  check(
    "the low top pushed to 0.003 under the high one leaves a 0.003 wall face: a note, in words, step still ok",
    st(e, "P").kind === "ok" && notes.length === 1 && /0\.0030 mm thick/.test(notes[0]!.text),
    notes.map((n) => n.text).join(" | "),
  );
  const clean = new Engine(push(5));
  clean.build();
  check(
    "pushed exactly flush: the faces merge and nothing is a sliver",
    st(clean, "P").kind === "ok" &&
      clean.result("P").notes.every((n) => n.kind !== "sliver") &&
      slivers(body(clean, "P")).length === 0,
  );
  const wide = new Engine(push(4));
  wide.build();
  check(
    "a 1 mm step is a feature, not a sliver",
    wide.result("P").notes.every((n) => n.kind !== "sliver"),
  );
  const off = new Engine(push(4.997));
  off.minFeature = 0;
  off.build();
  check(
    "the check can be turned off (minimum 0)",
    off.result("P").notes.every((n) => n.kind !== "sliver"),
  );
  for (const x of [e, clean, wide, off]) x.release();
}
console.log("2. valid but nothing changed is a failure, in words");
{
  const base = new Engine(stepped());
  base.build();
  const face = lowTop(base);
  base.release();
  const missed: Step[] = [
    poly("a", 0, 10),
    { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["a"] },
    poly("c", 50, 60),
    { id: "C", kind: "extrude", params: { d: 5 }, inputs: ["c"] },
    { id: "X", kind: "combine", params: { mode: "cut" }, inputs: ["A", "C"] },
  ];
  const e = new Engine(missed);
  e.build();
  check(
    "a cut that misses the body: flagged, said",
    st(e, "X").kind === "flagged" && /changed nothing/.test(st(e, "X").why ?? ""),
    st(e, "X").why,
  );
  const inside: Step[] = [...stepped(), { id: "P", kind: "push", params: { face, dist: 3 }, inputs: ["U"] }];
  const p = new Engine(inside);
  p.build();
  check("a push that does something is ok", st(p, "P").kind === "ok");
  const keep: Step[] = [
    poly("a", 0, 10),
    { id: "A", kind: "extrude", params: { d: 10 }, inputs: ["a"] },
    poly("c", 50, 60),
    { id: "C", kind: "extrude", params: { d: 5 }, inputs: ["c"] },
    { id: "K", kind: "combine", params: { mode: "keep", targets: [], tools: [] }, inputs: ["A", "C"] },
  ];
  void keep;
  for (const x of [e, p]) x.release();
}
console.log("3. the cleanup: a number moved by under the smallest feature, as a change in the history");
{
  const base = new Engine(stepped());
  base.build();
  const face = lowTop(base);
  base.release();
  const doc0 = stepped().reduce((d, s) => D.insert(d, s), D.emptyDoc()),
    doc = D.insert(doc0, { id: "P", kind: "push", params: { face, dist: 4.997 }, inputs: ["U"] });
  const e = new Engine(doc.steps as never);
  e.build();
  const prop = propose(e, "P");
  check(
    "a proposal: the push's distance 4.997 to 5.000 (the sliver's own thickness), nothing applied yet",
    !!prop &&
      prop.key === "dist" &&
      near(prop.to, 5, 1e-9) &&
      near((e.step("P").params as { dist: number }).dist, 4.997),
    prop ? prop.text : "none",
  );
  const h = new D.History(doc),
    done = autoClean(e, h);
  check(
    "autoClean does it: one change, marked automatic, the engine is clean, and the step is ok",
    done.length === 1 &&
      h.next.undo === done[0]!.text &&
      st(e, "P").kind === "ok" &&
      e.result("P").notes.every((n) => n.kind !== "sliver"),
    h.next.undo ?? "",
  );
  check(
    "the distance in the document is now 5, and the history says why",
    near((h.doc.steps.find((s) => s.id === "P")!.params as { dist: number }).dist, 5, 1e-9),
  );
  const u = h.undo()!;
  e.setRecipe(u.steps as never, undefined, u.parameters);
  check(
    "undo takes it back: the 4.997 and its sliver and its warning are there again (nothing changed without a trace)",
    near((e.step("P").params as { dist: number }).dist, 4.997) && e.result("P").notes.some((n) => n.kind === "sliver"),
  );
  check("and it is not made again", autoClean(e, h).length === 0 && h.declined("P.dist"));
  const again = new D.History(doc);
  check("a fresh history on the same document cleans it again", autoClean(e, again).length === 1);
  e.release();
  const far = new Engine([...stepped(), { id: "P", kind: "push", params: { face, dist: 4.95 }, inputs: ["U"] }]);
  far.build();
  check(
    "a step 0.05 from flush is a 0.05 mm face: bigger than the smallest feature, not a sliver, not touched",
    far.result("P").notes.every((n) => n.kind !== "sliver") && propose(far, "P") === null,
  );
  far.release();
  const tiny = new Engine([...stepped(), { id: "P", kind: "push", params: { face, dist: 4.9999 }, inputs: ["U"] }]);
  tiny.build();
  const pr = propose(tiny, "P");
  check("0.0001 from flush: moved by 0.0001", !!pr && near(pr.to, 5, 1e-9), pr ? pr.text : "none");
  tiny.release();
}
console.log(failureCount() ? `\n${failureCount()} failure(s)` : "\nno failure");
process.exit(failureCount() ? 1 : 0);
