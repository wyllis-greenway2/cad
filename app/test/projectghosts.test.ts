// The boxes of a saved project from its commands alone, before anything is replayed (`dec_progressive_open`, `in_1005`).
import test from "node:test";
import assert from "node:assert/strict";
import { openSession, scene } from "../src/interaction/session.ts";
import { standIns } from "../src/interaction/standin.ts";
import { ghostsFromProject } from "../src/compiler/projectghosts.ts";
import type { Kernel } from "../src/compiler/kernel/adapter.ts";
import { projectText } from "./pieceshelp.ts";

const EMPTY = { ops: [], finalId: null, volume: null, bbox: null, mesh: null, faces: null, edges: null, vertices: null, totalMs: 0 };
const nokernel = { name: "none", init: async () => ({}), evaluate: () => ({ ...EMPTY, stale: true }) as never, exportMesh: async () => ({ ok: false, error: "no" }), exportStep: async () => ({ ok: false, error: "no" }), lagging: true } as unknown as Kernel;

test("the boxes from the saved text are the boxes the replayed scene gives, part by part", () => {
  const text = projectText(40);
  const early = ghostsFromProject(text)!;
  assert.equal(early.length, 40);
  const r = openSession(nokernel, text);
  assert.ok(r.ok);
  const later = standIns(scene(r.value), { stale: true, ops: [], bodies: null });
  assert.equal(later.length, 40);
  early.forEach((g, i) => { assert.equal(g.id, later[i]!.step); assert.deepEqual(g.box, later[i]!.box, g.id); });
});

test("a project that is anything but pushes of sketches on the base plane has no boxes: they could be wrong", () => {
  assert.equal(ghostsFromProject(projectText(10)), null, "few parts");
  const moved = JSON.parse(projectText(30)); moved.commands.push({ type: "movePart", ref: "d/e_001.p0", to: [1, 1, 0] });
  assert.equal(ghostsFromProject(JSON.stringify(moved)), null, "a command that moves a part");
  const other = JSON.parse(projectText(30)); other.commands[0].commands[0].part.plane = "w/XZ";
  assert.equal(ghostsFromProject(JSON.stringify(other)), null, "a sketch on another plane");
  const turn = JSON.parse(projectText(30)); turn.commands.push({ type: "addStep", step: { id: "s_900", type: "rotate", parts: [], params: { axis: 2, value: 10 } } });
  assert.equal(ghostsFromProject(JSON.stringify(turn)), null, "a turn");
  assert.equal(ghostsFromProject("{not json"), null);
  assert.equal(ghostsFromProject(JSON.stringify({ format: "other" })), null);
});

test("fillets and holes do not change where a part stands: the boxes are still there", () => {
  const withMods = JSON.parse(projectText(30));
  withMods.commands.push({ type: "addStep", step: { id: "s_900", type: "edgeMod", parts: [], params: { mode: "fillet", value: 1 } } });
  withMods.commands.push({ type: "addStep", step: { id: "s_901", type: "extrude", parts: ["d/e_001.s0"], params: { depth: 20, cut: "1" } } });
  assert.equal(ghostsFromProject(JSON.stringify(withMods))!.length, 30, "the parts, not the fillet or the hole");
});

test("circles are boxes round them", () => {
  const cmds: object[] = [];
  for (let k = 0; k < 30; k++) {
    cmds.push({ type: "batch", commands: [{ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: `d/e_${k}.k`, kind: "corner", at: [k * 20, 0, 0] } }, { type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: `d/e_${k}.c`, kind: "circle", center: `d/e_${k}.k`, radius: 5 } }] });
    cmds.push({ type: "addStep", step: { id: `s_${100 + k}`, type: "extrude", parts: [`d/e_${k}.c`], params: { depth: 7, ...(k ? { mode: "new" } : {}) } } });
  }
  const g = ghostsFromProject(JSON.stringify({ format: "cad-project", version: 1, base: { version: 1, counter: 0, parts: [], relations: [], steps: [] }, commands: cmds, cursor: cmds.length }))!;
  assert.equal(g.length, 30);
  assert.deepEqual(g[2]!.box, { min: [35, -5, 0], max: [45, 5, 7] });
});
