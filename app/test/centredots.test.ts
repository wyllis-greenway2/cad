// The middle dots of circles and arcs not used up (`in_318`). They are drawn in the `marks` group (`ui/view/highlight.ts`), not in the overlay: a body dragged on the graphics card moves the overlay (its highlight)
// by the body's matrix, and the dot of another body's sketch (the circle at the bottom of a part with a hole) went with a cylinder that was turned in preview. This is the pure part: which dots there are.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { centreDots } from "../src/interaction/centredots.ts";

await kernel.init();

test("the circle at the bottom of the part with the hole has its dot; the circles used up by extrusions have none", () => {
  const s = (openSession(kernel, readFileSync(new URL("./fixtures/hole-body-move-in_317.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
  const dots = centreDots(scene(s));
  assert.equal(dots.length, 1);
  assert.deepEqual(dots[0], [33.21, 29.11, 0]);
});
