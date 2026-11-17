// The number system (`in_661`, `dec_settings_page`): the model is millimetres whatever is shown; what is typed and shown for a length is in the system in use, angles and counts are not.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { units, lengthText, lengthIn, lengthOut, typedLength, unitName } from "../src/shared/units.ts";
import { valueOf } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { inUnits } from "../src/interaction/entry.ts";
import type { Entry } from "../src/interaction/entry.ts";
import { patternValues } from "../src/interaction/pattern.ts";

afterEach(() => { units.system = "mm"; });
const op = (o: Partial<Op>): Op => ({ kind: "pushpull", parts: [], typed: "", value: null, axis: 0, rot: ["", "", ""], pat: [], ...o }) as unknown as Op;

test("millimetres are as they were; inches convert both ways and name themselves", () => {
  assert.equal(lengthText(25.4), "25.4"); assert.equal(typedLength("2"), 2); assert.equal(unitName("mm"), "mm");
  units.system = "in";
  assert.equal(lengthText(25.4), "1"); assert.equal(lengthText(3), "0.1181");
  assert.equal(lengthIn(2), 50.8); assert.equal(lengthOut(50.8), 2);
  assert.equal(typedLength("1"), 25.4); assert.equal(typedLength("-"), null); assert.equal(typedLength(""), null);
  assert.equal(unitName("mm"), "in"); assert.equal(unitName("deg"), "deg"); assert.equal(unitName("°"), "°");
});

test("a length typed for an operation is in the system in use; an angle or a factor is not", () => {
  units.system = "in";
  assert.equal(valueOf(op({ kind: "pushpull", typed: "1" })), 25.4);
  assert.equal(valueOf(op({ kind: "edge", typed: "0.5" })), 12.7);
  assert.equal(valueOf(op({ kind: "rotate", typed: "90" })), 90, "degrees stay degrees");
  assert.equal(valueOf(op({ kind: "scale", typed: "2" })), 2, "a factor is a factor");
  units.system = "mm";
  assert.equal(valueOf(op({ kind: "pushpull", typed: "1" })), 1);
});

test("only the distance of a linear repeat is a length, not its counts or a circular repeat's degrees", () => {
  units.system = "in";
  const lin = op({ kind: "linear", patStart: [2, 10, 1, 10, 1, 10], pat: ["3", "1", "", "", "", ""] });
  assert.deepEqual(patternValues(lin), [3, 25.4, 1, 10, 1, 10]);
  const circ = op({ kind: "circular", patStart: [4, 360, 0, 0, 0, 0], pat: ["6", "90", "", "", "", ""] });
  assert.deepEqual(patternValues(circ).slice(0, 2), [6, 90]);
});

test("a bubble shows the model's length in inches with the unit's name, and leaves what was typed and the degrees as they are", () => {
  const e: Entry = { unit: "mm", fields: [{ label: "A", value: "25.4", active: true, typed: false }, { label: "B", value: "2", active: false, typed: true }, { label: "C", value: "90", active: false, typed: false, unit: "°" }, { label: "D", value: "-", active: false, typed: false }] };
  assert.equal(inUnits(e), e, "millimetres: the same entry");
  units.system = "in";
  const o = inUnits(e);
  assert.deepEqual(o.fields.map((f) => f.value), ["1", "2", "90", "-"]);
  assert.deepEqual([o.unit, o.fields[0]!.unit, o.fields[2]!.unit], ["in", "in", "°"]);
  assert.equal(e.fields[0]!.value, "25.4", "the original is not changed");
});

import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { panelOf } from "../src/interaction/panels.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { worldRef } from "../src/shared/ref.ts";
import { nextId } from "../src/operation/scene.ts";
await kernel.init();
test("the history says a step's length in the number system in use", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 25.4 } } });
  const label = () => panelOf("history", scene(s), [], {})!.rows.map((x) => x.label).join("|");
  assert.match(label(), /Extrude 25\.4 mm/);
  units.system = "in";
  assert.match(label(), /Extrude 1 in/);
});

import { areaText } from "../src/shared/units.ts";
import { appRows } from "../src/interaction/appmenu.ts";
import { importDialog } from "../src/interaction/transfer.ts";
import { IMPORT_DEFAULTS } from "../src/interaction/importfile.ts";
import { createState, reduce } from "../src/interaction/controller.ts";

test("areas, the Clearance row and its steps and an STL's units follow the number system (`in_677`)", () => {
  assert.equal(areaText(645.16), "645.16"); // millimetres: as it was
  units.system = "in";
  assert.equal(areaText(645.16), "1");
  assert.equal(unitName("mm²"), "in²");
  assert.equal(appRows("", {}, false, 0.254).find((r) => r.id === "hard:clearance")!.label, "Clearance 0.01");
  const stl = importDialog("a.stl", { ...IMPORT_DEFAULTS }).fields.find((f) => f.id === "units")!;
  assert.equal(stl.value, "in", "an STL's units start from the number system");
  let st = createState(createSession(kernel));
  const seen: number[] = [];
  for (let i = 0; i < 6; i++) { st = reduce(st, { type: "runAction", id: "hard:clearance" }, { w: 800, h: 600, now: 0 } as never); seen.push(scene(st.session).clearance ?? 0); }
  assert.deepEqual(seen.map((v) => Math.round((v / 25.4) * 1e4) / 1e4), [0.005, 0.01, 0.015, 0.02, 0.04, 0], "a few small values in inches, round to nothing");
  units.system = "mm";
  st = reduce(createState(createSession(kernel)), { type: "runAction", id: "hard:clearance" }, { w: 800, h: 600, now: 0 } as never);
  assert.equal(scene(st.session).clearance, 0.1, "millimetres: as before");
});
