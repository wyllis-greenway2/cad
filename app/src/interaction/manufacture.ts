// Making things with a machine from the app (`in_569`, `in_571`, `dec_manufacturing_contract`, `dec_manufacturing_definitions`): the registry of routes the app holds, the machines (the user's own library and the copies a project keeps),
// the dialogs (made from a route's own schema, so every route gets one the same way), and running a route on the drawing to a file. The G-code dialect is a **generic starting point, not an official one** (`dec_manufacturing_definitions`
// point 10: official ones come from a cited source): plain GRBL-style words. Pure: dialogs are descriptions, answers are values, a run gives bytes and commands.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { createRegistry, runRoute, builtInRoutes, defaultSettings } from "../manufacturing/index.ts";
import type { Route, MachineDefinition, DialectDefinition, RouteRun, OutputFile, Finding, ParamSpec, PartSnapshot, ManufacturingPlan } from "../manufacturing/index.ts";
import { CONTRACT_VERSION } from "../manufacturing/index.ts";
import type { Command } from "../operation/commands.ts";
import type { Scene } from "../operation/scene.ts";
import type { Dialog, Field, FieldValue } from "./transfer.ts";
import type { Session } from "./session.ts";
import { flatSnapshot } from "./partsnapshot.ts";
import type { PersonalLibrary } from "./library.ts";
import { whyBadMachine, slug, nextVersion, NAME_MAX } from "./library.ts";

/** The registry the app holds: the routes that come with it. */
export const registry = createRegistry();
for (const r of builtInRoutes) registry.register(r);

export const LASER_ROUTE = "laser-outline";
const provenance = { author: "the app (a generic starting point)", date: "2026-11-16", licence: "CC0", origin: "user" as const, trust: "user" as const, source: "plain G-code words as GRBL-style controllers read them; not checked against a manual" };
const userProvenance = { author: "the user", date: "", licence: "personal", origin: "user" as const, trust: "user" as const };

/** Plain GRBL-style words: G21 G90, G0 G1 G2 G3, M4 S for a beam at a power, M5 off. Unchecked: the dialog says to read the first lines against the controller's manual. */
const genericDialect = (powerMax: number): DialectDefinition => ({
  kind: "dialect", id: "generic-grbl-style", version: 1, name: "Generic GRBL-style", provenance, extension: "nc", decimals: 3, comment: { open: "(", close: ")" }, lineNumbers: false,
  start: ["G21", "G90"], end: ["M5", "M2"], words: { rapid: "G0", linear: "G1", arcCw: "G2", arcCcw: "G3" }, dwell: "G4 P{sec}", power: { on: "M4 S{s}", off: "M5", max: powerMax, offOnTravel: true },
});

// ---------- machines ----------
const MACHINE_DEFAULTS = { machineName: "My laser", bedWidth: 400, bedHeight: 400, powerMax: 1000, rapid: 6000 };
export interface MachineFields { machineName: string; bedWidth: number; bedHeight: number; powerMax: number; rapid: number }

/** A laser machine from the fields of the dialog. Its id is its name as an id; its version is the library's (or the project's) latest of that id, or one more when something about it changed. */
export function machineFrom(f: MachineFields, known: readonly MachineDefinition[] = []): MachineDefinition {
  const id = slug(f.machineName);
  const base: MachineDefinition = {
    kind: "machine", id, version: 1, name: f.machineName.trim(), provenance: { ...userProvenance, date: new Date().toISOString().slice(0, 10) }, process: "laser",
    envelope: { min: [0, 0, 0], max: [f.bedWidth, f.bedHeight, 0] }, origin: "front-left", kinematics: "cartesian", limits: { feed: f.rapid },
    capabilities: { axes: 2, rotary: false, arcs: true, toolChange: "none", coolant: false, probe: false }, dialect: "generic-grbl-style", route: { powerMax: f.powerMax },
  };
  const same = (m: MachineDefinition): boolean => m.name === base.name && m.envelope.max[0] === f.bedWidth && m.envelope.max[1] === f.bedHeight && m.limits.feed === f.rapid && m.route.powerMax === f.powerMax;
  const latest = known.filter((m) => m.id === id).sort((a, b) => b.version - a.version)[0];
  if (latest && same(latest)) return latest; // (nothing changed: the same version, and the project's copy of it is the same copy)
  return { ...base, version: nextVersion(id, ...known) };
}
const fieldsOf = (m: MachineDefinition): MachineFields => ({ machineName: m.name, bedWidth: m.envelope.max[0] - m.envelope.min[0], bedHeight: m.envelope.max[1] - m.envelope.min[1], powerMax: Number(m.route.powerMax), rapid: m.limits.feed });

const keyOf = (m: MachineDefinition): string => `machine/${m.id}@${m.version}`;
/** The machines the project keeps a copy of. */
export function projectMachines(scene: Scene): MachineDefinition[] {
  return Object.entries(scene.manufacturing?.definitions ?? {}).filter(([k, v]) => k.startsWith("machine/") && !whyBadMachine(v as MachineDefinition)).map(([, v]) => v as MachineDefinition);
}
/** The plan last made for this part and route (and machine, when given): the newest is last. */
export function planFor(scene: Scene, part: string, route: string, machine?: string): ManufacturingPlan | undefined {
  const plans = (scene.manufacturing?.plans ?? []) as ManufacturingPlan[];
  return [...plans].reverse().find((p) => p.part === part && p.route === route && (!machine || p.machine === machine));
}

export const NEW_MACHINE = "new";
export interface MachineChoice { id: string; label: string; machine: MachineDefinition | null; /** from the project's copy, or the user's library */ from: "project" | "library" | "new" }
/** The machines to choose from: the one the last plan for this part used (the project's copy of that version first), then the user's, then a new one. */
export function machineChoices(scene: Scene, lib: PersonalLibrary, part: string): MachineChoice[] {
  const out: MachineChoice[] = [];
  const last = planFor(scene, part, LASER_ROUTE);
  const mine = projectMachines(scene);
  const copy = last ? mine.find((m) => m.id === last.machine && m.version === (last.machineVersion ?? m.version)) : undefined;
  if (copy) out.push({ id: `project:${keyOf(copy)}`, label: `${copy.name} (this project's copy, version ${copy.version})`, machine: copy, from: "project" });
  for (const m of lib.machines) out.push({ id: `library:${m.id}`, label: `${m.name} (version ${m.version})`, machine: m, from: "library" });
  out.push({ id: NEW_MACHINE, label: "A new machine", machine: null, from: "new" });
  return out;
}
/** The first question: which machine, and whether to take a machine of the library out instead. */
export function machineDialog(choices: readonly MachineChoice[], values: { machine: string; remove: boolean }): Dialog {
  const chosen = choices.find((c) => c.id === values.machine);
  return {
    title: "Which machine",
    ok: values.remove ? "Take it out" : "Next",
    fields: [
      { id: "machine", label: "Machine", type: "choice", choices: choices.map((c) => ({ value: c.id, label: c.label })), value: values.machine },
      ...(chosen?.from === "library" ? [{ id: "remove", label: "Take this machine out of my library", type: "check" as const, value: values.remove, note: "Take this machine out of my library instead of cutting. Projects that used it keep their copy." }] : []),
    ],
  };
}

// ---------- the laser dialog ----------
/** One field of a dialog from one setting of a route: the schema is the whole description. */
function fieldOf(p: ParamSpec, value: FieldValue): Field {
  const label = p.unit && p.kind === "number" ? `${p.label} (${p.unit})` : p.label;
  const note = p.help;
  if (p.kind === "boolean") return { id: p.id, label: p.label, type: "check", value: !!value, ...(note ? { note } : { note: p.label }) };
  if (p.kind === "choice") return { id: p.id, label, type: "choice", choices: p.choices!, value, ...(note ? { note } : {}) };
  return { id: p.id, label, type: p.kind === "number" ? "number" : "text", value, ...(note ? { note } : {}) };
}
export type LaserValues = Record<string, FieldValue>;
const num = (v: LaserValues, id: string, d: number): number => (typeof v[id] === "number" && Number.isFinite(v[id]) ? (v[id] as number) : d);
const machineFieldsOf = (v: LaserValues): MachineFields => ({ machineName: String(v.machineName ?? MACHINE_DEFAULTS.machineName).trim(), bedWidth: Math.max(1, num(v, "bedWidth", MACHINE_DEFAULTS.bedWidth)), bedHeight: Math.max(1, num(v, "bedHeight", MACHINE_DEFAULTS.bedHeight)), powerMax: Math.max(1, num(v, "powerMax", MACHINE_DEFAULTS.powerMax)), rapid: Math.max(1, num(v, "rapid", MACHINE_DEFAULTS.rapid)) });

/**
 * What the laser dialog starts with: the chosen machine's fields (a new one: the usual), and the settings from the last plan for this part, route and machine, else the last answers the page kept, else each setting's default.
 * A setting the route no longer has is left out; one it has and the saved answers lack gets its default.
 */
export function startValues(scene: Scene, part: string, choice: MachineChoice | null, last: LaserValues = {}): LaserValues {
  const route = registry.get(LASER_ROUTE)!;
  const machine = choice?.machine ?? null;
  const plan = machine ? planFor(scene, part, LASER_ROUTE, machine.id) : undefined;
  const saved = plan?.settings ?? last;
  const settings = Object.fromEntries(route.params.map((p) => [p.id, typeof saved[p.id] === typeof p.default ? saved[p.id]! : p.default]));
  return { ...(machine ? fieldsOf(machine) : MACHINE_DEFAULTS), ...settings, remember: true };
}
export const laserDefaults = (): LaserValues => ({ ...MACHINE_DEFAULTS, ...defaultSettings(registry.get(LASER_ROUTE)!), remember: true });

/** The laser dialog: the machine's name, work area, power scale and rapid speed, then every setting the route declares, then whether to keep the machine. */
export function laserDialog(values: LaserValues): Dialog {
  const route = registry.get(LASER_ROUTE)!;
  return {
    title: "Laser cut",
    ok: "Make the file",
    fields: [
      { id: "machineName", label: "Machine name", type: "text", value: values.machineName ?? MACHINE_DEFAULTS.machineName, note: `Up to ${NAME_MAX} letters. A machine kept under a name is offered the next time, here and in other drawings; a changed one becomes the next version.` },
      { id: "bedWidth", label: "Work area width (mm)", type: "number", value: values.bedWidth ?? MACHINE_DEFAULTS.bedWidth, note: "Your machine's travel in x. The drawing is checked against it." },
      { id: "bedHeight", label: "Work area height (mm)", type: "number", value: values.bedHeight ?? MACHINE_DEFAULTS.bedHeight },
      { id: "powerMax", label: "Power scale (S)", type: "number", value: values.powerMax ?? MACHINE_DEFAULTS.powerMax, note: "The number your controller takes for full power (1000 for GRBL's usual setting). The file is plain GRBL-style G-code: read its first lines against your controller's manual before the first cut." },
      { id: "rapid", label: "Rapid speed (mm/min)", type: "number", value: values.rapid ?? MACHINE_DEFAULTS.rapid, note: "How fast the head travels with the beam off (used for the time estimate)." },
      ...route.params.map((p) => fieldOf(p, values[p.id] ?? p.default)),
      { id: "remember", label: "Keep this machine", type: "check", value: values.remember !== false, note: "Keep this machine" },
    ],
  };
}

export interface LaserRun { run: RouteRun; file: OutputFile | null; machine: MachineDefinition; part: PartSnapshot; summary: string }
const minutes = (s: number): string => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 6) / 10} min`);

/** Run the laser route on the drawing the selection stands for (or all that is drawn): the file, the findings and a line saying what was made. `known` are the machines already kept (the library's and the project's), so a machine that has not changed keeps its version. */
export function runLaser(session: Session, values: LaserValues, known: readonly MachineDefinition[] = []): Result<LaserRun> {
  const part = flatSnapshot(session);
  if (!part.ok) return err(part.error);
  const route = registry.get(LASER_ROUTE) as Route;
  const f = machineFieldsOf(values);
  if (!f.machineName) return err(`a machine needs a name of up to ${NAME_MAX} letters`);
  const machine = machineFrom(f, known);
  const why = whyBadMachine(machine);
  if (why) return err(why);
  const settings = Object.fromEntries(route.params.map((p) => [p.id, values[p.id] ?? p.default]));
  const ran = runRoute(route, part.value, { machine, settings }, genericDialect(Number(machine.route.powerMax)));
  const run: RouteRun = { ...ran, findings: [...ran.findings, ...ran.warnings.map((message, i): Finding => ({ id: `emit:${i}`, severity: "caution", message, refs: [] }))] }; // (what the file writer could not write is shown with the rest)
  const file = run.files[0] ?? null;
  const cuts = run.toolpath?.operations.map((o) => `${o.moves.filter((m) => m.op === "cut" || m.op === "arc").length} ${o.label.toLowerCase()} moves`).join(", ") ?? "nothing planned";
  return ok({ run, file, machine, part: part.value, summary: `${file?.name ?? "no file"}: ${cuts}${run.toolpath?.seconds ? `, about ${minutes(run.toolpath.seconds)}` : ""} on ${machine.name}` });
}

/** What the project keeps of a run (`dec_manufacturing_definitions` point 4, `in_546`): a copy of the machine used, by its version, and the plan (part, route, machine and settings), which a later dialog for the same part starts from. */
export function recordCommands(result: LaserRun, values: LaserValues): Command[] {
  const route = registry.get(LASER_ROUTE)!;
  const plan: ManufacturingPlan = {
    contract: CONTRACT_VERSION, id: `${result.part.id}|${LASER_ROUTE}|${result.machine.id}`, part: result.part.id, route: LASER_ROUTE, machine: result.machine.id, machineVersion: result.machine.version,
    settings: Object.fromEntries(route.params.map((p) => [p.id, values[p.id] ?? p.default])),
  };
  return [{ type: "useDefinition", key: keyOf(result.machine), value: result.machine }, { type: "setPlan", plan }];
}

/** The findings of a run as a dialog to read before the file is saved (the file is saved only on OK). */
export function findingsDialog(findings: readonly Finding[], summary: string): Dialog {
  const rank = { warning: 0, caution: 1, info: 2 } as const;
  const sorted = [...findings].sort((a, b) => rank[a.severity] - rank[b.severity]);
  return {
    title: "Before you cut",
    ok: "Save the file",
    fields: [
      { id: "summary", label: "The file", type: "text", readonly: true, value: summary },
      ...sorted.map((f, i): Field => ({ id: `f${i}`, label: f.severity === "warning" ? "Warning" : f.severity === "caution" ? "Note" : "For your information", type: "text", readonly: true, value: f.message })),
    ],
  };
}
