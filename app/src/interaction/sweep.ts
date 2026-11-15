// A sweep (`dec_sweep`, `in_444`): a closed figure carried along a path of lines and arcs drawn anywhere, ending in a body. This file reads the path from what is selected and makes the step; the kernel
// makes the body (`sweep` in `interpreter.mjs`).
import type { Scene } from "../operation/scene.ts";
import { nextId, figureParams, lookup } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import type { Command } from "../operation/commands.ts";
import { walkPath } from "../operation/path.ts";
import { normalOfPlane } from "../operation/part.ts";
import type { Op } from "./operations.ts";

/** The step of a sweep: the shape is the step's figure, the path is the lines it follows (named, so it follows a later edit of them). */
export function sweepCommand(scene: Scene, op: Op): Command | null {
  if (!op.sweepFig || !op.sweepLines?.length) return null;
  return { type: "addStep", step: { id: nextId(scene, "s"), type: "sweep", parts: op.sweepFig.outer, params: { ...figureParams([op.sweepFig]), path: op.sweepLines.join(",") } } };
}


/** The corner the shape is carried from, to show as a dot: the end of the path that is on the shape's plane (the far end when both are, as the kernel takes it). */
export function sweepStart(scene: Scene, op: Op): Ref[] {
  if (!op.sweepFig || !op.sweepLines) return [];
  const get = lookup(scene);
  const walked = walkPath(get, op.sweepLines);
  const first = get(op.sweepFig.outer[0]!);
  const plane = first && "plane" in first && first.plane ? get(first.plane) : undefined;
  if (!walked.ok || !plane || plane.kind !== "plane") return [];
  const n = normalOfPlane(plane);
  const off = (q: readonly number[]): number => Math.abs((q[0]! - plane.at[0]) * n[0] + (q[1]! - plane.at[1]) * n[1] + (q[2]! - plane.at[2]) * n[2]);
  const [head, tail] = [walked.sides[0]!, walked.sides.at(-1)!];
  if (off(head.a) <= 1e-3) return [head.from];
  return off(tail.b) <= 1e-3 ? [tail.to] : [];
}
