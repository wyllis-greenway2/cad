// The pointer intents: hover, click (selecting, or drawing when a tool is armed, or finishing an operation) and the menu.
import { CONSTRAINT_GROUPS, fits } from "../constraintlist.ts";
import { whyNoPathRepeat } from "../pathrepeat.ts";
import type { Intent } from "../../shared/input.ts";
import type { Ref } from "../../shared/ref.ts";
import { dist, dot, sub, cross, normalize } from "../../math/vec.ts";
import type { Plane } from "../../operation/part.ts";
import { normalOfPlane, segmentOf, circleOf } from "../../operation/part.ts";
import { lookup, nextId } from "../../operation/scene.ts";
import { gearOfPart, gearOfSelection } from "../../operation/gearscene.ts";
import { planetaryOfPart } from "../../operation/planetary.ts";
import type { Scene } from "../../operation/scene.ts";
import type { Vec3 } from "../../math/vec.ts";
import { scene as sceneOf, selection as selectionOf, clickOn, hoverOn, run } from "../session.ts";
import type { Session } from "../session.ts";
import { candidatesAt } from "../picking.ts";
import { actionsFor, relationKinds } from "../actions.ts";
import type { ToolKind, Tool } from "../tools.ts";
import { diskFaceRef } from "../../operation/loops.ts";
import { lineHint, arcEndHint, hintRelations, circleCentredAt, anchorCentreAt, pointHint, arcBulgeHint, circleRadiusHint, tangentCentre } from "../hints.ts";
import type { Hint } from "../hints.ts";
import { snapOnPlane, guidesOf, finish, planeForDrawing, armTool, pointOnPlane, canHelix, meshSuggestion, snapToMesh } from "../tools.ts";
import { splineEdit } from "../splineedit.ts";
import { startMotion } from "../motion.ts";
import { gearOfBody } from "../../operation/gearcouple.ts";
import { trimAt } from "../../operation/trim.ts";
import type { Command } from "../../operation/commands.ts";
import type { OpKind, Op } from "../operations.ts";
import { startOp, surfaceAxes, canPickFor } from "../operations.ts";
import { similarTo } from "../similar.ts";
import { whyNotGroup, whyNotUngroup, whyNotCombine, applyCut } from "./select.ts";
import { projector, nearTolMm } from "../camera.ts";
import { settings } from "../../shared/settings.ts";
import { planeOf, objectOf } from "../objects.ts";
import type { AppState, Env, MenuItem } from "./state.ts";
import { paneAt } from "../panes.ts";
import type { WorldName } from "../panes.ts";
import { isHard } from "../hard.ts";
import { doLook, selectedSurface } from "./viewing.ts";
import { sectionNow, doSectionClick } from "./section.ts";
import { sketchPlaneOf, pickOpts, withSession, surfacePoint, planeView, animateTo } from "./state.ts";
import { selectedBodies } from "./bodies.ts";
import { commitFigure, commitOp, setRepeatAxis, doApply, finishPicking, picksMany } from "./modal.ts";
import { doGizmoHover, gizmoOf, chosenId, activeOp, movePivotTo } from "./handles.ts";
import { orientApply, hasOrb, putMover } from "./pose.ts";
import { patternValues } from "../pattern.ts";
import { hasGizmo, hitHandle, moveOffset } from "../gizmo.ts";

/** The operations a right click offers (`in_133`), in categories (`in_143`): sketching, constraints, shape, moving and repeating, and delete. The ones that cannot start from the selection are there too, dimmed, with the reason. */
const LEAVES: { id: string; label: string; icon: string; op?: OpKind; tool?: ToolKind; /** a way of selecting more (`in_257`) */ select?: "similar" | "group" | "ungroup" | "combine" | "faces" | "edges" | "vertices" | "paste" | "hard" | "bodies" | "add" }[] = [
  { id: "tool:rect", label: "Rectangle", icon: "rect", tool: "rect" },
  { id: "tool:circle", label: "Circle", icon: "circle", tool: "circle" },
  { id: "tool:line", label: "Line", icon: "line", tool: "line" },
  { id: "tool:arc", label: "Curve", icon: "arc", tool: "arc" },
  { id: "tool:spline", label: "Spline", icon: "spline", tool: "spline" },
  { id: "tool:eccentric", label: "Eccentric cam", icon: "cam", tool: "cam" },
  { id: "tool:snail", label: "Snail cam", icon: "cam", tool: "cam" },
  { id: "tool:ratchet", label: "Ratchet", icon: "cam", tool: "cam" },
  { id: "tool:geneva", label: "Apart", icon: "cam", tool: "cam" },
  { id: "tool:geneva:assembled", label: "Assembled", icon: "cam", tool: "cam" },
  { id: "tool:geneva:model", label: "3D model", icon: "cam", tool: "cam" },
  { id: "tool:linear", label: "Linear ratchet", icon: "cam", tool: "cam" },
  { id: "tool:disc:cycloidal", label: "Cycloidal", icon: "cam", tool: "cam" },
  { id: "tool:disc:harmonic", label: "Harmonic", icon: "cam", tool: "cam" },
  { id: "tool:disc:parabolic", label: "Parabolic", icon: "cam", tool: "cam" },
  { id: "tool:trim", label: "Trim", icon: "scissors", tool: "trim" },
  { id: "tool:gear", label: "Spur gear", icon: "gear", tool: "gear" },
  { id: "tool:bevel", label: "Bevel gear", icon: "bevelgear", tool: "gear" },
  { id: "tool:crown", label: "Crown gear", icon: "crowngear", tool: "gear" },
  { id: "tool:spiral", label: "Spiral bevel", icon: "spiralbevel", tool: "gear" },
  { id: "tool:worm", label: "Worm", icon: "worm", tool: "gear" },
  { id: "tool:wormwheel", label: "Worm wheel", icon: "wormwheel", tool: "gear" },
  { id: "tool:planetary", label: "Planetary set", icon: "planetary", tool: "gear" },
  { id: "tool:ring", label: "Ring gear", icon: "ringgear", tool: "gear" },
  { id: "tool:rack", label: "Rack", icon: "rack", tool: "gear" },
  { id: "tool:gt2", label: "GT2 pulley", icon: "txtGT2", tool: "gear" },
  { id: "tool:gt3", label: "GT3 pulley", icon: "txtGT3", tool: "gear" },
  { id: "tool:htd5", label: "HTD 5M", icon: "txt5M", tool: "gear" },
  { id: "tool:htd8", label: "HTD 8M", icon: "txt8M", tool: "gear" },
  { id: "tool:sprocket", label: "ANSI sprocket", icon: "sprocket", tool: "gear" },
  { id: "tool:isosprocket", label: "ISO sprocket", icon: "sprocket", tool: "gear" },
  { id: "tool:clock", label: "Clock gear", icon: "clockgear", tool: "gear" },
  { id: "tool:clockring", label: "Clock ring", icon: "clockring", tool: "gear" },
  { id: "tool:clockrack", label: "Clock rack", icon: "rack", tool: "gear" },
  { id: "gear:edit", label: "Edit gear", icon: "gear" },
  { id: "cam:edit", label: "Edit cam", icon: "cam" },
  { id: "cam:follow", label: "Follower", icon: "cam" },
  { id: "motion:play", label: "Play", icon: "play" },
  { id: "motion:link", label: "Link joints", icon: "play" },
  { id: "gear:helix", label: "Helix", icon: "helical" },
  { id: "gear:mesh", label: "Mesh gear", icon: "meshgear" },
  { id: "gear:meshrack", label: "Mesh rack", icon: "meshrack" },
  { id: "gear:meshring", label: "Mesh ring", icon: "meshring" },
  { id: "op:offset", label: "Offset", icon: "offset", op: "offset" },
  { id: "op:pushpull", label: "Push pull", icon: "pushpull", op: "pushpull" },
  { id: "op:edge", label: "Fillet chamfer", icon: "edge", op: "edge" },
  { id: "op:hollow", label: "Hollow", icon: "hollow", op: "hollow" },
  { id: "op:revolve", label: "Revolve", icon: "revolve", op: "revolve" },
  { id: "op:loft", label: "Loft", icon: "loft", op: "loft" },
  { id: "op:sweep", label: "Sweep", icon: "sweep", op: "sweep" },
  { id: "op:mirror", label: "Mirror copy", icon: "mirror", op: "mirror" },
  { id: "op:scale", label: "Scale", icon: "scale", op: "scale" },
  { id: "op:move", label: "Move", icon: "move", op: "move" },
  { id: "op:rotate", label: "Rotate", icon: "rotate", op: "rotate" },
  { id: "op:copy", label: "Copy", icon: "copy", op: "copy" },
  { id: "clipboard:paste", label: "Paste", icon: "paste", select: "paste" },
  { id: "op:linear", label: "Line repeat", icon: "linear", op: "linear" },
  { id: "op:circular", label: "Round repeat", icon: "circular", op: "circular" },
  { id: "repeat:path", label: "Path repeat", icon: "pathrepeat" }, // (`dec_path_repeat`, `in_841`: a figure repeated along a line, a curve or an outline)
  { id: "models:fasteners", label: "Fasteners", icon: "fastener" }, // (Shape, then Models: a dialog with drawings, `dec_parts_interface`, `in_812`)
  { id: "models:holes", label: "Fastener Holes", icon: "fastenerHole" }, // (the hole for a fastener cut into the face selected, `in_813`)
  { id: "body:hard", label: "Hard body", icon: "hard", select: "hard" }, // (a constraint: no other body goes into it while one or the other is moved by hand, `in_473`, `in_490`)
  { id: "combine:parts", label: "Combine", icon: "subtract", select: "combine" }, // (add, cut and what is left of both: the parts the bodies make are each kept or tossed, `in_298`)
  { id: "select:similar", label: "Select similar", icon: "similar", select: "similar" },
  { id: "select:faces", label: "All faces", icon: "selfaces", select: "faces" },
  { id: "select:edges", label: "All edges", icon: "seledges", select: "edges" },
  { id: "select:vertices", label: "All vertices", icon: "selvertices", select: "vertices" },
  { id: "select:bodies", label: "All bodies", icon: "selbodies", select: "bodies" },
  { id: "select:add", label: "Add mode", icon: "seladd", select: "add" },
  { id: "select:group", label: "Group", icon: "group", select: "group" },
  { id: "select:ungroup", label: "Ungroup", icon: "ungroup", select: "ungroup" },
];
/** a submenu: its own icon in the ring that opens another ring of what is in it (`in_588`: every gear tool is in the Gear submenu of Sketch) */
interface Group { id: string; label: string; icon: string; items: (string | Group)[] }
const GEARS: Group = {
  id: "gears", label: "Gear", icon: "gear", items: [
    "tool:gear", "tool:ring", "tool:rack", "tool:planetary",
    "tool:bevel", "tool:spiral", "tool:crown",
    { id: "worms", label: "Worm", icon: "worm", items: ["tool:worm", "tool:wormwheel"] },
    { id: "clockgears", label: "Clock", icon: "clockgear", items: ["tool:clock", "tool:clockring", "tool:clockrack"] },
    { id: "pulleys", label: "Pulley", icon: "pulley", items: ["tool:gt2", "tool:gt3", "tool:htd5", "tool:htd8"] },
    { id: "sprockets", label: "Sprocket", icon: "sprocket", items: ["tool:sprocket", "tool:isosprocket"] },
    // (Edit, Helix and Mesh are not in the ring: they are on the gear's own icon, `in_771`)
  ],
};
const CATEGORIES: { id: string; label: string; icon: string; items: (string | Group)[] }[] = [
  { id: "sketch", label: "Sketch", icon: "sketch", items: ["tool:rect", "tool:circle", "tool:line", "tool:arc", "tool:spline", { id: "cams", label: "Cam", icon: "cam", items: ["tool:eccentric", "tool:snail", "tool:ratchet", "tool:linear", { id: "genevas", label: "Geneva", icon: "cam", items: ["tool:geneva", "tool:geneva:assembled", "tool:geneva:model"] }, { id: "disccams", label: "Disc cam", icon: "cam", items: ["tool:disc:cycloidal", "tool:disc:harmonic", "tool:disc:parabolic"] }, "cam:edit", "cam:follow"] }, GEARS, "tool:trim", "op:offset"] },
  { id: "shape", label: "Shape", icon: "body", items: ["op:pushpull", "op:edge", "op:hollow", "op:revolve", "op:loft", "op:sweep", "op:scale", "combine:parts", { id: "models", label: "Models", icon: "models", items: ["models:fasteners", "models:holes"] }] },
  { id: "place", label: "Move", icon: "move", items: ["op:move", "op:rotate", "motion:play", "motion:link"] },
  { id: "repeat", label: "Repeat", icon: "copy", items: ["op:copy", "clipboard:paste", "op:mirror", "op:linear", "op:circular", "repeat:path"] },
  { id: "select", label: "Select", icon: "pointer", items: ["select:add", "select:similar", "select:bodies", "select:faces", "select:edges", "select:vertices", "select:group", "select:ungroup"] },
];
/** While a repeat is open only drawing, Move and Rotate (and constraints) are offered (the rest could change what is being repeated or the pivot's parts). */
const IN_REPEAT = new Set(["tool:rect", "tool:circle", "tool:line", "tool:arc", "tool:spline", "tool:eccentric", "tool:snail", "tool:ratchet", "tool:linear", "tool:geneva", "tool:geneva:assembled", "tool:geneva:model", "tool:disc:cycloidal", "tool:disc:harmonic", "tool:disc:parabolic", "tool:gear", "tool:worm", "tool:wormwheel", "tool:ring", "tool:rack", "tool:gt2", "tool:gt3", "tool:htd5", "tool:htd8", "tool:sprocket", "tool:isosprocket", "tool:clock", "tool:clockring", "tool:clockrack", "tool:trim", "op:move", "op:rotate", "op:copy", "op:mirror", "op:linear", "op:circular"]);
const category = (id: string, label: string, icon: string, kids: MenuItem[]): MenuItem => {
  const first = kids.find((k) => k.enabled);
  return { id, label, icon, enabled: true, why: null, children: kids, ...(first ? {} : { dim: true as const }) }; // (always opens, so every ring can be looked through: dimmed when nothing in it applies now, `in_538`)
};
function menuFor(session: Session, x: number, y: number, repeating = false, over: Ref | null | undefined = null, view: { wireframe: boolean; tape: boolean; section: boolean; clip?: boolean; adding?: boolean; touch?: boolean } = { wireframe: false, tape: false, section: false }): AppState["menu"] {
  const adding = !!view.adding;
  const sc = sceneOf(session);
  const sel = selectionOf(session);
  const leaf = new Map<string, MenuItem>(LEAVES.map((r) => {
    const base = { id: r.id, label: r.label, icon: r.icon };
    if (repeating && !IN_REPEAT.has(r.id)) return [r.id, { ...base, enabled: false, why: "apply or cancel the repeat that is open first" }];
    if (r.id === "motion:play") { const body = sel.find((x) => sc.parts[x]?.kind === "body"); const m = body ? startMotion(sc, body, "turn") : null; return [r.id, { ...base, enabled: !!m?.ok, why: m?.ok ? null : "select a body on a pin or a rod (the first body of a coaxial mate)" }]; }
    if (r.id === "motion:link") { const n = sel.filter((x) => sc.parts[x]?.kind === "body").length; return [r.id, { ...base, enabled: n === 2, why: n === 2 ? null : "select two bodies that each turn on a pin or slide on a rod" }]; }
    if (r.id === "cam:follow") { const has = sel.some((x) => sc.parts[x]?.kind === "body" && !!gearOfBody(sc, x)?.spec.cam); return [r.id, { ...base, enabled: has, why: has ? null : "select a cam with its body, then the rod that rides it" }]; }
    if (r.id === "cam:edit") { const has = sel.some((x) => !!gearOfPart(sc, x)?.spec.cam); return [r.id, { ...base, enabled: has, why: has ? null : "select a cam" }]; }
    if (r.id === "gear:helix") { // (the helix is a number of a plain gear, `in_693`)
      const rec = sel.map((x) => gearOfSelection(sc, x)).find((g) => !!g);
      const why = !rec ? "select a gear" : !canHelix(rec.spec) ? "a helix goes on a plain gear (not yet a pulley, sprocket, clock gear or worm)" : null;
      return [r.id, { ...base, enabled: !why, why }];
    }
    if (r.id === "gear:edit" || r.id === "gear:mesh" || r.id === "gear:meshrack" || r.id === "gear:meshring") { const has = sel.some((x) => !!gearOfSelection(sc, x) || (r.id === "gear:edit" && !!planetaryOfPart(sc, x))); return [r.id, { ...base, enabled: has, why: has ? null : "select a gear" }]; }
    if (r.id === "repeat:path") { const why = whyNoPathRepeat(session); return [r.id, { ...base, enabled: !why, why }]; }
    if (r.id === "models:fasteners") return [r.id, { ...base, enabled: true, why: null }];
    if (r.id === "models:holes") return [r.id, { ...base, enabled: true, why: null }]; // (it opens a panel that says what to select, `dec_parts_tool`)
    if (r.tool) return [r.id, { ...base, enabled: true, why: null }];
    if (r.select === "similar") { const q = similarTo(sc, sel); return [r.id, { ...base, enabled: q.ok, why: q.ok ? null : q.why }]; }
    if (r.select === "combine") { const why = whyNotCombine(session); return [r.id, { ...base, enabled: !why, why }]; }
    if (r.select === "hard") {
      const bodies = sel.filter((x) => sc.parts[x]?.kind === "body" && !!(sc.parts[x] as { id?: string }).id);
      const every = bodies.length > 0 && bodies.every((x) => isHard(sc, x));
      return [r.id, { ...base, label: every ? "Soft body" : "Hard body", enabled: bodies.length > 0, why: bodies.length ? null : "select a body" }];
    }
    if (r.select === "add") return [r.id, { ...base, label: adding ? "Stop adding" : "Add mode", enabled: true, why: null }];
    if (r.select === "bodies") { const any = Object.values(sc.parts).some((q) => q.kind === "body"); return [r.id, { ...base, enabled: any, why: any ? null : "no bodies yet" }]; }
    if (r.select === "paste") return [r.id, { ...base, enabled: !!view.clip, why: view.clip ? null : "nothing is copied: select something and press Ctrl+C" }];
    if (r.select === "faces" || r.select === "edges" || r.select === "vertices") return [r.id, { ...base, enabled: true, why: null }];
    if (r.select) { const why = r.select === "group" ? whyNotGroup(session) : whyNotUngroup(session); return [r.id, { ...base, enabled: !why, why }]; }
    const st = startOp(sc, sel, r.op!);
    return [r.id, { ...base, enabled: true, why: st.ok ? null : st.why, ...(st.ok ? {} : { picks: true as const }) }]; // (not selected yet: it can be chosen and waits for what to click, `in_464`)
  }));
  const build = (i: string | Group): MenuItem => (typeof i === "string" ? leaf.get(i)! : category(i.id, i.label, i.icon, i.items.map(build)));
  const acts = actionsFor(sc, sel);
  const live = acts.filter((a) => a.group === "relation");
  const selKinds = relationKinds(sc, sel);
  // every constraint and mate there is, in groups by what they apply to: the ring never changes shape with the selection; one that does not fit it is dimmed and says what to select (`in_666`)
  const groups: MenuItem[] = CONSTRAINT_GROUPS.map((g) => category(g.id, g.label, g.items[0]!.id, g.items.map((it): MenuItem => {
    const a = live.find((x) => x.id === it.id);
    const fit = fits(g, selKinds);
    return { id: it.id, label: it.label, icon: it.id, enabled: fit && !!a && a.enabled, why: !fit || !a ? `select ${g.what} first` : a.why };
  })));
  groups.push(category("group:bodies", "Bodies", "hard", [leaf.get("body:hard")!]));
  const del = acts.find((a) => a.id === "delete");
  // looking straight at the selected plane or face, or at the one the click was on (`in_171`: the eye lives here, not on the screen)
  const clicked = over ? planeOf(lookup(sc), over) : null; // (the surface the right click was on: a face, a sketch's plane, a world plane; a sketch tool chosen from the ring turns to it when the selection does not say which plane)
  const target = lookTarget(sc, sel, over);
  const items: MenuItem[] = [
    ...CATEGORIES.slice(0, 1).map((c) => category(c.id, c.label, c.icon, c.items.filter((i) => i !== "select:add" || view.touch || adding).map(build))),
    category("constraints", "Constraints", "constraint", groups), // (a hard body is a constraint on every body that meets it, `in_490`)
    ...CATEGORIES.slice(1).map((c) => category(c.id, c.label, c.icon, c.items.filter((i) => i !== "select:add" || view.touch || adding).map(build))),
    // the eye: how the model is looked at (`in_386`): straight at a surface, as wireframe, and the tape measure
    category("view", "View", "eye", [
      { id: "look", label: "Look at", icon: "look", enabled: !!target, why: target ? null : "select a plane or a face, or right-click on one" },
      { id: "view:game", label: "Game mode", icon: "game", enabled: true, why: null },
      { id: "view:section", label: "Section", icon: "section", enabled: true, why: null }, // (one item: a new plane, cutting; its icons change that, `in_466`)
      { id: "view:hide", label: "Hide body", icon: "eyeOff", enabled: selectedBodies(sc, sel).length > 0, why: "select a body to hide (a hidden body comes back with its eye or from the Bodies list)" }, // (the eye that hovered on a body is here now, `in_697`)
      { id: "view:wireframe", label: "Wireframe", icon: "wireframe", enabled: true, why: null },
      { id: "tape:measure", label: "Tape measure", icon: "dimension", enabled: true, why: null },
    ]),
    // the actions on what is there: undo and redo, and delete (`in_538`)
    category("actions", "Actions", "trash", [
      { id: "undo", label: "Undo", icon: "undo", enabled: session.history.cursor > 0, why: "nothing to undo" },
      { id: "redo", label: "Redo", icon: "redo", enabled: session.history.cursor < session.history.commands.length, why: "nothing to redo" },
      { id: "delete", label: "Delete", icon: "trash", enabled: !!del?.enabled, why: del?.why ?? "select something to delete" },
    ]),
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

/** Where a click puts the mover's sphere (`in_416`): on a vertex, at the point of the edge or the face that was clicked; for a move the mover goes where the body's own moving has not yet taken it, so the offset so far is taken out. */
function moverPlace(sc: Scene, c: { ref: Ref; kind: string; score: number } | undefined, pv: ReturnType<ReturnType<typeof projector>["view"]>, op: Op): Vec3 | null {
  const p = c ? sc.parts[c.ref] : undefined;
  if (!c || !p) return null;
  let at: Vec3 | null = null;
  if (p.kind === "corner") at = p.at;
  else if (p.kind === "line") { const sg = segmentOf(lookup(sc), p.ref); at = sg ? [(sg[0][0] + sg[1][0]) / 2, (sg[0][1] + sg[1][1]) / 2, (sg[0][2] + sg[1][2]) / 2] : null; }
  else if (p.kind === "circle") at = circleOf(lookup(sc), p.ref)?.center ?? null;
  else if (p.kind === "plane" && p.origin !== "body" && op.pivot) { // (a plane that is not a face of the body, a world plane or a sheet: the orb goes into it, where it was across it, `in_652`)
    const n = normalOfPlane(p);
    const off = dot(sub(op.pivot, p.at), n);
    at = [op.pivot[0] - n[0] * off, op.pivot[1] - n[1] * off, op.pivot[2] - n[2] * off];
  } else at = surfacePoint(pv, c.score);
  return at && op.kind === "move" ? sub(at, moveOffset(sc, op)) : at;
}

/** The axes the mover takes from what it is put on (`in_417`): on a flat face Z is the face's outward normal, on a straight edge X runs along it; a vertex or a round leaves them as they are. */
function moverTurned(sc: Scene, c: { ref: Ref } | undefined): [Vec3, Vec3, Vec3] | null {
  const p = c ? sc.parts[c.ref] : undefined;
  if (!p) return null;
  const perp = (a: Vec3): [Vec3, Vec3] => { const u = normalize(cross(Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], a)); return [u, cross(a, u)]; };
  if (p.kind === "plane" && p.origin === "body") return surfaceAxes(sc, p);
  if (p.kind === "line" && !p.circle && !p.mid) {
    const sg = segmentOf(lookup(sc), p.ref);
    if (!sg) return null;
    const x = normalize(sub(sg[1], sg[0]));
    const [u, v] = perp(x);
    return [x, u, v];
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
  const pane = paneAt(s.cam, env.w, env.h, x, y, s.worldHidden);
  if (!pane) return null;
  const sc = sceneOf(s.session);
  const there = candidatesAt(sc, projector(s.cam, env.w, env.h).view(x, y), pickOpts(s));
  // the pane gives way to the body and to a point or a line of a drawing right at the pointer, but not to the fill of a figure drawn over it: that stays selectable by its edges (`in_433`)
  return there.some((c) => { const p = sc.parts[c.ref]; return !!p && p.origin !== "world" && (p.origin === "body" || p.kind === "corner" || p.kind === "line" || p.kind === "circle"); }) ? null : pane;
}

const PANE_BUTTON: Record<WorldName, "X" | "Y" | "Z"> = { YZ: "X", XZ: "Y", XY: "Z" }; // (the button that looks at a plane: X at the plane across it)
const isWorldPlane = (sc: Scene, r: Ref): boolean => { const p = sc.parts[r]; return !!p && p.origin === "world" && p.kind === "plane"; };

export function doHover(s: AppState, i: Extract<Intent, { type: "hover" }>, env: Env): AppState {
  const sc = sceneOf(s.session);
  const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
  // a little pane of another world plane under the pointer lights up and takes the pointer: nothing else is hovered through it (`in_190`)
  const pane = !s.tool && !s.op && !s.drag ? paneUnder(s, i.x, i.y, env) : null;
  if (pane) return { ...withSession(s, hoverOn(s.session, undefined)), hoverPoint: null, paneHover: pane };
  // an operation that is waiting for what to click lights only what it can use (`in_465`)
  const c = candidatesAt(sc, pv, pickOpts(s)).find((k) => !s.picking || canPickFor(sc, s.picking.kind, k.ref));
  const point = c && c.rank === 2 ? surfacePoint(pv, c.score) : null;
  let next: AppState = { ...withSession(s, hoverOn(s.session, c?.ref)), hoverPoint: point, paneHover: null };
  if (s.tool?.plane) {
    const pl = sc.parts[s.tool.plane];
    const raw0 = pl && pl.kind === "plane" ? snapOnPlane(sc, pv, pl) : null;
    // the centre of a circle being drawn at the centre of a circular edge of the body: it goes there and will be concentric with it (`in_308`)
    const anc = raw0 && pl && pl.kind === "plane" && s.tool.kind === "circle" && !s.tool.points.length ? anchorCentreAt(sc, pl, pv) : null;
    const raw = anc?.at ?? raw0;
    const h = raw && pl && pl.kind === "plane" ? hintFor(sc, s.tool, pl, pv, raw) : null; // (the end of a line, an end of an arc, the bow of an arc: each takes a constraint it is close to)
    // a circle's centre on another circle's centre: it will be made concentric
    const about = raw && pl && pl.kind === "plane" && s.tool.kind === "circle" && !s.tool.points.length ? circleCentredAt(sc, pl, raw) : (s.tool.concentric ?? null);
    const hints: Hint[] = h ? h.hints : about ? [{ kind: "concentric", ref: about }] : [];
    if (raw && !s.tool.sized) next = { ...next, tool: { ...s.tool, cursor: h ? h.at : raw, hints } }; // (a gear whose size a click has set keeps it, `in_688`)
  }
  // trim: the part of the line or circle under the pointer that a click would cut off
  // (and the line or circle itself is not lit as a whole: only the part that would go is, in the selected blue, and nothing at all where nothing crosses; `in_206`)
  if (s.tool?.kind === "trim") next = { ...withSession(next, hoverOn(next.session, undefined)), hoverPoint: null, tool: { ...s.tool, trimming: trimUnder(sc, pv) } };
  // a circle tool still armed (no plane yet): where the centre would go, and whether it is on another circle's centre; a line or an arc: whether its first end would be on a line or a circle
  if (s.tool && !s.tool.plane && (s.tool.kind === "circle" || s.tool.kind === "arc" || s.tool.kind === "line" || s.tool.kind === "rect" || s.tool.kind === "gear" || s.tool.kind === "cam")) {
    const planeRef = selectedSurface(sc, selectionOf(s.session)) ?? drawingPlane(sc, candidatesAt(sc, pv, pickOpts(s)).map((k) => k.ref)) ?? drawingPlane(sc, selectionOf(s.session));
    const pl = planeRef ? (lookup(sc)(planeRef) as Plane) : null;
    const at = pl ? snapOnPlane(sc, pv, pl) : null;
    const lined = at && pl ? guidesOf(sc, pl, at) : []; // (the pointer lines up with a corner: it is shown, and the click takes it, `in_381`)
    if (s.tool.kind === "rect") {
      const h = at && pl ? pointHint(sc, pl, pv, at) : null;
      next = { ...next, tool: { ...s.tool, guides: lined, hints: h?.hints ?? [], cursor: h?.hints.length ? h.at : s.tool.held || lined.length ? at : null } };
    } else if (s.tool.kind !== "circle") {
      const h = at && pl ? pointHint(sc, pl, pv, at) : null;
      next = { ...next, tool: { ...s.tool, guides: lined, hints: h?.hints ?? [], cursor: h?.hints.length ? h.at : s.tool.held || lined.length ? at : null } }; // (a finger holds the cursor where it is aimed, `in_286`)
    } else {
      const anc = at && pl ? anchorCentreAt(sc, pl, pv) : null;
      const about = anc?.ref ?? (at && pl ? circleCentredAt(sc, pl, at) : null);
      const h = !about && at && pl ? pointHint(sc, pl, pv, at) : null; // (a circle's centre on another circle's edge or on a line, `in_294`)
      next = { ...next, tool: { ...s.tool, hints: about ? [{ kind: "concentric", ref: about }] : h?.hints ?? [], cursor: anc ? anc.at : about ? at : h?.hints.length ? h.at : s.tool.held ? at : null } };
    }
  }
  return doGizmoHover(next, i.x, i.y, env);
}

/** The constraint the pointer is close to for the tool being drawn with: the end of a line, an end of an arc, or the bow of an arc (a height typed in is not moved by one). */
function hintFor(sc: Scene, t: Tool, pl: Plane, pv: ReturnType<ReturnType<typeof projector>["view"]>, raw: Vec3): { at: Vec3; hints: Hint[] } | null {
  if (t.kind === "trim") return null;
  if (!t.points.length) return pointHint(sc, pl, pv, raw); // (a first point of any figure: on a line or a circle, `in_294`: a circle's centre and a rectangle's corner are points like a line's end)
  if (t.kind === "line") return lineHint(sc, pl, t.points[0]!, pv, raw);
  if (t.kind === "spline") return pointHint(sc, pl, pv, raw); // (each point of a spline can be on a corner or a line already drawn)
  if (t.kind === "rect") return pointHint(sc, pl, pv, raw); // (the opposite corner)
  if (t.kind === "gear" || t.kind === "cam") return null; // (the size: the pointer's distance from the centre, or the numbers typed)
  if (t.kind === "circle") return t.typed[0] === "" ? circleRadiusHint(sc, pl, t.points[0]!, pv, raw) : null; // (the size: a number, or a point on the edge that touches another circle, `in_296`)
  if (t.points.length < 2) return arcEndHint(sc, pl, t.points[0]!, pv, raw); // (an arc's other end: level or upright with the first, `in_381`)
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
 * A tap while a sketch tool is on, for a finger (`in_286`, `in_288`): it has no hover, so a figure starts as soon as it is tapped (the first point is set right there) and the next point is already held, a little way off,
 * to be moved with its drag icon (its hints are the hover's) while the first has an icon of its own; a tap anywhere then sets the point held where it is. When that finished the figure it is made and the tool is put away (an arc goes on to its bow first), so a tap that applies also ends the tool (`in_289`). The trim tool has one step: a tap is a click.
 */
export function doTapAim(s: AppState, i: Extract<Intent, { type: "tapAim" }>, env: Env): AppState {
  if (!s.tool) return doClick(s, { type: "click", x: i.x, y: i.y, count: 1, shift: false }, env);
  if (s.tool.kind === "trim") {
    // the scissors cut where a tap is over a part that can be cut off; a tap in free space is a right click: the tool is put away (`in_292`)
    const over = trimUnder(sceneOf(s.session), projector(s.cam, env.w, env.h).view(i.x, i.y));
    return over ? doClick(s, { type: "click", x: i.x, y: i.y, count: 1, shift: false }, env) : { ...s, tool: null, resume: null, menu: null };
  }
  if (!s.tool.held || !s.tool.cursor) return holdNext(doClick({ ...s, tool: { ...s.tool, held: undefined } }, { type: "click", x: i.x, y: i.y, count: 1, shift: false }, env), env); // (the first point is set where the tap is)
  const at = projector(s.cam, env.w, env.h).project(s.tool.cursor); // (the point held is set where it is)
  return holdNext(doClick({ ...s, tool: { ...s.tool, held: undefined } }, { type: "click", x: at[0], y: at[1], count: 1, shift: false }, env), env);
}

/** After a point is set: the next is held a little way off where the tap can be seen and reached (up and to the right of the last point, so a rectangle or a circle shows at once; an arc's bow, to one side of its chord), unless the figure is made. */
function holdNext(s: AppState, env: Env): AppState {
  const t = s.tool;
  if (!t || !t.points.length) return t ? { ...s, tool: null, resume: null } : s; // (the figure is made: it is applied and the tool is put away with it, as a right click would, `in_289`)
  const pr = projector(s.cam, env.w, env.h);
  const last = pr.project(t.points[t.points.length - 1]!);
  let target: [number, number] = [last[0] + 90, last[1] - 70];
  if (t.kind === "arc" && t.points.length >= 2) {
    const [a, b] = [pr.project(t.points[0]!), pr.project(t.points[1]!)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    target = [(a[0] + b[0]) / 2 - ((b[1] - a[1]) / len) * 50, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / len) * 50];
  }
  const [x, y] = [Math.max(40, Math.min(env.w - 40, target[0])), Math.max(90, Math.min(env.h - 90, target[1]))];
  const held = doHover({ ...s, tool: { ...t, held: true } }, { type: "hover", x, y }, env);
  return held.tool?.cursor ? held : { ...held, tool: { ...held.tool!, held: undefined } };
}

/** A finger drags the icon of a point already placed (`in_288`): the point goes where the icon is, with the hints a hover gives it (on a line, on a circle, tangent). */
export function doMovePoint(s: AppState, i: Extract<Intent, { type: "movePoint" }>, env: Env): AppState {
  const t = s.tool;
  const sc = sceneOf(s.session);
  const pl = t?.plane ? sc.parts[t.plane] : null;
  if (!t || pl?.kind !== "plane" || i.index < 0 || i.index >= t.points.length) return s;
  const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
  const raw = snapOnPlane(sc, pv, pl);
  if (!raw) return s;
  const whole0 = t.kind === "circle" && i.index === 0 && !!t.cursor;
  // the centre of a circle that is moved whole: where its edge would touch another circle it takes that place and says tangent (`in_300`)
  const touching = whole0 ? tangentCentre(sc, pl, dist(t.points[0]!, t.cursor!), raw, nearTolMm(s.cam)) : null;
  const h = touching ? { at: touching.at, hints: [{ kind: "tangent", ref: touching.ref } as Hint] } : pointHint(sc, pl, pv, raw); // (any point of any figure, `in_294`)
  const at = h?.hints.length ? h.at : raw;
  const by: Vec3 = [at[0] - t.points[i.index]![0], at[1] - t.points[i.index]![1], at[2] - t.points[i.index]![2]];
  // a circle has its size set by the held point (its icon) and the centre's icon moves the whole circle at that size; so has an arc once its bow is held: its ends' icons move the whole curve (`in_289`)
  const whole = (t.kind === "circle" && i.index === 0) || (t.kind === "arc" && t.points.length >= 2 && !!t.cursor);
  const shift = (p: Vec3): Vec3 => [p[0] + by[0], p[1] + by[1], p[2] + by[2]];
  const points = t.points.map((p, k) => (whole ? shift(p) : k === i.index ? at : p));
  const ends = t.ends ? t.ends.map((e, k) => (k === i.index ? h?.hints ?? [] : e)) : t.ends;
  return { ...s, tool: { ...t, points, ...(whole && t.cursor ? { cursor: shift(t.cursor) } : {}), ...(ends ? { ends } : {}), hints: h?.hints ?? [] } };
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
    const planeRef = t.plane ?? sketchPlaneOf(base)?.ref ?? selectedSurface(sc, selectionOf(sess)) ?? drawingPlane(sc, refs) ?? drawingPlane(sc, selectionOf(sess)); // (the plane the tool is already on, else the one being looked at straight, else what is under the click: a block in front of the plane does not take the drawing, `in_194`)
    const pl = planeRef ? (lookup(sc)(planeRef) as Plane) : null;
    const at0 = pl ? snapOnPlane(sc, pv, pl) : null;
    if (!pl || !at0) return { ...base, session: { ...sess, message: "click on a surface to draw on" } };
    const { plane, command } = planeForDrawing(sc, pl.ref);
    const session = command ? run(sess, command) : sess;
    const anc = t.kind === "circle" ? anchorCentreAt(sceneOf(session), lookup(sceneOf(session))(plane) as Plane, pv) : null; // (the centre of a circular edge of the body, `in_308`)
    const at = anc?.at ?? at0;
    const about = t.kind === "circle" ? anc?.ref ?? circleCentredAt(sceneOf(session), lookup(sceneOf(session))(plane) as Plane, at) : null;
    const first = pointHint(sc, pl, pv, at); // (the first end of a line or an arc on a line or a circle says so, `in_280`, `in_281`)
    const from = first ? first.at : at;
    return { ...base, session: { ...session, message: null }, tool: { ...t, plane, points: [from], cursor: from, ...(first ? { ends: [first.hints] } : {}), ...(about ? { concentric: about } : {}) } };
  }
  const plane = sc.parts[t.plane!] as Plane;
  const flat = snapOnPlane(sc, pv, plane);
  const hint = flat ? hintFor(sc, t, plane, pv, flat) : null;
  const at = hint ? hint.at : flat;
  if (!at) return base;
  if (t.kind === "gear" && t.points.length) {
    // a gear: the first click after its centre only sets the size and the number box stays open; the next click in space makes it and starts the next gear (`in_688`)
    const sug = !t.sized && !i.shift ? meshSuggestion(sc, t) : null; // (next to a gear it would mesh with: the click makes the gear that meshes, Shift leaves it, `in_709`)
    if (sug) return { ...base, tool: snapToMesh(sug, t), session: { ...sess, message: `meshed with ${sug.src.id}: ${sug.teeth} teeth` } };
    if (!t.sized && !t.gear?.planetary) return { ...base, tool: { ...t, cursor: at, sized: true } }; // (a planetary set has no size to set: the next click makes it)
    const done = commitFigure(base, finish(sc, t));
    return done.tool && !done.tool.points.length && !done.session.message ? clickWithTool(done, i, env, refs) : done;
  }
  if (t.kind === "arc" && t.points.length < 2) {
    // an arc: the second click is its other end, the third sets how far it bows out (the pointer's distance from the chord); an end on a line or a circle says so
    return dist(at, t.points[0]!) < 1e-6 ? base : { ...base, tool: { ...t, points: [...t.points, at], cursor: at, typed: ["", ""], ends: [...(t.ends ?? []), hint?.hints ?? []] } };
  }
  if (t.kind === "spline") { // a spline: each click places a point of it; a click on the last point again, a double click, or Enter makes it (`dec_spline_and_cams`)
    const pr0 = projector(base.cam, env.w, env.h);
    const [fx, fy] = pr0.project(t.points[0]!);
    if (t.points.length >= 3 && Math.hypot(fx - i.x, fy - i.y) <= settings.pick.pointPx) return commitFigure(base, finish(sc, { ...t, points: [...t.points, t.points[0]!] })); // (a click on the first point closes the curve)
    if (dist(at, t.points[t.points.length - 1]!) < 1e-6 || i.count >= 2) return commitFigure(base, finish(sc, t));
    return { ...base, tool: { ...t, points: [...t.points, at], cursor: at, typed: ["", ""] } };
  }
  // a rectangle, a circle, a line: the second click finishes it and the tool is put away (a line is one segment: leave it open, or draw the next to close a shape)
  const fin = t.kind === "line" ? (dist(at, t.points[0]!) < 1e-6 ? null : finish(sc, { ...t, points: [t.points[0]!, at], cursor: at })) : finish(sc, { ...t, cursor: at });
  let done = t.kind === "line" && !fin ? base : commitFigure(base, fin);
  // the line or arc made with the constraints it was close to: its ends on a line or a circle, and the rest (level, upright, parallel, square, as long as, tangent): one way for both (`in_281`)
  const curve = t.kind === "line" || t.kind === "arc" ? fin?.select[0] : undefined;
  const isOn = (h: Hint) => h.kind === "onLine" || h.kind === "onCircle";
  const ends: Hint[][] = t.kind === "arc" ? (t.ends ?? []) : [t.ends?.[0] ?? [], (hint?.hints ?? []).filter(isOn)];
  const chord = t.kind === "arc" ? (t.ends?.[1] ?? []).filter((h) => h.kind === "horizontal" || h.kind === "vertical") : []; // (the other end was placed level or upright with the first)
  const rest = [...chord, ...(hint?.hints ?? []).filter((h) => t.kind === "line" ? !isOn(h) : true)];
  if (curve && done !== base && !(done.tool && done.tool.points.length) && !done.session.message && (ends.some((e) => e.length) || rest.length)) {
    let session = done.session;
    for (const r of hintRelations(sceneOf(session), curve, ends, rest)) {
      session = run(session, { type: "addRelation", relation: { id: nextId(sceneOf(session), "r"), kind: r.kind, parts: r.parts } });
      if (session.message) break;
    }
    done = { ...done, session };
  }
  // a circle's centre and a rectangle's corners that were put on a line or a circle say so, as a line's ends do (`in_294`)
  if ((t.kind === "rect" || t.kind === "circle") && fin && done !== base && !done.session.message) {
    const pairs: [Vec3, Hint[]][] = [[t.points[0]!, t.ends?.[0] ?? []], ...(t.kind === "rect" ? [[at, (hint?.hints ?? []).filter(isOn)] as [Vec3, Hint[]]] : [])];
    let session = done.session;
    for (const [pt, hs] of pairs) {
      const corner = Object.values(sceneOf(session).parts).find((q) => q.kind === "corner" && q.origin === "drawn" && dist(q.at, pt) < 1e-6);
      for (const h of hs) if (corner && h.ref && isOn(h)) { session = run(session, { type: "addRelation", relation: { id: nextId(sceneOf(session), "r"), kind: h.kind, parts: [corner.ref, h.ref] } }); if (session.message) break; }
    }
    done = { ...done, session };
  }
  // a circle whose edge was taken to where it touches another circle is made tangent to it (`in_296`)
  if (t.kind === "circle" && fin && done !== base && !done.session.message) {
    const made = fin.select[0] ? Object.values(sceneOf(done.session).parts).find((q) => q.kind === "circle" && diskFaceRef(q.ref) === fin.select[0]) : undefined;
    let session = done.session;
    for (const h of (hint?.hints ?? [])) if (made && h.kind === "tangent" && h.ref) { session = run(session, { type: "addRelation", relation: { id: nextId(sceneOf(session), "r"), kind: "tangent", parts: [made.ref, h.ref] } }); if (session.message) break; }
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
  // an operation chosen from the menu is waiting for what it needs (`in_464`): what is clicked is given to it; on nothing, what there is starts it (or it is let go)
  if (s.picking && !s.tool && !s.op && !s.repeat) {
    const under = candidatesAt(sc, projector(s.cam, env.w, env.h).view(i.x, i.y), pickOpts(s)).filter((c) => sc.parts[c.ref]?.origin !== "world"); // (a world plane under the pointer is the background, not a thing)
    const top = under.find((c) => canPickFor(sc, s.picking!.kind, c.ref));
    if (!top && under.length) return { ...s, session: { ...s.session, message: `that cannot be used here: ${(() => { const r = startOp(sc, [under[0]!.ref], s.picking!.kind); return r.ok ? "" : r.why; })()} (Esc to leave)` } }; // (a click on what it cannot use leaves it waiting)
    if (!top) {
      const started = finishPicking(s, env.now);
      return started.picking ? { ...started, picking: null, session: { ...started.session, message: null } } : started;
    }
    const kind = s.picking.kind;
    const next = doClick({ ...s, picking: null }, picksMany(kind) ? { ...i, shift: true } : i, env); // (several things: each click adds, as Shift does)
    const w = { ...next, picking: { kind } };
    if (picksMany(kind)) return { ...w, session: { ...w.session, message: `${selectionOf(w.session).length} picked: click more, then Enter or the check starts it (Esc to leave)` } };
    return finishPicking(w, env.now);
  }
  // a click on a sheet selects it, as a click on a face does (`in_459`)
  if (!s.tool && !s.op && !s.repeat && !s.cut) {
    const top = candidatesAt(sc, projector(s.cam, env.w, env.h).view(i.x, i.y), pickOpts(s))[0];
    const part = top ? sc.parts[top.ref] : undefined;
    if (part?.kind === "plane" && part.section) return doSectionClick(s, part.ref);
  }
  // a click on a little pane turns that world plane on and looks straight at it (the same as its X Y Z button, `in_190`)
  const pane = !s.tool && !s.op ? paneUnder(s, i.x, i.y, env) : null;
  if (pane) return doLook({ ...s, menu: null, focus: null, resume: null }, { type: "look", plane: PANE_BUTTON[pane] }, env);
  const pv = projector(s.cam, env.w, env.h).view(i.x, i.y);
  const cands = candidatesAt(sc, pv, pickOpts(s));
  const refs = cands.map((c) => c.ref);
  const base: AppState = { ...s, menu: null, focus: null, resume: null };
  // a gear tool that is armed for the next gear stays on after a gear is made (`in_688`): a double click on a body then is a person selecting it, not starting a gear: the tool is put away and the double click selects the body
  if (s.tool?.kind === "gear" && i.count >= 2 && !i.shift && s.tool.points.length === 1 && !s.tool.sized && !s.tool.gear?.mesh && !s.tool.gear?.editing && !(s.tool.gear?.typed ?? []).some((x) => x !== "") && refs.some((r) => sc.parts[r]?.origin === "body")) {
    const free = { ...base, tool: null, resume: null };
    return doClickSelect(doClickSelect(free, { ...i, count: 1 }, env, cands, refs, pv), i, env, cands, refs, pv);
  }
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
  const hit = g ? hitHandle(g, projector(s.cam, env.w, env.h).project, i.x, i.y, undefined, chosenId(s)) : null;
  // the sphere at the junction of the mover (`in_416`): a click selects it, a second click lets it go; selected, a vertex, an edge or a face clicked puts the mover there
  // a figure being revolved waits for the line to turn about: a click on a straight line or an axis chooses it (`in_435`)
  if (hit && hit.id.startsWith("mir:") && hit.id !== "mir:orb" && s.op?.kind === "mirror") return { ...base, op: { ...s.op, mirrorAxis: "xyz".indexOf(hit.id[4]!) as 0 | 1 | 2 }, handleSel: hit.id, gizmoHover: hit.id }; // (taking an arrow of the mirror chooses its plane, `in_437`)
  const mover = s.op ?? activeOp(s);
  // every orb is the mover's orb (`in_440`): the move and turn, the revolve, the mirror and the two repeats; the repeat being set up is not an operation of its own state, its mover is written into it
  const orbHit = !!hit && (hit.id === "pivot" || hit.id === "rev:orb" || hit.id === "mir:orb" || hit.id === "lin:orb");
  const canOrient = !!mover && hasOrb(mover.kind) && (!s.repeat || !s.op);
  // the sphere clicked again while it is selected and the mover has been turned (or was): it goes between true x, y, z and its turned axes, staying where it is (`in_419`)
  if (orbHit && s.moverSphere && canOrient && (mover!.frame || mover!.frameKept)) {
    const { frame, frameKept, ...rest } = mover!;
    return { ...putMover(base, { ...rest, auto: false, ...(frame ? { frameKept: frame } : frameKept ? { frame: frameKept } : {}) } as Op), handleSel: null, gizmoHover: hit!.id };
  }
  if (orbHit && canOrient) {
    const op0: Op = s.op ?? { ...mover!, auto: false };
    // selected: the mover itself is being oriented, not the object (`in_421`): where it stands and its axes now are kept for Cancel; clicked again it is applied
    if (s.moverSphere) return { ...orientApply({ ...base, ...(s.repeat && !s.op ? {} : { op: op0 }) }), handleSel: null, gizmoHover: hit!.id };
    const was = op0.kind === "circular" ? (([a, b, c]) => ({ pivot: [a, b, c] as Vec3 }))(patternValues(op0).slice(3, 6) as [number, number, number]) : { pivot: op0.pivot };
    return { ...base, moverSphere: true, moverWas: { ...was, ...(op0.frame ? { frame: op0.frame } : {}), ...(op0.frameKept ? { frameKept: op0.frameKept } : {}) }, ...(s.repeat && !s.op ? {} : { op: op0 }), handleSel: null, gizmoHover: hit!.id };
  }
  // a revolve takes a click on a line, a vertex or a face for the orb even before the sphere is selected: it puts the orb there, its axis along the line or across the face (`in_438`)
  // a click on one of the revolve's rings makes that the axis, with no drag needed (`in_468`)
  if (hit && (hit.id.startsWith("rev:turn:") || hit.id.startsWith("rev:adv:")) && s.op?.kind === "revolve") return { ...base, op: { ...s.op, auto: false, axis: "xyz".indexOf(hit.id[hit.id.startsWith("rev:adv:") ? 8 : 9]!) as 0 | 1 | 2, revField: hit.id.startsWith("rev:adv:") ? 1 : 0 }, gizmoHover: hit.id, handleSel: hit.id };
  if (!hit && (s.moverSphere || mover?.kind === "revolve") && canOrient) {
    const at = moverPlace(sc, cands[0], pv, mover!);
    const turned = moverTurned(sc, cands[0]);
    if (at) {
      const placed: Op = { ...(s.op ?? mover!), auto: false, pivot: at, ...(turned ? { frame: turned } : {}), ...(mover!.kind === "revolve" && turned ? { axis: (sc.parts[cands[0]!.ref]?.kind === "plane" ? 2 : 0) as 0 | 2 } : {}) };
      const moved = mover!.kind === "circular" ? movePivotTo(base, at) : base; // (a circular repeat's pivot is a point of the drawing: it is moved there)
      return { ...putMover(moved, placed), handleSel: null, session: { ...moved.session, message: null } };
    }
  }
  // a click on a ring of a repeat, or of the turn being set up, makes that the axis, with no drag needed (`in_206`)
  if (hit && hit.id.startsWith("rot:") && s.op?.kind === "rotate") return { ...base, op: { ...s.op, axis: "xyz".indexOf(hit.id[4]!) as 0 | 1 | 2, typed: "" }, gizmoHover: hit.id, handleSel: hit.id };
  // Shift on a move arrow chooses it with the others already chosen: a body dragged free then moves only along those axes (`in_299`)
  if (hit && i.shift && hit.id.startsWith("move:") && (!s.op || s.op.kind === "move") && !s.repeat && !sectionNow(s)) {
    const k = "xyz".indexOf(hit.id[5]!) as 0 | 1 | 2;
    return { ...base, lockAxes: s.lockAxes.includes(k) ? s.lockAxes.filter((a) => a !== k) : [...s.lockAxes, k].sort() as (0 | 1 | 2)[], handleSel: null, gizmoHover: hit.id };
  }
  // a click on a move arrow chooses that one alone for a free drag (a second click on it goes back to all three), Shift adds or takes one out (`in_383`)
  if (hit && hit.id.startsWith("move:") && (!s.op || s.op.kind === "move") && !s.repeat && !sectionNow(s)) {
    const k = "xyz".indexOf(hit.id[5]!) as 0 | 1 | 2;
    const only = s.lockAxes.length === 1 && s.lockAxes[0] === k;
    return { ...base, lockAxes: only ? [] : [k], handleSel: hit.id, gizmoHover: hit.id };
  }
  // the orb's position arrows hold its drag to the axes chosen (`in_652`): a click on one holds it to that axis alone (a second click lets it go free), Shift adds an axis or takes one out (two held: the plane of the two)
  if (hit && /^piv:[xyz]$/.test(hit.id) && (s.op?.kind === "revolve" || s.moverSphere) && !s.repeat) {
    const k = "xyz".indexOf(hit.id[4]!) as 0 | 1 | 2;
    const lock = i.shift ? (s.lockAxes.includes(k) ? s.lockAxes.filter((a) => a !== k) : [...s.lockAxes, k].sort() as (0 | 1 | 2)[]) : s.lockAxes.length === 1 && s.lockAxes[0] === k ? [] : [k];
    const words = lock.length === 0 ? "the orb moves freely" : lock.length === 3 ? "the orb moves freely" : lock.length === 1 ? `the orb moves along ${"XYZ"[lock[0]!]} only` : `the orb moves in the ${lock.map((a) => "XYZ"[a]).join("")} plane only`;
    return { ...base, lockAxes: lock.length === 3 ? [] : lock, handleSel: i.shift ? null : hit.id, gizmoHover: hit.id, session: { ...base.session, message: words } };
  }
  // a click on an arrow selects it: it shows its number then (`in_238`)
  if (hit) return s.repeat && !s.op ? { ...(hit.id.startsWith("rot:") ? setRepeatAxis(base, "xyz".indexOf(hit.id[4]!)) : { ...base, repeat: { ...s.repeat, chosen: hit.id } }), handleSel: hit.id } : { ...base, handleSel: hit.id };
  // a click anywhere else, blank space too, leaves an operation you started, and then acts as a normal click
  // (an operation that is open is applied by it, as the check and Enter do, not dropped: a sweep, a loft or a mirror that was not given its check was lost, `in_463`)
  const left = s.op ? { ...doApply(base), drag: null, gizmoHover: null } : base;
  return doClickSelect(left.op ? { ...left, op: null } : left, i, env, cands, refs, pv);
}

/** A normal click: select what is under it (cycling where things overlap), two select the whole object, three look straight at the plane. */
function doClickSelect(base: AppState, i: Extract<Intent, { type: "click" }>, env: Env, cands: ReturnType<typeof candidatesAt>, refs: Ref[], pv: ReturnType<ReturnType<typeof projector>["view"]>): AppState {
  const sess = base.session;
  const sc = sceneOf(sess);
  const get = lookup(sc);
  if (i.count === 2 && !i.shift && !base.op) { // a double click on a selected spline: a point put on the curve there, or the point there taken away (`dec_spline_and_cams`)
    const pr = projector(base.cam, env.w, env.h);
    const edit = splineEdit(sc, selectionOf(sess), (q) => pr.project(q), i.x, i.y, settings.pick.pointPx, settings.pick.linePx);
    if (typeof edit === "string") return withSession(base, { ...sess, message: edit });
    if (edit) { const next = run(sess, edit); return withSession(base, next.message ? next : { ...next, click: sess.click }); }
  }
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
  // Shift on bodies adds or takes out the whole body: when what is selected are whole bodies, a click on a body (any face of it) is that body, not the face (`in_291`)
  const whole = i.shift && selectionOf(sess).length > 0 && selectionOf(sess).every((r) => sc.parts[r]?.kind === "body");
  const asBody = whole ? selectable.filter((r) => sc.parts[r]?.origin === "body").slice(0, 1).map((r) => objectOf(sc, r)) : [];
  const picked = clickOn(sess, asBody.length ? asBody : selectable, i.shift);
  const next: Session = { ...picked, click: { ...picked.click, selection: withTwins(sc, selectionOf(sess), selectionOf(picked)) } };
  const top = selectionOf(next).at(-1);
  const hit = cands.find((c) => c.ref === top);
  const point = hit && hit.rank === 2 ? surfacePoint(pv, hit.score) : null;
  return { ...withSession(base, next), spread: hit && point ? { ref: hit.ref, point, startMs: env.now } : null };
}

/** A right click opens the ring of operations on what is selected and changes nothing about the selection (`in_140`): select first (one click, a triple click, Shift for several), then right click. */
export function doMenu(s: AppState, i: Extract<Intent, { type: "menu" }>, env: Env): AppState {
  if (s.cut && !i.button) return applyCut(s); // (a right click makes the cut, as it applies an operation)
  // a repeat that is open (linear, circular or a copy): a right click leaves it and makes the copies; with none to make it just leaves (`in_236`)
  if (!i.button && (s.repeat && !s.op)) return doApply(s);
  // an operation that is open: a right click accepts it and leaves it, as Enter does (`in_244`)
  if (!i.button && s.op) return doApply(s);
  if (!i.button && s.picking && !s.tool) return doApply(s); // (a right click starts what was clicked for it, as Enter does, `in_464`)
  // the views (the cross section, the wireframe) are put away by a right click as a tool is (`in_394`); the ⋯ button still opens the menu
  if (!i.button && !s.tool && !s.op && !s.repeat && !s.cut && (sectionNow(s) || s.wireframe)) return { ...s, sectionLive: null, wireframe: false, menu: null, session: { ...s.session, click: { ...s.session.click, selection: sectionNow(s) ? [] : s.session.click.selection }, message: null } };
  // while a sketching tool is on, a right click puts it away (the ⋯ button still opens the menu): the tool stays on until then or the cancel icon (`in_193`)
  if (s.tool && !i.button) return { ...s, tool: null, resume: null, menu: null };
  // a long press on a move arrow chooses the arrow with the others, as Shift does: a phone has no Shift (`in_300`)
  if (!i.button && !s.op && !s.repeat) {
    const g = gizmoOf(s);
    const hit = g ? hitHandle(g, projector(s.cam, env.w, env.h).project, i.x, i.y) : null;
    if (hit?.id.startsWith("move:")) return doClick(s, { type: "click", x: i.x, y: i.y, count: 1, shift: true }, env);
  }
  // what is under the point (a finger has no hover: a long press must be told what is under it the same way a right click is, or a tool chosen from the ring would not turn the view straight to the plane there, `in_283`)
  const under = i.button ? null : candidatesAt(sceneOf(s.session), projector(s.cam, env.w, env.h).view(i.x, i.y), pickOpts(s))[0]?.ref ?? null;
  return { ...s, menu: menuFor(s.session, i.x, i.y, !!s.repeat, under ?? undefined, { wireframe: s.wireframe, tape: s.tape, section: !!sectionNow(s), clip: !!s.clipboard?.length, adding: s.adding, touch: i.touch }) };
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
