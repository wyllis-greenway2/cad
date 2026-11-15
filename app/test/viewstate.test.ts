// The cross section kept in a saved file (`in_395`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, openSession, saveText, scene } from "../src/interaction/session.ts";
import { withView, sectionOf } from "../src/interaction/viewstate.ts";

await kernel.init();

test("a saved file carries the cross section and opens the same without it; a bad one is ignored", () => {
  const s = createSession(kernel);
  const plain = saveText(s);
  assert.equal(sectionOf(plain), null);
  assert.equal(withView(plain, null), plain, "no section: the file is as it was");
  const sec = { at: [20, 10, 10] as [number, number, number], n: [1, 0, 0] as [number, number, number], mode: "rotate" as const };
  const text = withView(plain, sec);
  assert.deepEqual(sectionOf(text), sec);
  const back = openSession(kernel, text);
  assert.ok(back.ok, "the history opens with the extra key");
  if (back.ok) assert.deepEqual(Object.keys(scene(back.value).parts), Object.keys(scene(s).parts));
  assert.equal(sectionOf(JSON.stringify({ ...JSON.parse(plain), view: { section: { at: [1, 2], n: [1, 0, 0], mode: "move" } } })), null, "a section that is not three numbers is ignored");
  assert.equal(sectionOf("not json"), null);
});
