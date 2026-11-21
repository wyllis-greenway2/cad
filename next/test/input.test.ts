import { test } from "node:test";
import assert from "node:assert/strict";
import { actionOf, classifyWheel, wheelKind } from "../src/input.ts";

test("[C2 C5] which button and key does what", () => {
  const no = { shift: false, alt: false };
  assert.equal(actionOf(0, no, false), "click");
  assert.equal(actionOf(2, no, false), "orbit");
  assert.equal(actionOf(0, { shift: false, alt: true }, false), "orbit");
  assert.equal(actionOf(1, no, false), "pan");
  assert.equal(actionOf(2, { shift: true, alt: false }, false), "pan");
  assert.equal(actionOf(0, no, true), "pan");
  assert.equal(actionOf(0, { shift: true, alt: true }, false), "pan");
});

test("[C6] a wheel event is a pinch, a notch or a scroll", () => {
  assert.equal(wheelKind({ ctrlKey: true, deltaMode: 0, deltaX: 0, deltaY: 3 }), "pinch");
  assert.equal(wheelKind({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY: 100 }), "wheel");
  assert.equal(wheelKind({ ctrlKey: false, deltaMode: 1, deltaX: 0, deltaY: 3 }), "wheel");
  assert.equal(wheelKind({ ctrlKey: false, deltaMode: 0, deltaX: 4, deltaY: 12.5 }), "scroll");
});

test("[C6] a gesture keeps its kind while its events keep coming: a whole 120 in a trackpad's flick is not a notch", () => {
  const ev = (deltaY: number) => ({ ctrlKey: false, deltaMode: 0, deltaX: 0, deltaY });
  let s = classifyWheel(ev(4.5), 0, null);
  assert.equal(s.kind, "scroll");
  s = classifyWheel(ev(120), 16, s); assert.equal(s.kind, "scroll", "the tail of a flick");
  s = classifyWheel(ev(120), 400, s); assert.equal(s.kind, "wheel", "a lone notch after a pause");
  s = classifyWheel(ev(100), 416, s); assert.equal(s.kind, "wheel", "a wheel spun fast stays a wheel");
  s = classifyWheel({ ...ev(3), ctrlKey: true }, 420, s); assert.equal(s.kind, "pinch");
});
