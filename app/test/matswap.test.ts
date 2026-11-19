// A mate that cannot move the first body moves the second instead (`in_1109`): the user's project, a pin held in an arm's hole by a Concentric.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import type { Ref } from "../src/shared/ref.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession } from "../src/interaction/session.ts";
import { drawCircle } from "../src/operation/build.ts";
import { lookup } from "../src/operation/scene.ts";
import { roundOf } from "../src/operation/part.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/pin-two-arms-jamb.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const PIN = "b/body/c@2,27.59,25.5,4.8,1.7043,4.8,11.5" as Ref; // the big gear's pin, held in an arm's hole by the Concentric r_010
const FAR_HOLE = "b/body/c@2,10.5672,58.7191,8.3,1.9482,8.3,11.5" as Ref; // the hole of another arm, elsewhere
const pick = (s: Session, sel: Ref[]) => reduce({ ...createState({ ...s, click: { ...s.click, selection: sel as never } }), cam: homeCamera() }, { type: "runAction", id: "mate:coaxial" }, env);
const centreOf = (s: Session, ref: Ref) => { const p = scene(s).parts[ref] as unknown as { center?: number[]; mesh?: number[] }; return p; };

/** a post of radius 8 whose sketch is tied to the world's origin (it cannot move), and a free post of radius 3 twenty away */
function heldAndFree() {
  let s = createSession(kernel);
  const a = drawCircle(scene(s), worldRef("XY"), [0, 0, 0], 8); s = run(s, a.command);
  s = run(s, actionsFor(scene(s), [worldRef("O"), a.centre]).find((x) => x.id === "coincident")!.run()); // (the centre on the origin: the body cannot leave it)
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [a.circle], params: { depth: 10 } } });
  const b = drawCircle(scene(s), worldRef("XY"), [20, 0, 0], 3); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: [b.circle], params: { depth: 10, mode: "new" } } });
  const get = lookup(scene(s));
  const wall = (r: number): Ref => (Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && Math.abs((roundOf(get, p.ref)?.radius ?? 0) - r) < 0.02) as { ref: Ref }).ref;
  return { s, held: wall(8), free: wall(3) };
}
const bodyBoxes = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body").map((p) => (p as unknown as { bbox: { min: number[]; max: number[] } }).bbox);

test("the first body is held where it is: the mate is made the other way round, the second body moving to the first, one step, and it says which moved", () => {
  const { s, held, free } = heldAndFree();
  const direct = run(s, actionsFor(scene(s), [held, free]).find((a) => a.id === "mate:coaxial")!.run());
  assert.ok(direct.message && direct.history === s.history, `as asked it is refused: ${direct.message}`);
  const st = pick(s, [held, free]);
  assert.equal(st.session.history.cursor, s.history.cursor + 1, "one step: one undo takes it back");
  assert.match(st.session.message ?? "", /is held where it is, so .* moved to it/);
  assert.equal(st.session.conflict, null, "not a refusal");
  assert.equal(scene(st.session).relations.filter((r) => r.kind === "mate").length, 1, "the mate stands");
  const [big, small] = bodyBoxes(st.session).sort((p, q) => (q.max[0]! - q.min[0]!) - (p.max[0]! - p.min[0]!));
  assert.ok(Math.abs((big!.min[0]! + big!.max[0]!) / 2) < 1e-6 && Math.abs((small!.min[0]! + small!.max[0]!) / 2) < 1e-6, "the free post is on the held one's axis; the held one did not move");
});

test("with the free body selected first it moves, as before, with no word of any swap", () => {
  const { s, held, free } = heldAndFree();
  const st = pick(s, [free, held]);
  assert.equal(st.session.history.cursor, s.history.cursor + 1);
  assert.ok(!/moved to it/.test(st.session.message ?? ""), st.session.message ?? "");
});

test("neither body can move: refused, with the constraint that holds the first flashing, and it says the other way round fails too; no empty step is kept", () => {
  const s = open();
  const st = pick(s, [PIN, FAR_HOLE]);
  assert.equal(st.session.history, s.history, "nothing was made");
  assert.match(st.session.message ?? "", /cannot be done either/);
  assert.ok(st.session.conflict?.victims.includes("r_010"), "the Concentric that holds the pin's body flashes");
});

test("a mate that hard bodies stop is refused with what it ran into: the hardness flashes and can be deleted, not swallowed as an empty step (`in_1109`)", () => {
  const s = open();
  const st = pick(s, [FAR_HOLE, PIN]);
  assert.equal(st.session.history, s.history, "no empty step in the history");
  assert.match(st.session.message ?? "", /hard bodies do not go into each other/);
  assert.deepEqual(st.session.conflict?.soften, ["x_s_084"]);
  assert.ok(st.session.conflict?.retry, "with the mate to make once it is soft");
});

// ---------- a mate that a sketch's constraint already makes true (`in_1111`) ----------
import { suggestionsFor } from "../src/interaction/suggest.ts";
import { impliedMate } from "../src/interaction/implied.ts";
const HOLE_HERE = "b/body/c@2,27.59,25.5,5.4,2.2869,5.4,11.5" as Ref; // the arm's hole round the pin: its circle is held concentric with the pin's rim by the sketch's r_010

test("a coaxial mate between the pin and the hole the sketch already holds round it: said, not made twice, and the sketch's Concentric flashes green", () => {
  const s = open();
  assert.deepEqual(impliedMate(scene(s), "coaxial", PIN, HOLE_HERE), ["r_010"]);
  assert.deepEqual(impliedMate(scene(s), "coaxial", HOLE_HERE, PIN), ["r_010"], "whichever is first");
  assert.deepEqual(impliedMate(scene(s), "parallelAxes", PIN, HOLE_HERE), ["r_010"], "parallel axes too: coaxial includes it");
  assert.deepEqual(impliedMate(scene(s), "tangent", PIN, HOLE_HERE), [], "tangent is not what a Concentric makes true");
  const st = pick(s, [PIN, HOLE_HERE]);
  assert.equal(st.session.history, s.history, "nothing was made, nothing to undo");
  assert.match(st.session.message ?? "", /already holds: the Concentric constraint \(it flashes green\) makes it true/);
  assert.deepEqual(st.session.already, ["r_010"]);
  assert.deepEqual(st.flash?.green, ["r_010"], "the constraint flashes green");
  assert.equal(scene(st.session).relations.filter((r) => r.kind === "mate").length, 0, "no mate was added");
});

test("the suggester does not offer what the sketch already makes true, and the pin with another hole is offered the mates as before", () => {
  const s = open();
  const here = suggestionsFor(scene(s), [PIN, HOLE_HERE])?.items.map((i) => i.id) ?? [];
  assert.ok(!here.includes("mate:coaxial") && !here.includes("mate:parallelAxes"), here.join());
  const far = suggestionsFor(scene(s), [PIN, FAR_HOLE])?.items.map((i) => i.id) ?? [];
  assert.ok(far.includes("mate:coaxial"), "not implied for another hole");
});
