// The options of the open operation (`in_557`, `dec_ui_unification`): the choices that sit in the operation bar (what a push / pull of a face does, how a fillet's size runs, how a loft is joined), in one list, and Tab and
// Shift+Tab stepping through the ones that are a choice between ways (not the ones that are switches). A step chooses the option, so it needs no aiming: it works in game mode, with the keyboard alone, and on a phone with the bar's own buttons.
import type { AppState } from "./control/state.ts";
import type { Intent } from "../shared/input.ts";
import { scene as sceneOf, selection as selectionOf } from "./session.ts";
import { cutParts } from "./cut.ts";
import { SIMILAR_RULES } from "./similar.ts";
import type { SimilarRule } from "./similar.ts";
import { chamferFaces } from "./operations.ts";
import { loftChips } from "./loft.ts";

export interface FaceKind { id: "move" | "extrude" | "extend"; label: string; title: string; on: boolean }
export interface SizeKind { id: "constant" | "variable" | "twoDistances" | "swap"; label: string; title: string; on: boolean }
/** One option of the bar: its group's name, what pressing it sends, and whether it is a way among ways (`radio`: Tab steps to it) or a switch or an action. */
export interface Option { group: string; id: string; label: string; title: string; on: boolean; radio: boolean; /** pressing it does something once, it is not on or off (swap the faces) */ action?: true; /** the one Tab last stepped to */ focus: boolean; intent: Intent }

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

/** The ways the choices run: in the loft the first four (smooth or ruled, along the normal or straight) are choices between ways (Tab chooses one by landing on it), the rest are switches (Tab lands on them, Shift+Enter flips one). */
const LOFT_RADIO = new Set(["smooth", "ruled", "normal", "straight"]);

/** The rules of the last Select similar while the selection is still what it selected (`in_257`): a switch each. */
export function similarOf(s: AppState): { rules: { id: SimilarRule; label: string; title: string; on: boolean }[]; count: number; noun: string } | null {
  const sim = s.similar;
  if (!sim) return null;
  const sel = selectionOf(s.session);
  if (sel.length !== sim.refs.length || !sim.refs.every((r) => sel.includes(r))) return null;
  return { rules: SIMILAR_RULES.map((r) => ({ ...r, on: sim.rules.includes(r.id) })), count: sim.refs.length, noun: sim.noun };
}

/** Every option of the bar for the state, in order (empty when what is open has none): an operation's, a Cut's (each part kept or tossed, and joined or separate), a Select similar's rules (`in_563`). */
export function optionsOf(s: AppState): Option[] {
  const op = s.op;
  let list: Omit<Option, "focus">[] = [];
  if (op) {
    const face = faceKinds(s);
    const size = sizeKinds(s);
    if (face) list = face.map((k) => ({ group: "Face", id: k.id, label: k.label, title: k.title, on: k.on, radio: true, intent: { type: "faceKind", kind: k.id } }));
    else if (size) list = size.map((k) => ({ group: "Size", id: k.id, label: k.label, title: k.title, on: k.on, radio: k.id !== "swap", ...(k.id === "swap" ? { action: true as const } : {}), intent: { type: "sizeKind", kind: k.id } }));
    else if (op.kind === "loft") list = loftChips(sceneOf(s.session), op).map((k) => ({ group: "Loft", id: k.id, label: k.label, title: k.title, on: k.on, radio: LOFT_RADIO.has(k.id), intent: { type: "loftKind", id: k.id } }));
  } else if (s.cut && !s.tool && !s.repeat && !s.picking) {
    const parts = cutParts(sceneOf(s.session), s.cut);
    list = [
      ...parts.map((p) => ({ group: "Cut", id: `cut:${p.mask}`, label: `${p.label} ${p.kept ? "kept" : "tossed"}`, title: p.tip, on: p.kept, radio: false, intent: { type: "cut", act: "toggle", mask: p.mask } as Intent })),
      ...(parts.length ? [{ group: "Cut", id: "cut:join", label: s.cut.join ? "Joined" : "Separate", title: "Kept parts that touch become one body, or stay as the separate bodies they are", on: s.cut.join, radio: false, intent: { type: "cut", act: "join" } as Intent }] : []),
    ];
  } else if (!s.tool && !s.repeat && !s.picking) {
    const sim = similarOf(s);
    if (sim) list = sim.rules.map((r) => ({ group: "Similar", id: r.id, label: r.label, title: r.title, on: r.on, radio: false, intent: { type: "similarRule", rule: r.id } }));
  }
  const sig = list.map((o) => o.id).join(",");
  const at = s.optionAt && s.optionAt.sig === sig ? s.optionAt.index : -1; // (a place kept for another set of options is not this one's)
  return list.map((o, i) => ({ ...o, focus: i === at }));
}

/** Tab (`dir` 1) or Shift+Tab (-1): the option the focus goes to, round; choosing it when it is a choice between ways, only lighting it when it is a switch. Null when there are fewer than two options. */
export function stepOption(s: AppState, dir: 1 | -1): { optionAt: NonNullable<AppState["optionAt"]>; intent: Intent | null } | null {
  const all = optionsOf(s);
  if (all.length < 2) return null;
  const focus = all.findIndex((o) => o.focus);
  const now = focus >= 0 ? focus : all.some((o) => o.radio) ? all.findIndex((o) => o.radio && o.on) : -1; // (from the one that is on, as a first Tab goes to the next)
  const index = (now + dir + all.length) % all.length;
  const o = all[index]!;
  return { optionAt: { index, sig: all.map((q) => q.id).join(",") }, intent: o.radio ? o.intent : null };
}

/** Shift+Enter: what the option the focus is on does when it is a switch or an action (the choices between ways are chosen as the focus lands). Null when there is no such option. */
export function activateOption(s: AppState): Intent | null {
  const o = optionsOf(s).find((q) => q.focus);
  return o && !o.radio ? o.intent : null;
}
