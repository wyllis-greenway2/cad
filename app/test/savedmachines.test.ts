// Saved machines and settings (`in_571`, `dec_manufacturing_definitions` points 2 to 5, `in_546`): the user's library of machines kept between sessions, versions that never change under a project, the project's copy of the machine it
// used and its plan for the drawing (saved with the project), and a dialog that starts from them.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, saveText, openSession, undoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { emptyLibrary, saveMachine, removeMachine, parseLibrary, libraryText, whyBadMachine, slug, nextVersion } from "../src/interaction/library.ts";
import type { PersonalLibrary } from "../src/interaction/library.ts";
import { machineFrom, machineChoices, machineDialog, startValues, runLaser, recordCommands, projectMachines, planFor, laserDefaults, laserDialog, NEW_MACHINE, LASER_ROUTE } from "../src/interaction/manufacture.ts";
import type { LaserValues } from "../src/interaction/manufacture.ts";
import { flatSnapshot } from "../src/interaction/partsnapshot.ts";

await kernel.init();
const fields = { machineName: "Bench laser", bedWidth: 300, bedHeight: 200, powerMax: 255, rapid: 5000 };
const drawing = (): Session => {
  let s = createSession(kernel);
  s = run(s, drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]).command);
  return run(s, drawCircle(scene(s), worldRef("XY"), [10, 10, 0], 4).command);
};
const lib = (...names: string[]): PersonalLibrary => names.reduce((l, n) => { const r = saveMachine(l, machineFrom({ ...fields, machineName: n }, l.machines)); return r.ok ? r.value : l; }, emptyLibrary());

test("a machine is made from the dialog's fields: its id is its name, its version 1; unchanged it keeps its version, changed it gets the next", () => {
  const m1 = machineFrom(fields);
  assert.equal(m1.id, "bench-laser"); assert.equal(m1.version, 1); assert.equal(m1.process, "laser");
  assert.deepEqual(m1.envelope.max, [300, 200, 0]); assert.equal(m1.route.powerMax, 255); assert.equal(m1.limits.feed, 5000);
  assert.equal(machineFrom(fields, [m1]), m1, "nothing changed: the same machine, the same version");
  const m2 = machineFrom({ ...fields, bedWidth: 350 }, [m1]);
  assert.equal(m2.version, 2); assert.equal(m2.id, "bench-laser");
  assert.equal(machineFrom({ ...fields, bedWidth: 400 }, [m1, m2]).version, 3, "one more than the latest known");
  assert.equal(nextVersion("x"), 1);
  assert.equal(slug("  My Laser #2! "), "my-laser-2"); assert.equal(slug("***"), "machine");
});

test("the library keeps machines by id, replaces one with the same id, takes one out, and is read back from its text; a machine that is not valid is left out and counted", () => {
  let l = lib("Bench laser", "Garage laser");
  assert.deepEqual(l.machines.map((m) => m.id), ["bench-laser", "garage-laser"]);
  const bigger = machineFrom({ ...fields, bedWidth: 500 }, l.machines);
  const r = saveMachine(l, bigger);
  assert.ok(r.ok);
  if (r.ok) { l = r.value; assert.deepEqual(l.machines.map((m) => [m.id, m.version]), [["garage-laser", 1], ["bench-laser", 2]], "replaced, and now last"); }
  assert.deepEqual(removeMachine(l, "garage-laser").machines.map((m) => m.id), ["bench-laser"]);
  const back = parseLibrary(libraryText(l));
  assert.deepEqual(back.library, l); assert.equal(back.dropped, 0);
  const text = JSON.stringify({ format: "cad-library", version: 1, machines: [...l.machines, { kind: "machine", id: "bad", name: "", version: 1 }, 5] });
  assert.equal(parseLibrary(text).dropped, 2);
  assert.equal(parseLibrary(text).library.machines.length, 2);
  for (const bad of [null, undefined, "", "not json", "{}", JSON.stringify({ format: "other", machines: [] })]) assert.deepEqual(parseLibrary(bad), { library: emptyLibrary(), dropped: 0 });
});

test("a machine is checked before it is kept: a name, a work area, a rapid speed and a power scale above zero", () => {
  const ok = machineFrom(fields);
  assert.equal(whyBadMachine(ok), null);
  assert.match(whyBadMachine({ ...ok, name: " " })!, /needs a name/);
  assert.match(whyBadMachine({ ...ok, name: "x".repeat(61) })!, /needs a name/);
  assert.match(whyBadMachine({ ...ok, envelope: { min: [0, 0, 0], max: [0, 100, 0] } })!, /work area/);
  assert.match(whyBadMachine({ ...ok, limits: { feed: -1 } })!, /rapid speed/);
  assert.match(whyBadMachine({ ...ok, route: { powerMax: 0 } })!, /power scale/);
  assert.equal(saveMachine(emptyLibrary(), { ...ok, name: "" }).ok, false);
});

test("a run records the project's copy of the machine and the plan; they come back with the saved project and a new run replaces the plan", () => {
  const s0 = drawing();
  const values: LaserValues = { ...laserDefaults(), ...fields, kerf: 0.3, tabs: 2 };
  const r = runLaser(s0, values);
  assert.ok(r.ok);
  if (!r.ok) return;
  const s1 = run(s0, { type: "batch", commands: recordCommands(r.value) });
  assert.deepEqual(projectMachines(scene(s1)).map((m) => [m.id, m.version]), [["bench-laser", 1]]);
  const plan = planFor(scene(s1), r.value.part.id, LASER_ROUTE, "bench-laser")!;
  assert.equal(plan.machineVersion, 1); assert.equal(plan.settings.kerf, 0.3); assert.equal(plan.settings.tabs, 2);
  const back = openSession(kernel, saveText(s1));
  assert.ok(back.ok);
  if (back.ok) { assert.deepEqual(projectMachines(scene(back.value)).map((m) => m.name), ["Bench laser"]); assert.equal(planFor(scene(back.value), r.value.part.id, LASER_ROUTE)!.settings.kerf, 0.3); }
  const again = runLaser(s1, { ...values, kerf: 0.1 }, projectMachines(scene(s1)));
  assert.ok(again.ok);
  if (!again.ok) return;
  assert.equal(again.value.machine.version, 1, "the project's copy is the same: no new version");
  const s2 = run(s1, { type: "batch", commands: recordCommands(again.value) });
  assert.equal((scene(s2).manufacturing!.plans as unknown[]).length, 1, "the plan for the same part, route and machine is replaced");
  assert.equal(planFor(scene(s2), r.value.part.id, LASER_ROUTE)!.settings.kerf, 0.1);
  assert.equal(planFor(scene(undoLast(s2)), r.value.part.id, LASER_ROUTE)!.settings.kerf, 0.3, "one undo takes the latest record back");
  assert.equal(scene(drawing()).manufacturing, undefined, "a project that made nothing has no section");
});

test("the machines offered: the last plan's project copy first, then the library's, then a new one; a changed machine in the library does not touch the project's copy", () => {
  const s0 = drawing();
  const part = flatSnapshot(s0);
  assert.ok(part.ok);
  if (!part.ok) return;
  const l = lib("Garage laser");
  assert.deepEqual(machineChoices(scene(s0), l, part.value.id).map((c) => [c.from, c.label]), [["library", "Garage laser (version 1)"], ["new", "A new machine"]]);
  assert.deepEqual(machineChoices(scene(s0), emptyLibrary(), part.value.id).map((c) => c.id), [NEW_MACHINE]);
  const values: LaserValues = { ...laserDefaults(), ...fields };
  const r = runLaser(s0, values);
  assert.ok(r.ok);
  if (!r.ok) return;
  const s1 = run(s0, { type: "batch", commands: recordCommands(r.value) });
  const kept = saveMachine(l, r.value.machine);
  assert.ok(kept.ok);
  if (!kept.ok) return;
  const bigger = machineFrom({ ...fields, bedWidth: 999 }, kept.value.machines);
  const changed = saveMachine(kept.value, bigger);
  assert.ok(changed.ok);
  if (!changed.ok) return;
  const choices = machineChoices(scene(s1), changed.value, part.value.id);
  assert.equal(choices[0]!.from, "project");
  assert.equal(choices[0]!.machine!.envelope.max[0], 300, "the project's copy is version 1, as it was used");
  assert.match(choices[0]!.label, /Bench laser \(this project's copy, version 1\)/);
  assert.equal(choices.find((c) => c.id === "library:bench-laser")!.machine!.envelope.max[0], 999, "the library has the newer one");
});

test("the dialog starts from the chosen machine and the plan's settings for this drawing; else the last answers; else the defaults; settings the route lacks are dropped", () => {
  const s0 = drawing();
  const part = flatSnapshot(s0);
  assert.ok(part.ok);
  if (!part.ok) return;
  const fresh = startValues(scene(s0), part.value.id, null);
  assert.equal(fresh.machineName, "My laser"); assert.equal(fresh.kerf, 0.15); assert.equal(fresh.remember, true);
  const lastAnswers = startValues(scene(s0), part.value.id, null, { kerf: 0.4, cutSpeed: "fast", nozzle: 0.4 });
  assert.equal(lastAnswers.kerf, 0.4); assert.equal(lastAnswers.cutSpeed, 600, "a wrong kind of value gives the default"); assert.equal("nozzle" in lastAnswers, false);
  const machine = machineFrom(fields);
  const withMachine = startValues(scene(s0), part.value.id, { id: "library:bench-laser", label: "", machine, from: "library" }, { kerf: 0.4 });
  assert.equal(withMachine.machineName, "Bench laser"); assert.equal(withMachine.bedWidth, 300); assert.equal(withMachine.powerMax, 255); assert.equal(withMachine.rapid, 5000);
  const values: LaserValues = { ...laserDefaults(), ...fields, kerf: 0.25, cutPasses: 3 };
  const r = runLaser(s0, values);
  assert.ok(r.ok);
  if (!r.ok) return;
  const s1 = run(s0, { type: "batch", commands: recordCommands(r.value) });
  const fromPlan = startValues(scene(s1), part.value.id, { id: "library:bench-laser", label: "", machine, from: "library" }, { kerf: 0.4 });
  assert.equal(fromPlan.kerf, 0.25, "the plan for this drawing and machine wins over the last answers"); assert.equal(fromPlan.cutPasses, 3);
  const other = startValues(scene(s1), part.value.id, { id: "library:garage", label: "", machine: machineFrom({ ...fields, machineName: "Garage" }), from: "library" }, { kerf: 0.4 });
  assert.equal(other.kerf, 0.4, "another machine has no plan for this drawing yet: the last answers");
});

test("the machine dialog offers the choices, and taking a machine out only for one in the library; a run needs a valid machine", () => {
  const l = lib("Garage laser");
  const choices = machineChoices(scene(drawing()), l, "sketch/w/XY");
  const d = machineDialog(choices, { machine: "library:garage-laser", remove: false });
  assert.deepEqual(d.fields.map((f) => f.id), ["machine", "remove"]); assert.equal(d.ok, "Next");
  assert.equal(machineDialog(choices, { machine: "library:garage-laser", remove: true }).ok, "Take it out");
  assert.deepEqual(machineDialog(choices, { machine: NEW_MACHINE, remove: false }).fields.map((f) => f.id), ["machine"]);
  assert.equal(laserDialog({ ...laserDefaults(), ...fields }).fields[0]!.value, "Bench laser");
  const bad = runLaser(drawing(), { ...laserDefaults(), machineName: "  " });
  assert.deepEqual(bad, { ok: false, error: "a machine needs a name of up to 60 letters" });
  const wide = runLaser(drawing(), { ...laserDefaults(), bedWidth: 1e999 as number });
  assert.equal(wide.ok, true, "a number that is not finite is taken as the usual");
});
