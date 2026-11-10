// How the work grows with the size of the drawing and the body (`in_250`): a hundred drawn shapes, a hundred and forty-four posts. A check is about how the time grows from a small size to a bigger one, both
// measured here and now (so that a busy machine slows both alike), because that is what a return of work that grows with the square of the size would change: it showed first as seconds spent opening a file.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, saveText, openSession } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";

await kernel.init();
/** The shortest of a few runs of `f`, in milliseconds. */
const best = (f: () => void, runs = 3): number => { let m = Infinity; for (let i = 0; i < runs; i++) { const t = performance.now(); f(); m = Math.min(m, performance.now() - t); } return m; };

/** The saved text of a drawing of n rectangles (the whole opening of it is every command solved and derived again). */
function rectangles(n: number): string {
  let s = createSession(kernel);
  for (let i = 0; i < n; i++) {
    const [x, y] = [(i % 10) * 14, Math.floor(i / 10) * 14];
    s = run(s, drawSquaredRectangle(scene(s), worldRef("XY"), [x, y, 0], [x + 10, y + 8, 0], [1, 0, 0], [0, 1, 0]).command);
  }
  return saveText(s);
}

test("opening a drawing of 90 rectangles takes about ten times what 30 take (each command is derived again: the square of the size), not twenty-five (the cube, which it was before `in_250`)", () => {
  const [small, big] = [rectangles(30), rectangles(90)];
  const opened = openSession(kernel, big);
  assert.ok(opened.ok);
  assert.equal(scene(opened.value).relations.length, 360);
  const [a, b] = [best(() => openSession(kernel, small)), best(() => openSession(kernel, big))];
  assert.ok(b / a < 15, `${a.toFixed(0)} ms for 30 and ${b.toFixed(0)} ms for 90: ${(b / a).toFixed(1)} times`);
});

test("a body of 144 posts (864 faces, 1728 edges) takes about seven times what 16 posts take to make and open, not twenty-five (the kernel listed its edges in time that grew with the square, `in_250`)", () => {
  const [small, big] = ["grid-4x4", "grid-12x12"].map((f) => readFileSync(new URL(`./fixtures/${f}.cad.json`, import.meta.url), "utf8"));
  const opened = openSession(kernel, big!);
  assert.ok(opened.ok);
  assert.equal(opened.value.outcome.kernel!.faces!.length, 864);
  assert.equal(opened.value.outcome.kernel!.edges!.length, 1728);
  const [a, b] = [best(() => openSession(kernel, small!)), best(() => openSession(kernel, big!), 2)];
  assert.ok(b / a < 14, `${a.toFixed(0)} ms for 16 and ${b.toFixed(0)} ms for 144: ${(b / a).toFixed(1)} times`);
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
