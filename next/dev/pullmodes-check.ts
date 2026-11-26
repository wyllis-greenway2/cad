// A dev check (not a test, `in_1444`) of the face pull kinds the screen offers, through the worker's questions: a chamfered block's top: Extrude (a prism), Move (the step's depth), Extend (the chamfers carried on to a pyramid); node --experimental-strip-types dev/pullmodes-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { answer } from "../src/engine/asks.ts";
import { check, failureCount } from "./lib.ts";
await initKernel();
const base = [
  {
    id: "s1",
    kind: "sketchPolygon",
    params: {
      points: [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
      ],
    },
    inputs: [],
  },
  { id: "e1", kind: "extrude", params: { d: 10 }, inputs: ["s1"] },
];
const e0 = new Engine(base as any);
e0.build();
const top = (e0.result("e1").value as Body).faces.find((f) => f.id.role === "end")!.id;
// a chamfer of the four top edges, so pulling the top face has something to extend
const edges = (e0.result("e1").value as Body)
  .edges()
  .filter((x) => x.ref && x.faces.some((f) => f.id.role === "end") && x.faces.some((f) => f.id.role === "side"))
  .map((x) => x.ref);
const steps = [...base, { id: "r1", kind: "round", params: { edges, size: 3, mode: "chamfer" }, inputs: ["e1"] }];
const e = new Engine(steps as any);
e.build();
check("a chamfered block", e.result("r1").status.kind === "ok", JSON.stringify(e.result("r1").status));
const vol = (en: Engine, id: string) => K.volume((en.result(id).value as Body).solid);
const v0 = vol(e, "r1"),
  topFace = (e.result("r1").value as Body).faces.find((f) => f.id.role === "end")!.id;
const modes = answer(e, { what: "pullModes", step: "r1", face: topFace }) as {
  mode: string;
  ok: boolean;
  why: string;
  suggested: boolean;
}[];
check(
  "the modes of the top: edit, push, move, offset",
  modes.map((m) => m.mode).join() === "edit,push,move,offset",
  JSON.stringify(modes.map((m) => [m.mode, m.ok])),
);
check(
  "push (Extrude) and move (Extend) apply to the chamfered top; the round-wall offset does not",
  modes.find((m) => m.mode === "push")!.ok &&
    modes.find((m) => m.mode === "move")!.ok &&
    !modes.find((m) => m.mode === "offset")!.ok,
);
// Extrude: a prism of the top square (20 x 20 minus the chamfer) added 4 high
const ex = new Engine([
  ...steps,
  { id: "p1", kind: "push", params: { face: topFace, dist: 4 }, inputs: ["r1"] },
] as any);
ex.build();
check(
  "Extrude adds a prism of the face's outline: volume grows by area x 4, the chamfers stay as a ledge",
  ex.result("p1").status.kind === "ok" && Math.abs(vol(ex, "p1") - v0 - 14 * 14 * 4) < 1e-3,
  `${(vol(ex, "p1") - v0).toFixed(3)}`,
);
// Extend: the face moves and the chamfers are carried on; the block grows toward a pyramid
const mv = new Engine([
  ...steps,
  { id: "m1", kind: "moveFace", params: { face: topFace, dist: 4 }, inputs: ["r1"] },
] as any);
mv.build();
check(
  "Extend carries the chamfers on: ok, and it adds less than the prism (the sloped sides stay sloped)",
  mv.result("m1").status.kind === "ok" && vol(mv, "m1") - v0 > 0 && vol(mv, "m1") - v0 < 14 * 14 * 4,
  `${mv.result("m1").status.kind} +${(vol(mv, "m1") - v0).toFixed(3)}`,
);
// Extend far enough that the chamfers meet: says where, in words, and does not make a different shape
const far = new Engine([
  ...steps,
  { id: "m1", kind: "moveFace", params: { face: topFace, dist: 40 }, inputs: ["r1"] },
] as any);
far.build();
check(
  "Extend past the pyramid's tip is said in words (where the faces meet)",
  far.result("m1").status.kind !== "ok" && /meet|collapsed/.test(JSON.stringify(far.result("m1").status)),
  JSON.stringify(far.result("m1").status).slice(0, 160),
);
// Move: the step that made the face (the extrude's depth) changes: the answer is its new numbers
const e2 = new Engine(base as any);
e2.build();
const oe = answer(e2, { what: "originalEdit", step: "e1", face: top, dist: 3 }) as any;
check(
  "Move on a plain extrude's end: the depth of the extrude becomes 13",
  oe.step === "e1" && oe.params.d === 13,
  JSON.stringify(oe),
);
const no = answer(e, { what: "originalEdit", step: "r1", face: topFace, dist: 3 }) as any;
check(
  "Move on a face the chamfer step touched says why it cannot (no number moves it)",
  !!no.why || no.step !== undefined,
  JSON.stringify(no).slice(0, 120),
);
process.exit(failureCount() ? 1 : 0);
