// The snapshot says where the time of a slow change went (`in_441`): the steps made and the ones found as they were, the slowest of them, how the bodies were described, and how the compiles have gone.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, run } from "../src/interaction/session.ts";
import { profileOf } from "../src/interaction/snapshot.ts";

await kernel.init();

test("the profile tells the steps made from the steps kept, and bodies described from bodies found as they were", () => {
  const o = openSession(kernel, readFileSync(new URL("./fixtures/cylinder-in-hole-in_436.cad.json", import.meta.url), "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  const s = o.value;
  // a change to the last step only: the steps before it are found as they were
  const next = run(s, { type: "setStepParams", id: "s_019", params: { depth: -26 } } as never);
  const p = profileOf(next.outcome.kernel) as { compile: { compiles: number; recent: { totalMs: number; kernelMs: number }[] }; kernel: { ops: { total: number; kept: number; madeMs: number }; slowest: { id: string; ms: number }[]; describe: { bodies: number; reused: number } | null } };
  assert.ok(p.compile.compiles >= 2 && p.compile.recent.length >= 2, "the compiles are counted");
  assert.ok(p.compile.recent.at(-1)!.kernelMs >= 0 && p.compile.recent.at(-1)!.totalMs >= p.compile.recent.at(-1)!.kernelMs);
  assert.ok(p.kernel.ops.total > p.kernel.ops.kept, "something was made");
  assert.ok(p.kernel.ops.kept >= 3, `the steps before the change were found as they were: ${p.kernel.ops.kept}`);
  assert.ok(p.kernel.describe && p.kernel.describe.bodies >= 1);
  assert.ok(p.kernel.slowest.every((x, i, all) => i === 0 || all[i - 1]!.ms >= x.ms), "the slowest first");
  assert.equal(profileOf(null).kernel, null);
});

test("a second answer of the same model describes every body as it was", () => {
  const o = openSession(kernel, readFileSync(new URL("./fixtures/cylinder-in-hole-in_436.cad.json", import.meta.url), "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  const again = run(o.value, { type: "setStepParams", id: "s_013", params: { depth: 15.1 } } as never); // (the same number)
  const d = (profileOf(again.outcome.kernel) as { kernel: { describe: { bodies: number; reused: number } } }).kernel.describe;
  assert.equal(d.reused, d.bodies);
});
