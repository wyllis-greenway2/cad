// Add part (`dec_parts_interface`, `dec_parts_fastener_pilot`): a dialog with the families, a size and (for a screw) a length, and the steps that make the part at the origin. The tables and the drawing are in `operation/fasteners.ts`;
// this file asks, checks and runs them.
import type { Session } from "./session.ts";
import { run, scene } from "./session.ts";
import type { Dialog } from "./transfer.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { typedLength } from "../shared/units.ts";
import { FASTENER_FAMILIES, FASTENER_SIZES, FASTENER_SOURCES, isFastenerSize, receiversText, makeNut, makeCountersunk, countersunkDims } from "../operation/fasteners.ts";
import type { FastenerFamily, PartSteps } from "../operation/fasteners.ts";

export interface AddPartValues { family: string; size: string; length: string }
export const addPartStart = (): AddPartValues => ({ family: "nut", size: "M3", length: "10" });
const familyOf = (s: string): FastenerFamily => (s === "countersunk" ? "countersunk" : "nut");

export function addPartDialog(v: AddPartValues): Dialog {
  const family = familyOf(v.family);
  const size = isFastenerSize(v.size) ? v.size : "M3";
  const info = FASTENER_FAMILIES.find((f) => f.id === family)!;
  return {
    title: "Add part",
    ok: "Add",
    fields: [
      { id: "family", label: "Family", type: "choice", value: family, choices: FASTENER_FAMILIES.map((f) => ({ value: f.id, label: `${f.label} (${f.standard})` })) },
      { id: "size", label: "Size (coarse thread)", type: "choice", value: size, choices: FASTENER_SIZES.map((s) => ({ value: s, label: s })), note: `matches: ${receiversText(size, family)}` },
      ...(family === "countersunk" ? [{ id: "length", label: "Length from the top of the head (mm)", type: "text" as const, value: v.length, note: `the standard's length list was not read: any length over ${countersunkDims(size).headHeight + 0.5} mm; the part is made at nominal size` }] : []),
      { id: "source", label: "Numbers from", type: "text", value: FASTENER_SOURCES[family === "nut" ? "nut" : "countersunk"], readonly: true, note: `${info.standard}; placed at the origin, drawn at its nominal size` },
    ],
  };
}

/** The steps for the answers, or why not. */
export function addPartSteps(v: AddPartValues): Result<PartSteps> {
  if (!isFastenerSize(v.size)) return err(`${v.size} is not a size this family has`);
  if (familyOf(v.family) === "nut") return makeNut(v.size);
  const length = typedLength(v.length);
  return length === null ? err("type the length as a number") : makeCountersunk(v.size, length);
}

/** Make the part in the session: each step is run from the scene the one before left. Stops at the first that fails and says so. */
export function addPart(session: Session, v: AddPartValues): Result<Session> {
  const steps = addPartSteps(v);
  if (!steps.ok) return steps;
  let s = session;
  for (const make of steps.value) {
    s = run(s, make(scene(s)));
    if (s.message) return err(s.message);
  }
  return ok(s);
}
