// Moving one body after a combine moves that body (`in_298`): the overlap kept next to the rest stands inside the box of the larger body, and the larger one used to be taken for it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body");

test("the smaller body of a combine is the one that moves, and the larger stays (`in_298`)", () => {
  const s = (openSession(kernel, readFileSync(new URL("./fixtures/combine-move-in_298.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
  const small = bodies(s).reduce((a, b) => ((a.volume ?? 0) < (b.volume ?? 0) ? a : b));
  const big = bodies(s).find((b) => b !== small)!;
  const [smallZ, bigZ] = [small.bbox!.min[2], big.bbox!.min[2]];
  const moved = run(s, { type: "addStep", step: { id: "s_007", type: "move", parts: [small.ref], params: { axis: 2, value: -4.7, follow: 1, body: small.id } } } as never);
  assert.ok(!moved.message);
  const after = bodies(moved);
  const smallAfter = after.reduce((a, b) => ((a.volume ?? 0) < (b.volume ?? 0) ? a : b));
  const bigAfter = after.find((b) => b !== smallAfter)!;
  assert.ok(Math.abs(smallAfter.bbox!.min[2] - (smallZ - 4.7)) < 1e-3, "the smaller one moved");
  assert.ok(Math.abs(bigAfter.bbox!.min[2] - bigZ) < 1e-3, "the larger one stayed");
});
