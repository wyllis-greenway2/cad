// A chamfer of all the edges of a face with the kernel answering later (`in_263`): an answer that is an error takes back only the step that asked, never the model before it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import type { Kernel, KernelGraph } from "../src/compiler/kernel/adapter.ts";
import { openSession, redoLast, refresh, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";

await kernel.init();
const FILE = "test/fixtures/gear-chamfer.cad.json";
const env = { w: 800, h: 600, now: 0 };

function lagging(onChange: () => void) {
  let job: { id: number; graph: KernelGraph; draft?: boolean } | null = null;
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const worker: WorkerLike = { postMessage: (m) => { job = m as typeof job; }, addEventListener: (t, f) => { if (t === "message") { listeners.push(f); f({ data: { ready: true } }); } } };
  const k = createAsyncKernel(onChange, worker);
  return {
    kernel: k as Kernel,
    deliver: (fail = false): boolean => { if (!job) return false; const j = job; job = null; if (fail) { for (const f of listeners) f({ data: { id: j.id, failed: "boom" } }); return true; } kernel.draft = !!j.draft; const result = kernel.evaluate(j.graph); for (const f of listeners) f({ data: { id: j.id, result } }); return true; },
  };
}

test("chamfer all edges of a face of the gear, the kernel answering later: steps made, changed and refused leave the model before them alone", { skip: !fs.existsSync(FILE) }, () => {
  let st!: AppState;
  const answer = () => { const before = st.session.history.cursor; const session = refresh(st.session); st = { ...st, session, ...(session.history.cursor < before ? { op: null, drag: null } : {}) }; };
  const lag = lagging(answer);
  const flush = () => { for (let i = 0; i < 40 && lag.deliver(); i++); };
  const o = openSession(lag.kernel, fs.readFileSync(FILE, "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  st = { ...createState(redoLast(o.value)), cam: homeCamera() };
  flush();
  assert.equal(scene(st.session).steps.length, 1, "the gear is extruded");
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!(p as { mesh?: unknown }).mesh && !(p as { rounded?: string }).rounded && !(p as { curved?: unknown }).curved && Math.abs((p as { at: number[] }).at[2]! - 3) < 1e-6)!;
  const trace: string[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let k = 0; k < 10; k++) {
    const text = String(Math.round((rnd() * 1.4 - 0.9) * 100) / 100 || 0.1);
    const pick = scene(st.session).steps.length;
    if (!st.op) {
      st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [face.ref] } } };
      st = reduce(st, { type: "runAction", id: "op:edge" }, env);
    }
    st = reduce(st, { type: "entry", field: 0, text }, env);
    if (rnd() < 0.5) st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    trace.push(`${k}: typed ${text}: steps ${pick} -> ${scene(st.session).steps.length}, cursor ${st.session.history.cursor}, op ${!!st.op}`);
    const n = Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) lag.deliver(rnd() < 0.25);
    if (rnd() < 0.2) st = reduce(st, { type: "escape" }, env);
    if (!scene(st.session).steps.some((s) => s.type === "extrude")) { console.log(trace.slice(-8).join("\n")); assert.fail(`the extrusion vanished at ${k}`); }
  }
});
