// The step list (`in_1567`, the prototype's History list): what the recipe is made of, in order, each with its status and the numbers that can be changed in place (an extrude's distance, a sketch's dimensions). Pure: the recipe and what the engine last said in,
// rows out; and `editNumber`, the new recipe when one number is changed (the studio sends it to the engine; a step that then fails is flagged with the reason and the rest passes through, as always: undo puts it back).
import type { Step } from "../engine/steps.ts";
import type { StepSnap } from "../engine/protocol.ts";
import { RANGEABLE, RELATIONS, type Constraint } from "../engine/solver.ts";

export interface NumberRow { /** where it is in the step: `d`, or `c:<constraint id>` */ key: string; label: string; value: number; unit: "mm" | "deg" }
export interface Row { id: string; icon: string; title: string; status: "ok" | "flagged" | "orphaned" | "unknown"; /** the engine's words when it is not ok */ why: string; numbers: NumberRow[] }

const unitOf = (k: string): "mm" | "deg" => (k === "angle" ? "deg" : "mm");
const TITLE: Record<string, string> = { sketch: "Sketch", extrude: "Extrude", combine: "Combine", sketchPolygon: "Sketch", sketchCircle: "Sketch", push: "Push / pull", round: "Round", move: "Move", turn: "Turn" };
const ICON: Record<string, string> = { sketch: "sketch", sketchPolygon: "sketch", sketchCircle: "sketch", extrude: "pushpull", push: "pushpull", combine: "add", round: "round" };

export function rowsOf(steps: readonly Step[], snap: readonly StepSnap[]): Row[] {
  return steps.map((s) => {
    const sn = snap.find((x) => x.id === s.id), numbers: NumberRow[] = [];
    if (s.kind === "sketch") for (const c of ((s.params.constraints as Constraint[] | undefined) ?? [])) { if (RANGEABLE.has(c.kind) && c.value !== undefined) numbers.push({ key: `c:${c.id}`, label: `${RELATIONS[c.kind].label} ${c.parts.join(", ")}`, value: c.value, unit: unitOf(c.kind) }); }
    else for (const [k, v] of Object.entries(s.params)) if (typeof v === "number") numbers.push({ key: k, label: k === "d" ? "Distance" : k, value: v, unit: "mm" });
    const mode = s.kind === "combine" ? (s.params.mode === "cut" ? "Cut" : s.params.mode === "intersect" ? "Intersect" : "Add") : s.kind === "round" ? (s.params.mode === "chamfer" ? "Chamfer" : "Round") : null;
    const st = sn?.status as { kind: string; why?: string } | undefined;
    return { id: s.id, icon: s.kind === "round" && s.params.mode === "chamfer" ? "chamfer" : ICON[s.kind] ?? "pencil", title: `${mode ?? TITLE[s.kind] ?? s.kind} ${s.id}`, status: !st ? "unknown" : (st.kind as Row["status"]), why: st?.why ?? "", numbers };
  });
}
/** the recipe with one number of one step changed; null if there is no such step or number */
export function editNumber(steps: readonly Step[], id: string, key: string, value: number): Step[] | null {
  const s = steps.find((x) => x.id === id); if (!s || !isFinite(value)) return null;
  let params: Record<string, unknown>;
  if (key.startsWith("c:")) {
    const cs = (s.params.constraints as Constraint[] | undefined) ?? [], cid = key.slice(2);
    if (!cs.some((c) => c.id === cid && c.value !== undefined)) return null;
    params = { ...s.params, constraints: cs.map((c) => (c.id === cid ? { ...c, value, min: undefined, max: undefined } : c)) };
  } else { if (typeof s.params[key] !== "number") return null; params = { ...s.params, [key]: value }; }
  return steps.map((x) => (x.id === id ? ({ ...x, params } as Step) : x));
}
