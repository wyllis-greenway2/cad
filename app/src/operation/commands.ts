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
import { bumpCounter } from "./scene.ts";
import { addGroup, removeGroup, withoutParts } from "./groups.ts";
import { addPattern, setPattern, breakPattern, patternsWithout } from "./repeat.ts";

export type Command =
  | { type: "addPart"; part: Part }
  | { type: "movePart"; ref: Ref; to: Vec3 }
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
  | { type: "transformFigure"; parts: Ref[]; plane: Ref; newPlane: Ref; turns: { axis: 0 | 1 | 2; angle: number }[]; pivot: Vec3; translate: Vec3; /** made this many times bigger about `pivot`, after the turns (the same all ways; circles too) */ scale?: number }
  /** group things (parts, or groups made before) so that selecting one selects all; `id` is a new group id (`in_257`) */
  | { type: "group"; id: string; items: string[] }
  /** break one group: what was in it stays, and a group inside it stays a group */
  | { type: "ungroup"; id: string }
  /** repeat a drawn figure so that it keeps its numbers (`in_257`, `repeat.ts`): the copies are made from this record */
  | { type: "pattern"; id: string; kind: "linear" | "circular"; parts: Ref[]; plane: Ref; params: number[] }
  | { type: "setPattern"; id: string; params: number[] }
  | { type: "breakPattern"; id: string }
  | { type: "batch"; commands: Command[] };

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

export function apply(s: Scene, c: Command): Result<Scene> {
  switch (c.type) {
    case "addPart": {
      if (c.part.ref in s.parts) return err(`${c.part.ref} already exists`);
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
    case "setRadius": {
      const p = s.parts[c.ref];
      if (!p || p.kind !== "circle") return err(`${c.ref} is not a circle`);
      if (!p.movable) return err(`${c.ref} is a reference and cannot change`);
      if (!(c.radius > 0)) return err("the radius must be positive");
      return ok({ ...s, parts: { ...s.parts, [c.ref]: { ...p, radius: c.radius } } });
    }
    case "transformFigure": {
      const pl = s.parts[c.plane];
      if (!pl || pl.kind !== "plane") return err(`${c.plane} is not a plane`);
      const figure = new Set<Ref>(c.parts);
      const mats = c.turns.map((t) => about(t.axis, t.angle));
      const turn = (v: Vec3): Vec3 => mats.reduce((q, m) => [m[0] * q[0] + m[1] * q[1] + m[2] * q[2], m[3] * q[0] + m[4] * q[1] + m[5] * q[2], m[6] * q[0] + m[7] * q[1] + m[8] * q[2]] as Vec3, v);
      const kf = c.scale ?? 1;
      const move = (p: Vec3): Vec3 => { const q = turn(sub(p, c.pivot)); return add(add(c.pivot, [q[0] * kf, q[1] * kf, q[2] * kf]), c.translate); };
      const others = Object.values(s.parts).some((p) => p.origin === "drawn" && p.plane === c.plane && p.kind !== "face" && !figure.has(p.ref));
      const inPlace = pl.origin === "drawn" && !others;
      const target: Ref = inPlace ? pl.ref : c.newPlane;
      const parts: Record<Ref, Part> = { ...s.parts };
      if (inPlace) parts[pl.ref] = { ...pl, at: move(pl.at), u: turn(pl.u), v: turn(pl.v) };
      else {
        if (c.newPlane in s.parts) return err(`${c.newPlane} already exists`);
        parts[c.newPlane] = { ref: c.newPlane, kind: "plane", origin: "drawn", plane: null, movable: false, at: move(pl.at), u: turn(pl.u), v: turn(pl.v), ...(pl.onBody ? { onBody: true as const } : {}), ...(pl.body ? { body: pl.body } : {}) };
      }
      for (const ref of c.parts) {
        const p = s.parts[ref];
        if (!p || p.origin !== "drawn") return err(`${ref} is not a drawn part`);
        if (p.kind === "corner") parts[ref] = { ...p, at: move(p.at), plane: target };
        else if (p.kind === "circle") parts[ref] = { ...p, plane: target, radius: p.radius * kf };
        else if (p.kind === "line") parts[ref] = { ...p, plane: target };
      }
      return ok(inPlace ? { ...s, parts } : bumpCounter({ ...s, parts }, idOf(c.newPlane)));
    }
    case "deletePart": {
      const p = s.parts[c.ref];
      if (!p) return err(`${c.ref} does not exist`);
      if (!p.movable) return err(`${c.ref} is a reference and cannot be deleted`);
      const gone = new Set(dependentParts(s, c.ref));
      const parts = Object.fromEntries(Object.entries(s.parts).filter(([k]) => !gone.has(k as Ref)));
      const relations = s.relations.filter((r) => !r.parts.some((x) => gone.has(x)));
      return ok(withoutParts(patternsWithout({ ...s, parts, relations }, gone), gone));
    }
    case "deleteParts": {
      // several at once: everything built on any of them goes too (a part that an earlier one already took is not an error)
      const gone = new Set<Ref>();
      for (const r of c.refs) {
        const p = s.parts[r];
        if (!p) continue;
        if (!p.movable) return err(`${r} is a reference and cannot be deleted`);
        for (const d of dependentParts(s, r)) gone.add(d);
      }
      if (!gone.size) return err("nothing to delete");
      const parts = Object.fromEntries(Object.entries(s.parts).filter(([k]) => !gone.has(k as Ref)));
      return ok(withoutParts(patternsWithout({ ...s, parts, relations: s.relations.filter((r) => !r.parts.some((x) => gone.has(x))) }, gone), gone));
    }
    case "addRelation": {
      if (s.relations.some((r) => r.id === c.relation.id)) return err(`relation ${c.relation.id} already exists`);
      for (const r of c.relation.parts) if (!(r in s.parts)) return err(`relation uses ${r}, which does not exist`);
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
      return ok({ ...s, steps: s.steps.map((x) => (x.id === c.id ? { ...x, params: { ...x.params, ...c.params } } : x)) });
    }
    case "removeStep":
      if (!s.steps.some((x) => x.id === c.id)) return err(`step ${c.id} does not exist`);
      return ok({ ...s, steps: s.steps.filter((x) => x.id !== c.id) });
    case "group": {
      const r = addGroup(s, c.id, c.items);
      return r.ok ? ok(bumpCounter(r.value, c.id)) : r;
    }
    case "ungroup": return removeGroup(s, c.id);
    case "pattern": { const r = addPattern(s, { id: c.id, kind: c.kind, parts: c.parts, plane: c.plane, params: c.params }); return r.ok ? ok(bumpCounter(r.value, c.id)) : r; }
    case "setPattern": return setPattern(s, c.id, c.params);
    case "breakPattern": return breakPattern(s, c.id);
    case "batch": {
      let cur = s;
      for (const sub of c.commands) {
        const r = apply(cur, sub);
        if (!r.ok) return r; // all or nothing: the scene is returned unchanged by the caller
        cur = r.value;
      }
      return ok(cur);
    }
  }
}

