// What crosses between the engine's worker and the caller (E16, E17): plain data only. A body holds kernel objects and cannot cross, so the caller sees a snapshot of each step:
// its status, its faces with their ids and facts, its lines, its notes. Ids travel as text (`idKey`) with a readable label.
import type { Ask } from "./asks.ts";
import type { Status } from "./engine.ts";
import type { V3 } from "./kernel.ts";
import type { Note } from "./lineage.ts";
import type { Step } from "./steps.ts";

export interface FaceSnap {
  id: string;
  label: string;
  alias: string[];
  defect: boolean;
  type: string;
  area: number;
  ce: V3;
  ne: V3;
}
export interface LineSnap {
  id: string;
  ends: [V3, V3] | null;
  from: "sketch" | "body";
}
/** a body of the answer (E38, E42): its name, the ids of its faces, its volume */
export interface BodySnap {
  id: string;
  label: string;
  alias: string[];
  faces: string[];
  volume: number;
}
export interface StepSnap {
  id: string;
  kind: string;
  status: Status;
  fingerprint: string;
  output: "body" | "sketch" | "empty";
  faces: FaceSnap[];
  bodies: BodySnap[];
  lines: LineSnap[];
  notes: Note[];
}
export interface Snapshot {
  steps: StepSnap[];
  /** the step that made the model as it is now (`Engine.current`): what a new body is joined to; null: no body */
  current: string | null;
  computes: number;
  ms: number;
  rssMb: number;
}

/** a question about the recipe the worker holds (E28, E35): answered on a copy, the recipe is not changed; the questions are the table in `asks.ts` */
export type { Ask } from "./asks.ts";
export type Request =
  | {
      id: number;
      type: "load" | "apply";
      steps: Step[];
      forced: Record<string, string>;
      /** the named numbers (E66) */ parameters?: Record<string, number | string>;
    }
  | { id: number; type: "ask"; ask: Ask }
  | { id: number; type: "ping" };
export type Reply =
  | { type: "running"; step: string }
  | { type: "done"; id: number; snapshot: Snapshot }
  | { type: "answer"; id: number; data: unknown }
  | { type: "error"; id: number; message: string };
