// A refusal always says which constraints stand in the way (`in_1045`): a mate that moves a body whose sketch is held by constraints to edges of a body that is gone used to say "cannot be done without breaking other
// constraints" and name none, so nothing flashed and nothing could be deleted. And two circular edges of two bodies (a hole's rim and a pin) are offered the mates their round faces are.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/hole-pin-coaxial.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const PIN = "b/body/c@2,27.59,25.5,4.8,1.7043,4.8,11.5" as Ref;
const HOLE_FAR = "b/body/c@2,10.5672,58.7192,8.3,1.9482,8.3,11.5" as Ref;
const PIN_RIM = "b/body/e@29.2943,25.5,11.5~29.2943,25.5,11.5~25.8857,25.5,11.5" as Ref;
const HOLE_RIM = "b/body/e@29.8769,25.5,11.5~29.8769,25.5,11.5~25.3031,25.5,11.5" as Ref;

test("a mate that the sketch of the moved body cannot follow names the constraints that hold it, and offers to delete them", () => {
  const s = open();
  const act = actionsFor(scene(s), [HOLE_FAR, PIN]).find((a) => a.id === "mate:coaxial")!;
  assert.ok(act.enabled);
  const r = run(s, act.run(0));
  assert.match(r.message ?? "", /cannot be done without breaking other constraints/);
  assert.match(r.message ?? "", /: the .* (constraint|mate) .*(holds|hold) what it would move/, "it says which kind of constraint holds it, so the flash is not a mystery");
  assert.ok(r.conflict && r.conflict.victims.length > 0, "the constraints in the way are named");
  assert.ok(r.conflict!.retry, "and can be deleted to go on");
  // deleting them and making the mate again goes through
  const freed = run(s, { type: "batch", commands: r.conflict!.victims.map((id) => ({ type: "removeRelation" as const, id })) });
  assert.equal(freed.message, null);
  assert.equal(run(freed, act.run(0)).message, null);
});

test("the rim of a hole and the rim of a pin, selected as edges, are offered the coaxial mate", () => {
  const acts = actionsFor(scene(open()), [PIN_RIM, HOLE_RIM]);
  const coax = acts.find((a) => a.id === "mate:coaxial");
  assert.ok(coax, "the coaxial mate is offered");
  assert.equal(coax.enabled, true);
});

test("while a sketch tool is on a plane of a model, the plane and the side of it facing the camera are given, so the edges past it are drawn faintly (`in_1045`)", async () => {
  const { createState, reduce } = await import("../src/interaction/controller.ts");
  const { frameOf } = await import("../src/interaction/frame.ts");
  const env = { w: 800, h: 600, now: 0 };
  const st = { ...createState(open()) };
  assert.equal(frameOf(st, env).behindPlane, null, "no tool: the usual look");
  const sel = { ...st, session: { ...st.session, click: { ...st.session.click, selection: ["d/loop@arc@e_023.s0@e_019.p0@e_021.p0+e_019.s0+e_021.s0+e_049.s0" as Ref] } } };
  const on = reduce(sel, { type: "begin", name: "circle" }, env);
  const f = frameOf(on, env).behindPlane;
  assert.ok(f, "the tool is on the lever's plane");
  assert.equal(f.at[2], 11.5);
  assert.equal(Math.abs(f.n[2]), 1);
});
