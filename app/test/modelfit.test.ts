// Every model meets the numbers typed in its box the same way (`in_1243`): the numbers not typed are moved to fit (`modelfit.ts`), a number that cannot be met is taken back to the nearest that works and marked (`modelFix`), and typing a number as it already is
// changes nothing. One test for all the models, not one for each.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { armModel } from "../src/interaction/tools.ts";
import { modelFix, modelEntry, modelTarget } from "../src/interaction/modeltool.ts";
import { MODEL_KINDS, modelFields, modelStart } from "../src/operation/modelkinds.ts";
import type { ModelKind } from "../src/operation/modelkinds.ts";

await kernel.init();
const XY = worldRef("XY");
const sc = scene(createSession(kernel));
const toolWith = (kind: ModelKind, typed: Record<string, string>, size = ""): ReturnType<typeof armModel> => {
  const t = armModel(kind), keys = modelFields(kind).map((f) => f.key);
  return { ...t, plane: XY, points: [[0, 0, 0]], cursor: [0, 0, 0], fill: { center: [0, 0, 0], normal: [0, 0, 1] }, model: { ...t.model!, typed: t.model!.typed.map((x, i) => (i === 0 ? size : i >= 1 && typed[keys[i - 1]!] !== undefined ? typed[keys[i - 1]!]! : x)) } } as ReturnType<typeof armModel>;
};
const BEARING_OWN = { own: "1", detail: "1" };
const base = (kind: ModelKind): Record<string, string> => (kind === "ballbearing" ? { ...BEARING_OWN } : {});
const typable = (kind: ModelKind) => modelFields(kind).filter((f) => !f.choices && !f.hidden && f.key !== "number" && !(kind === "ballbearing" && ["own", "detail"].includes(f.key)));

test("every model with nothing typed is a model, at any size it is given", () => {
  for (const kind of MODEL_KINDS) {
    const start = modelStart(kind);
    const size = kind === "ballbearing" ? [] : [0.4, 0.7, 1, 1.6, 3];
    const t0 = modelTarget(sc, toolWith(kind, base(kind)))!;
    assert.equal(t0.problem, null, `${kind}: ${t0.problem}`);
    for (const f of size) {
      const g = modelTarget(sc, toolWith(kind, base(kind), String(Math.round(t0.size * f * 10) / 10)))!;
      if (g.problem) { const fx = modelFix(sc, toolWith(kind, base(kind), String(Math.round(t0.size * f * 10) / 10))); assert.ok(fx, `${kind} at ${f} x: ${g.problem}`); assert.equal(modelTarget(sc, fx!.tool)!.problem, null, `${kind}: taken back to a model`); }
    }
    void start;
  }
});

test("a number typed as it already is changes nothing, in any model", () => {
  for (const kind of MODEL_KINDS) {
    const t0 = modelTarget(sc, toolWith(kind, base(kind)))!;
    for (const f of typable(kind)) {
      const v = t0.nums[f.key]!, g = modelTarget(sc, toolWith(kind, { ...base(kind), [f.key]: String(v) }))!;
      assert.equal(g.problem, null, `${kind} ${f.key} typed as ${v}: ${g.problem}`);
      assert.deepEqual(g.nums, t0.nums, `${kind} ${f.key} typed as ${v}: nothing else moves`);
    }
  }
});

test("random numbers typed into any model end as a model: met by the others, or taken back and marked", () => {
  let seed = 11; const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const kind of MODEL_KINDS) {
    const fields = typable(kind), t0 = modelTarget(sc, toolWith(kind, base(kind)))!;
    let taken = 0;
    const N = 120;
    for (let i = 0; i < N; i++) {
      const typed: Record<string, string> = { ...base(kind) };
      for (let j = 0, n = 1 + Math.floor(rnd() * 3); j < n; j++) {
        const f = fields[Math.floor(rnd() * fields.length)]!, v = t0.nums[f.key]!;
        typed[f.key] = f.whole ? String(Math.max(f.zero ? 0 : 1, Math.round(v * (0.4 + rnd() * 2.6)))) : String(Math.round(v * (0.3 + rnd() * 3) * 1000) / 1000);
      }
      const t = toolWith(kind, typed), g = modelTarget(sc, t)!;
      if (!g.problem) continue;
      taken++;
      const fx = modelFix(sc, t);
      assert.ok(fx, `${kind} ${JSON.stringify(typed)}: ${g.problem}, and no number is taken back`);
      assert.equal(modelTarget(sc, fx!.tool)!.problem, null, `${kind} ${JSON.stringify(typed)}: taken back to a model`);
      assert.equal(modelEntry(sc, t)!.fields.some((f) => f.bad), true, `${kind}: the box marks a number red`);
    }
    assert.ok(taken < N * 0.7, `${kind}: ${taken} of ${N} random numbers had to be taken back (the others met them)`);
  }
});
