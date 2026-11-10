// Esc cancels only the operation that is open (`in_244`), also when another operation was started while the first was still open (`in_264`: after an extrusion and a chamfer, both went at one Esc).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, run, scene } from "../src/interaction/session.ts";
import { opCommand } from "../src/interaction/operations.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";

await kernel.init();
const FILE = "test/fixtures/gear-chamfer.cad.json";
const env = { w: 800, h: 600, now: 0 };

test("an operation begun while another is still open remembers where the history stood then: Esc takes back only what it made", () => {
  const o = openSession(kernel, fs.readFileSync(FILE, "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  let st: AppState = { ...createState(o.value), cam: homeCamera() };
  assert.equal(st.session.history.cursor, 38, "the file is saved with the extrusion and the chamfer undone");
  const piece = Object.values(scene(st.session).parts).find((p) => p.kind === "face" && (p as { pieces?: unknown }).pieces)!;
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [piece.ref] } } };
  st = reduce(st, { type: "runAction", id: "op:extrude" }, env);
  assert.equal(st.opBase, 38);
  // the extrusion is made by dragging its arrow: its operation stays open (as in the page)
  const made = run(st.session, opCommand(scene(st.session), { ...st.op!, value: 3 })!);
  st = { ...st, session: made, op: { ...st.op!, made: true } };
  assert.equal(made.history.cursor, 39);
  const top = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!(p as { mesh?: unknown }).mesh && !(p as { rounded?: string }).rounded && !(p as { curved?: unknown }).curved && Math.abs((p as unknown as { at: number[] }).at[2]! - 3) < 1e-6)!;
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [top.ref] } } };
  st = reduce(st, { type: "runAction", id: "op:edge" }, env);
  assert.equal(st.op?.kind, "edge");
  assert.equal(st.opBase, 39, "the chamfer began with the extrusion made");
  st = reduce(st, { type: "escape" }, env);
  assert.equal(scene(st.session).steps.some((s) => s.type === "extrude"), true, "the extrusion is still there");
  assert.equal(st.session.history.cursor, 39);
});
