// A piece made onto the body that never said whether it cuts, joins or stands apart is made to say it, and deleting the body a cut was made in leaves no cut behind to make a tube of the piece beside it (`in_432`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import type { Kernel, KernelGraph } from "../src/compiler/kernel/adapter.ts";
import { openSession, refresh, scene, run, redoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";

await kernel.init();
const text = () => readFileSync(new URL("./fixtures/cylinder-in-hole-in_432.cad.json", import.meta.url), "utf8");
function lagging(onChange: () => void) {
  let job: { id: number; graph: KernelGraph; draft?: boolean } | null = null;
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const worker: WorkerLike = { postMessage: (m) => { job = m as typeof job; }, addEventListener: (t, f) => { if (t === "message") { listeners.push(f); f({ data: { ready: true } }); } } };
  const k = createAsyncKernel(onChange, worker);
  return { kernel: k as Kernel, deliver: (): boolean => { if (!job) return false; const j = job; job = null; kernel.draft = !!j.draft; const result = kernel.evaluate(j.graph); for (const f of listeners) f({ data: { id: j.id, result } }); return true; } };
}
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number }[];

test("opened with the kernel answering later, the piece in the hole is made to say it is a piece of its own, so a wider piece does not cut the block", () => {
  let s!: Session;
  const lag = lagging(() => { s = refresh(s); });
  const o = openSession(lag.kernel, text());
  assert.ok(o.ok);
  if (!o.ok) return;
  s = o.value;
  for (let i = 0; i < 40 && lag.deliver(); i++);
  const step = scene(s).steps.find((x) => x.id === "s_019")!;
  assert.equal(step.params.mode, "new", "the step now says what it is");
  // the circle made wider than the hole: still a piece of its own
  s = run(s, { type: "setRadius", ref: "d/e_017.k" as never, radius: 2.7007 });
  for (let i = 0; i < 40 && lag.deliver(); i++);
  assert.equal(bodies(s).length, 2, "the block and the piece");
  assert.ok(bodies(s).every((b) => b.volume > 400), `neither is cut away: ${bodies(s).map((b) => b.volume).join()}`);
});

test("deleting the block leaves no cut to turn the piece beside it into a tube: the piece is whole", () => {
  const o = openSession(kernel, text());
  assert.ok(o.ok);
  if (!o.ok) return;
  let st = createState({ ...o.value, click: { ...o.value.click, selection: ["b/x_s_013/o"] as never } });
  st = reduce(st, { type: "runAction", id: "delete" }, { w: 800, h: 600, now: 0 } as never);
  const left = bodies(st.session);
  assert.equal(left.length, 1);
  assert.ok(Math.abs(left[0]!.volume - Math.PI * 2.2207 ** 2 * 27.1) < 0.5, `the cylinder, whole: ${left[0]!.volume}`);
});

test("deleting the block also takes out the cut that was made only in it, and the piece beside it stays whole with no broken step (`in_432`)", () => {
  const o = openSession(kernel, text());
  assert.ok(o.ok);
  if (!o.ok) return;
  let st = createState({ ...o.value, click: { ...o.value.click, selection: ["b/x_s_013/o"] as never } });
  st = reduce(st, { type: "runAction", id: "delete" }, { w: 800, h: 600, now: 0 } as never);
  assert.deepEqual(scene(st.session).steps.filter((x) => x.type === "extrude").map((x) => x.id), ["s_019"], "the block and its hole are gone, the piece stays");
  assert.deepEqual(st.session.outcome.errors, {});
});
