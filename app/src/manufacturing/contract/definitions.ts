// Machines, materials and tools as data (`dec_manufacturing_definitions`): versioned, with provenance, looked up in three layers (project copy, personal library, public library). Plain data; a route asks a machine for capabilities, never for its name.
import type { Point3 } from "./part.ts";
import type { ParamValue } from "./params.ts";

export type DefinitionKind = "machine" | "material" | "tool" | "settings" | "dialect";

/** Where a definition comes from (`in_557`: only we make `official` ones, users add `user` ones). `source` names the datasheet or chart a number came from. */
export interface Provenance {
  author: string;
  date: string;
  licence: string;
  origin: "datasheet" | "measured" | "user";
  trust: "official" | "user";
  source?: string;
}

/** What every definition has. `extends` names the definition it starts from and overrides; fields not known to this version are kept, not dropped. */
export interface DefinitionHeader {
  kind: DefinitionKind;
  id: string;
  /** whole number; a change makes a new version, an old one never changes under a project */
  version: number;
  name: string;
  extends?: string;
  provenance: Provenance;
}

/** What a machine can do, asked for by a route in place of the machine's name. */
export interface Capabilities {
  /** number of linear axes and whether there are rotary ones */
  axes: number;
  rotary: boolean;
  arcs: boolean;
  toolChange: "none" | "manual" | "automatic";
  coolant: boolean;
  probe: boolean;
}

export interface MachineDefinition extends DefinitionHeader {
  kind: "machine";
  /** the process it is for: the id of a route family such as "laser", "waterjet", "milling", "fdm" */
  process: string;
  envelope: { min: Point3; max: Point3 };
  /** where zero is: a corner or the middle, as the machine's controller has it */
  origin: "front-left" | "front-right" | "back-left" | "back-right" | "center";
  kinematics: "cartesian" | "corexy" | "delta" | "other";
  limits: { feed: number; acceleration?: number };
  capabilities: Capabilities;
  /** the name of a dialect template (`dialect` definition) that writes its file */
  dialect: string;
  /** how far a finished feature may stray, in mm: the allowance a printed fit or a cut needs */
  tolerance?: number;
  /** the fields only this route knows (nozzle, spindle, laser power...), described by the route's schema */
  route: Record<string, ParamValue>;
}

/**
 * A row of a settings table (`in_573`, `dec_manufacturing_definitions`): the numbers of a route that work for a material at a thickness, on a machine or on any. For a laser: power and speed and passes to cut, to score and to engrave, and the kerf.
 * The numbers come from someone's own tests (`provenance.origin` "measured"); none come with the app (`in_558`: official ones need a cited source).
 */
export interface SettingsDefinition extends DefinitionHeader {
  kind: "settings";
  /** the route these numbers are for (its id) */
  route: string;
  /** the material's name, as the person wrote it; matched without regard to case or extra spaces */
  material: string;
  /** mm; 0 for a thing with no thickness that matters (an engraving on a surface) */
  thickness: number;
  /** a machine's id: these numbers are for that machine only; absent: any machine */
  machine?: string;
  /** the route's settings, by their ids (a number or a choice) */
  values: Record<string, ParamValue>;
  /** a line of the person's own: what they used, what it did */
  note?: string;
}

/** A hazard of working a material one way (`in_558`): a short note and the source it came from. Guidance only; the material's own safety data sheet and the machine's manual come first. */
export interface Hazard {
  /** the process it is about: a route family id */
  process: string;
  level: "avoid" | "care";
  note: string;
  source: string;
}

export interface MaterialDefinition extends DefinitionHeader {
  kind: "material";
  /** kg per cubic metre */
  density?: number;
  /** how much a part shrinks while it cools or sets, as a fraction (0.02 is two per cent), for the manufacturing version's scale */
  shrinkage?: number;
  hazards: Hazard[];
  /** the fields only a route knows */
  route: Record<string, ParamValue>;
}

export interface ToolDefinition extends DefinitionHeader {
  kind: "tool";
  /** "flat", "ball", "bull", "vbit", "drill", "nozzle", "beam"... : a route's own word */
  type: string;
  /** mm */
  diameter: number;
  route: Record<string, ParamValue>;
}

/**
 * How a machine's controller wants its file (`dec_manufacturing_contract` point 4, `in_567`): data, not code, so one writer (`core/gcode.ts`) serves every route and a machine we never heard of needs only a new
 * dialect. `start` and `end` are written as they are (the escape hatch: homing, heating, anything). In a template `{s}` is the power as the controller's number, `{tool}` the tool, `{sec}` and `{ms}` a pause.
 */
export interface DialectDefinition extends DefinitionHeader {
  kind: "dialect";
  /** the file's ending, without the dot */
  extension: string;
  /** digits after the point */
  decimals: number;
  /** how a comment is written: `;` or `(` and `)` */
  comment: { open: string; close?: string };
  lineNumbers: boolean;
  start: string[];
  end: string[];
  words: { rapid: string; linear: string; arcCw: string; arcCcw: string };
  /** a pause, as a line, for example `G4 P{sec}`; none: the writer says it cannot */
  dwell?: string;
  /** a tool change, for example `M6 T{tool}`; none: the writer leaves a comment */
  toolChange?: string;
  /** power for a beam (a laser, a plasma torch): the line that turns it on at a power, the line that turns it off, the controller's full scale, and whether it goes off for every travel move */
  power?: { on: string; off: string; max: number; offOnTravel: boolean };
  /** an extruder: the axis word, and whether its numbers add up (absolute) or each move says how much (relative) */
  extrude?: { axis: string; absolute: boolean };
}
