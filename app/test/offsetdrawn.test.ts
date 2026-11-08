// Inset of a drawn figure with arcs, and of what is picked of it (`in_232`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { pointOf } from "../src/operation/part.ts";
import type { Part } from "../src/operation/part.ts";
import { dist } from "../src/math/vec.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/inset-sketch.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;

function figure(s: Session) {
  const sc = scene(s);
  const face = Object.values(sc.parts).find((p): p is Extract<Part, { kind: "face" }> => p.kind === "face" && p.origin === "drawn" && !p.disk && p.loop.length > 2)!;
  assert.ok(face, "the closed figure");
  return { sc, face };
}
const drawnLines = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !p.derived);

test("the face of a figure with arcs can be inset, alone or picked with its sides and corners, in and out", () => {
  const s = open();
  const { sc, face } = figure(s);
  for (const picked of [[face.ref], [face.ref, ...face.loop, ...face.corners]]) {
    const op = startOp(sc, picked, "offset");
    assert.ok(op.ok, `${picked.length} parts: ${op.ok ? "" : op.why}`);
    for (const v of [-2, 1.5]) {
      const made = runOp(s, { ...op.op, value: v });
      assert.ok(made, "a step");
      assert.equal(made!.session.message, null, `${v}: made`);
      const after = drawnLines(made!.session);
      assert.equal(after.length, drawnLines(s).length * 2, `${v}: a copy with as many sides and arcs as the figure`);
    }
  }
});

test("the inset keeps the figure's shape: every new side is the old one moved by the distance (arcs about the same centre, their radius changed by it)", () => {
  const s = open();
  const { sc, face } = figure(s);
  const op = startOp(sc, [face.ref], "offset");
  assert.ok(op.ok);
  const made = runOp(s, { ...op.op, value: -1 })!.session;
  const after = scene(made);
  const old = drawnLines(s);
  const fresh = drawnLines(made).filter((l) => !old.some((o) => o.ref === l.ref));
  assert.equal(fresh.filter((l) => l.kind === "line" && l.center).length, old.filter((l) => l.kind === "line" && l.center).length, "as many arcs");
  for (const l of fresh) {
    if (l.kind !== "line" || !l.center) continue;
    const [c, a] = [pointOf((r) => after.parts[r], l.center!)!, pointOf((r) => after.parts[r], l.a)!];
    const same = old.filter((o) => o.kind === "line" && o.center).map((o) => { const oc = pointOf((r) => scene(s).parts[r], (o as unknown as { center: never }).center)!; return dist(oc, c); });
    assert.ok(same.some((d) => d < 1e-6), "about the same centre as one of the arcs it came from");
    assert.ok(dist(c, a) > 0.5, "with a radius");
  }
});

test("a chain of sides (lines and arcs) picked without the face can be inset too; a single arc as well", () => {
  const s = open();
  const sc = scene(s);
  const lines = drawnLines(s).filter((l) => l.kind === "line");
  const chain = [lines[0]!, ...lines.filter((l) => l.kind === "line" && (l.a === lines[0]!.b || l.b === lines[0]!.b || l.a === lines[0]!.a || l.b === lines[0]!.a)).slice(0, 1)].filter((l, i, a) => a.indexOf(l) === i);
  const op = startOp(sc, chain.map((l) => l.ref), "offset");
  assert.ok(op.ok, op.ok ? "" : op.why);
  const made = runOp(s, { ...op.op, value: 1 });
  assert.ok(made && made.session.message === null, "made");
  const arc = lines.find((l) => l.kind === "line" && l.center)!;
  const one = startOp(sc, [arc.ref], "offset");
  assert.ok(one.ok, one.ok ? "" : one.why);
  assert.ok(runOp(s, { ...one.op, value: 1 }));
  run(s, { type: "batch", commands: [] });
});
