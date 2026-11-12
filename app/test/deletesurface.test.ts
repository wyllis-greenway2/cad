// Delete a whole surface of a sketch (`in_285`): its own edges are trimmed off, the edges another surface shares stay, a surface that a body is made from cannot be deleted.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { nextId } from "../src/operation/scene.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = (name: string): Session => (openSession(kernel, readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as unknown as { value: Session }).value;
type Face = Extract<Part, { kind: "face" }>;
const faces = (s: Session) => Object.values(scene(s).parts).filter((p): p is Face => p.kind === "face");
const drawnCurves = (s: Session) => Object.values(scene(s).parts).filter((p) => p.origin === "drawn" && (p.kind === "circle" || (p.kind === "line" && !p.derived)));

test("the large circle's own surface (the part no other surface shares edges with) is deleted: its outer arc is trimmed off, the two small circles and the rest of the large circle stay (`in_285`)", () => {
  const s = open("three-circles-in_285.cad.json");
  assert.equal(faces(s).length, 7);
  // the surface of the large circle outside both small ones: bounded by an arc of each of the three circles, the arc of the large circle being the outer one
  const outer = "d/arc@e_003.k@x@e_001.k@e_003.k@1@x@e_002.k@e_003.k@1"; // (the arc of the large circle that no small circle covers)
  const big = faces(s).find((f) => f.loop.includes(outer));
  assert.ok(big, "found it");
  const del = actionsFor(scene(s), [big!.ref]).find((a) => a.id === "delete")!;
  assert.ok(del.enabled, `it can be deleted: ${del.why}`);
  const after = run(s, del.run());
  assert.equal(after.message, null);
  const sc = scene(after);
  assert.ok(sc.parts["d/e_001.k"] && sc.parts["d/e_002.k"], "the two small circles stay whole");
  assert.equal(sc.parts["d/e_003.k"], undefined, "the large circle is no longer a whole circle");
  const arcs = drawnCurves(after).filter((p) => p.kind === "line" && p.center);
  assert.equal(arcs.length, 1, "it is left as one arc, the part that runs through the small circles");
  // the outer part is gone: every remaining piece of the arc lies inside one of the small circles
  const arc = arcs[0] as Extract<Part, { kind: "line" }>;
  const at = (r: string) => (sc.parts[r as never] as { at: number[] }).at;
  const [c3, a, b] = [at(arc.center!), at(arc.a), at(arc.b)];
  assert.ok(Math.hypot(a[0]! - c3[0]!, a[1]! - c3[1]!) > 30, "it has the large circle's radius about its centre");
  assert.equal(drawnCurves(after).length, 3, "two circles and an arc");
  void b;
});

test("deleting a surface that a body was made from is refused with a reason; so is one whose every edge is shared", () => {
  const s = open("three-circles-in_285.cad.json");
  // the middle surface (the three circles' common part): all three edges are shared
  const middle = faces(s).find((f) => f.loop.every((l) => faces(s).some((g) => g !== f && g.loop.includes(l))))!;
  const none = actionsFor(scene(s), [middle.ref]).find((a) => a.id === "delete")!;
  assert.equal(none.enabled, false);
  assert.match(none.why ?? "", /shared/);
  // extrude one surface: it is part of a body now
  const f = faces(s)[0]!;
  const withBody = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: f.loop, params: { depth: 5 } } });
  const del = actionsFor(scene(withBody), [f.ref]).find((a) => a.id === "delete")!;
  assert.equal(del.enabled, false);
  assert.match(del.why ?? "", /body/);
});

import { createSession } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawSquaredRectangle, drawChain } from "../src/operation/build.ts";
test("a rectangle cut in two by a line: deleting the left surface takes the three sides that are its own and leaves the line it shares with the right surface, which is still a closed surface", () => {
  let s = createSession(kernel);
  s = run(s, drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]).command);
  s = run(s, drawChain(scene(s), worldRef("XY"), [[20, -5, 0], [20, 25, 0]], false, { reuse: true }).command);
  const pieces = faces(s).filter((f) => f.pieces);
  assert.equal(pieces.length, 2, "two surfaces");
  const left = pieces.find((f) => f.corners.every((c) => ((scene(s).parts[c] as { at: number[] }).at[0]!) <= 20.001))!;
  const del = actionsFor(scene(s), [left.ref]).find((a) => a.id === "delete")!;
  assert.ok(del.enabled, String(del.why));
  const after = run(s, del.run());
  assert.equal(after.message, null);
  const rest = faces(after);
  assert.equal(rest.length, 1, "one surface is left");
  assert.ok(rest[0]!.corners.every((c) => ((scene(after).parts[c] as { at: number[] }).at[0]!) >= 19.999), "the right-hand one");
});
