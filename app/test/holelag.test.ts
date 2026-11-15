// A hole drawn on the top of a block and pushed through it is a cut, also when the kernel answers later (the browser) and a separate body stands beside it (`in_412`):
// the mode of the step (adds a piece, joins, cuts) was decided from the answer that was still the older one, so the hole was kept as a body joined on.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import type { Kernel, KernelGraph } from "../src/compiler/kernel/adapter.ts";
import { openSession, redoLast, refresh, scene, bodyVolume } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();

function lagging(onChange: () => void) {
  let job: { id: number; graph: KernelGraph; draft?: boolean } | null = null;
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const worker: WorkerLike = { postMessage: (m) => { job = m as typeof job; }, addEventListener: (t, f) => { if (t === "message") { listeners.push(f); f({ data: { ready: true } }); } } };
  const k = createAsyncKernel(onChange, worker);
  return { kernel: k as Kernel, deliver: (): boolean => { if (!job) return false; const j = job; job = null; kernel.draft = !!j.draft; const result = kernel.evaluate(j.graph); for (const f of listeners) f({ data: { id: j.id, result } }); return true; } };
}

test("a hole pushed through the block, the kernel answering later, is a cut (`in_412`)", () => {
  let s!: Session;
  const lag = lagging(() => { s = refresh(s); });
  const o = openSession(lag.kernel, readFileSync(new URL("./fixtures/hole-after-cylinder-in_412.cad.json", import.meta.url), "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  s = redoLast(o.value);
  for (let i = 0; i < 40 && lag.deliver(); i++);
  assert.equal(scene(s).steps.length, 3);
  const before = bodyVolume(s);
  const st = startOp(scene(s), ["d/disk@e_021.k" as never], "extrude");
  assert.ok(st.ok);
  if (!st.ok) return;
  const r = runOp(s, { ...st.op, value: -27.9 });
  assert.ok(r && !r.session.message);
  s = r!.session;
  for (let i = 0; i < 40 && lag.deliver(); i++);
  assert.equal(scene(s).steps.at(-1)!.params.mode, "cut");
  assert.ok(bodyVolume(s) < before - 50, `the block is smaller: ${before} -> ${bodyVolume(s)}`);
});
