// Each gear's steps are a chain of their own, joined at the end (`dec_gear_islands`): deleting or changing one gear does not make the others again.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { clearKernelCaches } from "../src/compiler/kernel/occt/interpreter.mjs";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { graphOf } from "../src/compiler/compile.ts";
import type { GearSpec } from "../src/operation/gear.ts";

await kernel.init();
const XY = worldRef("XY");
const SPEC = (teeth: number, width: number): GearSpec => ({ teeth, module: 2, width });
const gear = (s: Session, id: string, at: [number, number, number], spec: GearSpec): Session => { const n = run(s, { type: "gear", id, plane: XY, at, spec }); assert.ok(!n.message, n.message ?? ""); return n; };
const two = (): Session => gear(gear(createSession(kernel), "g_001", [0, 0, 0], SPEC(12, 6)), "g_002", [60, 0, 0], SPEC(14, 8));
const volume = (s: Session): number => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? p.volume ?? 0 : 0), 0);
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body");
const ops = (s: Session) => graphOf(scene(s)).ops;
type Done = { ops: { id: string; cached: boolean }[]; volume: number; bodies: unknown[] };
const evaluate = (s: Session): Done => kernel.evaluate(graphOf(scene(s)) as never) as never;

test("the graph: each of two gears starts a chain of its own (no target), and a join stands them beside each other; one gear alone has no join", () => {
  const g = ops(two());
  const join = g.find((o) => o.type === "join");
  assert.ok(join, "a join");
  const gearOps = g.filter((o) => /^x_s_\d+$/.test(o.id) && o.type !== "join");
  const starts = gearOps.filter((o) => !o.target);
  assert.equal(starts.length, 2, "each gear's first step has no target");
  assert.deepEqual([join!.target, ...(join!.others as string[])].sort(), gearOps.filter((o) => !gearOps.some((p) => p.target === o.id)).map((o) => o.id).sort(), "the join takes the last step of each chain");
  assert.ok(!ops(gear(createSession(kernel), "g_001", [0, 0, 0], SPEC(12, 6))).some((o) => o.type === "join"), "one gear is the one chain, as before");
});

test("both gears are bodies with the volumes they have alone, and with the names of their steps", () => {
  const s = two();
  clearKernelCaches();
  const done = evaluate(s);
  const a = volume(gear(createSession(kernel), "g_001", [0, 0, 0], SPEC(12, 6)));
  const b = volume(gear(createSession(kernel), "g_002", [60, 0, 0], SPEC(14, 8)));
  assert.equal(bodies(s).length, 2);
  assert.ok(Math.abs(done.volume - (a + b)) < 1e-6 * (a + b), `${done.volume} against ${a + b}`);
  assert.ok(Math.abs(volume(s) - (a + b)) < 1e-6 * (a + b));
});

// (`run` works the model out itself, which fills the kernel's memory: so both models are made first and the memory emptied, then the first is worked out cold and the second is looked at)
test("deleting a gear does not make the other again: every step of what is left is found as it was made", () => {
  const s = two();
  const gone = run(s, { type: "deleteGear", id: "g_001" });
  clearKernelCaches();
  const cold = evaluate(s);
  assert.ok(cold.ops.every((o) => !o.cached), "the first is worked out from nothing");
  const after = evaluate(gone);
  assert.ok(after.ops.length > 0 && after.ops.every((o) => o.cached), `${after.ops.filter((o) => !o.cached).map((o) => o.id)} were made again`);
  assert.ok(Math.abs(after.volume - volume(gear(createSession(kernel), "g_002", [60, 0, 0], SPEC(14, 8)))) < 1e-6 * after.volume);
});

/** The steps of the graph that a gear's own steps made (its sketches and its bodies). */
const opsOf = (s: Session, gear: string): string[] => {
  const mine = scene(s).steps.filter((st) => st.params.gear === gear).map((st) => st.id);
  return ops(s).filter((o) => mine.some((id) => o.id === `x_${id}` || o.id.startsWith(`s_${id}`))).map((o) => o.id);
};

test("changing the first gear does not make the second's steps again: only the first's steps and the join are new", () => {
  const s = two();
  const changed = run(s, { type: "setGear", id: "g_001", spec: SPEC(13, 6) });
  assert.ok(!changed.message, changed.message ?? "");
  clearKernelCaches();
  evaluate(s);
  const after = evaluate(changed);
  const made = after.ops.filter((o) => !o.cached).map((o) => o.id);
  const [first, second] = [opsOf(changed, "g_001"), opsOf(changed, "g_002")];
  assert.ok(first.length > 0 && second.length > 0);
  assert.ok(first.every((id) => made.includes(id) || id.startsWith("s_")), "the first gear's bodies are made again");
  assert.deepEqual(made.filter((id) => second.includes(id)), [], "none of the second gear's steps");
  assert.ok(made.some((id) => id.startsWith("j_")), "and the join");
});
