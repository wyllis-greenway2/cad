// The picture of a fillet or chamfer being dragged is the kernel's own result for every size, not the stretched one (`in_328`); the other previews keep the stretch.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, undoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { createState } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { frameOf, previewIsExact } from "../src/interaction/frame.ts";
import { settings } from "../src/shared/settings.ts";

await kernel.init();
const EDGE = "b/body/e@29.78,10.89,0~29.78,10.89,12.4~29.78,10.89,6.2";
const open = (): Session => undoLast((openSession(kernel, readFileSync(new URL("./fixtures/two-blocks-in_319.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value);
const dragging = (s: Session, op: unknown): AppState => ({ ...createState(s), session: { ...s, click: { ...s.click, selection: [EDGE as never] } }, op: op as never, drag: { handle: { id: "edge:0", dir: [1, 0, 0], kind: "edge" } } as never });
const size = { w: 1280, h: 687 };

test("which previews are the kernel's own result", () => {
  const s = open();
  const edge = startOp(scene(s), [EDGE as never], "edge");
  assert.ok(edge.ok);
  assert.equal(previewIsExact(edge.op), true, "a new fillet or chamfer");
  assert.equal(previewIsExact({ ...edge.op, kind: "pushpull", edit: { kind: "edgeSize", step: "s_026", value: 3 } } as never), true, "one that is there, pulled in or out");
  assert.equal(previewIsExact({ ...edge.op, kind: "extrude" } as never), false, "an extrusion keeps the stretch");
  assert.equal(previewIsExact({ ...edge.op, kind: "pushpull" } as never), false, "so does a plain push or pull");
  settings.preview.exactRounding = false;
  try { assert.equal(previewIsExact(edge.op), false, "turned back"); } finally { settings.preview.exactRounding = true; }
  settings.preview.stretch = false;
  try { assert.equal(previewIsExact({ ...edge.op, kind: "extrude" } as never), true, "or all of them exact"); } finally { settings.preview.stretch = true; }
});

test("a fillet size dragged is drawn from the kernel's answer for that size, with no stretch", () => {
  const s = open();
  const st = startOp(scene(s), [EDGE as never], "edge");
  assert.ok(st.ok);
  for (const v of [8, 3.1, 1.7, -2.2]) {
    let f: ReturnType<typeof frameOf> | null = null;
    for (let i = 0; i < 4; i++) f = frameOf(dragging(s, { ...st.op, value: v }), size, i * 200);
    assert.equal(f!.faceShift, null, `no stretch at ${v}`);
    const step = f!.scene.steps.at(-1)!;
    assert.equal(step.type, "edgeMod");
    assert.ok(Math.abs(Number(step.params.value) - Math.abs(v)) < 1e-9, "the picture's step is the size asked for");
    assert.equal(step.params.mode, v > 0 ? "fillet" : "chamfer");
    assert.ok(f!.mesh && f!.mesh.triangles.length > 0, "and its mesh");
  }
});
