// Pulling the wall of one tooth (a piece of a circle) must never make a ring round all the teeth (`in_265`): when the sketch cannot take the new radius, the pull is refused, not turned into a prism of the whole circle.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, undoLast, scene } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const FILE = "test/fixtures/gear-teeth.cad.json";

test("pulling the wall of an arc of the gear by sizes the chamfer cannot follow makes no ring round all the teeth", { skip: !fs.existsSync(FILE) }, () => {
  const o = openSession(kernel, fs.readFileSync(FILE, "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  const s0 = undoLast(o.value); // (before the pull of the file)
  const wall = Object.values(scene(s0).parts).find((p) => p.ref.startsWith("b/body/s@CYLINDRE,8.089,31.95"))!;
  const st = startOp(scene(s0), [wall.ref], "pushpull");
  assert.ok(st.ok);
  if (!st.ok) return;
  const sizes: string[] = [];
  for (const v of [0.3, 0.8, 1.76, -1.2]) {
    const r = runOp(s0, { ...st.op, value: v });
    const steps = scene(r!.session).steps;
    sizes.push(`${v}: ${steps.map((x) => x.type).join(",")} | ${r!.session.message ?? ""}`);
    assert.ok(!steps.some((x) => x.type === "pushPull" && "cr" in x.params), `${v}: no prism of the whole circle\n${sizes.join("\n")}`);
  }
});
