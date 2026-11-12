// The pointer intents: hover, click (selecting, or drawing when a tool is armed, or finishing an operation) and the menu.
import type { Intent } from "../../shared/input.ts";
import type { Ref } from "../../shared/ref.ts";
import { dist, dot, sub } from "../../math/vec.ts";
import type { Plane } from "../../operation/part.ts";
import { normalOfPlane } from "../../operation/part.ts";
import { lookup, nextId } from "../../operation/scene.ts";
import type { Scene } from "../../operation/scene.ts";
import type { Vec3 } from "../../math/vec.ts";
import { scene as sceneOf, selection as selectionOf, clickOn, hoverOn, run } from "../session.ts";
import type { Session } from "../session.ts";
import { candidatesAt } from "../picking.ts";
import { actionsFor } from "../actions.ts";
import type { ToolKind, Tool } from "../tools.ts";
import { lineHint, hintRelations, circleCentredAt, pointHint, arcBulgeHint } from "../hints.ts";
import type { Hint } from "../hints.ts";
import { snapOnPlane, finish, planeForDrawing, armTool, pointOnPlane } from "../tools.ts";
import { trimAt } from "../../operation/trim.ts";
import type { Command } from "../../operation/commands.ts";
import type { OpKind } from "../operations.ts";
import { startOp } from "../operations.ts";
import { similarTo } from "../similar.ts";
import { patternOfAll } from "../../operation/repeat.ts";
import { whyNotGroup, whyNotUngroup, whyNotCombine } from "./select.ts";
import { projector } from "../camera.ts";
import { settings } from "../../shared/settings.ts";
import { planeOf, objectOf } from "../objects.ts";
import type { AppState, Env, MenuItem } from "./state.ts";
import { paneAt } from "../panes.ts";
import type { WorldName } from "../panes.ts";
import { doLook } from "./viewing.ts";
import { sketchPlaneOf, pickOpts, withSession, surfacePoint, planeView, animateTo } from "./state.ts";
import { commitFigure, commitOp, setRepeatAxis, doApply } from "./modal.ts";
import { doGizmoHover, gizmoOf } from "./handles.ts";
import { hasGizmo, hitHandle } from "../gizmo.ts";

/** The operations a right click offers (`in_133`), in categories (`in_143`): sketching, constraints, shape, moving and repeating, and delete. The ones that cannot start from the selection are there too, dimmed, with the reason. */
const LEAVES: { id: string; label: string; icon: string; op?: OpKind; tool?: ToolKind; /** a way of selecting more (`in_257`) */ select?: "similar" | "group" | "ungroup" | "editRepeat" | "breakRepeat" | "combine" }[] = [
  { id: "tool:rect", label: "Rectangle", icon: "rect", tool: "rect" },
  { id: "tool:circle", label: "Circle", icon: "circle", tool: "circle" },
  { id: "tool:line", label: "Line", icon: "line", tool: "line" },
  { id: "tool:arc", label: "Curve", icon: "arc", tool: "arc" },
  { id: "tool:trim", label: "Trim", icon: "scissors", tool: "trim" },
  { id: "op:offset", label: "Offset", icon: "offset", op: "offset" },
  { id: "op:pushpull", label: "Push / pull", icon: "pushpull", op: "pushpull" },
  { id: "op:edge", label: "Fillet / chamfer", icon: "edge", op: "edge" },
  { id: "op:scale", label: "Scale", icon: "scale", op: "scale" },
  { id: "op:move", label: "Move", icon: "move", op: "move" },
  { id: "op:rotate", label: "Rotate", icon: "rotate", op: "rotate" },
  { id: "op:copy", label: "Copy", icon: "copy", op: "copy" },
  { id: "op:linear", label: "Linear repeat", icon: "linear", op: "linear" },
  { id: "op:circular", label: "Circular repeat", icon: "circular", op: "circular" },
  { id: "repeat:edit", label: "Edit repeat", icon: "linear", select: "editRepeat" },
  { id: "repeat:break", label: "Break repeat", icon: "unlink", select: "breakRepeat" },
  { id: "combine:add", label: "Add bodies", icon: "add", select: "combine" },
  { id: "combine:subtract", label: "Subtract bodies", icon: "subtract", select: "combine" },
  { id: "combine:intersect", label: "Intersect bodies", icon: "intersect", select: "combine" },
  { id: "combine:subtract:keep", label: "Subtract, keep the tools", icon: "subtract", select: "combine" },
  { id: "combine:intersect:keep", label: "Intersect, keep the tools", icon: "intersect", select: "combine" },
  { id: "select:similar", label: "Select similar", icon: "similar", select: "similar" },
  { id: "select:group", label: "Group", icon: "group", select: "group" },
  { id: "select:ungroup", label: "Ungroup", icon: "ungroup", select: "ungroup" },
];
const CATEGORIES: { id: string; label: string; icon: string; items: string[] }[] = [
  { id: "sketch", label: "Sketch", icon: "sketch", items: ["tool:rect", "tool:circle", "tool:line", "tool:arc", "tool:trim", "op:offset"] },
  { id: "shape", label: "Shape", icon: "body", items: ["op:pushpull", "op:edge", "op:scale", "combine:add", "combine:subtract", "combine:intersect", "combine:subtract:keep", "combine:intersect:keep"] },
  { id: "place", label: "Move and repeat", icon: "move", items: ["op:move", "op:rotate", "op:copy", "op:linear", "op:circular", "repeat:edit", "repeat:break"] },
  { id: "select", label: "Select", icon: "similar", items: ["select:similar", "select:group", "select:ungroup"] },
];
/** While a repeat is open only drawing, Move and Rotate (and constraints) are offered (the rest could change what is being repeated or the pivot's parts). */
const IN_REPEAT = new Set(["tool:rect", "tool:circle", "tool:line", "tool:arc", "tool:trim", "op:move", "op:rotate"]);
const category = (id: string, label: string, icon: string, kids: MenuItem[]): MenuItem => {
  const first = kids.find((k) => k.enabled);
  return { id, label, icon, enabled: !!first, why: first ? null : kids[0]?.why ?? "nothing here applies", children: kids };
};
function menuFor(session: Session, x: number, y: number, repeating = false, over: Ref | null | undefined = null): AppState["menu"] {
  const sc = sceneOf(session);
  const sel = selectionOf(session);
  const leaf = new Map<string, MenuItem>(LEAVES.map((r) => {
    const base = { id: r.id, label: r.label, icon: r.icon };
    if (repeating && !IN_REPEAT.has(r.id)) return [r.id, { ...base, enabled: false, why: "apply or cancel the repeat that is open first" }];
    if (r.tool) return [r.id, { ...base, enabled: true, why: null }];
    if (r.select === "similar") { const q = similarTo(sc, sel); return [r.id, { ...base, enabled: q.ok, why: q.ok ? null : q.why }]; }
    if (r.select === "combine") { const why = whyNotCombine(session); return [r.id, { ...base, enabled: !why, why }]; }
    if (r.select === "editRepeat" || r.select === "breakRepeat") { const rec = patternOfAll(sc, sel); return [r.id, { ...base, enabled: !!rec, why: rec ? null : "select a copy of a repeat, or what was repeated" }]; }
    if (r.select) { const why = r.select === "group" ? whyNotGroup(session) : whyNotUngroup(session); return [r.id, { ...base, enabled: !why, why }]; }
    const st = startOp(sc, sel, r.op!);
    return [r.id, { ...base, enabled: st.ok, why: st.ok ? null : st.why }];
  }));
  const acts = actionsFor(sc, sel);
  const rels: MenuItem[] = acts.filter((a) => a.group === "relation" && a.enabled).map((a) => ({ id: a.id, label: a.label, icon: a.id, enabled: true, why: null }));
  const del = acts.find((a) => a.id === "delete");
  // looking straight at the selected plane or face, or at the one the click was on (`in_171`: the eye lives here, not on the screen)
  const clicked = over ? planeOf(lookup(sc), over) : null; // (the surface the right click was on: a face, a sketch's plane, a world plane; a sketch tool chosen from the ring turns to it when the selection does not say which plane)
  const target = lookTarget(sc, sel, over);
  const items: MenuItem[] = [
    ...CATEGORIES.slice(0, 1).map((c) => category(c.id, c.label, c.icon, c.items.map((i) => leaf.get(i)!))),
    category("constraints", "Constraints", "constraint", rels.length ? rels : [{ id: "none", label: "Constraints", icon: "constraint", enabled: false, why: "select the parts to constrain (a line, a corner, two lines …)" }]),
    ...CATEGORIES.slice(1).map((c) => category(c.id, c.label, c.icon, c.items.map((i) => leaf.get(i)!))),
    { id: "look", label: "Look straight at it", icon: "eye", enabled: !!target, why: target ? null : "select a plane or a face, or right-click on one" },
    { id: "delete", label: "Delete", icon: "trash", enabled: !!del?.enabled, why: del?.why ?? "select something to delete" },
  ];
  return { x, y, items, plane: clicked ? clicked.ref : null };
}

/** The plane "Look straight at it" turns to: the one selected plane, else the plane under the right click. */
function lookTarget(sc: Scene, sel: readonly Ref[], over: Ref | null | undefined): Plane | null {
  const get = lookup(sc);
  const planes = [...new Map(sel.flatMap((r) => { const p = planeOf(get, r); return p ? [[p.ref, p] as const] : []; })).values()];
  return planes.length === 1 ? planes[0]! : over ? planeOf(get, over) : null;
}

/** The first of these parts that has a plane (a surface a figure can be drawn on). */
function drawingPlane(sc: Scene, refs: readonly Ref[]): Ref | null {
  const get = lookup(sc);
  for (const r of refs) {
    const pl = planeOf(get, r);
    if (pl) return pl.ref;
  }
  return null;
}

/** A rim made of two half circles is one edge to the person: picking a half picks both, letting go of one lets go of both. */
function withTwins(sc: Scene, before: readonly Ref[], now: readonly Ref[]): Ref[] {
  const twinOf = (r: Ref): Ref | undefined => { const p = sc.parts[r]; return p?.kind === "line" ? p.twin : undefined; };
  const out = [...now];
  for (const r of before) { const t = twinOf(r); if (!now.includes(r) && t) { const k = out.indexOf(t); if (k >= 0) out.splice(k, 1); } }
  for (const r of now) { const t = twinOf(r); if (t && !out.includes(t) && t in sc.parts) out.splice(out.indexOf(r) + 1, 0, t); }
  return out;
}

/** The little pane under the pointer, unless something of the drawing or the body is there too (a sketch near the origin is not blocked by the panes beside the axes). */
function paneUnder(s: AppState, x: number, y: number, env: Env): ReturnType<typeof paneAt> {
  const pane = paneAt(s.cam, env.w, env.h, x, y);
  if (!pane) return null;
  const sc = sceneOf(s.session);
  const there = candidatesAt(sc, projector(s.cam, env.w, env.h).view(x, y), pickOpts(s));
  return there.some((c) => sc.parts[c.ref]?.origin !== "world") ? null : pane;
}

const PANE_BUTTON: Record<WorldName, "X" | "Y" | "Z"> = { YZ: "X", XZ: "Y", XY: "Z" }; // (the button that looks at a plane: X at the plane across it)
const isWorldPlane = (sc: Scene, r: Ref): boolean => { const p = sc.parts[r]; return !!p && p.origin === "world" && p.kind === "plane"; };

export function doHover(s: AppState, i: Extract<Intent, { type: "hover" }>, env: Env): AppState {
  const sc = sceneOf(s.session);
  const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
  // a little pane of another world plane under the pointer lights up and takes the pointer: nothing else is hovered through it (`in_190`)
  const pane = !s.tool && !s.op && !s.drag ? paneUnder(s, i.x, i.y, env) : null;
  if (pane) return { ...withSession(s, hoverOn(s.session, undefined)), hoverPoint: null, paneHover: pane };
  const c = candidatesAt(sc, pv, pickOpts(s))[0];
  const point = c && c.rank === 2 ? surfacePoint(pv, c.score) : null;
  let next: AppState = { ...withSession(s, hoverOn(s.session, c?.ref)), hoverPoint: point, paneHover: null };
  if (s.tool?.plane) {
    const pl = sc.parts[s.tool.plane];
    const raw = pl && pl.kind === "plane" ? snapOnPlane(sc, pv, pl) : null;
    const h = raw && pl && pl.kind === "plane" ? hintFor(sc, s.tool, pl, pv, raw) : null; // (the end of a line, an end of an arc, the bow of an arc: each takes a constraint it is close to)
    // a circle's centre on another circle's centre: it will be made concentric
    const about = raw && pl && pl.kind === "plane" && s.tool.kind === "circle" && !s.tool.points.length ? circleCentredAt(sc, pl, raw) : (s.tool.concentric ?? null);
    const hints: Hint[] = h ? h.hints : about ? [{ kind: "concentric", ref: about }] : [];
    if (raw) next = { ...next, tool: { ...s.tool, cursor: h ? h.at : raw, hints } };
  }
  // trim: the part of the line or circle under the pointer that a click would cut off
  // (and the line or circle itself is not lit as a whole: only the part that would go is, in the selected blue, and nothing at all where nothing crosses; `in_206`)
  if (s.tool?.kind === "trim") next = { ...withSession(next, hoverOn(next.session, undefined)), hoverPoint: null, tool: { ...s.tool, trimming: trimUnder(sc, pv) } };
  // a circle tool still armed (no plane yet): where the centre would go, and whether it is on another circle's centre; a line or an arc: whether its first end would be on a line or a circle
  if (s.tool && !s.tool.plane && (s.tool.kind === "circle" || s.tool.kind === "arc" || s.tool.kind === "line" || s.tool.kind === "rect")) {
    const planeRef = drawingPlane(sc, candidatesAt(sc, pv, pickOpts(s)).map((k) => k.ref)) ?? drawingPlane(sc, selectionOf(s.session));
    const pl = planeRef ? (lookup(sc)(planeRef) as Plane) : null;
    const at = pl ? snapOnPlane(sc, pv, pl) : null;
    if (s.tool.kind === "rect") {
      next = { ...next, tool: { ...s.tool, hints: [], cursor: s.tool.held ? at : null } };
    } else if (s.tool.kind !== "circle") {
      const h = at && pl ? pointHint(sc, pl, pv, at) : null;
      next = { ...next, tool: { ...s.tool, hints: h?.hints ?? [], cursor: h?.hints.length ? h.at : s.tool.held ? at : null } }; // (a finger holds the cursor where it is aimed, `in_286`)
    } else {
      const about = at && pl ? circleCentredAt(sc, pl, at) : null;
      next = { ...next, tool: { ...s.tool, hints: about ? [{ kind: "concentric", ref: about }] : [], cursor: about ? at : s.tool.held ? at : null } };
    }
  }
  return doGizmoHover(next, i.x, i.y, env);
}

/** The constraint the pointer is close to for the tool being drawn with: the end of a line, an end of an arc, or the bow of an arc (a height typed in is not moved by one). */
function hintFor(sc: Scene, t: Tool, pl: Plane, pv: ReturnType<ReturnType<typeof projector>["view"]>, raw: Vec3): { at: Vec3; hints: Hint[] } | null {
  if (t.kind !== "line" && t.kind !== "arc") return null;
  if (!t.points.length) return pointHint(sc, pl, pv, raw); // (a first end: on a line or a circle)
  if (t.kind === "line") return lineHint(sc, pl, t.points[0]!, pv, raw);
  if (t.points.length < 2) return pointHint(sc, pl, pv, raw);
  return t.typed[0] === "" ? arcBulgeHint(sc, pl, t.points[0]!, t.points[1]!, raw) : null;
}

/** The line or circle of the drawing under the pointer and what trimming it there would take off, if anything crosses it. */
function trimUnder(sc: Scene, pv: ReturnType<ReturnType<typeof projector>["view"]>): { ref: Ref; span: Vec3[]; command: Command } | undefined {
  const cand = candidatesAt(sc, pv, { pointTol: 0, lineTol: settings.pick.linePx }).find((c) => (c.kind === "line" || c.kind === "circle") && sc.parts[c.ref]?.origin === "drawn");
  const part = cand ? sc.parts[cand.ref] : undefined;
  const pl = part?.plane ? sc.parts[part.plane] : undefined;
  if (!cand || !pl || pl.kind !== "plane") return undefined;
  const at = pointOnPlane(pv, pl);
  const plan = at ? trimAt(sc, cand.ref, at) : null;
  return plan ? { ref: cand.ref, span: plan.span, command: plan.command } : undefined;
}

/**
 * A tap while a sketch tool is on, for a finger (`in_286`): it has no hover, so a point is held first and moved with the drag icon (its hints are the hover's), and the next tap sets it. The tap sets the point the cursor is held
 * at, then holds the cursor where the tap was, for the next point; when that point finished the figure nothing is held, so a tap after the last point only applies it. The trim tool has one step: a tap is a click.
 */
export function doTapAim(s: AppState, i: Extract<Intent, { type: "tapAim" }>, env: Env): AppState {
  if (!s.tool || s.tool.kind === "trim") return doClick(s, { type: "click", x: i.x, y: i.y, count: 1, shift: false }, env);
  const aim = (st: AppState): AppState => {
    const held = doHover({ ...st, tool: { ...st.tool!, held: true } }, { type: "hover", x: i.x, y: i.y }, env); // (held first, so a tool with no plane yet keeps the cursor where it is aimed)
    return held.tool?.cursor ? held : { ...held, tool: { ...held.tool!, held: undefined } };
  };
  if (!s.tool.held || !s.tool.cursor) return aim(s);
  // the point held is set: a click where the cursor is
  const at = projector(s.cam, env.w, env.h).project(s.tool.cursor);
  const set = doClick({ ...s, tool: { ...s.tool, held: undefined } }, { type: "click", x: at[0], y: at[1], count: 1, shift: false }, env);
  if (!set.tool || !set.tool.points.length) return set.tool ? { ...set, tool: { ...set.tool, held: undefined } } : set; // (the figure is made, or the tool is gone: nothing is held)
  return aim(set); // (more points to come: the cursor is held where the tap was)
}

/** A click while a tool is armed: the first sets the plane and the first point, later ones place corners or finish the figure. */
function clickWithTool(base: AppState, i: Extract<Intent, { type: "click" }>, env: Env, refs: Ref[]): AppState {
  const t = base.tool!;
  const sess = base.session;
  const sc = sceneOf(sess);
  const pv = projector(base.cam, env.w, env.h).view(i.x, i.y);
  if (t.kind === "trim") {
    // the scissors: the part under the click, between the places where other curves cross it, is cut off; the tool stays on
    const plan = trimUnder(sc, pv);
    if (!plan) return { ...base, session: { ...sess, message: "click a line or circle where another crosses it" } };
    const next = run(sess, plan.command);
    return { ...base, session: next.message ? next : { ...next, message: null, click: { ...next.click, selection: [] } }, tool: { ...t, trimming: undefined } };
  }
  if (!t.points.length) {
    // the plane chosen from the pencil bubble, else the surface under the click takes the drawing, from wherever the camera is; with none under it, the selected plane does
    const planeRef = t.plane ?? sketchPlaneOf(base)?.ref ?? drawingPlane(sc, refs) ?? drawingPlane(sc, selectionOf(sess)); // (the plane the tool is already on, else the one being looked at straight, else what is under the click: a block in front of the plane does not take the drawing, `in_194`)
    const pl = planeRef ? (lookup(sc)(planeRef) as Plane) : null;
    const at = pl ? snapOnPlane(sc, pv, pl) : null;
    if (!pl || !at) return { ...base, session: { ...sess, message: "click on a surface to draw on" } };
    const { plane, command } = planeForDrawing(sc, pl.ref);
    const session = command ? run(sess, command) : sess;
    const about = t.kind === "circle" ? circleCentredAt(sceneOf(session), lookup(sceneOf(session))(plane) as Plane, at) : null;
    const first = t.kind === "arc" || t.kind === "line" ? pointHint(sc, pl, pv, at) : null; // (the first end of a line or an arc on a line or a circle says so, `in_280`, `in_281`)
    const from = first ? first.at : at;
    return { ...base, session: { ...session, message: null }, tool: { ...t, plane, points: [from], cursor: from, ...(first ? { ends: [first.hints] } : {}), ...(about ? { concentric: about } : {}) } };
  }
  const plane = sc.parts[t.plane!] as Plane;
  const flat = snapOnPlane(sc, pv, plane);
  const hint = flat ? hintFor(sc, t, plane, pv, flat) : null;
  const at = hint ? hint.at : flat;
  if (!at) return base;
  if (t.kind === "arc" && t.points.length < 2) {
    // an arc: the second click is its other end, the third sets how far it bows out (the pointer's distance from the chord); an end on a line or a circle says so
    return dist(at, t.points[0]!) < 1e-6 ? base : { ...base, tool: { ...t, points: [...t.points, at], cursor: at, typed: ["", ""], ends: [...(t.ends ?? []), hint?.hints ?? []] } };
  }
  // a rectangle, a circle, a line: the second click finishes it and the tool is put away (a line is one segment: leave it open, or draw the next to close a shape)
  const fin = t.kind === "line" ? (dist(at, t.points[0]!) < 1e-6 ? null : finish(sc, { ...t, points: [t.points[0]!, at], cursor: at })) : finish(sc, { ...t, cursor: at });
  let done = t.kind === "line" && !fin ? base : commitFigure(base, fin);
  // the line or arc made with the constraints it was close to: its ends on a line or a circle, and the rest (level, upright, parallel, square, as long as, tangent): one way for both (`in_281`)
  const curve = t.kind === "line" || t.kind === "arc" ? fin?.select[0] : undefined;
  const isOn = (h: Hint) => h.kind === "onLine" || h.kind === "onCircle";
  const ends: Hint[][] = t.kind === "arc" ? (t.ends ?? []) : [t.ends?.[0] ?? [], (hint?.hints ?? []).filter(isOn)];
  const rest = (hint?.hints ?? []).filter((h) => t.kind === "line" ? !isOn(h) : true);
  if (curve && done !== base && !(done.tool && done.tool.points.length) && !done.session.message && (ends.some((e) => e.length) || rest.length)) {
    let session = done.session;
    for (const r of hintRelations(sceneOf(session), curve, ends, rest)) {
      session = run(session, { type: "addRelation", relation: { id: nextId(sceneOf(session), "r"), kind: r.kind, parts: r.parts } });
      if (session.message) break;
    }
    done = { ...done, session };
  }
  // sketching goes on while you keep clicking on vertices (`in_150`): a figure finished on an existing vertex leaves the same tool ready (a line starts its next segment from that vertex); finished anywhere else, the tool is put away
  const vertex = refs.map((r) => sc.parts[r]).find((p) => p?.kind === "corner" && p.origin === "drawn");
  if (!vertex || vertex.kind !== "corner" || done === base || (done.tool && done.tool.points.length) || done.session.message) return done;
  return t.kind === "line" ? { ...done, tool: { ...armTool("line"), plane: t.plane, made: (t.made ?? 0) + 1, ...(t.reveal ? { reveal: true as const } : {}), points: [vertex.at], cursor: vertex.at } } : done;
}

export function doClick(s: AppState, i: Extract<Intent, { type: "click" }>, env: Env): AppState {
  if (s.box) s = { ...s, box: null }; // (held, but never moved: an ordinary click)
  const sc = sceneOf(s.session);
  // a click on a little pane turns that world plane on and looks straight at it (the same as its X Y Z button, `in_190`)
  const pane = !s.tool && !s.op ? paneUnder(s, i.x, i.y, env) : null;
  if (pane) return doLook({ ...s, menu: null, focus: null, resume: null }, { type: "look", plane: PANE_BUTTON[pane] }, env);
  const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
  const cands = candidatesAt(sc, pv, pickOpts(s));
  const refs = cands.map((c) => c.ref);
  const base: AppState = { ...s, menu: null, focus: null, resume: null };
  if (s.tool) return clickWithTool(base, i, env, refs);
  // sketching goes on while you click on vertices: the click right after a figure, on a vertex, starts the next one from it; any other click drops the mode
  const vertex = s.resume && !s.op ? refs.map((r) => sc.parts[r]).find((p) => p?.kind === "corner" && p.origin === "drawn" && p.plane) : undefined;
  if (vertex && vertex.kind === "corner" && vertex.plane && s.resume) {
    const { plane, command } = planeForDrawing(sc, vertex.plane);
    const session = command ? run(base.session, command) : base.session;
    return { ...base, session: { ...session, message: null }, tool: { ...armTool(s.resume), plane, points: [vertex.at], cursor: vertex.at } };
  }
  if (s.op && !hasGizmo(s.op.kind)) return commitOp(base); // the dimension number chip: a click finishes it
  // the handles are dragged, so a click on one does nothing (it must not reselect what is under it)
  const g = gizmoOf(s);
  const hit = g ? hitHandle(g, projector(s.cam, env.w, env.h).project, i.x, i.y) : null;
  // a click on a ring of a repeat, or of the turn being set up, makes that the axis, with no drag needed (`in_206`)
  if (hit && hit.id.startsWith("rot:") && s.op?.kind === "rotate") return { ...base, op: { ...s.op, axis: "xyz".indexOf(hit.id[4]!) as 0 | 1 | 2, typed: "" }, gizmoHover: hit.id, handleSel: hit.id };
  // a click on an arrow selects it: it shows its number then (`in_238`)
  if (hit) return s.repeat && !s.op ? { ...(hit.id.startsWith("rot:") ? setRepeatAxis(base, "xyz".indexOf(hit.id[4]!)) : { ...base, repeat: { ...s.repeat, chosen: hit.id } }), handleSel: hit.id } : { ...base, handleSel: hit.id };
  // a click anywhere else, blank space too, leaves an operation you started, and then acts as a normal click
  return doClickSelect(s.op ? { ...base, op: null, drag: null, gizmoHover: null } : base, i, env, cands, refs, pv);
}

/** A normal click: select what is under it (cycling where things overlap), two select the whole object, three look straight at the plane. */
function doClickSelect(base: AppState, i: Extract<Intent, { type: "click" }>, env: Env, cands: ReturnType<typeof candidatesAt>, refs: Ref[], pv: ReturnType<ReturnType<typeof projector>["view"]>): AppState {
  const sess = base.session;
  const sc = sceneOf(sess);
  const get = lookup(sc);
  // a sketch drawn on a face of the body lies in the same plane as that face: the two are one surface for looking at it and for selecting the whole object
  const planes = refs.map((r) => planeOf(get, r));
  // (a point, line or circle edge under the click with something else: repeated clicks cycle through them, they do not select the object or turn the view)
  const surfaces = refs.every((r) => { const k = sc.parts[r]?.kind; return k === "plane" || k === "face" || k === "body"; });
  const onePlane = refs.length <= 1 || (surfaces && planes.every((q) => !!q) && planes.every((q) => Math.abs(dot(normalOfPlane(q!), normalOfPlane(planes[0]!)) - 1) < 1e-6 && Math.abs(dot(normalOfPlane(q!), sub(q!.at, planes[0]!.at))) < 1e-3));
  // the infinite world planes are only a surface for the ring to land on and for a tool to draw on: a click on one selects nothing (like a click on empty space)
  const selectable = refs.filter((r) => !(sc.parts[r]?.origin === "world" && sc.parts[r]?.kind === "plane"));
  // a quick second click only counts as a double (or triple) click when it is on the same things as the click before and without Shift: picking a vertex and then, quickly, the circle's edge next to it
  // is two selections, not a double click that takes the whole object (`in_162`)
  const count = !i.shift && [...selectable].sort().join("|") === sess.click.spot ? i.count : 1;
  if (count >= 2 && refs[0] && !selectable.length && isWorldPlane(sc, refs[0])) {
    // a world plane under the clicks and nothing else: it is selected and the view turns straight to it, from the side you are on (`in_159`)
    const pl = planeOf(get, refs[0]);
    if (pl) return animateTo(withSession(base, { ...sess, click: { selection: [refs[0]], spot: sess.click.spot }, message: null }), planeView(base.cam, pl, false), env.now);
  }
  // (a point or a line of the body under the double click is a part of the body too: two clicks take the whole object from any part of it, `in_186`)
  const bodyFirst = selectable.length > 0 && selectable.every((r) => sc.parts[r]?.origin === "body"); // (all of them: where a drawn thing lies on the same spot, repeated clicks cycle through them instead)
  // a sketch on its own (a drawn closed figure with no body under it): there is no body for a double click to take, so it goes straight to it, as for a world plane (`in_235`)
  if (count === 2 && onePlane && selectable.length > 0 && selectable.every((r) => sc.parts[r]?.origin === "drawn" && sc.parts[r]?.kind === "face")) {
    const pl = planeOf(get, selectable[0]!);
    if (pl) return animateTo(withSession(base, { ...sess, click: { selection: [selectable[0]!], spot: sess.click.spot }, message: null }), planeView(base.cam, pl, false), env.now);
  }
  if ((onePlane || bodyFirst) && count === 2) {
    // two: the whole object (the view does not turn)
    const o = selectable[0] ? objectOf(sc, selectable[0]) : undefined;
    return o ? withSession(base, { ...sess, click: { selection: [o], spot: sess.click.spot }, message: null }) : base;
  }
  if (!onePlane && bodyFirst && count >= 3) return withSession(base, { ...sess, click: { selection: [selectable[0]!], spot: sess.click.spot }, message: null }); // three on a point or a line: only that part again (the second click had taken the object)
  if (onePlane && count >= 3) {
    // three: only the face (the second click had taken the whole object), and the view turns straight to it from the side you are on
    const pl = refs[0] ? planeOf(get, refs[0]) : null;
    if (!pl) return base;
    const only = selectable[0] ? withSession(base, { ...sess, click: { selection: [selectable[0]], spot: sess.click.spot }, message: null }) : base;
    return animateTo(only, planeView(base.cam, pl, false), env.now);
  }
  const picked = clickOn(sess, selectable, i.shift);
  const next: Session = { ...picked, click: { ...picked.click, selection: withTwins(sc, selectionOf(sess), selectionOf(picked)) } };
  const top = selectionOf(next).at(-1);
  const hit = cands.find((c) => c.ref === top);
  const point = hit && hit.rank === 2 ? surfacePoint(pv, hit.score) : null;
  return { ...withSession(base, next), spread: hit && point ? { ref: hit.ref, point, startMs: env.now } : null };
}

/** A right click opens the ring of operations on what is selected and changes nothing about the selection (`in_140`): select first (one click, a triple click, Shift for several), then right click. */
export function doMenu(s: AppState, i: Extract<Intent, { type: "menu" }>, env: Env): AppState {
  // a repeat that is open (linear, circular or a copy): a right click leaves it and makes the copies; with none to make it just leaves (`in_236`)
  if (!i.button && (s.repeat && !s.op)) return doApply(s);
  // an operation that is open: a right click accepts it and leaves it, as Enter does (`in_244`)
  if (!i.button && s.op) return doApply(s);
  // while a sketching tool is on, a right click puts it away (the ⋯ button still opens the menu): the tool stays on until then or the cancel icon (`in_193`)
  if (s.tool && !i.button) return { ...s, tool: null, resume: null, menu: null };
  // what is under the point (a finger has no hover: a long press must be told what is under it the same way a right click is, or a tool chosen from the ring would not turn the view straight to the plane there, `in_283`)
  const under = i.button ? null : candidatesAt(sceneOf(s.session), projector(s.cam, env.w, env.h).view(i.x, i.y), pickOpts(s))[0]?.ref ?? null;
  return { ...s, menu: menuFor(s.session, i.x, i.y, !!s.repeat, under ?? undefined) };
}

/**
 * The left button held still for a while (`in_235`): the cursor changes, and the drag that follows without letting up draws a rectangle (`handles.doDragMove`); let go, what is in it is selected (`box.finishBox`).
 * Not while a tool or an operation is running, nor on a handle (a drag from there is the handle's).
 */
export function doHold(s: AppState, i: Extract<Intent, { type: "hold" }>, env: Env): AppState {
  if (s.tool || s.op || s.repeat || s.drag) return s;
  const g = gizmoOf(s);
  if (g && hitHandle(g, projector(s.cam, env.w, env.h).project, i.x, i.y)) return s;
  return { ...s, box: { x0: i.x, y0: i.y, x: i.x, y: i.y, shift: i.shift, ...(i.remove ? { remove: true } : {}) }, menu: null };
}
