// The person's laser table (`in_573`, `dec_manufacturing_definitions`): rows of numbers (kerf, power, speed, passes) for a material at a thickness, on a machine or any, kept from the person's own tests. None come with the app.
// A row chosen in the laser dialog takes the place of the numbers in it; "save these numbers as material" keeps the dialog's numbers as a row; a row for the same material, thickness and machine is replaced.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { emptyLibrary, saveMachine, saveSettings, removeSettings, removeMachine, parseLibrary, libraryText, whyBadSettings, sameRow, materialKey } from "../src/interaction/library.ts";
import type { PersonalLibrary } from "../src/interaction/library.ts";
import { laserDefaults, laserDialog, machineFrom, tableRows, rowLabel, rowFrom, tableDialog, runLaser, recordCommands, TABLE_KEYS, NO_ROW, planFor, LASER_ROUTE } from "../src/interaction/manufacture.ts";
import type { LaserValues } from "../src/interaction/manufacture.ts";
import { fabricateRows } from "../src/interaction/appmenu.ts";
import type { SettingsDefinition } from "../src/manufacturing/index.ts";

await kernel.init();
const machine = machineFrom({ machineName: "Bench laser", bedWidth: 300, bedHeight: 200, powerMax: 1000, rapid: 5000 });
const plate = (): Session => { const s = createSession(kernel); return run(s, drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]).command); };
const base = (over: Partial<LaserValues> = {}): LaserValues => ({ ...laserDefaults(), machineName: "Bench laser", bedWidth: 300, bedHeight: 200, kerf: 0.2, cutPower: 70, cutSpeed: 450, cutPasses: 2, scorePower: 15, scoreSpeed: 1200, ...over });
const row = (v: LaserValues, lib: PersonalLibrary = emptyLibrary()): SettingsDefinition => { const r = rowFrom(v, machine, lib.settings); assert.ok(r.ok && r.value); return (r as { ok: true; value: SettingsDefinition }).value; };

test("a row is made from the dialog's numbers under a material and thickness; nothing is made when no material is named; the machine-only box decides whether the machine is in it", () => {
  assert.deepEqual(rowFrom(base(), machine, []), { ok: true, value: null });
  const only = row(base({ saveMaterial: "  Birch   plywood ", saveThickness: 3, saveNote: "scorched a little at 100 %" }));
  assert.equal(only.material, "Birch   plywood", "the material as the person wrote it (trimmed at the ends)");
  assert.equal(only.thickness, 3); assert.equal(only.machine, "bench-laser"); assert.equal(only.route, LASER_ROUTE);
  assert.deepEqual(only.values, { kerf: 0.2, cutPower: 70, cutSpeed: 450, cutPasses: 2, scorePower: 15, scoreSpeed: 1200, engravePower: 10, engraveSpeed: 3000 });
  assert.equal(only.note, "scorched a little at 100 %");
  assert.equal(only.provenance.origin, "measured"); assert.equal(only.provenance.trust, "user");
  assert.equal(only.version, 1);
  assert.deepEqual(Object.keys(only.values).sort(), [...TABLE_KEYS].sort());
  const any = row(base({ saveMaterial: "Birch plywood", saveThickness: 3, saveForMachine: false }));
  assert.equal(any.machine, undefined);
  assert.notEqual(any.id, only.id);
  const bad = rowFrom(base({ saveMaterial: "Acrylic", saveThickness: Number.NaN }), machine, []);
  assert.equal(bad.ok, false);
  assert.equal(rowFrom(base({ saveMaterial: "x".repeat(61), saveThickness: 3 }), machine, []).ok, false);
});

test("the same material (any case, any spaces), thickness (within 0.05 mm) and machine is the same row and replaces it with the next version; another thickness or machine is another row", () => {
  assert.equal(materialKey("  Birch   PLYWOOD "), "birch plywood");
  let lib = emptyLibrary();
  const a = row(base({ saveMaterial: "Birch plywood", saveThickness: 3 }), lib);
  const s1 = saveSettings(lib, a);
  assert.ok(s1.ok);
  if (!s1.ok) return;
  lib = s1.value;
  const b = row(base({ saveMaterial: "BIRCH   plywood", saveThickness: 3.04, cutPower: 85 }), lib);
  assert.equal(b.id, a.id, "the same row"); assert.equal(b.version, 2);
  assert.ok(sameRow(a, b));
  const s2 = saveSettings(lib, b);
  assert.ok(s2.ok);
  if (!s2.ok) return;
  assert.equal(s2.value.settings.length, 1); assert.equal(s2.value.settings[0]!.values.cutPower, 85);
  const c = row(base({ saveMaterial: "Birch plywood", saveThickness: 6 }), s2.value);
  assert.equal(c.version, 1); assert.ok(!sameRow(a, c), "another thickness");
  const s3 = saveSettings(s2.value, c);
  assert.ok(s3.ok);
  if (s3.ok) { assert.equal(s3.value.settings.length, 2); assert.deepEqual(removeSettings(s3.value, a.id).settings.map((d) => d.thickness), [6]); }
});

test("a row is checked before it is kept; the library keeps rows with its text, drops invalid ones and counts them, reads an older library without rows, and keeps rows when a machine is saved or taken out", () => {
  const good = row(base({ saveMaterial: "Acrylic", saveThickness: 3 }));
  assert.equal(whyBadSettings(good), null);
  assert.match(whyBadSettings({ ...good, material: " " })!, /needs a name/);
  assert.match(whyBadSettings({ ...good, thickness: -1 })!, /thickness/);
  assert.match(whyBadSettings({ ...good, values: {} })!, /no numbers/);
  assert.match(whyBadSettings({ ...good, values: { cutPower: Infinity } })!, /not a number/);
  const lib = saveSettings(emptyLibrary(), good);
  assert.ok(lib.ok);
  if (!lib.ok) return;
  const back = parseLibrary(libraryText(lib.value));
  assert.deepEqual(back.library, lib.value); assert.equal(back.dropped, 0);
  const text = JSON.stringify({ format: "cad-library", version: 1, machines: [], settings: [good, { kind: "settings", material: "", thickness: 1, route: "x", values: { a: 1 }, id: "z", version: 1 }, 7] });
  assert.deepEqual([parseLibrary(text).library.settings.length, parseLibrary(text).dropped], [1, 2]);
  assert.deepEqual(parseLibrary(JSON.stringify({ format: "cad-library", version: 1, machines: [] })).library, emptyLibrary(), "a library made before the table has none");
  const withMachine = saveMachine(lib.value, machine);
  assert.ok(withMachine.ok);
  if (withMachine.ok) { assert.equal(withMachine.value.settings.length, 1); assert.equal(removeMachine(withMachine.value, machine.id).settings.length, 1); }
  assert.equal(libraryText(emptyLibrary()).includes("settings"), false, "an empty table is not written");
});

test("the rows offered for a machine are those for any machine and for it, for the laser route, by material then thickness; each is a line to choose by", () => {
  const mk = (m: string, t: number, machineId?: string, route = LASER_ROUTE, v: Record<string, number> = { cutPower: 80, cutSpeed: 400, cutPasses: 1 }): SettingsDefinition => ({ kind: "settings", id: `${m}${t}${machineId ?? ""}`, version: 1, name: m, route, material: m, thickness: t, ...(machineId ? { machine: machineId } : {}), values: v, provenance: { author: "u", date: "2026-11-16", licence: "personal", origin: "measured", trust: "user" } });
  const rows = [mk("Plywood", 6), mk("Acrylic", 3), mk("Plywood", 3, "bench-laser"), mk("Plywood", 3, "garage"), mk("Foam", 5, undefined, "milling")];
  assert.deepEqual(tableRows(rows, "bench-laser").map((d) => `${d.material} ${d.thickness}`), ["Acrylic 3", "Plywood 3", "Plywood 6"]);
  assert.deepEqual(tableRows(rows, "").map((d) => d.id), ["Acrylic3", "Plywood6"], "with no machine chosen only the rows for any");
  assert.equal(rowLabel(mk("Plywood", 3, "bench-laser", LASER_ROUTE, { cutPower: 80, cutSpeed: 400, cutPasses: 2, scorePower: 15, scoreSpeed: 900 })), "Plywood 3 mm: cut 80 % at 400 mm/min, 2 passes; score 15 % at 900 (this machine)");
  assert.equal(rowLabel(mk("Leather", 0)), "Leather: cut 80 % at 400 mm/min");
});

test("a row chosen in the dialog takes the place of its numbers in the run: the file, the plan and a finding say so", () => {
  const r0 = row(base({ saveMaterial: "Plywood", saveThickness: 3, cutPower: 40, cutSpeed: 300, cutPasses: 1, kerf: 0 }));
  const withRow = runLaser(plate(), { ...base({ cutPower: 100, cutSpeed: 999, kerf: 0.5 }), tableRow: r0.id }, [machine], [r0]);
  assert.ok(withRow.ok);
  if (!withRow.ok) return;
  const file = new TextDecoder().decode(withRow.value.file!.bytes);
  assert.match(file, /M4 S400/, "forty per cent of a scale of 1000");
  assert.match(file, /F300/);
  assert.doesNotMatch(file, /F999/);
  assert.equal(withRow.value.values.cutPower, 40); assert.equal(withRow.value.values.kerf, 0);
  assert.ok(withRow.value.run.findings.some((f) => f.severity === "info" && /^Using your table: Plywood 3 mm: cut 40 % at 300 mm\/min/.test(f.message)));
  const s1 = run(plate(), { type: "batch", commands: recordCommands(withRow.value) });
  assert.equal(planFor(scene(s1), withRow.value.part.id, LASER_ROUTE)!.settings.cutPower, 40, "the plan keeps the numbers that were used");
  const without = runLaser(plate(), { ...base({ cutPower: 100, cutSpeed: 999, kerf: 0 }), tableRow: NO_ROW }, [machine], [r0]);
  assert.ok(without.ok);
  if (without.ok) { assert.match(new TextDecoder().decode(without.value.file!.bytes), /M4 S1000/); assert.ok(!without.value.run.findings.some((f) => f.id === "table")); }
  const unknown = runLaser(plate(), { ...base(), tableRow: "gone" }, [machine], [r0]);
  assert.ok(unknown.ok, "a row that is not there is simply not used");
});

test("the dialog offers the table only when it has rows for the machine, and always the way to keep numbers as a row", () => {
  const none = laserDialog(base());
  assert.equal(none.fields.some((f) => f.id === "tableRow"), false);
  for (const id of ["saveMaterial", "saveThickness", "saveNote", "saveForMachine"]) assert.ok(none.fields.some((f) => f.id === id), id);
  const r0 = row(base({ saveMaterial: "Plywood", saveThickness: 3 }));
  const some = laserDialog(base(), [r0]);
  const f = some.fields.find((x) => x.id === "tableRow")!;
  assert.deepEqual(f.choices!.map((c) => c.value), [NO_ROW, r0.id]);
  assert.equal(f.choices![0]!.label, "The numbers above");
  assert.ok(some.fields.findIndex((x) => x.id === "tableRow") < some.fields.findIndex((x) => x.id === "saveMaterial"));
});

test("the table dialog lists the rows and takes one out; the ⋯ menu shows Laser table… only when there are rows", () => {
  const r0 = row(base({ saveMaterial: "Plywood", saveThickness: 3 }));
  const d = tableDialog([r0], { row: r0.id, remove: false });
  assert.equal(d.title, "Your laser table"); assert.equal(d.ok, "Done");
  assert.equal(tableDialog([r0], { row: r0.id, remove: true }).ok, "Take it out");
  assert.deepEqual(d.fields[0]!.choices!.map((c) => c.value), [r0.id]);
  const rows = (can: boolean) => fabricateRows({ laserTable: can }).filter((x) => x.id === "laserTable");
  assert.deepEqual(rows(true).map((x) => [x.label, x.enabled]), [["Laser table…", true]]);
  assert.deepEqual(rows(false), []);
});
