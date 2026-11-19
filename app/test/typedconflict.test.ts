// A number typed on a dimension that something else already fixes follows the one rule (`inv_constraint_uniformity`, `in_1161`): it is refused, the constraints in the way flash and can be deleted.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const XY = "w/XY" as never;
type L = { ref: string; a: string; b: string };

function rectangle() {
  let s: Session = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const lines = Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "drawn") as unknown as L[];
  const at = (id: string) => (scene(s).parts[id as never] as unknown as { at: Vec3 }).at;
  const side = (y: number) => lines.find((l) => at(l.a)[1] === y && at(l.b)[1] === y)!;
  const length = (st: Session, l: L, n: number) => run(st, actionsFor(scene(st), [l.ref as never]).find((x) => x.id === "length")!.run(n));
  return { s, bottom: side(0), top: side(20), length };
}

test("a second length typed on a side that already has one is refused: the first flashes and can be deleted", () => {
  const { s, bottom, length } = rectangle();
  const first = length(s, bottom, 40);
  assert.equal(first.message, null);
  const again = length(first, bottom, 50);
  assert.match(again.message ?? "", /cannot be done without breaking other constraints: the Length constraint \(it flashes\) holds what it would move/);
  assert.ok(again.conflict && again.conflict.culprits.length > 0 && again.conflict.retry, "named, and a button can delete it and go on");
  assert.equal(scene(again).relations.length, scene(first).relations.length, "nothing was added");
});

test("a number typed over a length whose opposite side is fixed at another is refused the same way, naming all that hold it", () => {
  const { s, bottom, top, length } = rectangle();
  let st = length(s, bottom, 40);
  st = length(st, top, 40);
  const dim = scene(st).relations.find((x) => x.kind === "length" && x.id === scene(st).relations.filter((y) => y.kind === "length")[0]!.id)!;
  const big = run(st, { type: "setRelationValue", id: dim.id, value: 60 });
  assert.match(big.message ?? "", /cannot be done without breaking other constraints: .* hold what it would move/);
  assert.ok(big.conflict!.victims.length >= 2 && big.conflict!.retry, "the holding constraints flash and can be deleted");
});
