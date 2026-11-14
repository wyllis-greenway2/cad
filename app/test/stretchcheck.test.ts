// The stretched picture is checked against the kernel's answer, and given up for the kernel's own when they differ (`in_325`, `q_preview_provenance`).
import { settings } from "../src/shared/settings.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, undoLast, previewCommand } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { createState } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { frameOf, checkStretch, previewChecks } from "../src/interaction/frame.ts";
import { roundingFaces, sharpOfPoints } from "../src/operation/roundings.ts";

await kernel.init();
// (these test the stretched picture of a fillet or chamfer, which is what the other previews use and what `settings.preview.exactRounding` off brings back; the default for a fillet or chamfer is the kernel's own result, `in_328`, tested in `exactpreview.test.ts`)
settings.preview.exactRounding = false;
const EDGE = "b/body/e@29.78,10.89,0~29.78,10.89,12.4~29.78,10.89,6.2";
const open = (): Session => undoLast((openSession(kernel, readFileSync(new URL("./fixtures/two-blocks-in_319.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value);
const dragging = (s: Session, op: unknown): AppState => ({ ...createState(s), session: { ...s, click: { ...s.click, selection: [EDGE as never] } }, op: op as never, drag: { handle: { id: "edge:0", dir: [1, 0, 0], kind: "edge" } } as never });
const size = { w: 1280, h: 687 };

test("a fillet size dragged big and then small is checked against the kernel and passes; the stretch stays", () => {
  const s = open();
  const st = startOp(scene(s), [EDGE as never], "edge");
  assert.ok(st.ok);
  const [before, differedBefore] = [previewChecks.checked, previewChecks.differed];
  let now = 0;
  let last: ReturnType<typeof frameOf> | null = null;
  for (const v of [8, 8, 5, 2.5, 1.7, 1.7, -1.7, -4, -8, -2]) {
    for (let i = 0; i < 6; i++) { last = frameOf(dragging(s, { ...st.op, value: v }), size, now); now += 200; }
  }
  assert.ok(previewChecks.checked > before, "it was checked");
  assert.equal(previewChecks.differed, differedBefore, "and it agreed with the kernel");
  assert.ok(last!.faceShift?.rounds, "the stretch is still what is drawn");
});

test("a stretched picture with the wall taken for the rounding (the fault of `in_323`) is found to differ from the kernel's", () => {
  const s = open();
  const sc = scene(s);
  const e = sc.parts[EDGE as never] as unknown as { a: never; b: never };
  const [pa, pb] = [sc.parts[e.a], sc.parts[e.b]] as unknown as { at: [number, number, number] }[];
  const sharp = sharpOfPoints(pa!.at, pb!.at, null)!;
  const st = startOp(sc, [EDGE as never], "edge");
  assert.ok(st.ok);
  const R = 8;
  const reference = previewCommand(s, opCommand(sc, { ...st.op, typed: "", value: R }, { preview: true })!)!;
  const faceNames = (reach: number) => roundingFaces(reference.scene, [sharp], reach, (r) => r in sc.parts).map((f) => ({ face: f.face, sharp: sharp.sharp }));
  const right = faceNames(3 * R);
  const wrong = faceNames(9 * R); // (what a distance of three sizes took for the rounding on a small block: a wall as well)
  assert.ok(wrong.length > right.length, "the wrong rule takes more faces");
  const v = 1.7;
  const exact = () => opCommand(sc, { ...st.op, typed: "", value: v }, { preview: true });
  const state = dragging(s, { ...st.op, value: v });
  const [checked, differed] = [previewChecks.checked, previewChecks.differed];
  assert.equal(checkStretch(state, s, "test-right", reference, { k: v / R, groups: right }, exact, 100000), true, "the right faces agree");
  assert.equal(previewChecks.differed, differed);
  assert.equal(checkStretch(state, s, "test-wrong", reference, { k: v / R, groups: wrong }, exact, 200000), false, "the wall taken for the rounding does not");
  assert.equal(previewChecks.differed, differed + 1);
  assert.ok(previewChecks.checked >= checked + 2);
  assert.match(previewChecks.last?.why ?? "", /volume|box/);
});
