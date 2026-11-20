// A mate that cannot be made is refused quickly (`in_1325`): the human's model had 34 sketches in conflict, and each was searched for its culprit (0.4 s each) at every pose the mate tried, so Coincident on two faces hung for 14 s.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";

await kernel.init();
test("two faces that cannot be mated are refused in seconds, with the reason", () => {
  const o = openSession(kernel, readFileSync(new URL("./fixtures/cannot-mate-face-in_1325.cad.json", import.meta.url), "utf8"));
  assert.ok(o.ok);
  const sel = ["b/body/f@1,0,0,57.72", "b/body/f@1,0,0,31.02"];
  const flush = actionsFor(scene(o.value), sel as never).find((a) => a.id === "mate:flush");
  assert.ok(flush && flush.enabled);
  const t = Date.now();
  const s = run(o.value, flush.run());
  assert.ok(Date.now() - t < 5000, `took ${Date.now() - t} ms`);
  assert.match(s.message ?? "", /cannot be done without breaking other constraints/);
});
