// A fillet or chamfer of an edge that the kernel cannot round alone is made together with the edges that meet it at a corner, and says so (`in_348`). The top outline of a tilted round cut is such an edge: refused alone
// at every size, made when the edge that meets it at its end is rounded with it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run, saveText } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/tilted-cut-edges-in_341.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
type Line = Extract<Part, { kind: "line" }>;
const curved = (s: Session): Line[] => (Object.values(scene(s).parts) as Part[]).filter((p): p is Line => p.kind === "line" && p.origin === "body" && !!p.path);
const round = (s: Session, ref: string, value: number) => {
  const st = startOp(scene(s), [ref as never], "edge");
  assert.ok(st.ok);
  return runOp(s, { ...st.op, value })!.session;
};

for (const value of [0.2, -0.2, 0.6, -0.6]) {
  test(`the edge that the kernel cannot round alone is made with its neighbour at ${value}, and the answer says so`, () => {
    const s = open();
    const [, top] = curved(s);
    const done = round(s, top!.ref, value);
    assert.deepEqual(done.outcome.errors, {}, "made");
    assert.equal(scene(done).steps.at(-1)!.type, "edgeMod");
    assert.match(done.message ?? "", /together with the edge that meets it at a corner/);
    assert.match(done.message ?? "", value > 0 ? /fillet/ : /chamfer/);
  });
}

test("an edge that is rounded alone is not said to be made with another", () => {
  const s = open();
  const done = round(s, curved(s)[0]!.ref, -0.4);
  assert.deepEqual(done.outcome.errors, {});
  assert.equal(done.message, null);
});

test("the step records that it was made with the edges at its corner, so the file opens to the same body, and other steps never do it unasked", () => {
  const s = open();
  const [, top] = curved(s);
  const done = round(s, top!.ref, -0.3);
  const step = scene(done).steps.at(-1)!;
  assert.equal(step.params.corner, 1);
  const again = openSession(kernel, saveText(done));
  assert.ok(again.ok);
  assert.deepEqual((again as unknown as { value: Session }).value.outcome.errors, {});
  // a step made without it is refused, as the kernel says: nothing makes it round another edge unasked
  const st = startOp(scene(s), [top!.ref as never], "edge");
  assert.ok(st.ok);
  const plain = run(s, opCommand(scene(s), { ...st.op, value: -0.3 })!);
  assert.equal(scene(plain).steps.length, scene(s).steps.length, "refused");
  assert.match(plain.message ?? "", /cannot be made/);
});

test("while the size is set the picture shows what it would be made with, and says so", () => {
  const s = open();
  const [, top] = curved(s);
  const st = startOp(scene(s), [top!.ref], "edge");
  assert.ok(st.ok);
  const state = reduce({ ...createState({ ...s, click: { ...s.click, selection: [top!.ref] as never } }) }, { type: "begin", name: "edge" }, { w: 800, h: 600, now: 0 } as never);
  const f = frameOf({ ...state, op: { ...state.op!, value: -0.3 } }, { w: 800, h: 600 });
  assert.match(f.message, /together with the edge that meets it at a corner/);
  assert.ok(f.mesh, "a body is shown");
});
