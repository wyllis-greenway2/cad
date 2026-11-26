// The tools, as data (`dec_three_surfaces`, `in_1598`, `in_1599`): every item of the circle menu is one of these, and the framework treats all of them the same way. A tool is a list of NEEDS, what must be picked (in order, with the sentence that asks for it),
// and what it is (`kind`: how the page runs it). A constraint is a tool whose needs come from the relation table, so the constraints in the menu need no code of their own. New tools are new entries; nothing here draws anything. Pure.
import { RANGEABLE, RELATIONS, kindOf, type Relation, type System } from "../engine/solver.ts";
import { fits, kindTuples } from "../engine/relations.ts";
import { iconOf } from "./bubbles.ts";

export type Pick = "place" | "region" | "face" | "edge" | "body" | "part" | "line" | "circle" | "point";
export interface Need { pick: Pick; ask: string; many?: boolean }
export type Group = "sketch" | "model" | "constraint";
/** how the page runs a tool: `draw` (a figure of clicks, repeats), `extrude` (a click in a closed shape opens it), `plane` (a sketch plane placed, once), `face` (what is picked on a body), `move` (a body moved and turned by the mover orb), `constraint` (a relation on what is selected, repeats) */
export type ToolKind = "draw" | "extrude" | "plane" | "face" | "move" | "constraint";
export interface ToolSpec { id: string; icon: string; label: string; group: Group; kind: ToolKind; /** the first need at index 0; a draw tool's step is how many places are down */ needs: readonly Need[]; /** the draw tool's kind, the body action (`body:pull`), or the relation */ arg: string }

const place = (ask: string): Need => ({ pick: "place", ask });
const FIXED: ToolSpec[] = [
  { id: "line", icon: "line", label: "Line", group: "sketch", kind: "draw", arg: "line", needs: [place("Click where the line starts"), place("Click where it ends")] },
  { id: "rect", icon: "rect", label: "Rectangle", group: "sketch", kind: "draw", arg: "rect", needs: [place("Click the first corner"), place("Click the opposite corner (or type the width and height)")] },
  { id: "circle", icon: "circle", label: "Circle", group: "sketch", kind: "draw", arg: "circle", needs: [place("Click the centre"), place("Click a point on the circle (or type the diameter)")] },
  { id: "arc", icon: "arc", label: "Arc (centre, start, end)", group: "sketch", kind: "draw", arg: "arc", needs: [place("Click the centre"), place("Click where the arc starts"), place("Click where it ends")] },
  { id: "trim", icon: "scissors", label: "Trim", group: "sketch", kind: "draw", arg: "trim", needs: [{ pick: "part", ask: "Click the part of a line, arc or circle to trim" }] },
  { id: "extrude", icon: "pushpull", label: "Extrude", group: "model", kind: "extrude", arg: "extrude", needs: [{ pick: "region", ask: "Click a closed shape to extrude" }] },
  { id: "pull", icon: "pushpull", label: "Push / pull a face", group: "model", kind: "face", arg: "body:pull", needs: [{ pick: "face", ask: "Select the face to push or pull" }] },
  { id: "round", icon: "round", label: "Round edges", group: "model", kind: "face", arg: "body:round", needs: [{ pick: "edge", ask: "Select the edges to round", many: true }] },
  { id: "chamfer", icon: "chamfer", label: "Chamfer edges", group: "model", kind: "face", arg: "body:chamfer", needs: [{ pick: "edge", ask: "Select the edges to chamfer", many: true }] },
  { id: "move", icon: "moveFace", label: "Move / turn a body", group: "model", kind: "move", arg: "body:move", needs: [{ pick: "body", ask: "Select the body to move or turn" }] },
  { id: "sketch-face", icon: "sketch", label: "Sketch on a face", group: "model", kind: "face", arg: "body:sketch", needs: [{ pick: "face", ask: "Select the face to sketch on" }] },
  { id: "sketch-plane", icon: "sheetPlain", label: "Sketch plane", group: "model", kind: "plane", arg: "plane", needs: [] },
];
const WORD: Record<string, string> = { point: "a point", line: "a line", circle: "a circle" };
/** every relation that is not a number is a tool (a number is on the info bar: `dec_dimensions_measure_then_lock`) */
const CONSTRAINTS: ToolSpec[] = (Object.keys(RELATIONS) as Relation[]).filter((r) => !RANGEABLE.has(r)).map((r) => ({
  id: `rel:${r}`, icon: iconOf(r), label: RELATIONS[r].label.replace(/^./, (c) => c.toUpperCase()), group: "constraint" as const, kind: "constraint" as const, arg: r,
  needs: (kindTuples(r)[0] ?? []).map((k) => ({ pick: k, ask: `Select ${WORD[k] ?? k}` })),
}));
export const TOOLS: readonly ToolSpec[] = [...FIXED, ...CONSTRAINTS];
export const toolOf = (id: string): ToolSpec | undefined => TOOLS.find((t) => t.id === id);
export const GROUPS: { id: Group; label: string; icon: string }[] = [{ id: "sketch", label: "Sketch", icon: "sketch" }, { id: "model", label: "Model", icon: "pushpull" }, { id: "constraint", label: "Constraints", icon: "equal" }];

/** how what is selected stands against a constraint: `met` (the relation fits it), `partial` (it is the start of what the relation takes), `bad` (it cannot become that) */
export type Status = "met" | "partial" | "bad";
export function constraintStatus(rel: Relation, kinds: readonly string[]): Status {
  if (kinds.length && (fits(rel, kinds) || (kinds.length === 2 && fits(rel, [kinds[1]!, kinds[0]!])))) return "met";
  if (!kinds.length) return "partial";
  const tuples = kindTuples(rel);
  return tuples.some((t) => t.length > kinds.length && kinds.every((k, i) => t[i] === k)) || (kinds.length === 1 && tuples.some((t) => t.length === 2 && t[1] === kinds[0])) ? "partial" : "bad";
}
/** the sentence that asks for what a constraint still needs: "Tangent: select a line and a circle", after a line, "Tangent: select a circle" */
export function constraintAsk(rel: Relation, kinds: readonly string[]): string {
  const tuples = kindTuples(rel), label = RELATIONS[rel].label.replace(/^./, (c) => c.toUpperCase());
  const rest = [...new Set(tuples.filter((t) => t.length > kinds.length && kinds.every((k, i) => t[i] === k)).map((t) => t.slice(kinds.length).map((k) => WORD[k] ?? k).join(" and ")))];
  const flipped = kinds.length === 1 ? [...new Set(tuples.filter((t) => t.length === 2 && t[1] === kinds[0]).map((t) => WORD[t[0]!] ?? t[0]!))] : [];
  const all = [...new Set([...rest, ...flipped])];
  return `${label}: select ${all.length ? all.join(", or ") : "what it takes"}`;
}
/** the kinds of the parts selected in a sketch (a part that is not there is left out) */
export const kindsOfSelection = (S: System, ids: readonly string[]): string[] => ids.flatMap((id) => (S.points.some((p) => p.id === id) || S.lines.some((l) => l.id === id) || S.circles.some((c) => c.id === id) ? [kindOf(id, S)] : []));
/** how what is picked on a body stands against a face tool: `met` (the face, or the edges, it needs), `partial` (nothing yet), `bad` (the other kind) */
export function faceStatus(spec: ToolSpec, picked: { faces: number; edges: number } | null): Status {
  const need = spec.needs[0]?.pick; if (!picked || (!picked.faces && !picked.edges)) return "partial";
  if (need === "body") return "met"; // (anything picked on a body picks the body)
  return need === "face" ? (picked.faces === 1 && !picked.edges ? "met" : "bad") : picked.edges > 0 && !picked.faces ? "met" : "bad";
}
