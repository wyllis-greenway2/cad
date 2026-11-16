// The neutral toolpath (`dec_manufacturing_contract` points 6 and 8): an ordered list of moves that a machine profile turns into a file. Every route writes this and every preview draws it, so one overlay serves them all. Plain data.
import type { Point3 } from "./part.ts";

/** One move. Millimetres; `feed` in mm/min; `power` as a fraction of the machine's full power (0 to 1). */
export type Move =
  | { op: "travel"; to: Point3; feed?: number }
  | { op: "cut"; to: Point3; feed?: number; power?: number }
  | { op: "arc"; to: Point3; center: Point3; clockwise: boolean; feed?: number; power?: number }
  | { op: "extrude"; to: Point3; feed?: number; amount: number }
  | { op: "drill"; to: Point3; depth: number; feed?: number }
  | { op: "tool"; tool: string }
  | { op: "pause"; seconds: number };

/** A run of moves that belong together (one profile, one pocket, one layer). `layer` is the name the preview colours by and a file keeps (cut, score, engrave). */
export interface ToolpathOperation {
  id: string;
  label: string;
  layer: string;
  moves: Move[];
}

export interface Toolpath {
  units: "mm";
  operations: ToolpathOperation[];
  /** the raw material, drawn in the preview, if the route knows it */
  stock?: { min: Point3; max: Point3 };
  /** a time estimate in seconds, if the route can make one */
  seconds?: number;
}
