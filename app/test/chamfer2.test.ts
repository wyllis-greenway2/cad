// A chamfer with a distance along each face (`in_431`, `in_432`, `dec_chamfer_two_distances`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";

await kernel.init();
const block = () => (openSession(kernel, readFileSync(new URL("./fixtures/block-fillet-in_405.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const vol = (s: Session) => s.outcome.kernel!.volume!;
const set = (s: Session, params: Record<string, unknown>) => run(s, { type: "setStepParams", id: "s_014", params } as never);
// the block is 13.51 x 13.14 across and 17.9 high; the edge is its vertical edge at (29.7, 8.37), between the face x = 29.7 and the face y = 8.37
const H = 17.9;
const faceX = "1,0,0,29.7,29.7,15,9";
const faceY = "0,-1,0,-8.37,22,8.37,9";

test("a chamfer with distances d1 along one face and d2 along the other takes a triangle d1 x d2 / 2 off the edge, whichever face is named", () => {
  const plain = vol(set(block(), { value: 0.001 }));
  for (const [d1, d2] of [[3, 6], [6, 3], [2, 2], [4, 1.5]] as const) {
    for (const face of [faceX, faceY]) {
      const s = set(block(), { mode: "chamfer", value: d1, d2, face });
      assert.deepEqual(s.outcome.errors, {}, `${d1}, ${d2} on ${face}`);
      assert.ok(Math.abs(plain - vol(s) - (d1 * d2 / 2) * H) < 0.5, `${d1} x ${d2}: took ${plain - vol(s)}`);
    }
  }
});

test("a face that is not there, or that the edge does not lie on, is refused with the reason (no region to fall back on)", () => {
  const gone = set(block(), { mode: "chamfer", value: 3, d2: 4, face: "1,0,0,99,99,15,9" });
  assert.ok(Object.values(gone.outcome.errors).length > 0, "a face that is not there");
  const far = set(block(), { mode: "chamfer", value: 3, d2: 4, face: "0,1,0,21.51,22,21.51,9" }); // (the opposite face: the edge is not on it)
  assert.ok(Object.values(far.outcome.errors).length > 0, "an edge not on the face");
  assert.ok(/could not be made|not there|does not lie/.test(String(Object.values(far.outcome.errors)[0])), String(Object.values(far.outcome.errors)[0]));
});
