// The actions service (`dec_clean_engine_design` section 3): for the selected parts, every relation and operation that applies, each with a label,
// whether it is enabled (or why not), a measure when it has a number, and `run -> command`. The menu, the number chip, the keyboard and the touch
// long-press all ask this one function. Generalises the prototype's relations table (`relations.mjs`) from sketch parts to any parts.
// Geometry is read in 3D from the scene, so no plane or sketch is involved in measuring.
import { mirrorOfCopy } from "../operation/repeat.ts";
import { arcRadiusCommand } from "./faceedit.ts";
import { gearOfPart } from "../operation/gearscene.ts";
import { planetaryOfGear } from "../operation/planetary.ts";
import { sketchOfEdge } from "../operation/edgesource.ts";
import { whyNotDeleteSurface, deleteSurface } from "../operation/trim.ts";
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { dot, sub, normalize } from "../math/vec.ts";
import type { Scene, Relation } from "../operation/scene.ts";
import { lookup, nextId, figureRefs } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { relationKind, planeOfParts, roundOf } from "../operation/part.ts";
import type { Kind } from "../operation/part.ts";
import { whyNotMate, mateCommand, driveCommand, hardDrive, limitCommand, unlimitCommand, jointOf } from "./mate.ts";
import { worldRef } from "../shared/ref.ts";
import type { MateMode } from "../operation/mates.ts";
import { featureOf, existingMate, faceMiddle, isFlatMode, mateStatus, isWorldPlane } from "../operation/mates.ts";
import { ordered } from "./selection.ts";
import { impliedMate } from "./implied.ts";
import { ROWS, REFERENCES_ONLY, same } from "./rows.ts";
import type { Ctx } from "./rows.ts";

export interface Action {
  id: string;
  label: string;
  group: "relation" | "operation";
  dimensional: boolean;
  unit: "mm" | "deg" | null;
  /** The parts, mover first: the one selected first (the first selected moves to meet the next, `in_229`), then the others in the order selected, then any that cannot move. */
  parts: Ref[];
  enabled: boolean;
  /** Why it cannot be done now (when not enabled). */
  why: string | null;
  /** The current value of a dimensional relation. */
  measure(): number | null;
  /** Where a chip for the number goes. */
  spot(): Vec3 | null;
  /** The command that does it; a dimensional relation takes a value (the measure if none). */
  run(value?: number): Command;
}

const isFlatBodyFace = (get: ReturnType<typeof lookup>, sel: readonly Ref[]): boolean => sel.every((r) => { const p = get(r); return p?.kind === "plane" && p.origin === "body" && !!p.mesh && !p.curved && !p.round && !p.rounded; });
const isBallOrCone = (get: ReturnType<typeof lookup>, sel: readonly Ref[]): boolean => sel.every((r) => { const p = get(r); return p?.kind === "plane" && p.origin === "body" && (!!p.sphere || !!p.cone); }); // (a ball or a cone: a tangent mate's, `in_977`)
const isRoundBodyFace = (get: ReturnType<typeof lookup>, sel: readonly Ref[]): boolean => sel.every((r) => { const p = get(r); return p?.kind === "plane" && p.origin === "body" && !!roundOf(get, r); });

/** The round face of a body that a circular edge of it is the rim of (its axis through the edge's centre, the same radius); the edge itself if there is none. */
function faceOfEdge(scene: Scene, ref: Ref): Ref {
  const get = lookup(scene);
  const e = get(ref);
  if (e?.kind !== "line" || e.origin !== "body" || !e.circle) return ref;
  const c = e.circle;
  const f = Object.values(scene.parts).find((q) => {
    if (q.kind !== "plane" || q.origin !== "body" || q.of !== e.of) return false;
    const r = roundOf(get, q.ref);
    if (!r?.normal || Math.abs(r.radius - c.radius) > 1e-3) return false;
    const [d, n] = [sub(c.center, r.center), normalize(r.normal)];
    const along = dot(d, n);
    return Math.hypot(d[0] - n[0] * along, d[1] - n[1] * along, d[2] - n[2] * along) < 1e-3;
  });
  return f ? f.ref : ref;
}

/**
 * The command of a mate that cannot be made: nothing to do, and why (an empty step would be kept in the history with not a word, `in_1109`). When hard bodies stopped it their hardness is the constraint (`inv_constraint_uniformity`):
 * it flashes and can be deleted, and the mate is made as asked once it is gone (`again`: the mate worked out with the hard check off).
 */
function refusal(scene: Scene, r: { why: string; into?: Ref[] }, again: () => { command: Command } | { why: string }): Command {
  const names = (rs: readonly Ref[]): string[] => rs.flatMap((q) => { const p = scene.parts[q]; return p?.kind === "body" && p.id ? [p.id] : []; });
  const soften = names(r.into ?? []).filter((id) => !!scene.hard?.includes(id) || !!scene.fixed?.includes(id));
  const retry = soften.length ? again() : null;
  return { type: "refuse", why: r.why, ...(soften.length ? { soften, into: [...(r.into ?? [])] as string[] } : {}), ...(retry && "command" in retry ? { retry: retry.command } : {}) };
}

/** Every relation and operation that applies to the selection, relations first, in the order of the table. */
export function actionsFor(scene: Scene, selection0: readonly Ref[]): Action[] {
  // an edge of the body that lies where a sketch part was is that sketch part: the sketch belongs to the body but is still a regular sketch (`in_210`); a change it cannot take is refused and flashes
  const selection = [...new Set(selection0.map((r) => sketchOfEdge(scene, r)?.ref ?? r))]; // (the two ends of one extrusion are one sketch part)
  const get = lookup(scene);
  const sel = ordered(selection, get).filter((r) => get(r));
  if (!sel.length) return [];
  const sketchPlane = planeOfParts(get, sel);
  const kinds = sel.map((r) => relationKind(get, r, sketchPlane)); // (a circular edge of a body counts as a circle: an anchor, `in_308`)
  const ctx: Ctx = { scene, get, parts: sel };
  const out: Action[] = [];
  const movable = sel.some((r) => get(r)?.movable);

  for (const row of ROWS) {
    if (row.pair.length !== sel.length) continue;
    if (!(same(row.pair, kinds) || (row.anyOrder && same(row.pair, [...kinds].reverse())))) continue;
    if (row.hidden?.(ctx, sel)) continue;
    const why = !movable ? REFERENCES_ONLY : (row.unavailable?.(ctx, sel) ?? null);
    const dimensional = !!row.measure;
    out.push({
      id: row.id,
      label: row.label,
      group: "relation",
      dimensional,
      unit: row.unit ?? null,
      parts: sel,
      enabled: why === null,
      why,
      measure: () => row.measure?.(ctx, sel) ?? null,
      spot: () => row.spot?.(ctx, sel) ?? null,
      run: (value) => {
        const v = value ?? row.measure?.(ctx, sel) ?? undefined;
        const rel: Relation = {
          id: nextId(scene, "r"),
          kind: row.id,
          parts: sel,
          ...(dimensional ? { value: v, locked: true } : {}),
          ...(row.params ? { params: row.params(ctx, sel) } : {}),
        };
        // the radius of an arc of a sketch that was cut from a circle: its ends (and the lines' ends that sit there) go to the new radius first, or the extrusion would lose its sides (`in_210`)
        const moves = row.id === "radius" && v !== undefined && v > 0 && scene.parts[sel[0]!]?.kind === "line" ? arcRadiusCommand(scene, sel[0]!, v) : null;
        return moves ? { type: "batch", commands: [moves, { type: "addRelation", relation: rel }] } : { type: "addRelation", relation: rel };
      },
    });
  }

  // two faces of two bodies: they can be mated, the first one's body is moved to the second (`in_314`); flush has a gap that can be typed (`in_317`)
  const asFaces = selection0.length === 2 ? selection0.map((r) => faceOfEdge(scene, r)) : null; // (the edges as picked, not as the sketches they lie on)
  const msel = asFaces && asFaces.some((r, i) => r !== selection0[i]) ? asFaces : sel;
  if (msel.length === 2) {
    // (a circular edge of a body, a hole's rim or a pin's end, stands for its round face: two of them can be mated like the faces, `in_1045`)
    // a face of a body and a world plane (`in_977`): the face is mated with the plane, which stands still (parallel to the world's X, Y or Z plane, flush on it, an axis along its normal, a cylinder resting on it)
    const wi = msel.findIndex((r) => isWorldPlane(scene, r));
    const world = wi >= 0 && msel.some((r) => isFlatBodyFace(get, [r]) || isRoundBodyFace(get, [r]));
    const pair: [Ref, Ref] = world ? (wi === 1 ? [msel[0]!, msel[1]!] : [msel[1]!, msel[0]!]) : [msel[0]!, msel[1]!];
    const kinds: [MateMode, string, "mm" | "deg" | null][] = [
      ["flush", "Mate: flush faces", "mm"], ["parallel", "Mate: parallel faces", "mm"], ["perpendicular", "Mate: perpendicular faces", null], ["angle", "Mate: angle between faces", "deg"],
      ["coaxial", "Mate: coaxial", "mm"], ["parallelAxes", "Mate: parallel axes", null], ["perpendicularAxes", "Mate: perpendicular axes", null], ["angleAxes", "Mate: angle between axes", "deg"], ["axisToFace", "Mate: axis perpendicular to a face", null], ["tangent", "Mate: tangent", null],
    ];
    for (const [mode, label, unit] of kinds) {
      if (world && mode === "coaxial") continue; // (a round face has no axis of its own to put in a plane)
      const why = whyNotMate(scene, mode, pair[0], pair[1]);
      if (why && (world ? (isFlatMode(mode) ? !isFlatBodyFace(get, [pair[0]]) : mode === "tangent" ? !(isRoundBodyFace(get, [pair[0]]) || isBallOrCone(get, [pair[0]])) : !isRoundBodyFace(get, [pair[0]])) : mode === "tangent" ? !(isRoundBodyFace(get, [msel[0]!]) || isRoundBodyFace(get, [msel[1]!]) || isBallOrCone(get, [msel[0]!]) || isBallOrCone(get, [msel[1]!])) : mode === "axisToFace" ? !(isFlatBodyFace(get, [msel[0]!]) !== isFlatBodyFace(get, [msel[1]!]) || (isRoundBodyFace(get, [msel[0]!]) !== isRoundBodyFace(get, [msel[1]!]))) : isFlatMode(mode) ? !isFlatBodyFace(get, msel) : !isRoundBodyFace(get, msel))) continue; // (not this kind of faces: no row for it)
      const [fa, fb] = [featureOf(scene, pair[0], mode), featureOf(scene, pair[1], mode)];
      const degrees = unit === "deg";
      // what the faces leave now, as the number it would be typed as: the gap between flush faces, the distance between parallel faces, the distance between axes, the angle (`in_317`..`in_319`); the tape measure shows them (`in_338`)
      const measureNow = (): number | null => {
        if (!fa || !fb || unit === null) return null;
        const w = sub(fa.point, fb.point);
        const r = (x: number) => Math.round(x * 1e6) / 1e6;
        if (degrees) { const c = Math.abs(dot(fa.dir, fb.dir)) / (Math.hypot(...fa.dir) * Math.hypot(...fb.dir)); return Math.round(((Math.acos(Math.min(1, c)) * 180) / Math.PI) * 1e4) / 1e4; }
        if (mode === "flush") return r(dot(w, fb.dir));
        if (mode === "parallel") return r(Math.abs(dot(w, fb.dir)));
        const along = dot(w, fb.dir); // coaxial: how far the first axis is from the other's line
        return r(Math.hypot(w[0] - fb.dir[0] * along, w[1] - fb.dir[1] * along, w[2] - fb.dir[2] * along));
      };
      out.push({
        // (no number to type here: a mate is made at what the faces are, and its number is changed on its bubble, `in_338`)
        id: `mate:${mode}`, label, group: "relation", dimensional: false, unit: null, parts: [...sel], enabled: why === null, why,
        measure: measureNow,
        spot: () => faceMiddle(scene, pair[0]),
        run: (value?: number): Command => {
          const implied = impliedMate(scene, mode, pair[0], pair[1]); // (a sketch constraint that already makes it true: said, not made twice, `in_1111`)
          if (implied.length) return { type: "held", ids: implied };
          const again = fa && fb ? existingMate(scene, mode, fa.body, fb.body) ?? undefined : undefined; // (a mate made again between the same bodies replaces the one there)
          const amount = unit === null ? 0 : degrees ? Math.min(180, Math.max(0, value ?? measureNow() ?? 0)) : Math.max(0, value ?? 0);
          const r = mateCommand(scene, mode, pair[0], pair[1], amount, again, mode !== "parallel" || value !== undefined, true); // (parallel faces are only turned unless a distance is typed)
          return "command" in r ? r.command : refusal(scene, r, () => mateCommand(scene, mode, pair[0], pair[1], amount, again, mode !== "parallel" || value !== undefined, true, true));
        },
      });
    }
  }

  // one face or axis of a body made level or upright (`in_976`): a mate with the world, the face turned against the plane across the world's up direction (a flat face level: its normal along it; upright: at a right angle to it; an axis the other way round)
  if (sel.length === 1 && (isFlatBodyFace(get, sel) || isRoundBodyFace(get, sel))) {
    const flat = isFlatBodyFace(get, sel);
    const world = worldRef("XY");
    for (const [id, label, flatMode, roundMode] of [["horizontal", "Horizontal", "parallel", "perpendicularAxes"], ["vertical", "Vertical", "perpendicular", "parallelAxes"]] as const) {
      const mode: MateMode = flat ? flatMode : roundMode;
      const fa = featureOf(scene, sel[0]!, mode);
      const why = whyNotMate(scene, mode, sel[0]!, world);
      out.push({
        id: `mate:${id}`, label, group: "relation", dimensional: false, unit: null, parts: [...sel], enabled: why === null, why,
        measure: () => null, spot: () => faceMiddle(scene, sel[0]!),
        run: (): Command => {
          const again = fa ? existingMate(scene, mode, fa.body, world) ?? undefined : undefined;
          const r = mateCommand(scene, mode, sel[0]!, world, 0, again, false, true);
          return "command" in r ? r.command : refusal(scene, r, () => mateCommand(scene, mode, sel[0]!, world, 0, again, false, true, true));
        },
      });
    }
  }

  // a body that is the first of a true coaxial mate (a pin in a hole) is free to turn about the shared axis and to slide along it: a pivot and a slider (`in_321`)
  if (sel.length === 1 && get(sel[0]!)?.kind === "body") {
    const mate = mateStatus(scene).find((m) => m.state === "ok" && m.mode === "coaxial" && m.mover?.body === sel[0]);
    if (mate) {
      for (const [kind, label, unit] of [["turn", "Turn about the mate's axis", "deg"], ["slide", "Slide along the mate's axis", "mm"]] as const) {
        out.push({ id: `joint:${kind}`, label, group: "operation", dimensional: true, unit, parts: [...sel], enabled: true, why: null, measure: () => 0, spot: () => faceMiddle(scene, mate.mover!.ref), run: (value?: number): Command => driveCommand(scene, mate.id, kind, hardDrive(scene, mate.id, kind, value ?? 0).amount) ?? { type: "batch", commands: [] } });
        const j = jointOf(scene, mate.id)![kind];
        const unitText = unit === "deg" ? "°" : " mm";
        for (const side of ["Min", "Max"] as const) { // the limits: where the joint stops (`in_322`); a limit typed in is where it is to stop, in the joint's own count from where the mate was made
          const set = side === "Min" ? j.min : j.max;
          out.push({ id: `joint:${kind}${side}`, label: `${kind === "turn" ? "Turn" : "Slide"}: ${side === "Min" ? "lowest" : "highest"} stop (now ${j.now}${unitText}${set !== undefined ? `, stop at ${set}${unitText}` : ", none"})`, group: "operation", dimensional: true, unit, parts: [...sel], enabled: true, why: null, measure: () => set ?? j.now, spot: () => faceMiddle(scene, mate.mover!.ref), run: (value?: number): Command => limitCommand(scene, mate.id, kind, side, value ?? 0) ?? { type: "batch", commands: [] } });
        }
        if (j.min !== undefined || j.max !== undefined) out.push({ id: `joint:${kind}Free`, label: `${kind === "turn" ? "Turn" : "Slide"}: take the stops away`, group: "operation", dimensional: false, unit: null, parts: [...sel], enabled: true, why: null, measure: () => null, spot: () => null, run: (): Command => unlimitCommand(scene, mate.id, kind) ?? { type: "batch", commands: [] } });
      }
    }
  }

  // a gear that keeps its numbers goes as a whole, with its record (`gearscene.ts`)
  const gears = sel.flatMap((r) => { const g = gearOfPart(scene, r); return g ? [g] : []; });
  const sets = [...new Set(gears.flatMap((g) => { const p = planetaryOfGear(scene, g.id); return p ? [p.id] : []; }))]; // (a gear of a planetary set takes the whole set with it, `dec_planetary_gears`)
  const gearIds = [...new Set(gears.filter((g) => !planetaryOfGear(scene, g.id)).map((g) => g.id))];
  if (gearIds.length || sets.length) {
    out.push({
      id: "delete", label: "Delete", group: "operation", dimensional: false, unit: null, parts: [...sel],
      enabled: true, why: null, measure: () => null, spot: () => null,
      run: (): Command => ({ type: "batch", commands: [...sets.map((id): Command => ({ type: "deletePlanetary", id })), ...gearIds.map((id): Command => ({ type: "deleteGear", id }))] }),
    });
  }
  // delete: drawn parts (a closed figure goes with its corners, so nothing is left behind), or the whole body (one step, so it undoes)
  const whole = sel.filter((r) => get(r)?.kind === "body");
  if (whole.length) {
    out.push({
      id: "delete", label: "Delete", group: "operation", dimensional: false, unit: null, parts: whole,
      enabled: true, why: null, measure: () => null, spot: () => null,
      run: (): Command => {
        // the body is gone, and so is all that made it: its steps (they would make a body that is deleted again at once) and the sketches they used, which were only hidden (`in_192`). What is not used up stays: a corner another drawing stands on, the circle that a piece of was extruded
        const gone = new Set<Ref>();
        // with several bodies only the selected ones go: the step that made each (named in its id, `x_<step>`) and the steps that were made on it alone (`in_291`: deleting one cylinder took the other too)
        const all = Object.values(scene.parts).filter((q) => q.kind === "body");
        const ids = new Set(whole.map((r) => (get(r) as { id?: string }).id).filter((x): x is string => !!x));
        const some = all.length > 1 && ids.size > 0 && ids.size < all.length;
        const mine = (st: Scene["steps"][number]): boolean => !some || [...ids].some((id) => st.id === id.replace(/^x_/, "") || st.params.body === id);
        // the cuts that were made only in the bodies that go are taken out with them: they have nothing left to cut (`in_436`); a cut that also took material from another body stays
        const onlyHere = (st: Scene["steps"][number]): boolean => { const into = scene.cutOf?.[st.id]; return !!into && into.length > 0 && into.every((b) => ids.has(b)); };
        // a body that was kept as the tool of a subtraction or intersection and is deleted leaves the cut it made (the combine drops it, its own steps stay); one that was the body cut loses the combine too (it has nothing to work on)
        const combines = scene.steps.filter((st) => st.type === "combine" && (st.params.mode === "subtract" || st.params.mode === "intersect") && Number(st.params.keep) === 1);
        const bodyOf = (r: Ref): string => (r.startsWith("b/") ? r.split("/")[1]! : "");
        const dropped = new Map<string, string[]>(); // combine step id -> the tools deleted
        const lostCombines = new Set<string>();
        for (const c of combines) {
          const names = c.parts.map(bodyOf);
          if (ids.has(names[0]!)) lostCombines.add(c.id);
          else { const gone2 = names.slice(1).filter((n) => ids.has(n)); if (gone2.length) dropped.set(c.id, gone2); }
        }
        // a part a region combine made has no step of its own: it is taken out of the combine (`in_1320`: it could not be deleted)
        const skips = new Map<string, number[]>();
        for (const id of ids) {
          const m = /^x_(.+?)(?:\.(\d+))?$/.exec(id);
          const c = m && scene.steps.find((st) => st.id === m[1] && st.type === "combine" && st.params.mode === "regions");
          if (c) skips.set(c.id, [...(skips.get(c.id) ?? []), Number(m![2] ?? 0)]);
        }
        const keptTools = new Set([...dropped.values()].flat()); // (their steps stay: the cut they made is made by them)
        const steps = scene.steps.filter((st) => {
          if (skips.has(st.id)) return false;
          if (lostCombines.has(st.id)) return true;
          if ([...keptTools].some((id) => st.id === id.replace(/^x_/, "") || st.params.body === id)) return false;
          return mine(st) || (st.params.mode === "cut" && onlyHere(st));
        });
        for (const st of steps) {
          if (st.type !== "extrude" && st.type !== "revolve") continue; // (a turned body's profile goes too, `in_1262`)
          const cut = st.params.cut !== undefined || figureRefs(st).some((r) => r.includes("@")); // (a piece of a cut shape: the sides stay with the other pieces)
          for (const r of figureRefs(st)) { const p = get(r); if (p?.movable && !r.includes("@") && (!cut || p.kind === "circle")) gone.add(r); }
        }
        const corners = [...gone].flatMap((r): Ref[] => { const p = get(r); return p?.kind === "circle" ? [p.center] : p?.kind === "line" ? [p.a, p.b, ...(p.center ? [p.center] : [])] : []; });
        const alone = (c: Ref) => !!get(c)?.movable && !Object.values(scene.parts).some((q) => !gone.has(q.ref) && ((q.kind === "circle" && q.center === c) || (q.kind === "line" && (q.a === c || q.b === c || q.center === c))));
        const refs0 = [...gone, ...new Set(corners.filter(alone))].filter((r) => r in scene.parts);
        // a plane a model made for its sketches (a turned body's profile stands on one) goes when nothing is left on it and no step still names it (`in_1262`)
        const leaving = new Set<Ref>(refs0), keptSteps = scene.steps.filter((st) => !steps.includes(st));
        const planes = Object.values(scene.parts).filter((q) => q.kind === "plane" && q.origin === "drawn" && !q.movable && !leaving.has(q.ref) && Object.values(scene.parts).some((x) => leaving.has(x.ref) && (x as { plane?: Ref | null }).plane === q.ref) && !Object.values(scene.parts).some((x) => !leaving.has(x.ref) && x.kind !== "face" && (x as { plane?: Ref | null }).plane === q.ref) && !keptSteps.some((st) => JSON.stringify(st).includes(q.ref))).map((q) => q.ref);
        const refs = [...refs0, ...planes]; 
        const mates = scene.relations.filter((r) => r.kind === "mate" && r.parts.some((q) => whole.includes(q))).map((r): Command => ({ type: "removeRelation", id: r.id })); // (a mate of a body that is deleted goes with it, `in_315`)
        const drops = [...dropped].map(([id, tools]): Command => ({ type: "setStepParams", id, params: { drop: [...String(scene.steps.find((x) => x.id === id)?.params.drop ?? "").split(",").filter(Boolean), ...tools].join(",") } }));
        const skipCmds = [...skips].map(([id, n]): Command => ({ type: "setStepParams", id, params: { skip: [...new Set([...String(scene.steps.find((x) => x.id === id)?.params.skip ?? "").split(",").filter(Boolean).map(Number), ...n])].sort((a, b) => a - b).join(",") } }));
        return { type: "batch", commands: [...mates, ...drops, ...skipCmds, ...[...steps].reverse().map((st): Command => ({ type: "removeStep", id: st.id })), ...(refs.length ? [{ type: "deleteParts", refs } as Command] : [])] };
      },
    });
  } else {
    // the copies of a mirror follow the original and cannot be drawn on, but they can be deleted: the mirror goes (it is broken, its copies being ordinary until they are deleted), the original stays (`in_1306`)
    const mirrors = new Map<string, Ref[]>();
    if (!sel.some((r) => get(r)?.movable)) for (const r of sel) { const m = mirrorOfCopy(scene, r); if (m) mirrors.set(m.id, m.made); }
    if (mirrors.size && sel.every((r) => [...mirrors.values()].some((made) => made.includes(r)))) {
      out.push({
        id: "delete", label: "Delete", group: "operation", dimensional: false, unit: null, parts: [...sel],
        enabled: true, why: null, measure: () => null, spot: () => null,
        run: (): Command => ({ type: "batch", commands: [...[...mirrors.keys()].map((id): Command => ({ type: "breakPattern", id })), { type: "deleteParts", refs: [...mirrors.values()].flat() }] }),
      });
    }
    const drawn = sel.filter((r) => get(r)?.movable);
    const picked = new Set<Ref>(drawn);
    // a whole surface of a sketch cut by crossing curves (`in_285`): its own edges are trimmed off, the edges another surface shares stay; the circles and lines it was cut from remain as far as they are not its own
    const surfaces = drawn.filter((r) => { const p = get(r); return p?.kind === "face" && !!p.pieces; });
    if (surfaces.length) {
      const blocked = surfaces.length > 1 || drawn.length > surfaces.length ? "delete one surface at a time, with nothing else selected" : whyNotDeleteSurface(scene, surfaces[0]!);
      out.push({
        id: "delete", label: "Delete", group: "operation", dimensional: false, unit: null, parts: drawn,
        enabled: !blocked, why: blocked, measure: () => null, spot: () => null,
        run: (): Command => { const r = deleteSurface(scene, surfaces[0]!); return "command" in r ? r.command : { type: "batch", commands: [] }; },
      });
    }
    const used = (corner: Ref) => Object.values(scene.parts).some((q) => !picked.has(q.ref) && ((q.kind === "circle" && q.center === corner) || (q.kind === "line" && !q.derived && (q.a === corner || q.b === corner || q.center === corner)))); // another part still stands on this corner (a piece cut from a line, `derived`, is not another part: it goes with the line it was cut from)
    const targets = surfaces.length ? [] : drawn.flatMap((r): Ref[] => {
      const p = get(r);
      if (p?.kind === "face") return [...p.corners, ...p.loop.flatMap((l) => { const x = get(l); return x?.kind === "line" && x.center ? [x.center] : []; })]; // a face's corners (a disk's centre, the centres of its arcs): everything built on them goes too
      // a circle or a line goes with its points, unless something else stands on them: no point is left behind to snap to or suggest constraints to. (The command layer keeps that rule for every way parts go, `strandedCorners` in `commands.ts`; the points are listed here only so that a move, turn or scale step that names one goes with it, below.)
      const own = p?.kind === "circle" ? [p.center] : p?.kind === "line" ? [p.a, p.b, ...(p.center ? [p.center] : [])] : [];
      return [r, ...own.filter((c) => get(c)?.movable && !used(c))];
    });
    if (targets.length) {
      out.push({
        id: "delete", label: "Delete", group: "operation", dimensional: false, unit: null, parts: drawn,
        enabled: true, why: null, measure: () => null, spot: () => null,
        // a move, turn or scale step that was made on what is deleted goes with it (it has nothing left to work on, and would stay in the history naming parts that are gone); an extrusion is not taken out: it is reported broken, as before (`in_251`)
        run: (): Command => {
          const gone = new Set<Ref>(targets);
          const orphans = scene.steps.filter((st) => st.type !== "extrude" && st.parts.some((q) => gone.has(q)));
          return orphans.length ? { type: "batch", commands: [...[...orphans].reverse().map((st): Command => ({ type: "removeStep", id: st.id })), { type: "deleteParts", refs: targets }] } : { type: "deleteParts", refs: targets };
        },
      });
    }
  }
  return out;
}

export const dimensionalFor = (scene: Scene, selection: readonly Ref[]): Action | null => actionsFor(scene, selection).find((a) => a.dimensional) ?? null;

/** The number a selection offers to be typed over: the first dimension that can be set, but for an arc its radius before the length of its chord (an arc of a sketch, or an edge of the body that lies on one: `in_210`). */
export function measureAction(actions: readonly Action[], pick: (a: Action) => boolean): Action | undefined {
  const r = actions.find((a) => a.id === "radius" && a.dimensional && pick(a));
  return r ?? actions.find((a) => a.dimensional && pick(a));
}
