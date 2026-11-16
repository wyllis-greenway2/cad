// The constraints and mates the ring always lists (`in_573`, `dec_ui_unification`): every one the relations table knows, grouped by what it applies to, so the ring's shape never depends on what is selected. A constraint
// fits the selection when the selection is of that group's kinds; the ring dims the rest and says what to select. Pure.
import { ROWS } from "./rows.ts";
import type { Kind } from "../operation/part.ts";

export interface ConstraintGroup { id: string; label: string; /** what the selection has to be, said when a dimmed one is pressed */ what: string; /** the kinds of the selection it fits, sorted (null: faces and axes, the mates) */ kinds: string | null; items: { id: string; label: string }[] }
/** What a constraint is called in the ring: one or two words (`in_538`). */
const TIPS: Record<string, string> = { fixed: "Fix", onCircle: "On circle", sameAcross: "Same across", equalLength: "Equal", equalRadius: "Equal", "mate:flush": "Flush", "mate:parallel": "Parallel faces", "mate:perpendicular": "Perpendicular faces", "mate:angle": "Face angle", "mate:coaxial": "Coaxial", "mate:parallelAxes": "Parallel axes", "mate:perpendicularAxes": "Perpendicular axes", "mate:angleAxes": "Axis angle", "mate:axisToFace": "Axis-face" };
const tipOf = (id: string, label: string): string => TIPS[id] ?? label;

const NAME: Record<string, string> = { corner: "point", line: "line", circle: "circle" };
const keyOf = (kinds: readonly string[]): string => [...kinds].sort().join("+");
const GROUP_LABEL: Record<string, [string, string]> = {
  corner: ["Point", "a point"], line: ["Line", "a line"], circle: ["Circle", "a circle"],
  "corner+corner": ["Two points", "two points"], "corner+line": ["Point-line", "a point and a line"], "circle+corner": ["Point-circle", "a point and a circle"],
  "line+line": ["Two lines", "two lines"], "circle+line": ["Line-circle", "a line and a circle"], "circle+circle": ["Two circles", "two circles"],
};
const ORDER = ["corner", "line", "circle", "corner+corner", "corner+line", "circle+corner", "line+line", "circle+line", "circle+circle"];

/** The groups, the mates last. Each constraint once in its group (a row that applies to several kinds is in each). */
export const CONSTRAINT_GROUPS: ConstraintGroup[] = [
  ...ORDER.flatMap((k): ConstraintGroup[] => {
    const rows = ROWS.filter((r) => keyOf(r.pair) === k);
    if (!rows.length) return [];
    const [label, what] = GROUP_LABEL[k]!;
    const seen = new Set<string>();
    const items = rows.filter((r) => !seen.has(r.id) && !!seen.add(r.id)).map((r) => ({ id: r.id, label: tipOf(r.id, r.label) }));
    return [{ id: `group:${k}`, label, what, kinds: k, items }];
  }),
  { id: "group:mates", label: "Faces axes", what: "two faces or axes of two bodies", kinds: null, items: ["flush", "parallel", "perpendicular", "angle", "coaxial", "parallelAxes", "perpendicularAxes", "angleAxes", "axisToFace"].map((m) => ({ id: `mate:${m}`, label: tipOf(`mate:${m}`, m) })) },
];

/** Whether the selection (of these kinds) is what this group is for. Mates are for any two parts that are faces or axes, which the actions say themselves. */
export const fits = (g: ConstraintGroup, selected: readonly Kind[]): boolean => (g.kinds === null ? selected.length === 2 : keyOf(selected) === g.kinds);
