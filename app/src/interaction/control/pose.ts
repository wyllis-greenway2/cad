// An oriented mover stays as oriented while its part is selected (`in_439`): where the orb stands (kept as how far it is from the middle of the object, so it goes with the object when that moves) and the
// axes it was turned to. The move and the turn are two tools that each start their own operation: both take the pose from here, so the swapper between them does not lose it.
import type { Vec3 } from "../../math/vec.ts";
import { add, sub } from "../../math/vec.ts";
import { scene as sceneOf, selection as selectionOf } from "../session.ts";
import { moveCentre } from "../gizmo.ts";
import type { Op } from "../operations.ts";
import type { AppState } from "./state.ts";

const moves = (op: Op | null): op is Op => !!op && (op.kind === "move" || op.kind === "rotate") && (op.target === "body" || op.target === "plane");
const selectionKey = (s: AppState): string => selectionOf(s.session).join("|");

/** The pose of the operation's mover remembered for the selection (nothing when it is as it begins: no place of its own and no turned axes). */
export function storePose(s: AppState): AppState {
  const op = s.op;
  if (!moves(op)) return s;
  const c = moveCentre(sceneOf(s.session), op);
  if (!op.pivot && !op.frame) return { ...s, moverPose: null };
  const offset: Vec3 = op.pivot && c ? sub(op.pivot, c) : [0, 0, 0];
  return { ...s, moverPose: { key: selectionKey(s), offset, ...(op.frame ? { frame: op.frame } : {}) } };
}
/** The operation with the remembered pose, if it is for this selection and the operation has none of its own. */
export function withPose(s: AppState, op: Op | null): Op | null {
  const p = s.moverPose;
  if (!op || !moves(op) || !p || p.key !== selectionKey(s) || op.frame) return op; // (a turn begins with the middle of the body as its pivot: that is not a place of its own)
  const c = moveCentre(sceneOf(s.session), op);
  const turned = p.frame ? { frame: p.frame } : {};
  const moved = Math.hypot(...p.offset) > 1e-9 && c ? { pivot: add(c, p.offset) } : {};
  return { ...op, ...moved, ...turned };
}
/** The orient mode applied (the check, Enter, a right click, the sphere clicked again): the mover keeps its place and axes, and the mode is left; the selection is not touched. */
export function orientApply(s: AppState): AppState {
  return { ...storePose(s), moverSphere: false, moverWas: null };
}
