// The parts of a model made in pieces that are not made yet are drawn as boxes at once, from the scene's steps alone, and go as the kernel makes them (`dec_progressive_open`, `in_1002`).
import test from "node:test";
import assert from "node:assert/strict";
import { openSession, scene } from "../src/interaction/session.ts";
import { standIns } from "../src/interaction/standin.ts";
import { noticesOf } from "../src/interaction/notice.ts";
import type { Kernel } from "../src/compiler/kernel/adapter.ts";
import { projectText } from "./pieceshelp.ts";

const EMPTY = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
const nokernel = { name: "none", init: async () => ({}), evaluate: () => ({ ...EMPTY, stale: true }) as never, exportMesh: async () => ({ ok: false, error: "no" }), exportStep: async () => ({ ok: false, error: "no" }), lagging: true } as unknown as Kernel;
const sceneOf = (n: number) => { const r = openSession(nokernel, projectText(n)); assert.ok(r.ok); return scene(r.value); };

test("a box for every part the kernel has not made, from the steps alone; fewer as it makes them; none when it is not working or the model is small", () => {
  const sc = sceneOf(30);
  const all = standIns(sc, { stale: true, ops: [], bodies: null });
  assert.equal(all.length, 30);
  assert.ok(all.every((d) => d.box && d.box.max[2]! > d.box.min[2]!));
  assert.equal(all[0]!.step, "x_s_002");
  assert.deepEqual([all[0]!.box!.min, all[0]!.box!.max], [[0, 0, 0], [8, 8, 4]], "the first part: 8 by 8, 4 deep, at the corner");
  const some = standIns(sc, { stale: true, ops: [], bodies: [{ id: "x_s_002" }, { id: "x_s_004" }] });
  assert.equal(some.length, 28);
  assert.ok(!some.some((d) => d.step === "x_s_002" || d.step === "x_s_004"));
  const again = standIns(sc, { stale: true, ops: [], bodies: [{ id: "x_s_002" }, { id: "x_s_004" }] });
  assert.ok(again[0] === some[0] && again.length === some.length, "the same boxes while nothing changed: it is asked for every frame");
  assert.deepEqual(standIns(sc, { ops: [], bodies: null }), [], "not working: none");
  assert.deepEqual(standIns(sceneOf(5), { stale: true, ops: [], bodies: null }), [], "a small model: none");
});

test("the working sign says how far a model made in pieces is", () => {
  const f = { message: "", refusal: null, helper: null, busy: true };
  assert.equal(noticesOf(f).find((n) => n.kind === "busy")!.text, "Working…");
  assert.equal(noticesOf({ ...f, busyText: "Building 340 of 1000 parts…" }).find((n) => n.kind === "busy")!.text, "Building 340 of 1000 parts…");
});
