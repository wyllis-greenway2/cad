// What crosses between the engine's worker and the caller (E16, E17): plain data only. A body holds kernel objects and cannot cross, so the caller sees a snapshot of each step:
// its status, its faces with their ids and facts, its lines, its notes. Ids travel as text (`idKey`) with a readable label.
import type { Note } from "./lineage.ts";
import type { Status } from "./engine.ts";
import type { Step } from "./steps.ts";
import type { V3 } from "./kernel.ts";

export interface FaceSnap { id: string; label: string; alias: string[]; defect: boolean; type: string; area: number; ce: V3; ne: V3 }
export interface LineSnap { id: string; ends: [V3, V3] | null; from: "sketch" | "body" }
export interface StepSnap { id: string; kind: string; status: Status; fingerprint: string; output: "body" | "sketch" | "empty"; faces: FaceSnap[]; lines: LineSnap[]; notes: Note[] }
export interface Snapshot { steps: StepSnap[]; computes: number; ms: number; rssMb: number }

export type Request =
  | { id: number; type: "load" | "apply"; steps: Step[]; forced: Record<string, string> }
  | { id: number; type: "ping" };
export type Reply =
  | { type: "running"; step: string }
  | { type: "done"; id: number; snapshot: Snapshot }
  | { type: "error"; id: number; message: string };
