// The files the human sent (`test/fixtures/*.cad`), built by the engine, with the invariants that every file must keep (`docs/rebuild/fixtures_requirements.md`). A bug a file showed is a row there, with the file as proof.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initKernel, volume } from "../src/engine/kernel.ts";
import { open } from "../src/engine/document.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { kinds, type Step } from "../src/engine/steps.ts";
import { extrudeSteps } from "../src/interaction/extrude.ts";

await initKernel();
const dir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith(".cad"))
  .map((f) => ({ name: f, steps: [...open(readFileSync(dir + f, "utf8")).doc.steps] as Step[] }));
const build = (steps: Step[]) => {
  const e = new Engine(steps);
  e.build();
  return e;
};
const makesBody = (s: Step) => kinds[s.kind]?.outputs === "body";
/** the steps that take a body a newer step has replaced: [the step, the body it takes, the step that replaced it] */
const replaced = (steps: readonly Step[]): [string, string, string][] => {
  const out: [string, string, string][] = [];
  steps.forEach((s, i) => {
    for (const x of s.inputs) {
      const xs = steps.find((q) => q.id === x);
      if (!xs || !makesBody(xs)) continue;
      const newer = steps
        .slice(0, i)
        .find((y) => makesBody(y) && y.id !== s.id && y.inputs.includes(x) && !s.inputs.includes(y.id));
      if (newer) out.push([s.id, x, newer.id]);
    }
  });
  return out;
};

test("[F1] every file the human sent opens and builds: no step of it fails", () => {
  assert.ok(fixtures.length >= 2, "the fixtures are there");
  for (const f of fixtures) {
    const e = build(f.steps),
      bad = e.ids().filter((i) => e.result(i).status.kind !== "ok");
    assert.deepEqual(bad, [], `${f.name}: steps that failed`);
  }
});

test("[F2] no step takes a body that a newer step has replaced (model_9.cad, made before the fix, has exactly one: its combine c1)", () => {
  for (const f of fixtures) {
    const r = replaced(f.steps);
    if (f.name === "model_9.cad")
      assert.deepEqual(r, [["c1", "e1", "r1"]], "the check finds the combine that left out the round");
    else assert.deepEqual(r, [], `${f.name}: ${JSON.stringify(r)}`);
  }
});

test("[F3] a body added to a model is joined to the model as it is now: the engine says which step that is, and the combine takes it first", () => {
  const def = {
    points: [{ id: "P1", x: 0, y: 0 }],
    circles: [{ id: "K1", c: "P1", r: 3 }],
    lines: [],
    arcs: [],
    constraints: [],
  };
  const frame = {
    origin: [0, 0, 0] as [number, number, number],
    normal: [0, 0, 1] as [number, number, number],
    u: [1, 0, 0] as [number, number, number],
  };
  for (const f of fixtures) {
    const e = build(f.steps),
      current = e.current(),
      lastMaking = [...f.steps].reverse().find(makesBody)!.id;
    assert.equal(current, lastMaking, `${f.name}: the engine's current body is the last step that makes a body`);
    const added = extrudeSteps(f.steps, current, def as never, frame as never, [0, 0], 5),
      join = added.find((s) => s.kind === "combine");
    assert.ok(join, `${f.name}: a combine is added`);
    assert.equal(join!.inputs[0], current, `${f.name}: joined to ${current}`);
  }
  assert.equal(build([]).current(), null, "no body: no current, and no combine");
  assert.equal(
    extrudeSteps([], null, def as never, frame as never, [0, 0], 5).some((s) => s.kind === "combine"),
    false,
  );
});

test("[F4] a move or a turn keeps the volume of the body, at every such step of every file", () => {
  for (const f of fixtures) {
    const e = build(f.steps);
    for (const s of f.steps.filter((q) => q.kind === "move" || q.kind === "turn")) {
      const before = (e.result(s.inputs[0]!).value as Body).solid,
        after = (e.result(s.id).value as Body).solid;
      assert.ok(
        Math.abs(volume(after) - volume(before)) <= 1e-6 * Math.max(1, volume(before)),
        `${f.name}: ${s.id} changed the volume ${volume(before)} to ${volume(after)}`,
      );
    }
  }
});

test("[F5] the same recipe gives the same result: built twice, every step has the same fingerprint", () => {
  for (const f of fixtures) {
    const a = build(f.steps),
      b = build(f.steps);
    for (const id of a.ids()) assert.equal(a.result(id).fingerprint, b.result(id).fingerprint, `${f.name}: ${id}`);
  }
});
