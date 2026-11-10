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
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms to open (it was 1270, and is about 350 on a quiet machine)`);
});

test("turning or moving the whole body does not change its volume, after any step of a long history (`in_252`): the sketches carried with the body are read back through the moves to where they were drawn, and the same numbers come back every time", () => {
  for (const f of ["hollow-pushed", "rotate-weird", "rotate-slow", "hollow-rotated", "two-bodies"]) {
    const r = openSession(kernel, readFileSync(new URL(`./fixtures/${f}.cad.json`, import.meta.url), "utf8"));
    assert.ok(r.ok);
    const s = r.value;
    const h = s.history;
    let checked = 0;
    for (let i = 1; i <= h.cursor; i++) {
      const [a, b] = [h.snapshots[i - 1]!, h.snapshots[i]!];
      const added = b.steps.slice(a.steps.length);
      if (b.steps.length !== a.steps.length + 1 || !added.every((st) => st.type === "move" || st.type === "rotate")) continue;
      const [va, vb] = [s.outcomeOf({ ...h, scene: a }).kernel?.volume, s.outcomeOf({ ...h, scene: b }).kernel?.volume];
      if (va == null || vb == null) continue;
      checked++;
      assert.ok(Math.abs(va - vb) < 1e-5 * va, `${f}: a ${added[0]!.type} changed the volume from ${va} to ${vb} (command ${i})`);
    }
    assert.ok(checked > 0, `${f} has moves or turns to check`);
  }
});
