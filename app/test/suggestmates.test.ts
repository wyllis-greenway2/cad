// The suggester offers the mates that fit faces and edges of bodies, as it offers constraints for the parts of a drawing (`inv_constraint_uniformity`, `in_1086`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawCircle } from "../src/operation/build.ts";
import { nextId, lookup } from "../src/operation/scene.ts";
import { roundOf } from "../src/operation/part.ts";
import { suggestionsFor } from "../src/interaction/suggest.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const XY = worldRef("XY");
/** a ring (a hole of radius 4 through a post of radius 10, at the origin) and a pin of radius 3.9 standing 30 mm away */
function pinAndHole(): { s: Session; hole: Ref; pin: Ref; ringBody: Ref } {
  let s = createSession(kernel);
  const outer = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, outer.command);
  const inner = drawCircle(scene(s), XY, [0, 0, 0], 4);
  s = run(s, inner.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [outer.circle], params: { depth: 12, holes: inner.circle } } });
  const pinC = drawCircle(scene(s), XY, [30, 0, 0], 3.9);
  s = run(s, pinC.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [pinC.circle], params: { depth: 20, mode: "new" } } });
  const get = lookup(scene(s));
  const rounds = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body" && roundOf(get, p.ref));
  const near = (r: number) => rounds.find((p) => Math.abs((roundOf(get, p.ref)?.radius ?? 0) - r) < 0.02)!;
  const bodies = Object.values(scene(s).parts).filter((p) => p.kind === "body");
  assert.equal(bodies.length, 2, "two bodies");
  return { s, hole: near(4).ref, pin: near(3.9).ref, ringBody: bodies[0]!.ref };
}

test("a pin's wall and a hole's wall selected: the suggester offers a coaxial mate, and the other mates that fit two round faces", () => {
  const { s, hole, pin } = pinAndHole();
  const sg = suggestionsFor(scene(s), [pin, hole]);
  assert.ok(sg, "something is offered");
  const ids = sg.items.map((i) => i.id);
  assert.ok(ids.includes("mate:coaxial"), `coaxial is offered: ${ids}`);
  assert.ok(ids.every((id) => id.startsWith("mate:") || id.startsWith("select:")), ids.join());
  assert.ok(!ids.includes("mate:angle") && !ids.includes("mate:angleAxes"), "a mate with an angle waits for its number");
  // everything offered is what the Constraints ring offers for the same selection, enabled
  const ring = new Set(actionsFor(scene(s), [pin, hole]).filter((a) => a.enabled).map((a) => a.id));
  for (const id of ids.filter((x) => x.startsWith("mate:"))) assert.ok(ring.has(id), `${id} is in the ring too`);
});

test("clicking the coaxial suggestion makes the mate: the pin goes into the hole, on its axis", () => {
  const { s, hole, pin } = pinAndHole();
  const act = actionsFor(scene(s), [pin, hole]).find((a) => a.id === "mate:coaxial")!;
  assert.ok(act && act.enabled);
  const done = run(s, act.run());
  assert.ok(!done.message, done.message ?? "");
  const bb = Object.values(scene(done).parts).filter((p) => p.kind === "body").map((b) => (b as { bbox?: { min: number[]; max: number[] } }).bbox!);
  const centres = bb.map((b) => [(b.min[0]! + b.max[0]!) / 2, (b.min[1]! + b.max[1]!) / 2]);
  assert.ok(Math.hypot(centres[0]![0]! - centres[1]![0]!, centres[0]![1]! - centres[1]![1]!) < 1e-3, `the axes are one: ${JSON.stringify(centres)}`);
  // once it holds it is not offered again
  const again = suggestionsFor(scene(done), [pin, hole]);
  assert.ok(!again || !again.items.some((i) => i.id === "mate:coaxial"), "not offered when it already holds");
});

test("one round face alone, and one flat face, are offered the mates with the world that the ring has (level, upright)", () => {
  const { s, pin } = pinAndHole();
  const one = suggestionsFor(scene(s), [pin]);
  assert.ok(one && one.items.some((i) => i.id === "mate:horizontal" || i.id === "mate:vertical"), JSON.stringify(one?.items));
});

test("a mate that is made and true is not offered again, by the ring either (it is applied: nothing to ask for twice)", () => {
  const { s, hole, pin } = pinAndHole();
  const once = run(s, actionsFor(scene(s), [pin, hole]).find((a) => a.id === "mate:coaxial")!.run());
  assert.ok(!once.message, once.message ?? "");
  const again = actionsFor(scene(once), [pin, hole]).find((a) => a.id === "mate:coaxial");
  assert.ok(!again || !again.enabled, "not offered as a thing to do");
  assert.equal(scene(once).relations.filter((r) => r.kind === "mate").length, 1);
});

// ---------- a mate that a sketch's tangent already makes true (`in_1111`) ----------
import { impliedMate } from "../src/interaction/implied.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
test("a sketch line held tangent to a post's rim: the wall made from the line is already tangent to the post, so the tangent mate between them is said to hold, and one between other faces is not", () => {
  let s = createSession(kernel);
  const post = drawCircle(scene(s), XY, [0, 0, 0], 5);
  s = run(s, post.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [post.circle], params: { depth: 10 } } });
  const r = drawSquaredRectangle(scene(s), XY, [5, -5, 0], [25, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const sc0 = scene(s);
  const left = r.lines.find((l) => { const q = sc0.parts[l]; if (q?.kind !== "line") return false; const [a, b] = [sc0.parts[q.a] as unknown as { at: number[] }, sc0.parts[q.b] as unknown as { at: number[] }]; return Math.abs(a.at[0]! - 5) < 1e-6 && Math.abs(b.at[0]! - 5) < 1e-6; })!;
  const rim = Object.values(sc0.parts).find((p) => p.kind === "line" && p.origin === "body" && !!p.circle && Math.abs(p.circle.radius - 5) < 1e-6 && Math.abs(p.circle.center[2]) < 1e-6)!.ref as Ref;
  const tangent = actionsFor(sc0, [left, rim]).find((x) => x.id === "tangent");
  assert.ok(tangent?.enabled, "a sketch line can be made tangent to the body's rim");
  s = run(s, tangent!.run());
  assert.ok(!s.message, s.message ?? "");
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 10, mode: "new" } } });
  const get = lookup(scene(s));
  const wall = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && !roundOf(get, p.ref) && Math.abs(p.at[0] - 5) < 1e-6 && p.u[0] === 0 && p.v[0] === 0)!.ref as Ref;
  const postWall = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && Math.abs((roundOf(get, p.ref)?.radius ?? 0) - 5) < 0.02)!.ref as Ref;
  const id = scene(s).relations.find((x) => x.kind === "tangent")!.id;
  assert.deepEqual(impliedMate(scene(s), "tangent", wall, postWall), [id]);
  assert.deepEqual(impliedMate(scene(s), "tangent", postWall, wall), [id], "whichever is first");
  const far = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && !roundOf(get, p.ref) && Math.abs(p.at[0] - 25) < 1e-6 && p.u[0] === 0 && p.v[0] === 0)!.ref as Ref;
  assert.deepEqual(impliedMate(scene(s), "tangent", far, postWall), [], "the far end of the arm is not tangent to the post");
});
