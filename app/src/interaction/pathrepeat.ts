// The path repeat of a drawn figure (`dec_path_repeat`, step (b), `in_840` to `in_843`): the figure and the lines and arcs of the path selected, a dialog for the rules (drawn with a picture of where the copies stand), and the
// command that makes the repeat (or changes the rules of one that is there). The arithmetic is `operation/pathrepeat.ts`; the copies are made from the record by `operation/repeat.ts`.
import type { Ref } from "../shared/ref.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { typedNumber } from "../shared/numbers.ts";
import { typedLength } from "../shared/units.ts";
import type { Command } from "../operation/commands.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { Part } from "../operation/part.ts";
import type { PatternRecord } from "../operation/repeat.ts";
import { pathRepeatOf } from "../operation/repeat.ts";
import type { Path, Rules, RepeatNumbers } from "../operation/pathrepeat.ts";
import { placeAlong, numbersOf, rulesFrom, lengthOf, PATH_NUMBERS } from "../operation/pathrepeat.ts";
import { pathMaps, readPath, bodyPlaces, pathPlaneOf } from "../operation/pathmaps.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { figurePartsOf } from "./objects.ts";
import type { Session } from "./session.ts";
import { scene as sceneOf, selection as selectionOf } from "./session.ts";
import type { Dialog, Field } from "./transfer.ts";
import { pathPicture } from "./pathdrawing.ts";

export interface PathRepeatValues { by: string; value: string; ends: string; startInset: string; endInset: string; corners: string; offset: string; turn: string; reverse: string; /** the whole row walked along the path (`in_887`), mm */ shift?: string }
export const pathRepeatStart = (): PathRepeatValues => ({ by: "distance", value: "20", ends: "fit", startInset: "0", endInset: "0", corners: "ignore", offset: "0", turn: "keep", reverse: "start", shift: "0" });
const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

/** What the selection says: the figure to repeat (the parts of the faces selected), the lines and arcs of the path (selected lines that are not the figure's own), the plane, and, when a repeat that is there is selected, that one to change. */
export interface PathRepeatTarget {
  figure: Ref[]; path: Ref[]; plane: Ref; edit?: PatternRecord;
  /** a body repeated along the path (`in_844`): the body (and its name, when it is one of several) and, for one already repeated, the step to change */
  body?: { ref: Ref; one?: string; /** the body's name when the repeat was made, to find it again */ src?: string; step?: string; params?: number[] };
}
export function pathRepeatTarget(session: Session): Result<PathRepeatTarget> {
  const sc = sceneOf(session);
  const sel = selectionOf(session).map((r) => sc.parts[r]).filter((p): p is Part => !!p);
  for (const p of sel) { const rec = pathRepeatOf(sc, p.ref); if (rec) return ok({ figure: rec.parts, path: rec.path ?? [], plane: rec.plane, edit: rec }); }
  // a body, with the lines of a path (or a body that a path repeat made, to change its rules)
  const bodies = sel.filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body");
  if (bodies.length) {
    if (bodies.length > 1) return err("select one body to repeat");
    const body = bodies[0]!;
    const own = body.ref !== BODY_OBJECT && body.id ? body.id : undefined;
    const lines = sel.filter((p) => p.kind === "line" && p.origin === "drawn").map((p) => p.ref);
    // (a body the repeat made, or the one it was made from, selected alone: its rules are changed; with lines selected too it is a new repeat)
    const made = lines.length ? undefined : sc.steps.find((st) => st.type === "pattern" && st.params.mode === "path" && (!!body.id && (body.id === `x_${st.id}` || body.id.startsWith(`x_${st.id}.`)) || st.parts.includes(body.ref) || (!!body.id && st.params.src === body.id) || (own !== undefined && st.params.body === own)));
    if (made) {
      const path = String(made.params.path ?? "").split(",").filter(Boolean) as Ref[];
      const plane = pathPlaneOf(sc, path);
      if (!plane.ok) return plane;
      return ok({ figure: [], path, plane: plane.value, body: { ref: body.ref, ...(own ? { one: own } : {}), step: made.id, params: Array.from({ length: PATH_NUMBERS }, (_, i) => Number(made.params[`pr${i}`])) } });
    }
    const path = lines;
    if (!path.length) return err("select the lines or arcs of the path, with the body");
    const plane = pathPlaneOf(sc, path);
    if (!plane.ok) return plane;
    return ok({ figure: [], path, plane: plane.value, body: { ref: body.ref, ...(own ? { one: own } : {}), ...(body.id ? { src: body.id } : {}) } });
  }
  const faces = sel.filter((p): p is Extract<Part, { kind: "face" }> => p.kind === "face" && p.origin === "drawn");
  const figure = [...new Set(faces.flatMap((f) => figurePartsOf(sc, f)))];
  const path = sel.filter((p) => p.kind === "line" && p.origin === "drawn" && !figure.includes(p.ref)).map((p) => p.ref);
  if (!figure.length) return err("select the figure to repeat (a closed shape) or a body, and the lines or arcs of the path it follows");
  if (!path.length) return err("select the lines or arcs of the path, with the figure");
  const first = figure.map((r) => sc.parts[r]).find((p) => p?.kind === "corner" || p?.kind === "circle");
  const corner = first?.kind === "circle" ? sc.parts[first.center] : first;
  const plane = corner?.plane;
  if (!plane) return err("the figure is not drawn on a plane");
  return ok({ figure, path, plane });
}
export const whyNoPathRepeat = (session: Session): string | null => { const t = pathRepeatTarget(session); return t.ok ? null : t.error; };

/** The values of the dialog for a repeat that is there (a figure's record, or the numbers of a body's step). */
export function pathRepeatValuesOf(rec: { params: readonly number[] }): PathRepeatValues {
  const n = rulesFrom(rec.params);
  if (!n.ok) return pathRepeatStart();
  const r = n.value.rules;
  return { by: r.spacing.by, value: fmt(r.spacing.by === "count" ? r.spacing.count : r.spacing.distance), ends: r.ends ?? "fit", startInset: fmt(r.startInset ?? 0), endInset: fmt(r.endInset ?? 0), corners: r.corners ?? "ignore", offset: fmt(r.offset ?? 0), shift: fmt(r.shift ?? 0), turn: n.value.turn ? "turn" : "keep", reverse: n.value.reverse ? "other" : "start" };
}

/** The rules typed, or why they are not any. */
export function pathRepeatNumbers(v: PathRepeatValues): Result<RepeatNumbers> {
  const by = v.by === "count" ? "count" : "distance";
  const value = by === "count" ? typedNumber(v.value) : typedLength(v.value);
  const [i0, i1, off] = [typedLength(v.startInset === "" ? "0" : v.startInset), typedLength(v.endInset === "" ? "0" : v.endInset), typedLength(v.offset === "" ? "0" : v.offset)];
  const shift = typedLength((v.shift ?? "") === "" ? "0" : v.shift!);
  if (value === null) return err(by === "count" ? "type how many copies, a whole number" : "type the distance between copies as a number");
  if (i0 === null || i1 === null || off === null || shift === null) return err("type the insets, the offset and the shift as numbers");
  const ends = v.ends === "remainder" || v.ends === "centre" ? v.ends : "fit";
  const corners = v.corners === "each" || v.corners === "inward" ? v.corners : "ignore";
  const rules: Rules = { spacing: by === "count" ? { by, count: value } : { by, distance: value }, ends, startInset: i0, endInset: i1, corners, offset: off, shift };
  return ok({ rules, turn: v.turn === "turn", reverse: v.reverse === "other" });
}

const record = (t: PathRepeatTarget, params: number[]) => ({ plane: t.plane, path: t.path, params });
/** The numbers a target starts the dialog with: the repeat's own, or the usual. */
export const pathRepeatValuesFor = (t: PathRepeatTarget): PathRepeatValues => (t.edit ? pathRepeatValuesOf(t.edit) : t.body?.params ? pathRepeatValuesOf({ params: t.body.params }) : pathRepeatStart());
/** The dialog: the rules, and a picture of the path with the places the copies stand at. `ctx` is what the selection gave. */
/** The fields that say where copies stand along a path, and a picture of them: the spacing, the end rule, the corners, the insets, the offset. `what` names what the first place is ("figure", "body", "hole"). Shared by the path repeat's dialog and the fastener holes'. */
export function pathRuleFields(v: PathRepeatValues, path: Result<Path> | null, what: string, label = "Where the copies stand"): { picture: Field; fields: Field[] } {
  const closed = !!(path?.ok && path.value.closed);
  const n = pathRepeatNumbers(v);
  const placed = path?.ok && n.ok ? placeAlong(path.value, n.value.rules) : null;
  const first = what === "hole" ? "" : ` (the first is the ${what} itself, so ${Math.max(0, (placed?.ok ? placed.value.frames.length : 1) - 1)} copies)`;
  const note = !path ? "" : !path.ok ? path.error : !n.ok ? n.error : placed && !placed.ok ? placed.error : placed?.ok ? `${placed.value.frames.length} places${first}${placed.value.spacing !== null ? `, ${fmt(placed.value.spacing)} mm apart` : ""}; the path is ${fmt(lengthOf(placed.value.path))} mm long${n.value.rules.offset ? " after the offset" : ""}` : "";
  const by = v.by === "count" ? "count" : "distance";
  return {
    picture: { id: "picture", label, type: "picture", value: pathPicture(path?.ok ? path.value : null, placed?.ok ? placed.value.frames.map((f) => ({ at: f.at, corner: f.corner })) : [], n.ok && n.value.rules.offset && placed?.ok ? placed : null), note },
    fields: [
      { id: "by", label: "Spacing", type: "choice", layout: "chips", value: by, choices: [{ value: "distance", label: "A distance apart" }, { value: "count", label: what === "hole" ? "A number, equally divided" : "A number, equally divided" }] },
      { id: "value", label: by === "count" ? (what === "hole" ? "How many holes" : `How many (the ${what} itself is one)`) : (what === "hole" ? "Distance between holes (mm)" : "Distance between copies (mm)"), type: "text", value: v.value },
      ...(by === "distance" && v.corners === "ignore" ? [{ id: "ends", label: "At the end of the path", type: "choice" as const, layout: "chips" as const, value: v.ends === "remainder" || v.ends === "centre" ? v.ends : "fit", choices: [{ value: "fit", label: "Adjust the spacing to land on the end" }, { value: "remainder", label: "Leave the rest at the end" }, { value: "centre", label: "Centre them" }] }] : []),
      { id: "corners", label: "Corners", type: "choice", layout: "chips", value: v.corners === "each" || v.corners === "inward" ? v.corners : "ignore", choices: [{ value: "ignore", label: "Not special" }, { value: "each", label: what === "hole" ? "A hole at every corner, each side divided" : "A copy at every corner, each side divided" }, { value: "inward", label: "Work in from each corner" }], note: by === "count" && v.corners !== "ignore" ? "a rule for the corners needs a distance, not a number" : "" },
      ...(!closed && v.corners === "ignore" ? [{ id: "startInset", label: what === "hole" ? "First hole this far from the start (mm)" : "First copy this far from the start (mm)", type: "text" as const, value: v.startInset }, { id: "endInset", label: what === "hole" ? "Last hole this far from the end (mm)" : "Last copy this far from the end (mm)", type: "text" as const, value: v.endInset }] : []),
      { id: "offset", label: what === "hole" ? "Move the path in from the edge (mm; a negative number goes out)" : "Offset the path sideways (mm; to its left, a negative number to the right)", type: "text", value: v.offset, note: "for an outline drawn counter-clockwise, the left is the inside" },
      { id: "shift", label: closed ? "Walk them round the loop (mm)" : "Shift them along the line (mm)", type: "text", value: v.shift ?? "0", note: closed ? "turns every place round the path, as far as typed" : "moves the whole row along the line; a place that goes past an end is left out" },
    ],
  };
}

/** The dialog: the rules, and a picture of the path with the places the copies stand at. `t` is what the selection gave. */
export function pathRepeatDialog(session: Session, t: PathRepeatTarget, v: PathRepeatValues): Dialog {
  const sc = sceneOf(session);
  const what = t.body ? "body" : "figure";
  const plane = sc.parts[t.plane];
  const path = plane?.kind === "plane" ? readPath(sc, t.path, plane, v.reverse === "other") : null;
  const r = pathRuleFields(v, path, what);
  const changing = !!t.edit || !!t.body?.step;
  return {
    title: changing ? "Path repeat: change the rules" : t.body ? "Path repeat of a body" : "Path repeat",
    ok: changing ? "Change" : "Repeat",
    fields: [
      r.picture,
      ...r.fields,
      { id: "turn", label: "The copies", type: "choice", layout: "chips", value: v.turn === "turn" ? "turn" : "keep", choices: [{ value: "keep", label: "Keep their direction" }, { value: "turn", label: "Turn with the path" }] },
      { id: "reverse", label: "Count from", type: "choice", layout: "chips", value: v.reverse === "other" ? "other" : "start", choices: [{ value: "start", label: "The path's first end" }, { value: "other", label: "Its other end" }] },
    ],
  };
}

/** The command that makes the repeat (or changes the rules of the one selected), after the rules are tried on the path: a refusal says why. */
export function pathRepeatCommand(session: Session, t: PathRepeatTarget, v: PathRepeatValues): Result<Command> {
  const sc: Scene = sceneOf(session);
  const n = pathRepeatNumbers(v);
  if (!n.ok) return n;
  const params = numbersOf(n.value);
  if (t.body) { // a body: a step of the history with the numbers (`pr0` to `pr8`) and the path's lines
    const numbers = Object.fromEntries(params.map((x, i) => [`pr${i}`, x]));
    const tried = bodyPlaces(sc, { path: t.path, params });
    if (!tried.ok) return tried;
    if (tried.value.places.length > 200) return err("that is more than 200 copies");
    if (t.body.step) return ok({ type: "setStepParams", id: t.body.step, params: numbers });
    return ok({ type: "addStep", step: { id: nextId(sc, "s"), type: "pattern", parts: [t.body.ref], params: { mode: "path", path: t.path.join(","), ...numbers, ...(t.body.one ? { body: t.body.one } : {}), ...(t.body.src ? { src: t.body.src } : {}) } } });
  }
  const tried = pathMaps(sc, record(t, params));
  if (tried.why) return err(tried.why);
  if (tried.maps.length > 200) return err("that is more than 200 copies");
  return ok(t.edit ? { type: "setPattern", id: t.edit.id, params } : { type: "pattern", id: nextId(sc, "q"), kind: "path", parts: t.figure, plane: t.plane, params, path: t.path });
}
