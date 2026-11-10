// Ctrl (or Cmd) held with a click does what Shift does, and with a held rectangle it takes out (`in_257`).
import test from "node:test";
import assert from "node:assert/strict";
import { createMouse } from "../src/interaction/input/mouse.ts";

test("a Ctrl click is an adding click, a Shift click too, and a Ctrl hold is a removing one", () => {
  const m = createMouse(() => 1, () => false);
  const press = (mods: { shift: boolean; ctrl: boolean; alt: boolean }) => m({ kind: "down", x: 10, y: 10, t: 0, button: 0, mods } as never);
  press({ shift: false, ctrl: true, alt: false });
  assert.deepEqual(m({ kind: "up", x: 10, y: 10, t: 50, button: 0, mods: { shift: false, ctrl: true, alt: false } } as never).map((i) => i.type === "click" && i.shift), [true]);
  press({ shift: true, ctrl: false, alt: false });
  assert.deepEqual(m({ kind: "up", x: 10, y: 10, t: 60, button: 0, mods: { shift: true, ctrl: false, alt: false } } as never).map((i) => i.type === "click" && i.shift), [true]);
  press({ shift: false, ctrl: false, alt: false });
  assert.deepEqual(m({ kind: "up", x: 10, y: 10, t: 5000, button: 0, mods: { shift: false, ctrl: false, alt: false } } as never).map((i) => i.type === "click" && i.shift), [false]);
  press({ shift: false, ctrl: true, alt: false });
  assert.deepEqual(m.tick(100000), [{ type: "hold", x: 10, y: 10, shift: false, remove: true }]);
});
