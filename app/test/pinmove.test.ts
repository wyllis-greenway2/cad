// A pin that cannot be moved sideways (`in_918`): its circle is concentric with a hole's circle (a constraint), so the sketch that goes with the body is pulled back to the hole when the body is moved in the plane
// of the sketch. The move did nothing and said nothing; the check for a body whose sketch is tied only looked for a sketch stretched out of shape. It now looks for a sketch that did not arrive where it was taken.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; bbox: { min: number[]; max: number[] } }[];
const pin = (s: Session) => bodies(s).find((b) => (b.ref as string) === "b/x_s_020/o")!;
const text = readFileSync(new URL("./fixtures/pin-move-in_918.cad.json", import.meta.url), "utf8");
// (the report's history to the pin's first move, up in Z; the later sideways moves in it did nothing and said nothing)
const open = (cursor: number): Session => { const r = openSession(kernel, JSON.stringify({ ...JSON.parse(text), cursor })); assert.ok(r.ok, r.ok ? "" : r.error); return (r as { value: Session }).value; };

test("a pin whose circle is concentric with a hole's: moved sideways it is refused, the constraint named with a button to delete it; up along its axis it moves; with the constraint gone it moves sideways", () => {
  const s = open(11);
  const mv = startOp(scene(s), ["b/x_s_020/o" as never], "move");
  if (!mv.ok) return assert.fail("no move");
  const before = pin(s).bbox.min[0]!;
  const side = runOp(s, { ...mv.op, axis: 0 as const, value: -3.3 });
  assert.ok(side);
  assert.match(side!.session.message ?? "", /ties its sketch/, "refused, with the reason");
  assert.deepEqual(side!.session.conflict?.culprits, ["r_016"], "the concentric constraint is named");
  assert.ok(side!.session.conflict?.retry, "the button that deletes it and moves");
  assert.equal(scene(side!.session).steps.length, scene(s).steps.length, "no step that does nothing");
  assert.ok(Math.abs(pin(side!.session).bbox.min[0]! - before) < 1e-6);
  // the button: the constraint deleted and the move made as asked
  const freed = run(run(s, { type: "removeRelation", id: "r_016" }), side!.session.conflict!.retry!);
  assert.equal(freed.message, null);
  assert.ok(Math.abs(pin(freed).bbox.min[0]! - (before - 3.3)) < 1e-6, `${pin(freed).bbox.min[0]} against ${before - 3.3}`);
  // up along the pin's axis nothing ties it
  const up = runOp(s, { ...mv.op, axis: 2 as const, value: 5 });
  assert.equal(up!.session.message, null);
  assert.ok(Math.abs(pin(up!.session).bbox.min[2]! - (pin(s).bbox.min[2]! + 5)) < 1e-6);
});
