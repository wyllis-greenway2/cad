// A face whose outline is made of the body's own edges, pulled by its arrow and then given a number (`in_1351`, `in_1352`): the browser (the kernel answers later) took the figure's pieces away with the answer of the pulled model,
// and the step made from them was "gone". The two files are the human's.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import type { Kernel, KernelGraph } from "../src/compiler/kernel/adapter.ts";
import { openSession, refresh, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { projector } from "../src/interaction/camera.ts";

await kernel.init();

function lagging(onChange: () => void) {
  let job: { id: number; graph: KernelGraph; draft?: boolean } | null = null;
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const worker: WorkerLike = { postMessage: (m) => { job = m as typeof job; }, addEventListener: (t, f) => { if (t === "message") { listeners.push(f); f({ data: { ready: true } }); } } };
  const k = createAsyncKernel(onChange, worker);
  return { kernel: k as Kernel, deliver: (): boolean => { if (!job) return false; const j = job; job = null; kernel.draft = !!j.draft; const result = kernel.evaluate(j.graph); for (const f of listeners) f({ data: { id: j.id, result } }); return true; } };
}



for (const file of ["cannot-pull-face-in_1351.cad.json", "cannot-pull-face-in_1352.cad.json"]) {
  test(`pulling then typing 15 on the face of ${file} makes the step, the kernel answering later`, () => {
    let s!: Session;
    const lag = lagging(() => { s = refresh(s); });
    const o = openSession(lag.kernel, readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
    assert.ok(o.ok);
    if (!o.ok) return;
    s = o.value;
    for (let i = 0; i < 40 && lag.deliver(); i++);
    const face = Object.values(scene(s).parts).find((p) => p.kind === "face" && p.origin === "drawn" && p.loop.some((l) => String(l).includes("body/e@")) && (p.holes?.length ?? 0) <= 1) as { ref: string } | undefined;
    assert.ok(face, "a drawn face with the body's edges in its outline");
    const env = { w: 800, h: 600, now: 0 };
    let app: AppState = createState({ ...s, click: { ...s.click, selection: [face!.ref] as never } });
    const settle = (): void => { for (let i = 0; i < 40 && lag.deliver(); i++); app = { ...app, session: refresh(app.session) }; s = app.session; };
    const before = scene(app.session).steps.length;
    app = reduce(app, { type: "begin", name: "extrude" } as never, env);
    settle();
    const hd = gizmoOf(app)!.handles.find((h) => h.kind !== "pane")!;
    const [x0, y0] = projector(app.cam, 800, 600).project(hd.points[hd.points.length - 1]!)!;
    app = reduce(app, { type: "orbit", dx: 1, dy: 0, x: x0 + 1, y: y0 } as never, env);
    for (let k = 1; k <= 8; k++) { app = reduce(app, { type: "orbit", dx: 0, dy: -4, x: x0 + 1, y: y0 - 6 * k } as never, env); settle(); }
    app = reduce(app, { type: "dragEnd" } as never, env);
    settle();
    for (const k of "15") app = reduce(app, { type: "typed", key: k, shift: false }, env);
    settle();
    app = reduce(app, { type: "typed", key: "Enter", shift: false }, env);
    settle();
    assert.ok(!app.session.message, app.session.message ?? "");
    assert.equal(scene(app.session).steps.length, before + 1, "the step is there");
    assert.equal(Number(scene(app.session).steps.at(-1)!.params.depth), 15);
    assert.deepEqual(app.session.outcome.errors, {});
  });
}
