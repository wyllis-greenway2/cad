// The options of the open operation (`in_546`, `q_ui_unification`): the choices that sit in the operation bar (what a push / pull of a face does, how a fillet's size runs, how a loft is joined), in one list, and Tab and
// Shift+Tab stepping through the ones that are a choice between ways (not the ones that are switches). A step chooses the option, so it needs no aiming: it works in game mode, with the keyboard alone, and on a phone with the bar's own buttons.
import type { AppState } from "./control/state.ts";
import type { Intent } from "../shared/input.ts";
import { scene as sceneOf } from "./session.ts";
import { chamferFaces } from "./operations.ts";
import { loftChips } from "./loft.ts";

export interface FaceKind { id: "move" | "extrude" | "extend"; label: string; title: string; on: boolean }
export interface SizeKind { id: "constant" | "variable" | "twoDistances" | "swap"; label: string; title: string; on: boolean }
/** One option of the bar: its group's name, what pressing it sends, and whether it is a way among ways (`radio`: Tab steps to it) or a switch or an action. */
export interface Option { group: string; id: string; label: string; title: string; on: boolean; radio: boolean; /** the one Tab last stepped to */ focus: boolean; intent: Intent }

const FACE_KINDS: { id: "move" | "extrude" | "extend"; label: string; title: string }[] = [
  { id: "move", label: "Move", title: "Move the face by changing the step that made it: the height of what is attached grows or shrinks" },
  { id: "extrude", label: "Extrude", title: "Add (or take) a prism of the face's outline: a square growing out of the face" },
  { id: "extend", label: "Extend", title: "Move the face and carry the faces next to it on until they meet: a chamfered top grows into a pyramid, and past the top nothing more happens" },
];
/** The choice of what a push / pull of one flat face does (`in_405`): only for a flat face (a round wall, a fillet or chamfer face and several faces have their own meaning). */
export function faceKinds(s: AppState): FaceKind[] | null {
  const op = s.op;
  if (!op || op.kind !== "pushpull" || op.curved || op.rounded || op.roundAxis) return null;
  // several flat faces: each is pushed along its own normal by the same amount, as a prism (extrude) or extended with its neighbours (extend); there is no step to move for any of them (`in_410`)
  if ((op.faces?.length ?? 0) > 1) return FACE_KINDS.filter((k) => k.id !== "move").map((k) => ({ ...k, on: (op.faceKind ?? "extrude") === k.id }));
  if (op.parts.length !== 1) return null;
  return FACE_KINDS.map((k) => ({ ...k, on: (op.faceKind ?? "move") === k.id }));
}
/** The choice between a fillet or chamfer that is the same size all along its edges and one with a size at each end of each edge (`in_406`, `in_410`): not for a rim, which has no ends. */
export function sizeKinds(s: AppState): SizeKind[] | null {
  const op = s.op;
  if (!op || op.kind !== "edge" || !op.vary) return null;
  const on = !!op.variable;
  const faces = chamferFaces(sceneOf(s.session), op); // (always offered, like Variable: it makes the operation a chamfer whatever way the arrow is pulled)
  return [
    { id: "constant", label: "Constant", title: "The same size all along the edge", on: !on && !op.twoDist },
    { id: "variable", label: "Variable", title: "A size at the start of the edge (the end shown in amber) and a size at its other end (Tab goes between them); the round grows or shrinks along the edge", on },
    ...(faces.length ? [{ id: "twoDistances" as const, label: "Two distances", title: "A chamfer with a distance along each face: the first along the face that is lit, the second along the other (Tab goes between them)", on: !!op.twoDist }] : []),
    ...(faces.length > 1 && op.twoDist ? [{ id: "swap" as const, label: "Swap faces", title: "Measure the first distance along the other face", on: false }] : []),
  ];
}

/** The ways the choices run, for the Tab stepping: in the loft the first four (smooth or ruled, along the normal or straight) are choices between ways, the rest are switches. */
const LOFT_RADIO = new Set(["smooth", "ruled", "normal", "straight"]);

/** Every option of the bar for the state, in order (empty when the operation has none). */
export function optionsOf(s: AppState): Option[] {
  const op = s.op;
  if (!op) return [];
  const at = op.optionAt ?? -1;
  let list: Omit<Option, "focus">[] = [];
  const face = faceKinds(s);
  const size = sizeKinds(s);
  if (face) list = face.map((k) => ({ group: "Face", id: k.id, label: k.label, title: k.title, on: k.on, radio: true, intent: { type: "faceKind", kind: k.id } }));
  else if (size) list = size.map((k) => ({ group: "Size", id: k.id, label: k.label, title: k.title, on: k.on, radio: k.id !== "swap", intent: { type: "sizeKind", kind: k.id } }));
  else if (op.kind === "loft") list = loftChips(sceneOf(s.session), op).map((k) => ({ group: "Loft", id: k.id, label: k.label, title: k.title, on: k.on, radio: LOFT_RADIO.has(k.id), intent: { type: "loftKind", id: k.id } }));
  let r = -1;
  return list.map((o) => ({ ...o, focus: o.radio && ++r === at }));
}

/** The option Tab (`dir` 1) or Shift+Tab (-1) steps to: where the last step stood (else the one that is on), the next choice between ways, round to the first. Null when there are fewer than two. */
export function stepOption(s: AppState, dir: 1 | -1): { index: number; intent: Intent } | null {
  const radios = optionsOf(s).filter((o) => o.radio);
  if (radios.length < 2) return null;
  const now = s.op?.optionAt ?? Math.max(0, radios.findIndex((o) => o.on));
  const index = (now + dir + radios.length) % radios.length;
  return { index, intent: radios[index]!.intent };
}
