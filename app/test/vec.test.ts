import test from "node:test";
import assert from "node:assert/strict";
import { sub, dot, cross, length } from "../src/math/vec.ts";

test("vector helpers (the toolchain check: TypeScript, node:test and tsc agree)", () => {
  assert.deepEqual(sub([3, 4, 5], [1, 1, 1]), [2, 3, 4]);
  assert.equal(dot([1, 2, 3], [4, 5, 6]), 32);
  assert.deepEqual(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assert.equal(length([3, 4, 0]), 5);
});
