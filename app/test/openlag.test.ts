// A file with a group of parts of the body opens with the kernel answering later (the browser), as it does with the kernel at hand (`in_419`): the group was checked against the body before the first answer was there.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import type { Kernel, KernelGraph } from "../src/compiler/kernel/adapter.ts";
import { openSession, refresh, scene } from "../src/interaction/session.ts";

await kernel.init();
function lagging(onChange: () => void) {
  let job: { id: number; graph: KernelGraph; draft?: boolean } | null = null;
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const worker: WorkerLike = { postMessage: (m) => { job = m as typeof job; }, addEventListener: (t, f) => { if (t === "message") { listeners.push(f); f({ data: { ready: true } }); } } };
  const k = createAsyncKernel(onChange, worker);
  return { kernel: k as Kernel, deliver: (): boolean => { if (!job) return false; const j = job; job = null; kernel.draft = !!j.draft; const result = kernel.evaluate(j.graph); for (const f of listeners) f({ data: { id: j.id, result } }); return true; } };
}

test("a file whose history groups parts of a body opens with the kernel answering later", () => {
  const lag = lagging(() => {});
  const o = openSession(lag.kernel, readFileSync(new URL("./fixtures/group-then-new-body-in_419.cad.json", import.meta.url), "utf8"));
  assert.ok(o.ok, o.ok ? "" : o.error);
  if (o.ok) { for (let i = 0; i < 40 && lag.deliver(); i++); assert.ok(scene(refresh(o.value)).steps.length > 5); }
});
