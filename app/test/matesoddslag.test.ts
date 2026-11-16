// The button for mates at odds when the kernel answers later, as in the browser (`in_553`): the refusal is made when the answer comes (`refresh`), and it carries what to do once the mate is deleted. The browser pass found this path: the test with the answer at hand did not.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createAsyncKernel } from "../src/kernel-async.ts";
import type { WorkerLike } from "../src/kernel-async.ts";
import type { Kernel, KernelGraph } from "../src/compiler/kernel/adapter.ts";
import { openSession, redoLast, refresh, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;

function lagging(onChange: () => void) {
  let job: { id: number; graph: KernelGraph; draft?: boolean } | null = null;
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const worker: WorkerLike = { postMessage: (m) => { job = m as typeof job; }, addEventListener: (t, f) => { if (t === "message") { listeners.push(f); f({ data: { ready: true } }); } } };
  const k = createAsyncKernel(onChange, worker);
  return {
    kernel: k as Kernel,
    deliver: (): boolean => { if (!job) return false; const j = job; job = null; kernel.draft = !!j.draft; const result = kernel.evaluate(j.graph); for (const f of listeners) f({ data: { id: j.id, result } }); return true; },
  };
}

test("a second mate that no placement holds with the first, the answer coming later: it is taken back and the notice offers the button, which deletes the first mate and makes the second", () => {
  let st!: AppState;
  const answer = () => { const before = st.session.history.cursor; const session = refresh(st.session); const c = session.conflict; st = { ...st, session, ...(session.history.cursor < before ? { op: null, drag: null } : {}), ...(c && c !== st.session.conflict ? { flash: { ...c, at: 0 } } : {}) }; };
  const lag = lagging(answer);
  const flush = () => { for (let i = 0; i < 40 && lag.deliver(); i++); };
  const o = openSession(lag.kernel, readFileSync(new URL("./fixtures/mates-at-odds.cad.json", import.meta.url), "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  st = { ...createState(redoLast(o.value)), cam: homeCamera() };
  flush();
  const mates = () => scene(st.session).relations.filter((r) => r.kind === "mate").length;
  assert.equal(mates(), 1, "the first mate stands");
  st = reduce({ ...st, session: { ...st.session, click: { ...st.session.click, selection: ["b/body/f@1,0,0,20", "b/body/f@-1,0,0,-25"] as never } } }, { type: "runAction", id: "mate:flush" }, env);
  flush();
  assert.match(st.session.message ?? "", /unable to hold at once/, `refused when the answer came: ${st.session.message}`);
  assert.equal(mates(), 1, "the second mate was taken back");
  assert.ok(st.session.conflict?.retry, "the refusal carries the change to make once the mate is gone");
  st = reduce(st, { type: "overrideRefusal" }, env);
  flush();
  assert.equal(mates(), 1, "the first mate is deleted and the second made: one mate");
  assert.equal(st.session.message, null);
});
