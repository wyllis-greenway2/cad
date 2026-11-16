// A route (`dec_manufacturing_contract` points 3, 4 and 7): a module for one process. It declares itself to a registry and implements the stages that are its own, Fit, Check and Plan; a part goes through
// those and then Emit, and a route may stop at any of them (print readiness stops at Check). **Emit is not a route's:** writing a toolpath as a file depends on the machine's dialect, not on the process,
// so it is shared code (`manufacturing/core`, `in_566`, `in_567`) and every route gets it. A route never edits the model and never imports the app, the kernel or the UI (`inv_manufacturing_boundary`).
import type { PartKind, PartSnapshot } from "./part.ts";
import type { ParamSpec, ParamValue } from "./params.ts";
import type { Finding } from "./findings.ts";
import type { Toolpath } from "./toolpath.ts";
import type { DefinitionKind, MachineDefinition, MaterialDefinition } from "./definitions.ts";

/** Settings as the user has them: the route's schema ids to values. */
export type Settings = Record<string, ParamValue>;

/** What a stage is told besides the part: the machine and material of the plan, and its settings. */
export interface RouteContext {
  machine: MachineDefinition;
  material?: MaterialDefinition;
  settings: Settings;
}

/** Whether a route suits a part: `fits` is about the kind and size, `reasons` says why not (shown, never enforced). */
export interface FitReport {
  fits: boolean;
  reasons: string[];
}

/** A file to save: the bytes and a name. */
export interface OutputFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
}

/** What the shared Emit stage gives back: the files, and what it could not do (a move the machine's dialect has no word for): shown, never a stop (`in_546`). */
export interface EmitResult {
  files: OutputFile[];
  warnings: string[];
}

/** One route. Only `id`, `name`, `process`, `family`, `accepts`, `uses` and `params` are required: a stage a route does not have is simply missing. Every stage is a pure function of its arguments. There is no `emit`: it is shared. */
export interface Route {
  /** the contract version this route was written for (`CONTRACT_VERSION`) */
  contract: number;
  id: string;
  name: string;
  /** the machine process it is for (`MachineDefinition.process`): "laser", "waterjet", "milling"... */
  process: string;
  /** a toolpath route writes machine instructions; a derivation route makes new parts (`dec_manufacturing_contract` point 2) */
  family: "toolpath" | "derivation";
  accepts: PartKind[];
  /** which definition kinds the route reads (a laser reads machine and material and settings, not tools) */
  uses: DefinitionKind[];
  /** the route's settings, from which the settings screen is made */
  params: ParamSpec[];
  /** `ctx` may be missing: listing the routes a part could take happens before a machine is chosen */
  fit?(part: PartSnapshot, ctx?: RouteContext): FitReport;
  check?(part: PartSnapshot, ctx: RouteContext): Finding[];
  plan?(part: PartSnapshot, ctx: RouteContext): Toolpath;
}

/** A plan (`in_546`): one per part and machine, in the project's `manufacturing` section, never inside the model graph. The part is a body's stable name; in practice a manufacturing version (`dec_manufacturing_version`). */
export interface ManufacturingPlan {
  contract: number;
  id: string;
  part: string;
  route: string;
  /** ids of the machine and the material, found in the project copy first (`dec_manufacturing_definitions` point 4) */
  machine: string;
  material?: string;
  settings: Settings;
}

/** A route as offered for a part: the route's id and name, and whether and why it fits. */
export interface RouteOffer {
  route: string;
  name: string;
  process: string;
  fit: FitReport;
}

/** What running a route on a part gives back (`dec_manufacturing_contract` point 4): everything the stages said, the toolpath if the route plans one, the files if a dialect was given. A stage that fails is a finding, not a crash. */
export interface RouteRun {
  route: string;
  fit: FitReport;
  findings: Finding[];
  toolpath?: Toolpath;
  files: OutputFile[];
  /** what the shared Emit stage could not write */
  warnings: string[];
}
