// A cut drawn on a face of the body and pushed in opens that face (`in_419`): the tool began exactly on the face and the kernel left the face as a skin over the pocket, with a floor of the pocket on the same
// plane under it, so the top of the hole stayed shut. The tool now begins a hair behind the face, in the air.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/group-then-new-body-in_419.cad.json", import.meta.url), "utf8")) as unknown as { value: any }).value;

test("the D drawn on the slanted end of the arm and cut along the arm leaves no floor on the plane of the end: the end is open", () => {
  const s = open();
  assert.deepEqual(s.outcome.errors, {});
  const names = Object.keys(scene(s).parts);
  assert.ok(names.includes("b/body/f@-0.7071,0,0.7071,-7.7295"), "the end of the arm is still a face (the ring round the hole)");
  assert.ok(!names.some((n) => n === "b/body/f@0.7071,0,-0.7071,7.7295"), "no pocket floor on the same plane as the end");
  assert.ok(scene(s).steps.at(-1)!.params.mode === "cut");
});
