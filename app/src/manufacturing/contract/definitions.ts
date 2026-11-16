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
