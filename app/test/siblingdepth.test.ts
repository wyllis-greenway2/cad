// Two blocks extruded together are one step, but pulling the top of one changes only that block (`in_320`): each figure of the step can have a depth of its own (`alsoDepth`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run, undoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
type Body = Extract<Part, { kind: "body" }>;
const open = () => undoLast((openSession(kernel, readFileSync(new URL("./fixtures/two-blocks-in_319.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value);
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Body => p.kind === "body");
const topOf = (s: Session, body: string) => Object.values(scene(s).parts).find((p) => p.origin === "body" && p.kind === "plane" && p.of === `b/${body}/o` && /^b\/body\/f@0,0,1,/.test(p.ref))!; // (the face looking up: the top)

test("pulling the top of one of two blocks made together changes only that block", () => {
  const s = open();
  assert.deepEqual(bodies(s).map((b) => b.bbox!.max[2]), [12.4, 12.4]);
  const sc = scene(s);
  const st = startOp(sc, [topOf(s, "x_s_025").ref], "pushpull");
  assert.ok(st.ok);
  const pulled = run(s, opCommand(sc, { ...st.op, value: 3.7 })!);
  assert.deepEqual(pulled.outcome.errors, {});
  const [a, b] = bodies(pulled).sort((p, q) => p.bbox!.min[0] - q.bbox!.min[0]);
  assert.ok(Math.abs(a!.bbox!.max[2] - 16.1) < 1e-6, "the block pulled is taller");
  assert.ok(Math.abs(b!.bbox!.max[2] - 12.4) < 1e-6, "the other stays");
  // the other block can then be pulled on its own too, and the first keeps its height
  const sc2 = scene(pulled);
  const top2 = topOf(pulled, "x_s_025.1");
  const st2 = startOp(sc2, [top2.ref], "pushpull");
  assert.ok(st2.ok);
  const both = run(pulled, opCommand(sc2, { ...st2.op, value: -2 })!);
  const [a2, b2] = bodies(both).sort((p, q) => p.bbox!.min[0] - q.bbox!.min[0]);
  assert.ok(Math.abs(a2!.bbox!.max[2] - 16.1) < 1e-6 && Math.abs(b2!.bbox!.max[2] - 10.4) < 1e-6, "each has its own height");
});
