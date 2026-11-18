// The constraints and mates the ring always lists (`in_666`, `in_969`, `dec_ui_unification`): one flat list of the things a person means (Horizontal, Parallel, Tangent, Dimension...), each once, whatever it is made of underneath. An entry stands for
// several of what the relations table and the mates know (Parallel is the relation of two lines, the mate of two flat faces and of two axes); the one the selection fits is the one made. An entry that nothing fits is dimmed and says what to select.
// Pure.
import type { Action } from "./actions.ts";

export interface ConstraintEntry {
  /** the id the ring and `runAction` use */ id: string;
  /** one or two words */ label: string;
  /** the name of its icon */ icon: string;
  /** the ids of the actions (`actionsFor`) it stands for, the first that is enabled for the selection is the one made */ of: readonly string[];
  /** what to select, said when it is pressed with nothing that fits ("select two lines..." is waited for, `in_830`) */ what: string;
}

export const CONSTRAINT_ENTRIES: readonly ConstraintEntry[] = [
  { id: "c:horizontal", label: "Horizontal", icon: "horizontal", of: ["horizontal", "sameHeight", "mate:horizontal"], what: "a line, two points, or a face or an axis of a body" },
  { id: "c:vertical", label: "Vertical", icon: "vertical", of: ["vertical", "sameAcross", "mate:vertical"], what: "a line, two points, or a face or an axis of a body" },
  { id: "c:parallel", label: "Parallel", icon: "parallel", of: ["parallel", "mate:parallel", "mate:parallelAxes"], what: "two lines, two faces or axes of two bodies, or a face and a world plane" },
  { id: "c:perpendicular", label: "Perpendicular", icon: "perpendicular", of: ["perpendicular", "mate:perpendicular", "mate:perpendicularAxes", "mate:axisToFace"], what: "two lines, two faces or axes of two bodies, or a face and a world plane" },
  { id: "c:angle", label: "Angle", icon: "angle", of: ["angle", "arcAngle", "mate:angle", "mate:angleAxes"], what: "two lines or an arc, or two faces or axes of two bodies" },
  { id: "c:coincident", label: "Coincident", icon: "coincident", of: ["coincident", "mate:flush"], what: "two points, two flat faces of two bodies, or a flat face and a world plane" },
  { id: "c:on", label: "On", icon: "onLine", of: ["onLine", "onCircle"], what: "a point and a line or a circle" },
  { id: "c:tangent", label: "Tangent", icon: "tangent", of: ["tangent", "mate:tangent"], what: "two lines, two circles, a line and a circle, or a round face, a ball or a cone of a body and a flat or round face of another (or a world plane)" },
  { id: "c:concentric", label: "Concentric", icon: "concentric", of: ["concentric", "mate:coaxial"], what: "two circles, or two round faces of two bodies" },
  { id: "c:equal", label: "Equal", icon: "equalLength", of: ["equalLength", "equalRadius"], what: "two lines or two circles" },
  { id: "c:dimension", label: "Dimension", icon: "distance", of: ["diameter", "radius", "length", "distance"], what: "a line, a circle or an arc, or two things to measure between" },
  { id: "c:fixed", label: "Fix", icon: "fixed", of: ["fixed"], what: "a point" },
];

/** The action an entry makes for the actions the selection has: the first of those it stands for that is enabled, or null. */
export function resolveEntry(entry: ConstraintEntry, actions: readonly Action[]): Action | null {
  for (const id of entry.of) { const a = actions.find((x) => x.id === id && x.group === "relation" && x.enabled); if (a) return a; }
  return null;
}
