// Every change to the scene is a command: plain data that can be saved, replayed and undone (`dec_clean_engine_design` section 6).
// `apply` is pure: it returns a new scene or says why the command cannot apply. Deleting a part removes the relations that used it in the same command,
// so undo restores both.
import { withAnchors } from "./anchors.ts";
import { about } from "../math/rotation.ts";
import { add, sub } from "../math/vec.ts";
import type { Ref } from "../shared/ref.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Part } from "./part.ts";
import { anchorsOf } from "./part.ts";
import type { Scene, Relation, Step } from "./scene.ts";
import { bumpCounter, figureRefs, usesFigures } from "./scene.ts";
import { setParameter, removeParameter, linkParam, unlinked } from "./paramscene.ts";
import { addGroup, removeGroup, withoutParts } from "./groups.ts";
import { stretchScene } from "./stretch.ts";
import { addPattern, setPattern, breakPattern, patternsWithout } from "./repeat.ts";
import { addGear, setGear, deleteGear, ownedSteps } from "./gearscene.ts";
import { addPlanetary, setPlanetary, deletePlanetary } from "./planetary.ts";
import type { PlanetarySpec } from "./planetary.ts";
import type { GearSpec } from "./gear.ts";

export type Command =
  | { type: "addPart"; part: Part }
  | { type: "movePart"; ref: Ref; to: Vec3 }
  /** a plane put somewhere else (the cross section plane moved, turned or flipped, `in_396`) */
  | { type: "placePlane"; ref: Ref; at: Vec3; u: Vec3; v: Vec3; /** switches the cut on or off (left as it is when absent) */ cut?: boolean; /** the side cut away is the other one (left as it is when absent) */ flip?: boolean; /** the invisible mode (left as it is when absent) */ hidden?: boolean }
  | { type: "setRadius"; ref: Ref; radius: number }
  | { type: "deletePart"; ref: Ref }
  | { type: "deleteParts"; refs: Ref[] }
  | { type: "addRelation"; relation: Relation }
  | { type: "removeRelation"; id: string }
  | { type: "setRelationValue"; id: string; value: number; locked?: boolean }
  | { type: "addStep"; step: Step }
  | { type: "removeStep"; id: string }
  /** change numbers of a step that is already in the history (pulling a face the body has changes the step that made it: `in_173`) */
  | { type: "setStepParams"; id: string; params: Record<string, number | string> }
  /** Move or turn a drawn figure in space like an object (`in_135`): its corners (and circles, lines) with the plane they lie on. `turns` are about the world axes through `pivot`, in order, then `translate`.
   *  If the plane is shared with other drawings (a world plane, a face of the body) the figure gets a new drawn plane, named `newPlane`. */
  | { type: "transformFigure"; parts: Ref[]; plane: Ref; newPlane: Ref; turns: { axis: 0 | 1 | 2; angle: number }[]; pivot: Vec3; translate: Vec3; /** made this many times bigger about `pivot`, after the turns (the same all ways; circles too) */ scale?: number; /** a plane drawn when there was one body has no owner: this names the body it belongs to, so a later move of that body is read back through for what is drawn on it (`in_277`) */ body?: string }
  /** hide bodies or show them again (`dec_hidden_bodies`): `refs` are the bodies' refs; how the model is looked at, not a step */
  | { type: "hideBodies"; refs: Ref[]; hidden: boolean }
  /** a named parameter is given a formula, or made (`dec_named_parameters`); the numbers tied to it are made again */
  | { type: "setParameter"; name: string; expr: string }
  /** a parameter is taken away (refused while a formula or a step uses it) */
  | { type: "removeParameter"; name: string }
  /** a number of a step is tied to a formula (`expr`), or let go (`null`: it keeps the value it has) */
  | { type: "linkParam"; id: string; key: string; expr: string | null }
  /** group things (parts, or groups made before) so that selecting one selects all; `id` is a new group id (`in_257`) */
  | { type: "group"; id: string; items: string[] }
  /** a body made hard or soft (`dec_hard_bodies`): `body` is the name it keeps through the history */
  | { type: "setHard"; body: string; on: boolean }
  /** what a body is made of (`in_565`): `body` is the name it keeps through the history, `material` a material id (empty takes the tag off) */
  | { type: "setMaterial"; body: string; material: string }
  /** a copy of a machine (or other definition) the project used, kept in its manufacturing section by `kind/id@version` (`in_571`) */
  | { type: "useDefinition"; key: string; value: unknown }
  /** **Only to open projects saved before `in_603`** (when a drawn line carried what it was for): nothing makes it now. Replayed, it becomes the laser route's mark of those lines (`setMarks`), and the drawing is not touched. */
  | { type: "setUse"; refs: Ref[]; use: "cut" | "score" | "engrave" }
  /** a route's own roles for the lines of a drawing (`in_603`): `key` is `part|route`, `marks` the line refs and their roles; none left removes the key. Not the model's: it is kept in the project's manufacturing section */
  | { type: "setMarks"; key: string; marks: Record<string, string> }
  /** a manufacturing plan, one for a part, route and machine: put in the project's manufacturing section, replacing the one with the same `id` (`in_571`, `in_546`) */
  | { type: "setPlan"; plan: { id: string } }
  /** the clearance of the whole model, mm (`dec_hard_bodies`) */
  | { type: "setClearance"; value: number }
  /** break one group: what was in it stays, and a group inside it stays a group */
  | { type: "ungroup"; id: string }
  /** repeat a drawn figure so that it keeps its numbers (`in_257`, `repeat.ts`): the copies are made from this record */
  | { type: "pattern"; id: string; kind: "linear" | "circular" | "mirror"; parts: Ref[]; plane: Ref; params: number[] }
  | { type: "setPattern"; id: string; params: number[] }
  | { type: "breakPattern"; id: string }
  /** a gear that keeps its numbers (`gearscene.ts`, `dec_gear_tool`): its parts are made from this record; `setGear` gives it new numbers (and a new centre), `deleteGear` takes it away */
  | { type: "gear"; id: string; plane: Ref; at: Vec3; spec: GearSpec; /** radians */ turn?: number }
  | { type: "setGear"; id: string; spec: GearSpec; at?: Vec3; /** the gear turned about its centre in its plane, radians (0 puts it back) */ turn?: number }
  | { type: "deleteGear"; id: string }
  /** a planetary set that keeps its numbers (`planetary.ts`, `dec_planetary_gears`): a sun, planets and a ring (gear records of their own) and an optional carrier; `setPlanetary` gives it new numbers (and a new centre or turn), `deletePlanetary` takes it all away */
  | { type: "planetary"; id: string; plane: Ref; at: Vec3; spec: PlanetarySpec; /** radians */ turn?: number }
  | { type: "setPlanetary"; id: string; spec: PlanetarySpec; at?: Vec3; turn?: number }
  | { type: "deletePlanetary"; id: string }
  /** the whole model stretched by a factor along each world axis about a point (`dec_scale_axes`): the drawing and the distances of the steps, so the extrusions stay exact */
  | { type: "stretch"; factors: Vec3; pivot: Vec3; /** only this body of several (its name), or only these drawn parts (`in_390`) */ body?: string; parts?: Ref[] }
  | { type: "batch"; commands: Command[] };

/** The longest a material's name may be. */
export const MATERIAL_MAX = 60;
const idOf = (full: string): string => full.slice(full.indexOf("/") + 1).split(/[./]/)[0] ?? full;

/** The parts that go when `ref` goes: itself and every part built on it (a corner takes the lines and circles that use it). */
export function dependentParts(s: Scene, ref: Ref): Ref[] {
  const out = new Set<Ref>([ref]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of Object.values(s.parts)) {
      if (out.has(p.ref) || p.origin !== "drawn") continue;
      if (anchorsOf(p).some((a) => out.has(a) && a !== p.ref) || (p.kind === "face" && p.loop.some((l) => out.has(l)))) {
        out.add(p.ref);
        grew = true;
      }
    }
  }
  return [...out];
}

/**
 * The drawn corners that stood under parts that are going and are left with nothing drawn on them (`in_363`, `in_365`): no line or arc ends or is centred there and no circle is centred there. A corner shows only as the end of a
 * line or the middle of a circle or arc, so one with nothing on it is not there for the person drawing, and must not be left behind to be snapped to or lined up with. This is the one place the rule is kept: a delete, a trim and
 * a deleted surface all take parts away through `deletePart` and `deleteParts`, whatever they ask for. A corner a step names or a repeat repeats stays (taking it would change what they are made of), as does a corner the
 * sketch derives (a crossing). A piece cut from a line (`derived`) does not stand on a corner: it goes with its line.
 */
function strandedCorners(s: Scene, gone: ReadonlySet<Ref>): Ref[] {
  const under = new Set<Ref>();
  for (const r of gone) {
    const p = s.parts[r];
    if (p?.kind === "line") { under.add(p.a); under.add(p.b); if (p.center) under.add(p.center); }
    else if (p?.kind === "circle") under.add(p.center);
  }
  if (!under.size) return [];
  const stood = new Set<Ref>();
  for (const p of Object.values(s.parts)) {
    if (gone.has(p.ref)) continue;
    if (p.kind === "line" && !p.derived) { stood.add(p.a); stood.add(p.b); if (p.center) stood.add(p.center); }
    else if (p.kind === "circle") stood.add(p.center);
  }
  const named = new Set<Ref>([...s.steps.flatMap((st) => (usesFigures(st) ? figureRefs(st) : st.parts)), ...(s.patterns ?? []).flatMap((r) => r.parts)]);
  return [...under].filter((r) => {
    const p = s.parts[r];
    return !gone.has(r) && !stood.has(r) && !named.has(r) && p?.kind === "corner" && p.origin === "drawn" && p.movable && !p.derived;
  });
}
/** What goes when these parts go: everything built on them, and the corners that would be left with nothing on them. */
function goneWith(s: Scene, refs: readonly Ref[]): Set<Ref> {
  const gone = new Set<Ref>();
  for (const r of refs) for (const d of dependentParts(s, r)) gone.add(d);
  for (const c of strandedCorners(s, gone)) for (const d of dependentParts(s, c)) gone.add(d);
  return gone;
}

/** The part as it will be added, or why it cannot be: its name is free, the plane it is on (by the name a move gave it, `in_372`, if need be) and the points it stands on are there. `parts` are the parts so far. */
function checkedPart(s: Scene, parts: Record<Ref, Part>, part0: Part): Part | string {
  if (part0.ref in parts) return `${part0.ref} already exists`;
  const part = part0.plane && !(part0.plane in parts) && s.planeAlias?.[part0.plane] ? ({ ...part0, plane: s.planeAlias[part0.plane]! } as Part) : part0;
  for (const a of anchorsOf(part)) if (a !== part.ref && !(a in parts)) return `${part.ref} uses ${a}, which does not exist`;
  if (part.plane && !(part.plane in parts)) return `plane ${part.plane} does not exist`;
  return part;
}

export function apply(s: Scene, c: Command): Result<Scene> {
  switch (c.type) {
    case "addPart": {
      if (c.part.ref in s.parts) return err(`${c.part.ref} already exists`);
      if (c.part.plane && !(c.part.plane in s.parts) && s.planeAlias?.[c.part.plane]) return apply(s, { ...c, part: { ...c.part, plane: s.planeAlias[c.part.plane]! } as typeof c.part }); // (`in_372`)
      for (const a of anchorsOf(c.part)) if (a !== c.part.ref && !(a in s.parts)) return err(`${c.part.ref} uses ${a}, which does not exist`);
      if (c.part.plane && !(c.part.plane in s.parts)) return err(`plane ${c.part.plane} does not exist`);
      return ok(bumpCounter({ ...s, parts: { ...s.parts, [c.part.ref]: c.part } }, idOf(c.part.ref)));
    }
    case "movePart": {
      const p = s.parts[c.ref];
      if (!p) return err(`${c.ref} does not exist`);
      if (!p.movable) return err(`${c.ref} is a reference and cannot move`);
      if (p.kind !== "corner") return err("only corners move directly; move their corners");
      return ok({ ...s, parts: { ...s.parts, [c.ref]: { ...p, at: c.to } } });
    }
    case "stretch": return stretchScene(s, c.factors, c.pivot, { ...(c.body ? { body: c.body } : {}), ...(c.parts ? { parts: c.parts } : {}) });
    case "placePlane": {
      const p = s.parts[c.ref];
      if (p?.kind !== "plane" || !p.section) return err(`${c.ref} is not a cross section plane`);
      return ok({ ...s, parts: { ...s.parts, [c.ref]: { ...p, at: c.at, u: c.u, v: c.v, ...(c.cut === undefined ? {} : { cut: c.cut }), ...(c.flip === undefined ? {} : { flip: c.flip }), ...(c.hidden === undefined ? {} : { hidden: c.hidden }) } } });
    }
    case "setRadius": {
      const p = s.parts[c.ref];
      if (!p || p.kind !== "circle") return err(`${c.ref} is not a circle`);
      if (!p.movable) return err(`${c.ref} is a reference and cannot change`);
      if (!(c.radius > 0)) return err("the radius must be positive");
      return ok({ ...s, parts: { ...s.parts, [c.ref]: { ...p, radius: c.radius } } });
    }
    case "transformFigure": {
      const planeRef = s.parts[c.plane] ? c.plane : s.planeAlias?.[c.plane] ?? c.plane; // (a plane the history knew by the name a move gave it, `in_372`)
      const pl = s.parts[planeRef];
      if (!pl || pl.kind !== "plane") return err(`${c.plane} is not a plane`);
      const figure = new Set<Ref>(c.parts);
      const mats = c.turns.map((t) => about(t.axis, t.angle));
      const turn = (v: Vec3): Vec3 => mats.reduce((q, m) => [m[0] * q[0] + m[1] * q[1] + m[2] * q[2], m[3] * q[0] + m[4] * q[1] + m[5] * q[2], m[6] * q[0] + m[7] * q[1] + m[8] * q[2]] as Vec3, v);
      const kf = c.scale ?? 1;
      const move = (p: Vec3): Vec3 => { const q = turn(sub(p, c.pivot)); return add(add(c.pivot, [q[0] * kf, q[1] * kf, q[2] * kf]), c.translate); };
      const others = Object.values(s.parts).some((p) => p.origin === "drawn" && p.plane === planeRef && p.kind !== "face" && !figure.has(p.ref));
      const inPlace = pl.origin === "drawn" && !others;
      const target: Ref = inPlace ? pl.ref : c.newPlane;
      const parts: Record<Ref, Part> = { ...s.parts };
      if (inPlace) parts[pl.ref] = { ...pl, at: move(pl.at), u: turn(pl.u), v: turn(pl.v), ...(c.body && !pl.body ? { body: c.body } : {}) };
      else {
        if (c.newPlane in s.parts) return err(`${c.newPlane} already exists`);
        parts[c.newPlane] = { ref: c.newPlane, kind: "plane", origin: "drawn", plane: null, movable: false, at: move(pl.at), u: turn(pl.u), v: turn(pl.v), ...(pl.onBody ? { onBody: true as const } : {}), ...(pl.body || c.body ? { body: pl.body ?? c.body! } : {}) };
      }
      for (const ref of c.parts) {
        const p = s.parts[ref];
        if (!p || p.origin !== "drawn") return err(`${ref} is not a drawn part`);
        if (p.kind === "corner") parts[ref] = { ...p, at: move(p.at), plane: target };
        else if (p.kind === "circle") parts[ref] = { ...p, plane: target, radius: p.radius * kf };
        else if (p.kind === "line") parts[ref] = { ...p, plane: target };
      }
      return ok(inPlace ? { ...s, parts, planeAlias: { ...s.planeAlias, [c.newPlane]: pl.ref } } : bumpCounter({ ...s, parts }, idOf(c.newPlane)));
    }
    case "deletePart": {
      const p = s.parts[c.ref];
      if (!p) return err(`${c.ref} does not exist`);
      if (!p.movable) return err(`${c.ref} is a reference and cannot be deleted`);
      const gone = goneWith(s, [c.ref]);
      const parts = Object.fromEntries(Object.entries(s.parts).filter(([k]) => !gone.has(k as Ref)));
      const relations = s.relations.filter((r) => !r.parts.some((x) => gone.has(x)));
      return ok(withoutParts(patternsWithout({ ...s, parts, relations }, gone), gone));
    }
    case "deleteParts": {
      // several at once: everything built on any of them goes too (a part that an earlier one already took is not an error)
      const asked: Ref[] = [];
      for (const r of c.refs) {
        const p = s.parts[r];
        if (!p) continue;
        if (!p.movable) return err(`${r} is a reference and cannot be deleted`);
        asked.push(r);
      }
      // parts that are gone already are not an error, whether some of them or all: a corner left with nothing on it goes with its line now (`strandedCorners`), and a history made before that has later commands that delete it by name
      if (!asked.length) return ok(s);
      const gone = goneWith(s, asked);
      const parts = Object.fromEntries(Object.entries(s.parts).filter(([k]) => !gone.has(k as Ref)));
      return ok(withoutParts(patternsWithout({ ...s, parts, relations: s.relations.filter((r) => !r.parts.some((x) => gone.has(x))) }, gone), gone));
    }
    case "addRelation": {
      if (s.relations.some((r) => r.id === c.relation.id)) return err(`relation ${c.relation.id} already exists`);
      for (const r of c.relation.parts) if (!(r in s.parts) && !r.startsWith("b/")) return err(`relation uses ${r}, which does not exist`); // (a part of the body comes from the kernel, which may not have answered yet when a saved file is replayed in the browser: it is looked for when the compile has it, `in_316`)
      return ok(bumpCounter({ ...s, relations: [...s.relations, withAnchors(s, c.relation)] }, c.relation.id)); // (a circular edge of the body it names is described, so it can be found again, `in_309`)
    }
    case "removeRelation": {
      if (!s.relations.some((r) => r.id === c.id)) return err(`relation ${c.id} does not exist`);
      return ok({ ...s, relations: s.relations.filter((r) => r.id !== c.id) });
    }
    case "setRelationValue": {
      if (!s.relations.some((r) => r.id === c.id)) return err(`relation ${c.id} does not exist`);
      return ok({ ...s, relations: s.relations.map((r) => (r.id === c.id ? { ...r, value: c.value, locked: c.locked ?? r.locked } : r)) });
    }
    case "addStep":
      if (s.steps.some((x) => x.id === c.step.id)) return err(`step ${c.step.id} already exists`);
      return ok(bumpCounter({ ...s, steps: [...s.steps, c.step] }, c.step.id));
    case "setStepParams": {
      const st = s.steps.find((x) => x.id === c.id);
      if (!st) return err(`step ${c.id} does not exist`);
      return ok({ ...s, steps: s.steps.map((x) => (x.id === c.id ? unlinked({ ...x, params: { ...x.params, ...c.params } }, Object.keys(c.params)) : x)) }); // (a number typed over a tied one lets it go)
    }
    case "removeStep":
      if (!s.steps.some((x) => x.id === c.id)) return err(`step ${c.id} does not exist`);
      return ok({ ...s, steps: s.steps.filter((x) => x.id !== c.id) });
    case "group": {
      const r = addGroup(s, c.id, c.items);
      return r.ok ? ok(bumpCounter(r.value, c.id)) : r;
    }
    case "ungroup": return removeGroup(s, c.id);
    case "setParameter": return setParameter(s, c.name, c.expr);
    case "removeParameter": return removeParameter(s, c.name);
    case "linkParam": return linkParam(s, c.id, c.key, c.expr);
    case "hideBodies": {
      const now = new Set(s.hiddenBodies ?? []);
      for (const r of c.refs) { if (c.hidden) now.add(r); else now.delete(r); }
      const { hiddenBodies: _old, ...rest } = s;
      return ok(now.size ? { ...rest, hiddenBodies: [...now].sort() } : rest);
    }
    case "setHard": { const hard = (s.hard ?? []).filter((b) => b !== c.body); return ok({ ...s, ...(c.on ? { hard: [...hard, c.body] } : hard.length ? { hard } : { hard: undefined }) }); }
    case "useDefinition": {
      if (!c.key.trim()) return err("a definition needs a key");
      return ok({ ...s, manufacturing: { ...s.manufacturing, definitions: { ...s.manufacturing?.definitions, [c.key]: c.value } } });
    }
    case "setUse": { // (migration: an old project\'s marks become the laser route\'s marks, by the plane the lines are on)
      let cur: Scene = s;
      const byKey = new Map<string, Ref[]>();
      for (const r of c.refs) { const p = s.parts[r]; const plane = p && (p.kind === "line" || p.kind === "circle") ? p.plane : null; if (plane) byKey.set(`sketch/${plane}|laser-outline`, [...(byKey.get(`sketch/${plane}|laser-outline`) ?? []), r]); }
      for (const [key, refs] of byKey) {
        const marks = { ...(cur.manufacturing?.marks?.[key] ?? {}) };
        for (const r of refs) { if (c.use === "cut") delete marks[r]; else marks[r] = c.use; }
        const { [key]: _old, ...rest } = cur.manufacturing?.marks ?? {};
        cur = { ...cur, manufacturing: { ...cur.manufacturing, marks: Object.keys(marks).length ? { ...rest, [key]: marks } : rest } };
      }
      return ok(cur);
    }
    case "setMarks": {
      if (!c.key.trim()) return err("marks need a key");
      const { [c.key]: _old, ...rest } = s.manufacturing?.marks ?? {};
      const marks = Object.keys(c.marks).length ? { ...rest, [c.key]: { ...c.marks } } : rest;
      return ok({ ...s, manufacturing: { ...s.manufacturing, marks } });
    }
    case "setPlan": {
      if (typeof c.plan.id !== "string" || !c.plan.id) return err("a plan needs an id");
      const rest = (s.manufacturing?.plans ?? []).filter((p) => (p as { id?: string }).id !== c.plan.id);
      return ok({ ...s, manufacturing: { ...s.manufacturing, plans: [...rest, c.plan] } }); // (the newest is last: it is the one a dialog starts from)
    }
    case "setMaterial": {
      const m = c.material.trim();
      if (m.length > MATERIAL_MAX || /[\u0000-\u001f]/.test(m)) return err(`a material name is plain text of at most ${MATERIAL_MAX} letters`);
      const { [c.body]: _old, ...rest } = s.materials ?? {};
      const materials = m ? { ...rest, [c.body]: m } : rest;
      return ok({ ...s, materials: Object.keys(materials).length ? materials : undefined });
    }
    case "setClearance": return Number.isFinite(c.value) && c.value >= 0 ? ok({ ...s, clearance: c.value || undefined }) : err("the clearance is a distance of nothing or more");
    case "pattern": { const r = addPattern(s, { id: c.id, kind: c.kind, parts: c.parts, plane: c.plane, params: c.params }); return r.ok ? ok(bumpCounter(r.value, c.id)) : r; }
    case "setPattern": return setPattern(s, c.id, c.params);
    case "breakPattern": return breakPattern(s, c.id);
    case "gear": {
      const rec = { id: c.id, plane: c.plane, at: c.at, spec: c.spec, ...(c.turn ? { turn: c.turn } : {}) };
      const r = addGear(s, rec);
      if (!r.ok) return r;
      const made = bumpCounter(r.value, c.id);
      return ok(ownedSteps(made, rec).scene); // (a gear that has a body made with it comes with the steps that make it, `in_598`, `in_608`)
    }
    case "setGear": return setGear(s, c.id, c.spec, c.at, c.turn);
    case "deleteGear": return deleteGear(s, c.id);
    case "planetary": return addPlanetary(s, { id: c.id, plane: c.plane, at: c.at, spec: c.spec, ...(c.turn ? { turn: c.turn } : {}) });
    case "setPlanetary": return setPlanetary(s, c.id, c.spec, c.at, c.turn);
    case "deletePlanetary": return deletePlanetary(s, c.id);
    case "batch": {
      let cur = s;
      // a run of addPart commands adds to one private copy of the parts, made once: copying every part for each one added was quadratic (a drawing of 4,000 parts took 6 seconds to import)
      let work: Record<Ref, Part> | null = null;
      let counter = cur.counter;
      const flush = (): void => { if (work) { cur = { ...cur, parts: work, counter }; work = null; } };
      for (const sub of c.commands) {
        if (sub.type === "addPart") {
          work ??= { ...cur.parts };
          const part = checkedPart(cur, work, sub.part);
          if (typeof part === "string") return err(part); // all or nothing: the scene is returned unchanged by the caller
          work[part.ref] = part;
          const n = Number(idOf(part.ref).slice(idOf(part.ref).lastIndexOf("_") + 1));
          if (Number.isFinite(n) && n > counter) counter = n;
          continue;
        }
        flush();
        const r = apply(cur, sub);
        if (!r.ok) return r;
        cur = r.value;
        counter = cur.counter;
      }
      flush();
      return ok(cur);
    }
  }
}

