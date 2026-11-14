// in_295: two cylinders side by side; making one wider must not cut the other. Whether an extrusion adds a piece or cuts is decided when it is made and kept in the step.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";

await kernel.init();
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body");

test("a step that says it adds keeps both bodies when the first one grows (`in_295`)", () => {
  const text = readFileSync(new URL("./fixtures/cylinder-grow-in_295-before.cad.json", import.meta.url), "utf8").replace(/("type":"extrude","parts":\[[^\]]*\],"params":\{)/g, '$1"mode":"new",');
  const s = (openSession(kernel, text) as unknown as { value: Session }).value;
  assert.equal(bodies(s).length, 2);
  const grown = run(s, { type: "setRadius", ref: "d/e_002.k", radius: 16.738423 } as never);
  assert.ok(!grown.message);
  assert.equal(bodies(grown).length, 2);
});
