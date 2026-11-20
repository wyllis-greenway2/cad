// Regions that touch along a side are cut or pushed as one (`in_1306`): a ring drawn on a wall with a line across it is two half rings; selected together they are one figure (the ring), so the cut is one prism. The second half used to be refused
// ("kernel returned an invalid solid"): it had to meet the faces the first one left. The model is the user's (`ring-through.cad.json`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = (): Session => (openSession(kernel, readFileSync(new URL("./fixtures/ring-through.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const volumes = (s: Session) => Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body").map((b) => Math.round(b.volume ?? 0));
const faces = (s: Session) => Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "face" }> => p.kind === "face" && p.plane === "d/p_106");

test("the two halves of the ring are one figure: one step, cut through the wall, the disc inside it left as a body of its own", () => {
  const s = open();
  const ring = faces(s).filter((f) => f.loop.length === 4 && f.loop.some((l) => l.includes("e_115")));
  assert.equal(ring.length, 2, "the two halves");
  const st = startOp(scene(s), ring.map((f) => f.ref), "extrude");
  assert.ok(st.ok, st.ok ? "" : st.why);
  const op = (st as { op: Op }).op;
  assert.ok(!op.figs?.also, "one figure: the ring (no sibling)");
  assert.ok((op.figs?.holes ?? "").length > 0, "with the inner circle as its hole");
  const steps = scene(s).steps.length;
  const out = runOp(s, { ...op, value: -15 })!;
  assert.equal(out.session.message, null);
  assert.deepEqual(out.session.outcome.errors, {});
  assert.equal(scene(out.session).steps.length, steps + 1, "one step");
  assert.equal(scene(out.session).steps.at(-1)!.params.mode, "cut");
  assert.deepEqual(volumes(out.session).sort((a, b) => b - a).length, 2, "the wall and the disc");
  assert.ok(volumes(out.session)[0]! < 6899, `the wall lost the ring: ${volumes(out.session)}`);
});

test("a single half of the ring is as it was: one figure of its own", () => {
  const s = open();
  const half = faces(s).filter((f) => f.loop.length === 4 && f.loop.some((l) => l.includes("e_115")))[0]!;
  const op = (startOp(scene(s), [half.ref], "extrude") as { op: Op }).op;
  assert.deepEqual(op.parts, half.loop);
});
