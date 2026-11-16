// Making things with a machine from the app (`in_569`, `dec_manufacturing_contract`): the registry of routes the app holds, the dialog that asks a route's settings (made from the route's own schema, so every route gets one the same
// way), and running a route on the drawing to a file. The machine and the G-code dialect are **generic starting points, not official ones** (`dec_manufacturing_definitions` point 10: official ones come from a cited source): a
// work area the user types, and plain GRBL-style words. Pure: dialogs are descriptions, answers are values, a run gives bytes.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { createRegistry, runRoute, builtInRoutes, defaultSettings } from "../manufacturing/index.ts";
import type { Route, MachineDefinition, DialectDefinition, RouteRun, OutputFile, Finding, ParamSpec } from "../manufacturing/index.ts";
import type { Dialog, Field, FieldValue } from "./transfer.ts";
import type { Session } from "./session.ts";
import { flatSnapshot } from "./partsnapshot.ts";

/** The registry the app holds: the routes that come with it. */
export const registry = createRegistry();
for (const r of builtInRoutes) registry.register(r);

export const LASER_ROUTE = "laser-outline";
const provenance = { author: "the app (a generic starting point)", date: "2026-11-16", licence: "CC0", origin: "user" as const, trust: "user" as const, source: "plain G-code words as GRBL-style controllers read them; not checked against a manual" };

/** Plain GRBL-style words: G21 G90, G0 G1 G2 G3, M4 S for a beam at a power, M5 off. Unchecked: the dialog says to read the first lines against the controller's manual. */
const genericDialect = (powerMax: number): DialectDefinition => ({
  kind: "dialect", id: "generic-grbl-style", version: 1, name: "Generic GRBL-style", provenance, extension: "nc", decimals: 3, comment: { open: "(", close: ")" }, lineNumbers: false,
  start: ["G21", "G90"], end: ["M5", "M2"], words: { rapid: "G0", linear: "G1", arcCw: "G2", arcCcw: "G3" }, dwell: "G4 P{sec}", power: { on: "M4 S{s}", off: "M5", max: powerMax, offOnTravel: true },
});
const genericLaser = (width: number, height: number): MachineDefinition => ({
  kind: "machine", id: "generic-laser", version: 1, name: "Generic laser", provenance, process: "laser", envelope: { min: [0, 0, 0], max: [width, height, 0] }, origin: "front-left", kinematics: "cartesian",
  limits: { feed: 6000 }, capabilities: { axes: 2, rotary: false, arcs: true, toolChange: "none", coolant: false, probe: false }, dialect: "generic-grbl-style", route: {},
});

/** One field of a dialog from one setting of a route: the schema is the whole description. */
function fieldOf(p: ParamSpec, value: FieldValue): Field {
  const label = p.unit && p.kind === "number" ? `${p.label} (${p.unit})` : p.label;
  const note = p.help;
  if (p.kind === "boolean") return { id: p.id, label: p.label, type: "check", value: !!value, ...(note ? { note } : { note: p.label }) };
  if (p.kind === "choice") return { id: p.id, label, type: "choice", choices: p.choices!, value, ...(note ? { note } : {}) };
  return { id: p.id, label, type: p.kind === "number" ? "number" : "text", value, ...(note ? { note } : {}) };
}
const MACHINE_DEFAULTS = { bedWidth: 400, bedHeight: 400, powerMax: 1000 };
export type LaserValues = Record<string, FieldValue>;
export const laserDefaults = (): LaserValues => ({ ...MACHINE_DEFAULTS, ...defaultSettings(registry.get(LASER_ROUTE)!) });

/** The laser dialog: the machine's work area and power scale, then every setting the route declares. */
export function laserDialog(values: LaserValues): Dialog {
  const route = registry.get(LASER_ROUTE)!;
  return {
    title: "Laser cut",
    ok: "Make the file",
    fields: [
      { id: "bedWidth", label: "Work area width (mm)", type: "number", value: values.bedWidth ?? MACHINE_DEFAULTS.bedWidth, note: "Your machine's travel in x. The drawing is checked against it. This is a general laser until machines can be set up and saved." },
      { id: "bedHeight", label: "Work area height (mm)", type: "number", value: values.bedHeight ?? MACHINE_DEFAULTS.bedHeight },
      { id: "powerMax", label: "Power scale (S)", type: "number", value: values.powerMax ?? MACHINE_DEFAULTS.powerMax, note: "The number your controller takes for full power (1000 for GRBL's usual setting). The file is plain GRBL-style G-code: read its first lines against your controller's manual before the first cut." },
      ...route.params.map((p) => fieldOf(p, values[p.id] ?? p.default)),
    ],
  };
}

export interface LaserRun { run: RouteRun; file: OutputFile | null; machine: MachineDefinition; summary: string }
const minutes = (s: number): string => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 6) / 10} min`);

/** Run the laser route on the drawing the selection stands for (or all that is drawn): the file, the findings and a line saying what was made. */
export function runLaser(session: Session, values: LaserValues): Result<LaserRun> {
  const part = flatSnapshot(session);
  if (!part.ok) return err(part.error);
  const route = registry.get(LASER_ROUTE) as Route;
  const num = (id: string, d: number): number => (typeof values[id] === "number" && Number.isFinite(values[id]) ? (values[id] as number) : d);
  const machine = genericLaser(Math.max(1, num("bedWidth", 400)), Math.max(1, num("bedHeight", 400)));
  const settings = Object.fromEntries(route.params.map((p) => [p.id, values[p.id] ?? p.default]));
  const ran = runRoute(route, part.value, { machine, settings }, genericDialect(Math.max(1, num("powerMax", 1000))));
  const run: RouteRun = { ...ran, findings: [...ran.findings, ...ran.warnings.map((message, i): Finding => ({ id: `emit:${i}`, severity: "caution", message, refs: [] }))] }; // (what the file writer could not write is shown with the rest)
  const file = run.files[0] ?? null;
  const cuts = run.toolpath?.operations.map((o) => `${o.moves.filter((m) => m.op === "cut" || m.op === "arc").length} ${o.label.toLowerCase()} moves`).join(", ") ?? "nothing planned";
  return ok({ run, file, machine, summary: `${file?.name ?? "no file"}: ${cuts}${run.toolpath?.seconds ? `, about ${minutes(run.toolpath.seconds)}` : ""}` });
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
