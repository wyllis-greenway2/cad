// Game mode's menu (`in_467`): the wheel opens it and goes round it, and while it is open the view is fixed and the mouse turns its selection.
import test from "node:test";
import assert from "node:assert/strict";
import { createRecognizer } from "../src/interaction/recognizer.ts";
import type { RawInput, Intent } from "../src/shared/input.ts";

const mods = { shift: false, ctrl: false, alt: false };
const key = (k: string, down: boolean, t: number): RawInput => ({ kind: "key", key: k, down, mods, t });
const wheel = (dy: number, t: number): RawInput => ({ kind: "wheel", x: 100, y: 100, dx: 0, dy, unit: 0, wheelDeltaY: -dy, mods, t } as unknown as RawInput);
const move = (dx: number, dy: number, t: number): RawInput => ({ kind: "move", device: "mouse", id: 1, x: 400, y: 300, dx, dy, button: 0, mods, t } as unknown as RawInput);
const ticks = (from: number, n: number): RawInput[] => Array.from({ length: n }, (_, i) => ({ kind: "tick", t: from + (i + 1) * 16 }) as RawInput);
const run = (rec: ReturnType<typeof createRecognizer>, xs: RawInput[]): Intent[] => xs.flatMap((e) => rec.feed(e));
const enter = (rec: ReturnType<typeof createRecognizer>): void => { run(rec, [key(" ", true, 0), key(" ", false, 1)]); };

test("in game mode a notch of the wheel is a step of the menu, not a zoom; out of it the wheel zooms", () => {
  const rec = createRecognizer();
  assert.ok(run(rec, [wheel(120, 5)]).some((i) => i.type === "zoom"), "outside game mode: zoom");
  enter(rec);
  const is = run(rec, [wheel(120, 10), wheel(-120, 20)]);
  assert.deepEqual(is.filter((i) => i.type === "menuStep").map((i) => (i as { dir: number }).dir), [1, -1]);
  assert.ok(!is.some((i) => i.type === "zoom"));
});

test("with the menu open the mouse turns the menu's selection and does not swivel the view, and the keys do not walk it", () => {
  const rec = createRecognizer();
  enter(rec);
  rec.setMenu(true);
  const is = run(rec, [key("w", true, 30), move(12, 3, 31), ...ticks(31, 20)]);
  assert.ok(is.some((i) => i.type === "menuTurn"), "the mouse turns the menu");
  assert.ok(!is.some((i) => i.type === "swivel" || i.type === "walk"), "the view is fixed");
  rec.setMenu(false);
  const after = run(rec, [move(30, 0, 500), ...ticks(500, 20)]);
  assert.ok(after.some((i) => i.type === "swivel"), "with the menu shut the mouse turns the view again");
});
