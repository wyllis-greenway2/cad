// A dev check (not a test, `in_1444`) of undo and the step list's numbers, with the kernel: node --experimental-strip-types dev/undo-steplist-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { Undo } from "../src/interaction/undo.ts";
import { editNumber, rowsOf } from "../src/interaction/steplist.ts";
import { extrudeSteps } from "../src/interaction/extrude.ts";
import { addRect, constrain, emptySketch, keep, refOf } from "../src/interaction/drawing.ts";
import { worldFrame } from "../src/planes.ts";
import { check, failureCount } from "./lib.ts";
await initKernel();

const u = new Undo<number>(0);
check("a new history has nothing to undo or redo", !u.canUndo && !u.canRedo);
u.do(1, "one"); u.do(2, "two"); u.do(3, "three");
check("undo goes back one state at a time and says what it undid", u.undo() === 2 && u.next.redo === "three" && u.undo() === 1);
check("redo goes forward again", u.redo() === 2 && u.canRedo);
u.do(9, "nine");
check("a new change drops the redo", !u.canRedo && u.state === 9 && u.undo() === 2);
const m = new Undo<number>(0); m.do(1, "n", "k"); m.do(2, "n", "k"); m.do(3, "n", "k");
check("changes with one merge key are one change", m.undo() === 0 && !m.canUndo);
const m2 = new Undo<number>(0); m2.do(1, "n", "k"); m2.undo(); m2.redo(); m2.do(2, "n", "k");
check("an undo ends the merging", m2.undo() === 1);

// the recipe of a drawn rectangle with a dimension, extruded
const s0 = { points: {}, radii: {} }; let p = emptySketch();
let k = keep(addRect(p, s0, refOf(p, s0, [0, 0], 0.5), refOf(p, s0, [40, 25], 0.5))!); if (!k.ok) throw new Error(k.why); p = k.params;
const sol = { points: Object.fromEntries(p.points.map((x) => [x.id, [x.x, x.y] as [number, number]])), radii: {} };
const dim = constrain(p, sol, ["L1"], "dimension"); if (!dim.ok) throw new Error(dim.why); p = dim.params;
const steps = extrudeSteps([], p, worldFrame(2), [20, 12], 10);
const e = new Engine(steps as any); e.build();
const vol = (en: Engine, id: string) => K.volume((en.result(id).value as Body).solid);
check("the recipe makes 40 x 25 x 10", Math.abs(vol(e, "e1") - 10000) < 1e-6);
const rows = rowsOf(steps, [{ id: "s1", status: { kind: "ok" } }, { id: "e1", status: { kind: "ok" } }] as any);
check("rows: a sketch with its dimension, an extrude with its distance", rows.length === 2 && rows[0]!.numbers.some((n) => n.key === dim.added.replace(/^/, "c:") && n.value === 40) && rows[1]!.numbers[0]!.key === "d" && rows[1]!.numbers[0]!.value === 10, JSON.stringify(rows.map((r) => [r.title, r.numbers.map((n) => `${n.key}=${n.value}`)])));
const bigger = editNumber(steps, "e1", "d", 20)!, e2 = new Engine(bigger as any); e2.build();
check("a new distance: the engine makes 40 x 25 x 20", Math.abs(vol(e2, "e1") - 20000) < 1e-6);
const wider = editNumber(steps, "s1", `c:${dim.added}`, 60)!, e3 = new Engine(wider as any); e3.build();
check("a new dimension in the sketch step: the body is 60 x 25 x 10", e3.result("e1").status.kind === "ok" && Math.abs(vol(e3, "e1") - 15000) < 1e-3, `${vol(e3, "e1")}`);
check("the first corner stayed (the body still starts at the origin)", (() => { const b = e3.result("e1").value as Body; const f = b.faces.map((x) => K.facts(x.h)); return Math.min(...f.map((q) => q.lo[0])) === 0 && Math.min(...f.map((q) => q.lo[1])) === 0; })());
check("no such step or number: nothing", editNumber(steps, "x9", "d", 1) === null && editNumber(steps, "e1", "nope", 1) === null && editNumber(steps, "e1", "d", NaN) === null);
check("the old recipe is not changed by an edit", (steps[1]!.params as any).d === 10);
const impossible = editNumber(steps, "e1", "d", 0)!, e4 = new Engine(impossible as any); e4.build();
check("a distance of nothing: the step is flagged in words, not a body of nothing", e4.result("e1").status.kind !== "ok", JSON.stringify(e4.result("e1").status));
process.exit(failureCount() ? 1 : 0);
