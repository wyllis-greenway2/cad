// Two faces pulled together when their outlines have the body's edges in them (`in_1358`): the figures of an extrude are written into its numbers as lists of refs, and a ref named after a body's edge has commas in it
// (`d/arc@body/e@33.53,22.14,25~...`), so the second figure was cut to pieces at its commas and the step was "gone". A list with a comma in a ref is now joined by a separator no name has.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, saveText, run } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { figuresOf, figureParams, joinRefs, splitRefs } from "../src/operation/scene.ts";

await kernel.init();
test("a list of refs with commas in them is written and read back whole; a list without is written as before", () => {
  const withCommas = ["d/arc@body/e@1.5,2,3~4,5,6@x", "d/seg@e_001.s0@body/e@7,8,9"];
  assert.deepEqual(splitRefs(joinRefs(withCommas)), withCommas);
  assert.equal(joinRefs(["d/e_001.s0", "d/e_001.s1"]), "d/e_001.s0,d/e_001.s1", "the old way for ordinary names");
  assert.deepEqual(splitRefs("d/e_001.s0,d/e_001.s1"), ["d/e_001.s0", "d/e_001.s1"], "and an old file reads as it did");
  const figs = [{ outer: withCommas as never, holes: [] }, { outer: ["d/arc@body/e@9,9,9", "d/seg@e_002.s0"] as never, holes: [["d/e_003.s0,x" as never]] }];
  const p = figureParams(figs);
  const back = figuresOf({ id: "s", type: "extrude", parts: figs[0]!.outer, params: { ...p } });
  assert.deepEqual(back[1]!.outer, figs[1]!.outer, "the second figure comes back whole");
});
test("the human's two end pieces of a cylinder's top pulled down together make the step and cut the two (`in_1358`)", () => {
  const o = openSession(kernel, readFileSync(new URL("./fixtures/two-faces-pull-in_1358.cad.json", import.meta.url), "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  const sc = scene(o.value);
  const chosen = (JSON.parse(readFileSync(new URL("./fixtures/two-faces-pull-in_1358.cad.json", import.meta.url), "utf8")) as { state: { selection: string[] } }).state.selection; // (what the human had selected)
  const pieces = chosen.map((r) => sc.parts[r as never]!).filter(Boolean);
  assert.equal(pieces.length, 2, "the two end pieces");
  const before = (Object.values(sc.parts).find((p) => p.kind === "body") as { volume?: number }).volume!;
  const st = startOp(sc, pieces.map((p) => p.ref), "extrude");
  assert.ok(st.ok);
  if (!st.ok) return;
  const r = runOp(o.value, { ...st.op, value: -5 });
  assert.ok(r && !r.session.message, r?.session.message ?? "");
  const after = Object.values(scene(r!.session).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
  assert.ok(after < before - 1, `material was cut: ${before} to ${after}`);
  assert.deepEqual(r!.session.outcome.errors, {});
  // saved and opened again: the step is still there
  const text = saveText(r!.session);
  const again = openSession(kernel, text);
  assert.ok(again.ok);
  if (again.ok) { assert.equal(scene(again.value).steps.length, scene(r!.session).steps.length, scene(again.value).steps.map((x) => x.id + ":" + x.type).join(",")); assert.deepEqual(again.value.outcome.errors, {}); }
});
