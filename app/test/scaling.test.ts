// How the work grows with the size of the drawing and the body (`in_250`): a hundred drawn shapes, a hundred and forty-four posts. Limits are generous (about twice what it takes); they are there to
// catch a return of work that grows with the square of the size, which showed first as seconds spent opening a file.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, saveText, openSession } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";

await kernel.init();

test("a drawing of 90 rectangles (360 sides, 360 constraints) opens in a second or so, and each new shape is made in a few tens of milliseconds", () => {
  let s = createSession(kernel);
  const t0 = performance.now();
  for (let i = 0; i < 90; i++) {
    const [x, y] = [(i % 10) * 14, Math.floor(i / 10) * 14];
    s = run(s, drawSquaredRectangle(scene(s), worldRef("XY"), [x, y, 0], [x + 10, y + 8, 0], [1, 0, 0], [0, 1, 0]).command);
  }
  const build = performance.now() - t0;
  const text = saveText(s);
  const t1 = performance.now();
  const r = openSession(kernel, text);
  const open = performance.now() - t1;
  assert.ok(r.ok);
  assert.equal(scene(r.value).relations.length, 360);
  assert.ok(build / 90 < 40, `${(build / 90).toFixed(1)} ms a shape (it was 21 ms and rising with the number of shapes)`);
  assert.ok(open < 1100, `${open.toFixed(0)} ms to open (it was 1760)`);
});

test("a body of 144 posts (864 faces, 1728 edges) is made and opened in well under a second", () => {
  const text = readFileSync(new URL("./fixtures/grid-12x12.cad.json", import.meta.url), "utf8");
  const t = performance.now();
  const r = openSession(kernel, text);
  const ms = performance.now() - t;
  assert.ok(r.ok);
  assert.equal(r.value.outcome.kernel!.faces!.length, 864);
  assert.equal(r.value.outcome.kernel!.edges!.length, 1728);
  assert.ok(ms < 900, `${ms.toFixed(0)} ms to open (it was 1270)`);
});
