// What crosses between the engine's worker and the caller (E16, E17): plain data only. A body holds kernel objects and cannot cross, so the caller sees a snapshot of each step:
// its status, its faces with their ids and facts, its lines, its notes. Ids travel as text (`idKey`) with a readable label.
import type { Note } from "./lineage.ts";
import type { Status } from "./engine.ts";
import type { Step } from "./steps.ts";
import type { V3 } from "./kernel.ts";
import type { Change } from "./failure.ts";

export interface FaceSnap { id: string; label: string; alias: string[]; defect: boolean; type: string; area: number; ce: V3; ne: V3 }
export interface LineSnap { id: string; ends: [V3, V3] | null; from: "sketch" | "body" }
/** a body of the answer (E38, E42): its name, the ids of its faces, its volume */
export interface BodySnap { id: string; label: string; alias: string[]; faces: string[]; volume: number }
export interface StepSnap { id: string; kind: string; status: Status; fingerprint: string; output: "body" | "sketch" | "empty"; faces: FaceSnap[]; bodies: BodySnap[]; lines: LineSnap[]; notes: Note[] }
export interface Snapshot { steps: StepSnap[]; computes: number; ms: number; rssMb: number }

/** a question about the recipe the worker holds (E28, E35): answered on a copy, the recipe is not changed */
export type Ask = { what: "trial"; change: Change } | { what: "probe"; step: string; key: string; lo?: number; hi?: number } | { what: "options"; step: string } | { what: "probeParam"; name: string; lo?: number; hi?: number; focus?: string }
  /** the mesh of what a step made, by face id (E70); bodies: only these */ | { what: "mesh"; step: string; bodies?: string[]; tolerance?: number }
  /** a file of what a step made (E21, E71): the answer is `{ format, base64, bytes }` */ | { what: "export"; step: string; format: "step" | "stl"; bodies?: string[]; tolerance?: number; ascii?: boolean };
export type Request =
  | { id: number; type: "load" | "apply"; steps: Step[]; forced: Record<string, string>; /** the named numbers (E66) */ parameters?: Record<string, number | string> }
  | { id: number; type: "ask"; ask: Ask }
  | { id: number; type: "ping" };
export type Reply =
  | { type: "running"; step: string }
  | { type: "done"; id: number; snapshot: Snapshot }
  | { type: "answer"; id: number; data: unknown }
  | { type: "error"; id: number; message: string };
